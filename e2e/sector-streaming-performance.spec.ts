import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  BrowserPerformanceCapture,
  BrowserTestSnapshot,
} from '../src/debug/BrowserTestBridge';

const base = '/?e2e=1&skipPicker=1&traffic=0';
const outputDirectory =
  process.env.VANTA_PERF_EVIDENCE_DIR ??
  join(process.cwd(), 'docs/screenshots/perf-002');
const performanceMode = process.env.VANTA_PERF === '1';

// Video/trace encoding competes with software WebGL and invalidates frame pacing.
test.use({ screenshot: 'off', trace: 'off', video: 'off' });

test('streams three deterministic cycles without retained ownership growth', async ({
  page,
}) => {
  const faults = observeBrowserFaults(page);
  await mkdir(outputDirectory, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(base);
  await waitForReady(page);

  // Prime both sides until lazy GPU uploads reach their intentional stable set.
  const primingRendererSamples = await primeRendererOwnership(page);
  await waitForRenderedWorkloadPlateau(page);
  const baseline = await snapshot(page);
  const evidence: BrowserTestSnapshot[] = [];

  for (let cycle = 0; cycle < 3; cycle += 1) {
    await moveAndWait(page, 'spawn.approach-south', 'sector.southwest');
    await moveAndWait(page, 'spawn.approach-north', 'sector.northwest');
    await waitForRenderedWorkloadPlateau(page);
    const current = await snapshot(page);
    evidence.push(current);
    expect(ownership(current)).toEqual(ownership(baseline));
  }

  const rendererSamples = [
    ...primingRendererSamples,
    rendererOwnership(baseline),
    ...evidence.map(rendererOwnership),
  ];
  const geometryCounts = rendererSamples.map(({ geometries }) => geometries);
  const textureCounts = rendererSamples.map(({ textures }) => textures);
  const cycleGeometryCounts = evidence.map(
    ({ performance }) => performance.renderer.geometries,
  );
  expect(new Set(textureCounts)).toEqual(new Set([textureCounts[0]]));
  expect(
    Math.max(...geometryCounts) - Math.min(...geometryCounts),
  ).toBeLessThanOrEqual(rendererGeometryChurnAllowance);
  expect(
    cycleGeometryCounts
      .slice(1)
      .every((count, index) => count > cycleGeometryCounts[index]),
    'raw WebGL geometry registrations must not grow monotonically across settled cycles',
  ).toBe(false);

  expect(evidence.at(-1)?.world.sectors.unloadCount).toBeGreaterThanOrEqual(8);
  expect(faults.consoleErrors).toEqual([]);
  expect(faults.failedRequests).toEqual([]);
  expect(faults.externalRequests).toEqual([]);

  await mkdir(outputDirectory, { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('canvas.game-render-canvas')).toBeVisible();
  await page.screenshot({
    path: join(outputDirectory, 'ashfall-streaming-narrow.png'),
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  const frameBeforeDesktop = (await snapshot(page)).renderer.renderedFrames;
  await expect
    .poll(async () => (await snapshot(page)).renderer.renderedFrames)
    .toBeGreaterThan(frameBeforeDesktop + 2);
  await page.screenshot({
    path: join(outputDirectory, 'ashfall-streaming-desktop.png'),
  });
  await writeFile(
    join(outputDirectory, 'three-cycle-leak-evidence.json'),
    `${JSON.stringify(
      {
        baseline: ownership(baseline),
        cycles: evidence.map(ownership),
        rendererCycles: evidence.map(({ performance }) => ({
          geometries: performance.renderer.geometries,
          textures: performance.renderer.textures,
          drawCalls: performance.renderer.drawCalls,
          triangles: performance.renderer.triangles,
        })),
        network: {
          consoleErrors: faults.consoleErrors,
          failedRequests: faults.failedRequests,
          externalRequests: faults.externalRequests,
          expectedHeadAbortCount: faults.expectedHeadAborts.length,
        },
        finalTransitions: evidence.at(-1)?.world.sectors,
      },
      null,
      2,
    )}\n`,
  );
});

test('traverses every Junction seam with protected geometry resident', async ({
  page,
}, testInfo) => {
  const faults = observeBrowserFaults(page);
  await mkdir(outputDirectory, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(base);
  await waitForReady(page);

  const seams = [
    ['core', 0, 0],
    ['northwest-west-rim', -25, 17],
    ['southwest-west-rim', -25, -17],
    ['northeast-east-quay', 25, 14],
    ['east-quay-east-rim', 40, 14],
    ['southeast-east-rim', 35, -14],
    ['northwest-north-rim', -18, 25],
    ['northeast-north-contact', 22, 25],
    ['southwest-south-rim', -22, -29],
    ['southeast-south-rim', 22, -29],
  ] as const;

  for (const [name, x, z] of seams) {
    await command(page, 'player.teleport-position', `${x},0.22,${z},0`);
    await expect
      .poll(async () => {
        const sectors = (await snapshot(page)).world.sectors;
        const protectedIds = Object.values(sectors.policy.decisions)
          .filter((decision) => decision.protected)
          .map(({ sectorId }) => sectorId);
        return {
          pending: sectors.pending,
          missing: protectedIds.filter(
            (sectorId) => !sectors.active.includes(sectorId),
          ),
        };
      })
      .toEqual({ pending: [], missing: [] });
    await expect
      .poll(async () => {
        const current = await snapshot(page);
        return {
          seam: name,
          grounded: current.player.grounded,
          colliderDelta:
            current.world.initializedColliderCount -
            current.world.activeDeclaredColliderCount,
        };
      })
      .toEqual({ seam: name, grounded: true, colliderDelta: 0 });
    await waitForFrames(page, 2);
    if (['core', 'east-quay-east-rim', 'northwest-north-rim'].includes(name)) {
      await page.screenshot({
        path: join(outputDirectory, `junction-seam-${name}.png`),
      });
      await attachScreenshot(page, testInfo, `junction-seam-${name}`);
    }
  }

  const final = await snapshot(page);
  expect(final.runtimeErrors.count, final.runtimeErrors.last).toBe(0);
  expect(faults.consoleErrors).toEqual([]);
  expect(faults.failedRequests).toEqual([]);
  expect(faults.externalRequests).toEqual([]);
});

test('makes the active mission destination resident before arrival', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${base}&cinematics=0`);
  await waitForReady(page);
  await command(page, 'mission.start', 'ash-001-walk-the-block');
  await command(page, 'mission.complete-objective');

  await expect
    .poll(async () => {
      const state = await snapshot(page);
      const target = state.missions.runtime.highlights[0]?.target.referenceId;
      const decision =
        state.world.sectors.policy.decisions['sector.north-rim-east'];
      return {
        target,
        active: state.world.sectors.active.includes('sector.north-rim-east'),
        protected: decision?.protected,
        reason: decision?.reason,
      };
    })
    .toMatchObject({
      target: 'location.ash-001.contact-yard',
      active: true,
      protected: true,
      reason: 'mission-near',
    });
});

test('records full-level before and streamed 20s/60s performance', async ({
  page,
}) => {
  test.skip(!performanceMode, 'Run with VANTA_PERF=1 for the dedicated gate');
  test.setTimeout(210_000);
  await mkdir(outputDirectory, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${base}&streaming=0`);
  await waitForReady(page);
  const before = await capture(page);

  const faults = observeBrowserFaults(page);
  await page.goto(base);
  await waitForReady(page);
  const after = await capture(page);

  await writeFile(
    join(outputDirectory, 'performance-capture.json'),
    `${JSON.stringify({ before, after }, null, 2)}\n`,
  );

  expect(after.averageFps).toBeGreaterThanOrEqual(50);
  expect(after.onePercentLowFps).toBeGreaterThanOrEqual(45);
  expect(after.frameTimeP95Ms).toBeLessThanOrEqual(20);
  // Renderer totals include sector-aware pedestrians, which intentionally do
  // not spawn for the synthetic `legacy-full-level` sector ID. Compare the
  // authoritative sector-owned scene/resources rather than unlike populations.
  expect(after.sectors.sceneObjects).toBeLessThan(before.sectors.sceneObjects);
  expect(after.sectors.ownedResources).toBeLessThan(
    before.sectors.ownedResources,
  );
  if (after.browserMemory.peakUsedJsHeapSize !== undefined) {
    expect(after.browserMemory.peakUsedJsHeapSize).toBeLessThan(
      900 * 1024 * 1024,
    );
  }
  expect(after.sectors.policy.memory.estimatedWorkingSetMb).toBeLessThan(900);
  expect(faults.consoleErrors).toEqual([]);
  expect(faults.failedRequests).toEqual([]);
  expect(faults.externalRequests).toEqual([]);
});

async function capture(page: Page): Promise<BrowserPerformanceCapture> {
  return page.evaluate(async () => {
    if (!window.__VANTA_TEST__) throw new Error('Test bridge unavailable');
    return window.__VANTA_TEST__.capturePerformance(20_000, 60_000);
  });
}

async function moveAndWait(
  page: Page,
  spawnId: string,
  expectedSector: string,
): Promise<void> {
  await page.evaluate(
    async ({ spawnId: id }) => {
      if (!window.__VANTA_TEST__) throw new Error('Test bridge unavailable');
      await window.__VANTA_TEST__.executeDebugCommand('player.teleport', id);
    },
    { spawnId },
  );
  await expect
    .poll(async () => {
      const state = await snapshot(page);
      const oppositeRim = expectedSector.includes('south')
        ? 'sector.north-rim-west'
        : 'sector.south-rim-west';
      return {
        sectorReady: state.world.sectors.active.includes(expectedSector),
        oppositeRimGone: !state.world.sectors.active.includes(oppositeRim),
        pending: state.world.sectors.pending,
        transitionsPending: state.world.sectors.transitionsPending,
        pedestrianLoads: state.pedestrians.loadingCount,
        assetLoads: state.performance.assets.inFlight,
      };
    })
    .toEqual({
      sectorReady: true,
      oppositeRimGone: true,
      pending: [],
      transitionsPending: false,
      pedestrianLoads: 0,
      assetLoads: 0,
    });
  const renderedFrames = (await snapshot(page)).renderer.renderedFrames;
  await expect
    .poll(async () => (await snapshot(page)).renderer.renderedFrames)
    .toBeGreaterThan(renderedFrames + 2);
}

async function primeRendererOwnership(
  page: Page,
): Promise<ReturnType<typeof rendererOwnership>[]> {
  const samples: ReturnType<typeof rendererOwnership>[] = [];
  for (let cycle = 0; cycle < 3; cycle += 1) {
    await moveAndWait(page, 'spawn.approach-south', 'sector.southwest');
    await moveAndWait(page, 'spawn.approach-north', 'sector.northwest');
    await waitForRenderedWorkloadPlateau(page);
    samples.push(rendererOwnership(await snapshot(page)));
  }
  return samples;
}

async function waitForRenderedWorkloadPlateau(page: Page): Promise<void> {
  let previous = '';
  let stableSamples = 0;
  await expect
    .poll(
      async () => {
        const state = await snapshot(page);
        const current = JSON.stringify({
          ownership: ownership(state),
          drawCalls: state.performance.renderer.drawCalls,
          triangles: state.performance.renderer.triangles,
        });
        stableSamples = current === previous ? stableSamples + 1 : 0;
        previous = current;
        return stableSamples;
      },
      { timeout: 15_000, intervals: [100, 150, 250] },
    )
    .toBeGreaterThanOrEqual(2);
}

// `renderer.info.memory.geometries` is a lazy WebGL cache observation rather
// than an ownership count. One eight-mesh pedestrian source can enter or leave
// that cache while exact sector/resource ownership and rendered work stay flat.
const rendererGeometryChurnAllowance = 8;

async function waitForReady(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__VANTA_TEST__?.snapshot().gameState ?? 'unavailable',
      ),
    )
    .toBe('playing');
}

async function snapshot(page: Page): Promise<BrowserTestSnapshot> {
  return page.evaluate(() => {
    if (!window.__VANTA_TEST__) throw new Error('Test bridge unavailable');
    return window.__VANTA_TEST__.snapshot();
  });
}

function ownership(snapshot: BrowserTestSnapshot) {
  return {
    active: snapshot.world.sectors.active,
    sceneObjects: snapshot.world.sectors.sceneObjects,
    ownedResources: snapshot.world.sectors.ownedResources,
    sectorModelInstances: snapshot.world.sectors.modelInstances,
    assetSourceReferences: snapshot.performance.assets.sourceReferences,
    assetInstanceReferences: snapshot.performance.assets.instanceReferences,
  };
}

function rendererOwnership(snapshot: BrowserTestSnapshot) {
  return {
    geometries: snapshot.performance.renderer.geometries,
    textures: snapshot.performance.renderer.textures,
  };
}

async function command(
  page: Page,
  id: string,
  argument?: string,
): Promise<void> {
  await page.evaluate(
    async ({ commandId, commandArgument }) =>
      window.__VANTA_TEST__!.executeDebugCommand(commandId, commandArgument),
    { commandId: id, commandArgument: argument },
  );
}

async function waitForFrames(page: Page, count: number): Promise<void> {
  const frame = (await snapshot(page)).renderer.renderedFrames;
  await expect
    .poll(async () => (await snapshot(page)).renderer.renderedFrames)
    .toBeGreaterThanOrEqual(frame + count);
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
}

function observeBrowserFaults(page: Page) {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const expectedHeadAborts: string[] = [];
  const externalRequests: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    const detail = `${request.method()} ${request.url()} · ${request.failure()?.errorText ?? 'unknown'}`;
    if (
      request.method() === 'HEAD' &&
      request.failure()?.errorText === 'net::ERR_ABORTED'
    ) {
      expectedHeadAborts.push(detail);
    } else failedRequests.push(detail);
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      !['blob:', 'data:'].includes(url.protocol) &&
      !['127.0.0.1', 'localhost'].includes(url.hostname)
    ) {
      externalRequests.push(request.url());
    }
  });
  return {
    consoleErrors,
    failedRequests,
    expectedHeadAborts,
    externalRequests,
  };
}
