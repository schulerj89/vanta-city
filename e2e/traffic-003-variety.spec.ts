import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BrowserTestSnapshot } from '../src/debug/BrowserTestBridge';

const appUrl =
  '/?e2e=1&debug=0&skipPicker=1&traffic=1&trafficCadence=0&trafficMax=8&trafficSpeed=20';
const performanceMode = process.env.VANTA_PERF === '1';

// Video/trace encoding competes with software WebGL and invalidates frame pacing.
// This spec commits its own screenshots and JSON evidence explicitly.
test.use({ screenshot: 'off', trace: 'off', video: 'off' });

test('renders, moves, signals, and bounds every traffic catalog type @visual', async ({
  page,
}) => {
  const faults = monitorFaults(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(appUrl);
  await expect
    .poll(
      () =>
        page.evaluate(
          () => window.__VANTA_TEST__?.snapshot().gameState ?? 'unavailable',
        ),
      { timeout: 20_000 },
    )
    .toBe('playing');
  await command(page, 'runtime.pause-resume');
  await command(page, 'traffic.clear');
  await command(page, 'traffic.spawn-each-approach');
  await command(page, 'traffic.step', '3');
  await command(page, 'traffic.spawn-each-approach');

  const populated = await snapshot(page);
  expect(populated.traffic).toMatchObject({ count: 8, maxPopulation: 8 });
  expect(populated.traffic.pooledModels).toBe(8);
  expect(
    new Set(populated.traffic.vehicles.map(({ vehicleType }) => vehicleType)),
  ).toEqual(new Set(populated.traffic.catalog.map(({ id }) => id)));
  expect(
    populated.traffic.catalog.every(
      ({ pooledModels, activeVehicles }) =>
        pooledModels >= 1 && activeVehicles >= 1,
    ),
  ).toBe(true);

  const progress = new Map(
    populated.traffic.vehicles.map(({ id, progress }) => [id, progress]),
  );
  await command(page, 'traffic.step', '1');
  expect(
    (await snapshot(page)).traffic.vehicles.some(
      ({ id, progress: next }) => next > (progress.get(id) ?? next),
    ),
  ).toBe(true);
  await command(page, 'traffic.step', '5');
  const queued = await snapshot(page);
  expect(queued.traffic.signal.groups['east-west']).toBe('red');
  expect(
    queued.traffic.vehicles.some(
      ({ signalGroup, stoppingReason }) =>
        signalGroup === 'east-west' && stoppingReason === 'signal-red',
    ),
  ).toBe(true);

  await command(page, 'camera.preview-anchor', 'camera.intersection-overhead');
  await page.screenshot({
    path: screenshotPath('traffic-003-gameplay-overhead.png'),
    animations: 'disabled',
  });
  await command(page, 'camera.release-preview');
  await page.screenshot({
    path: screenshotPath('traffic-003-gameplay-street.png'),
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: screenshotPath('traffic-003-gameplay-narrow.png'),
    animations: 'disabled',
  });

  await page.setViewportSize({ width: 1280, height: 720 });
  await command(page, 'camera.preview-anchor', 'camera.signal-two-shot');
  const capture = await page.evaluate(
    ({ warmupMs, measurementMs }) =>
      window.__VANTA_TEST__!.capturePerformance(warmupMs, measurementMs),
    {
      warmupMs: performanceMode ? 2_000 : 500,
      measurementMs: performanceMode ? 5_000 : 1_000,
    },
  );
  const runtime = (await snapshot(page)).performance.runtime;
  const trafficUpdateP95Ms = runtime.enabled
    ? (runtime.systems.traffic?.update?.p95Ms ?? Number.POSITIVE_INFINITY)
    : Number.POSITIVE_INFINITY;
  await command(page, 'traffic.clear');
  const worldOnlyCapture = await page.evaluate(() =>
    window.__VANTA_TEST__!.capturePerformance(1_000, 2_000),
  );
  const trafficRenderCost = {
    drawCalls: capture.renderer.drawCalls - worldOnlyCapture.renderer.drawCalls,
    triangles: capture.renderer.triangles - worldOnlyCapture.renderer.triangles,
  };
  const evidence = {
    ...capture,
    trafficUpdateP95Ms,
    trafficRenderCost: {
      worldOnlyRenderer: worldOnlyCapture.renderer,
      delta: trafficRenderCost,
    },
  };
  if (performanceMode) {
    await writeFile(
      screenshotPath('traffic-003-performance.json'),
      `${JSON.stringify(evidence, null, 2)}\n`,
    );
  }
  expect(trafficRenderCost.drawCalls).toBeGreaterThanOrEqual(0);
  expect(trafficRenderCost.drawCalls).toBeLessThanOrEqual(24);
  expect(trafficRenderCost.triangles).toBeGreaterThanOrEqual(0);
  expect(trafficRenderCost.triangles).toBeLessThan(40_000);
  expect(capture.renderer.triangles).toBeLessThan(150_000);
  if (performanceMode) {
    expect(capture.frameTimeP95Ms).toBeLessThanOrEqual(20);
    expect(capture.averageFps).toBeGreaterThanOrEqual(50);
    expect(capture.onePercentLowFps).toBeGreaterThanOrEqual(45);
  }
  expect(trafficUpdateP95Ms).toBeLessThan(5);
  if (capture.browserMemory.peakUsedJsHeapSize !== undefined) {
    expect(capture.browserMemory.peakUsedJsHeapSize).toBeLessThan(
      900 * 1024 * 1024,
    );
  }
  expect((await snapshot(page)).runtimeErrors.count).toBe(0);
  expect(faults).toEqual({ console: [], failed: [], external: [] });
});

async function snapshot(page: Page): Promise<BrowserTestSnapshot> {
  return page.evaluate(() => window.__VANTA_TEST__!.snapshot());
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

function monitorFaults(page: Page): {
  console: string[];
  failed: string[];
  external: string[];
} {
  const faults = {
    console: [] as string[],
    failed: [] as string[],
    external: [] as string[],
  };
  page.on('pageerror', (error) => faults.console.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') faults.console.push(message.text());
  });
  page.on('requestfailed', (request) => {
    const errorText = request.failure()?.errorText ?? 'unknown';
    if (errorText === 'net::ERR_ABORTED') return;
    faults.failed.push(`${request.url()} ${errorText}`);
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol === 'blob:') return;
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
      faults.external.push(request.url());
    }
  });
  return faults;
}

function screenshotPath(name: string): string {
  return path.join(process.cwd(), 'docs', 'screenshots', 'traffic-003', name);
}
