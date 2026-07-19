import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { format } from 'prettier';
import type { BrowserTestSnapshot } from '../src/debug/BrowserTestBridge';
import {
  authoritativePedestrianExpectation,
  expectSteadyPedestrianPopulation,
} from './pedestrianPopulationExpectations';

const appUrl = '/?e2e=1&debug=0&skipPicker=1&cinematics=0&time=13';
const outputDirectory =
  process.env.VANTA_PEDESTRIAN_EDGE_EVIDENCE_DIR ??
  join(process.cwd(), 'docs/screenshots/pedestrian-003');

test('exposes deterministic edge lifecycle policy and preserves production walkers', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const faults = observeFaults(page);
  await mkdir(outputDirectory, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(appUrl);
  const initial = await expectSteadyPedestrianPopulation(page);
  const initialExpectation = authoritativePedestrianExpectation(initial);

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

  expect(initial.pedestrians).toMatchObject({
    residentCount: initialExpectation.residentCount,
    mixerOwnerCount: initialExpectation.residentCount,
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

  let exited = initial;
  let afterTraversal = initial;
  for (let cycle = 1; cycle <= 3; cycle += 1) {
    await command(page, 'player.teleport-position', '-15,0.2,32,0');
    await expectSteadyPedestrianPopulation(page, {
      requiredSector: 'sector.world-004-north-west',
    });
    await expect
      .poll(async () => productionExit(await snapshot(page)), {
        timeout: 15_000,
      })
      .toMatchObject({ lifecycleState: 'resident', grounded: true });
    await expect
      .poll(
        async () => {
          const state = await snapshot(page);
          return {
            present: Boolean(productionExit(state)),
            exits: state.pedestrians.boundaryExitCount,
            retired: state.pedestrians.retiredCount,
            mixersMatch:
              state.pedestrians.mixerOwnerCount ===
              state.pedestrians.residentCount,
          };
        },
        { timeout: 75_000 },
      )
      .toEqual({ present: false, exits: cycle, retired: 1, mixersMatch: true });
    exited = await snapshot(page);
    expect(exited.pedestrians.lifecycleEvents.at(-1)).toMatchObject({
      routeId: 'route.north-rim-west',
      state: 'despawned',
      reason: 'authored-boundary-exit',
      boundaryEdge: 'north',
    });
    expect(
      exited.pedestrians.lifecycleEvents.at(-1)!.position[2],
    ).toBeGreaterThanOrEqual(44.15);
    expect(
      exited.pedestrians.lifecycleEvents.at(-1)!.distanceTravelled,
    ).toBeGreaterThanOrEqual(30);
    await settleFrames(page);
    expect(productionExit(await snapshot(page))).toBeUndefined();

    await command(page, 'player.teleport-position', '0,0.2,-32,0');
    const southSteady = await expectSteadyPedestrianPopulation(page, {
      requiredSector: 'sector.south-rim-west',
      excludedSector: 'sector.world-004-north-west',
    });
    expect(southSteady.pedestrians.retiredCount).toBe(0);
    await command(page, 'player.teleport-position', '-15,0.2,32,0');
    await expectSteadyPedestrianPopulation(page, {
      requiredSector: 'sector.world-004-north-west',
    });
    await expect
      .poll(
        async () => {
          const state = await snapshot(page);
          return {
            active: state.world.sectors.active.includes(
              'sector.world-004-north-west',
            ),
            repopulations: state.pedestrians.repopulationCount,
            resident: productionExit(state)?.lifecycleState,
            mixersMatch:
              state.pedestrians.mixerOwnerCount ===
              state.pedestrians.residentCount,
          };
        },
        { timeout: 15_000 },
      )
      .toEqual({
        active: true,
        repopulations: cycle,
        resident: 'resident',
        mixersMatch: true,
      });
    afterTraversal = await snapshot(page);
  }

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
    productionBoundaryRoute:
      'WORLD-004 keeps route.north-rim-west as a grounded north-edge exit on c.sidewalk-world-004-north-west beyond the expanded boundary.',
    productionGeometry: {
      authoritativeMaxZ: 43.75,
      sidewalkMaxZ: 44.45,
      terminalFootZ: 44.45,
      exitClearance: 0.4,
      pedestrianCollisionRadius: 0.3,
      wallOpeningWidth: 0,
      pedestrianCrossing: 'lifecycle-specific boundary collider bypass',
    },
    runtime: {
      initialActiveSectorIds: initial.world.sectors.active,
      initialExpectedPopulation: initialExpectation,
      initialResidents: initial.pedestrians.residentCount,
      finalResidents: afterTraversal.pedestrians.residentCount,
      finalMixers: afterTraversal.pedestrians.mixerOwnerCount,
      repopulatedDistanceTravelled:
        productionExit(afterTraversal)?.distanceTravelled,
      boundaryExits: afterTraversal.pedestrians.boundaryExitCount,
      repopulations: afterTraversal.pedestrians.repopulationCount,
      completedLifecycleCycles: 3,
      productionExitLifecycle: exited.pedestrians.lifecycleEvents.at(-1),
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

function productionExit(state: BrowserTestSnapshot) {
  return state.pedestrians.pedestrians.find(
    ({ routeId }) => routeId === 'route.north-rim-west',
  );
}

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
