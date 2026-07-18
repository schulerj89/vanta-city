import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  BrowserPerformanceCapture,
  BrowserTestSnapshot,
} from '../src/debug/BrowserTestBridge';

const base = '/?e2e=1&skipPicker=1&traffic=0';
const outputDirectory = join(process.cwd(), 'docs/screenshots/perf-001');
const performanceMode = process.env.VANTA_PERF === '1';

// Video/trace encoding competes with software WebGL and invalidates frame pacing.
test.use({ screenshot: 'off', trace: 'off', video: 'off' });

test('streams three deterministic cycles without retained ownership growth', async ({
  page,
}) => {
  const faults = observeBrowserFaults(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(base);
  await waitForReady(page);

  // Prime both sides so the shared source cache reaches its intentional stable set.
  for (let warmupCycle = 0; warmupCycle < 3; warmupCycle += 1) {
    await moveAndWait(page, 'spawn.approach-south', 'sector.southwest');
    await moveAndWait(page, 'spawn.approach-north', 'sector.northwest');
  }
  const baseline = await snapshot(page);
  const evidence: BrowserTestSnapshot[] = [];

  for (let cycle = 0; cycle < 3; cycle += 1) {
    await moveAndWait(page, 'spawn.approach-south', 'sector.southwest');
    await moveAndWait(page, 'spawn.approach-north', 'sector.northwest');
    const current = await snapshot(page);
    evidence.push(current);
    expect(ownership(current)).toEqual(ownership(baseline));
  }

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
  expect(after.renderer.drawCalls).toBeLessThanOrEqual(
    before.renderer.drawCalls,
  );
  expect(after.renderer.triangles).toBeLessThanOrEqual(
    before.renderer.triangles,
  );
  if (after.browserMemory.peakUsedJsHeapSize !== undefined) {
    expect(after.browserMemory.peakUsedJsHeapSize).toBeLessThan(
      900 * 1024 * 1024,
    );
  }
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
    .poll(async () => (await snapshot(page)).world.sectors)
    .toMatchObject({
      active: expect.arrayContaining([expectedSector]),
      pending: [],
    });
  const renderedFrames = (await snapshot(page)).renderer.renderedFrames;
  await expect
    .poll(async () => (await snapshot(page)).renderer.renderedFrames)
    .toBeGreaterThan(renderedFrames + 2);
}

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
