import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BrowserTestSnapshot } from '../src/debug/BrowserTestBridge';

const appUrl = '/?e2e=1&debug=0&skipPicker=1&cinematics=0&time=13';
const outputDirectory = join(process.cwd(), 'docs/screenshots/pedestrian-002');

test('populates authored sidewalks, freezes cinematics, and captures visual evidence', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const faults = observeFaults(page);
  await mkdir(outputDirectory, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(appUrl);
  await expect
    .poll(
      async () => {
        const state = await page.evaluate(() =>
          window.__VANTA_TEST__?.snapshot(),
        );
        if (!state || !(state as Partial<BrowserTestSnapshot>).pedestrians)
          return {
            ready: false,
            gameState: undefined,
            residents: 0,
            loading: 0,
          };
        return {
          ready: state.ready,
          gameState: state.gameState,
          residents: state.pedestrians.residentCount,
          loading: state.pedestrians.loadingCount,
        };
      },
      { timeout: 25_000 },
    )
    .toEqual({ ready: true, gameState: 'playing', residents: 8, loading: 0 });

  const initial = await snapshot(page);
  expect(initial.pedestrians).toMatchObject({
    residentCap: 16,
    residentCount: 8,
    activeCount: 8,
    mixerOwnerCount: 8,
    routeCount: 2,
  });
  expect(
    new Set(initial.pedestrians.pedestrians.map(({ modelId }) => modelId)),
  ).toEqual(
    new Set([
      'pedestrian-casual',
      'pedestrian-dress',
      'pedestrian-street',
      'pedestrian-tank-top',
    ]),
  );
  for (const pedestrian of initial.pedestrians.pedestrians) {
    expect(pedestrian.grounded).toBe(true);
    expect(pedestrian.groundColliderId).toMatch(/^c\.sidewalk-/);
    expect(pedestrian.segmentId).toContain('->');
    expect(pedestrian.currentAnimation).not.toBe('applaud');
    expect(Math.abs(pedestrian.position[0])).toBeGreaterThanOrEqual(9.45);
    expect(Math.abs(pedestrian.position[2])).toBeGreaterThanOrEqual(11.45);
  }

  const initialPositions = positionKey(initial);
  await expect
    .poll(async () => positionKey(await snapshot(page)))
    .not.toBe(initialPositions);
  const moving = await snapshot(page);
  expect(
    moving.pedestrians.pedestrians.every(
      ({ state, currentAnimation }) =>
        (state === 'walking' && currentAnimation === 'walk') ||
        (state === 'idle' && currentAnimation === 'idle'),
    ),
  ).toBe(true);

  const started = await page.evaluate(() =>
    window.__VANTA_TEST__!.startCinematic('cinematic.ash-001.legacy-opening'),
  );
  expect(started).toBe(true);
  await expect
    .poll(async () => (await snapshot(page)).gameState)
    .toBe('cinematic');
  const cinematicPositions = positionKey(await snapshot(page));
  const cinematicFrame = (await snapshot(page)).renderer.renderedFrames;
  await expect
    .poll(async () => (await snapshot(page)).renderer.renderedFrames)
    .toBeGreaterThan(cinematicFrame + 8);
  expect(positionKey(await snapshot(page))).toBe(cinematicPositions);
  await page.evaluate(() => window.__VANTA_TEST__!.cancelCinematic());
  await expect
    .poll(async () => (await snapshot(page)).gameState)
    .toBe('playing');
  await expect
    .poll(async () => positionKey(await snapshot(page)))
    .not.toBe(cinematicPositions);
  await command(page, 'player.teleport-position', '0,0.2,0,0');
  await settleCamera(page);
  await page.screenshot({
    path: join(outputDirectory, 'sidewalk-day-desktop.png'),
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await settleCamera(page);
  await page.screenshot({
    path: join(outputDirectory, 'sidewalk-day-narrow.png'),
  });

  await page.setViewportSize({ width: 1280, height: 720 });
  await command(page, 'time.night');
  await expect
    .poll(async () => (await snapshot(page)).lighting.transitioning)
    .toBe(false);
  await page.screenshot({
    path: join(outputDirectory, 'sidewalk-night-desktop.png'),
  });

  await command(page, 'camera.preview-anchor', 'camera.intersection-overhead');
  await expect
    .poll(async () => {
      const camera = (await snapshot(page)).camera;
      return (
        camera.activeAnchorId === 'camera.intersection-overhead' &&
        camera.transitionProgress > 0.98
      );
    })
    .toBe(true);
  await page.screenshot({
    path: join(outputDirectory, 'sidewalk-overhead.png'),
  });
  await command(page, 'camera.release-preview');
  await command(page, 'player.teleport', 'spawn.approach-north');
  await expectResidentOwnership(page, 'sector.northwest');
  // Prime the shared model/sector caches before comparing retained ownership.
  for (let warmupCycle = 0; warmupCycle < 3; warmupCycle += 1) {
    await command(page, 'player.teleport', 'spawn.approach-south');
    await expectResidentOwnership(page, 'sector.southwest');
    await command(page, 'player.teleport', 'spawn.approach-north');
    await expectResidentOwnership(page, 'sector.northwest');
  }
  await settleCamera(page);
  const baselinePerformance = await page.evaluate(() =>
    window.__VANTA_TEST__!.capturePerformance(250, 1_000),
  );

  const disposalsBeforeCycles = (await snapshot(page)).pedestrians.disposeCount;
  for (let cycle = 0; cycle < 3; cycle += 1) {
    await command(page, 'player.teleport', 'spawn.approach-south');
    await expectResidentOwnership(page, 'sector.southwest');
    await command(page, 'player.teleport', 'spawn.approach-north');
    await expectResidentOwnership(page, 'sector.northwest');
  }
  const cycled = await snapshot(page);
  expect(cycled.pedestrians.disposeCount).toBeGreaterThanOrEqual(
    disposalsBeforeCycles + 24,
  );
  const postCyclePerformance = await page.evaluate(() =>
    window.__VANTA_TEST__!.capturePerformance(250, 1_000),
  );
  expect(postCyclePerformance.averageFps).toBeGreaterThanOrEqual(
    baselinePerformance.averageFps * 0.5,
  );
  expect(postCyclePerformance.renderer.drawCalls).toBeLessThanOrEqual(
    baselinePerformance.renderer.drawCalls + 2,
  );
  await writeFile(
    join(outputDirectory, 'performance-and-lifecycle.json'),
    `${JSON.stringify(
      {
        baseline: baselinePerformance,
        afterThreeRespawnCycles: postCyclePerformance,
        pedestrianOwnership: {
          residents: cycled.pedestrians.residentCount,
          mixers: cycled.pedestrians.mixerOwnerCount,
          spawns: cycled.pedestrians.spawnCount,
          disposals: cycled.pedestrians.disposeCount,
        },
        network: faults,
      },
      null,
      2,
    )}\n`,
  );

  expect((await snapshot(page)).runtimeErrors.count).toBe(0);
  expect(faults.consoleErrors).toEqual([]);
  expect(faults.failedRequests).toEqual([]);
  expect(faults.externalRequests).toEqual([]);
});

function positionKey(state: BrowserTestSnapshot): string {
  return state.pedestrians.pedestrians
    .map(
      ({ id, position }) =>
        `${id}:${position.map((value) => value.toFixed(3)).join(',')}`,
    )
    .join('|');
}

async function snapshot(page: Page): Promise<BrowserTestSnapshot> {
  return page.evaluate(() => window.__VANTA_TEST__!.snapshot());
}

async function command(
  page: Page,
  id: string,
  argument?: string,
): Promise<void> {
  await page.evaluate(
    ([commandId, value]) =>
      window.__VANTA_TEST__!.executeDebugCommand(commandId, value),
    [id, argument] as const,
  );
}

async function settleCamera(page: Page): Promise<void> {
  const frame = (await snapshot(page)).renderer.renderedFrames;
  await expect
    .poll(async () => (await snapshot(page)).renderer.renderedFrames)
    .toBeGreaterThan(frame + 3);
}

async function expectResidentOwnership(
  page: Page,
  expectedSector: string,
): Promise<void> {
  await expect
    .poll(async () => {
      const state = await snapshot(page);
      return {
        sectorReady: state.world.sectors.active.includes(expectedSector),
        transitionsPending: state.world.sectors.transitionsPending,
        residents: state.pedestrians.residentCount,
        loading: state.pedestrians.loadingCount,
        mixersMatch:
          state.pedestrians.mixerOwnerCount === state.pedestrians.residentCount,
      };
    })
    .toEqual({
      sectorReady: true,
      transitionsPending: false,
      residents: 8,
      loading: 0,
      mixersMatch: true,
    });
}

function observeFaults(page: Page) {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const externalRequests: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    // The asset loader intentionally aborts successful availability HEAD probes
    // once a GET owns the local source-cache request.
    if (request.method() !== 'HEAD') failedRequests.push(request.url());
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      ['http:', 'https:'].includes(url.protocol) &&
      !['127.0.0.1', 'localhost'].includes(url.hostname)
    )
      externalRequests.push(request.url());
  });
  return { consoleErrors, failedRequests, externalRequests };
}
