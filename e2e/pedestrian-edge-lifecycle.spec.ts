import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { format } from 'prettier';
import type { BrowserTestSnapshot } from '../src/debug/BrowserTestBridge';

const appUrl = '/?e2e=1&debug=0&skipPicker=1&cinematics=0&time=13';
const outputDirectory = join(process.cwd(), 'docs/screenshots/pedestrian-003');

test('exposes deterministic edge lifecycle policy and preserves production walkers', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const faults = observeFaults(page);
  await mkdir(outputDirectory, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(appUrl);
  await expect
    .poll(async () => {
      const state = await page.evaluate(() =>
        window.__VANTA_TEST__?.snapshot(),
      );
      return {
        ready: state?.ready ?? false,
        gameState: state?.gameState,
        residents: state?.pedestrians.residentCount ?? 0,
        loading: state?.pedestrians.loadingCount ?? 0,
      };
    })
    .toEqual({
      ready: true,
      gameState: 'playing',
      residents: 8,
      loading: 0,
    });

  const fixture = await page.evaluate(() =>
    window.__VANTA_TEST__!.pedestrianBoundaryFixture(),
  );
  expect(fixture).toMatchObject({
    routeDistance: 18.4,
    minimumTraversalDistance: 18,
    clearance: 0.35,
    repopulation: 'sector-reload',
  });
  expect(sample(fixture, 'resident').decision).toMatchObject({
    state: 'resident',
    shouldDespawn: false,
  });
  expect(sample(fixture, 'approach').decision).toMatchObject({
    state: 'approaching-boundary',
    shouldDespawn: false,
  });
  expect(sample(fixture, 'edge-crossed').decision).toMatchObject({
    state: 'exiting-boundary',
    shouldDespawn: false,
  });
  expect(sample(fixture, 'cleared').decision).toMatchObject({
    state: 'exiting-boundary',
    shouldDespawn: true,
    reason: 'authored-boundary-exit',
  });
  expect(sample(fixture, 'inward-teleport').decision.shouldDespawn).toBe(false);
  expect(sample(fixture, 'outward-teleport').decision.shouldDespawn).toBe(true);
  expect(
    Object.values(fixture.edgeChecks).every(
      ({ shouldDespawn, reason }) =>
        shouldDespawn && reason === 'authored-boundary-exit',
    ),
  ).toBe(true);

  const initial = await snapshot(page);
  expect(initial.pedestrians).toMatchObject({
    residentCount: 8,
    visibleCount: 8,
    mixerOwnerCount: 8,
    boundaryExitCount: 0,
    retiredCount: 0,
    repopulationCount: 0,
    loadCancellationCount: 0,
  });
  expect(
    initial.pedestrians.pedestrians.every(
      ({ lifecycleState, lifecycleReason }) =>
        lifecycleState === 'resident' && lifecycleReason === null,
    ),
  ).toBe(true);

  await expect
    .poll(
      async () =>
        Math.max(
          ...(await snapshot(page)).pedestrians.pedestrians.map(
            ({ distanceTravelled }) => distanceTravelled,
          ),
        ),
      { timeout: 20_000 },
    )
    .toBeGreaterThanOrEqual(12);
  const afterTraversal = await snapshot(page);
  expect(afterTraversal.pedestrians.mixerOwnerCount).toBe(
    afterTraversal.pedestrians.residentCount,
  );

  await page.evaluate(() =>
    window.__VANTA_TEST__!.executeDebugCommand(
      'player.teleport',
      'spawn.corner-northwest',
    ),
  );
  await settleFrames(page);
  await page.screenshot({
    path: join(outputDirectory, 'current-production-desktop.png'),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await settleFrames(page);
  await page.screenshot({
    path: join(outputDirectory, 'current-production-narrow.png'),
  });

  const report = {
    fixture,
    productionRouteLimitation:
      'Current authored production routes are loop routes; WORLD-003 must add boundary exit nodes and sidewalk continuation collision before visual edge disappearance can be captured.',
    runtime: {
      initialResidents: initial.pedestrians.residentCount,
      finalResidents: afterTraversal.pedestrians.residentCount,
      finalMixers: afterTraversal.pedestrians.mixerOwnerCount,
      maximumDistanceTravelled: Math.max(
        ...afterTraversal.pedestrians.pedestrians.map(
          ({ distanceTravelled }) => distanceTravelled,
        ),
      ),
      boundaryExits: afterTraversal.pedestrians.boundaryExitCount,
    },
    network: faults,
  };
  await writeFile(
    join(outputDirectory, 'boundary-policy-and-runtime.json'),
    await format(JSON.stringify(report), { parser: 'json' }),
  );

  expect(afterTraversal.runtimeErrors.count).toBe(0);
  expect(faults.consoleErrors).toEqual([]);
  expect(faults.failedRequests).toEqual([]);
  expect(faults.externalRequests).toEqual([]);
});

function sample(
  fixture: ReturnType<
    NonNullable<Window['__VANTA_TEST__']>['pedestrianBoundaryFixture']
  >,
  id: string,
) {
  const result = fixture.samples.find((candidate) => candidate.id === id);
  if (!result) throw new Error(`Missing pedestrian boundary sample "${id}"`);
  return result;
}

async function snapshot(page: Page): Promise<BrowserTestSnapshot> {
  return page.evaluate(() => window.__VANTA_TEST__!.snapshot());
}

async function settleFrames(page: Page): Promise<void> {
  const frame = (await snapshot(page)).renderer.renderedFrames;
  await expect
    .poll(async () => (await snapshot(page)).renderer.renderedFrames)
    .toBeGreaterThan(frame + 3);
}

function observeFaults(page: Page) {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const externalRequests: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    if (request.method() !== 'HEAD') failedRequests.push(request.url());
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      ['http:', 'https:'].includes(url.protocol) &&
      !['127.0.0.1', 'localhost'].includes(url.hostname)
    ) {
      externalRequests.push(request.url());
    }
  });
  return { consoleErrors, failedRequests, externalRequests };
}
