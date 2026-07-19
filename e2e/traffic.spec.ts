import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import path from 'node:path';
import type { BrowserTestSnapshot } from '../src/debug/BrowserTestBridge';

const appUrl =
  '/?e2e=1&debug=1&skipPicker=1&traffic=1&trafficCadence=0&trafficMax=8&trafficSpeed=20';

test.describe('bounded autonomous traffic', () => {
  test('repeats spawn, drive, opposite-edge despawn, and clear without console errors', async ({
    page,
  }) => {
    const failures = monitorFailures(page);
    await openReady(page);
    await command(page, 'runtime.pause-resume');
    for (let run = 1; run <= 2; run += 1) {
      await command(page, 'traffic.clear');
      await command(page, 'traffic.spawn-each-approach');
      await command(page, 'traffic.step', '3');
      await command(page, 'traffic.spawn-each-approach');
      await expect
        .poll(async () => (await snapshot(page)).traffic.spawned)
        .toBe(run * 8);
      const spawned = (await snapshot(page)).traffic;
      expect(spawned.count).toBeGreaterThanOrEqual(6);
      expect(
        new Set(spawned.vehicles.map(({ vehicleType }) => vehicleType)),
      ).toEqual(new Set(spawned.catalog.map(({ id }) => id)));
      expect(
        spawned.catalog.every(({ activeVehicles }) => activeVehicles > 0),
      ).toBe(true);
      for (let step = 0; step < 4; step += 1) {
        await command(page, 'traffic.step', '10');
      }
      expect((await snapshot(page)).traffic.despawned).toBe(run * 8);
      expect((await snapshot(page)).traffic.count).toBe(0);
    }
    const state = await snapshot(page);
    expect(state.traffic.pooledModels).toBe(8);
    expect(state.traffic.catalog).toEqual([
      expect.objectContaining({ id: 'pickup-truck', pooledModels: 2 }),
      expect.objectContaining({ id: 'sports-car', pooledModels: 1 }),
      expect.objectContaining({ id: 'sport-coupe', pooledModels: 1 }),
      expect.objectContaining({ id: 'family-sedan', pooledModels: 1 }),
      expect.objectContaining({ id: 'taxi-sedan', pooledModels: 1 }),
      expect.objectContaining({ id: 'suv', pooledModels: 1 }),
      expect.objectContaining({ id: 'compact-wagon', pooledModels: 1 }),
    ]);
    expect(state.runtimeErrors.count, state.runtimeErrors.last).toBe(0);
    expect(failures).toEqual([]);
  });

  test('stops for the player, resumes, follows without overlap, and freezes on pause', async ({
    page,
  }) => {
    const failures = monitorFailures(page);
    await openReady(page);
    await command(page, 'runtime.pause-resume');
    await command(page, 'player.teleport-position', '-1.5,0,24,0');
    await command(page, 'traffic.spawn-each-approach');
    await command(page, 'traffic.step', '0.5');
    expect(
      (await snapshot(page)).traffic.vehicles.some(
        ({ stoppingReason }) => stoppingReason === 'player',
      ),
    ).toBe(true);
    const stopped = await snapshot(page);
    expect(stopped.traffic.count).toBeLessThanOrEqual(
      stopped.traffic.maxPopulation,
    );

    await command(page, 'player.teleport-position', '12,0,12,0');
    const stoppedProgress = stopped.traffic.vehicles.find(
      ({ stoppingReason }) => stoppingReason === 'player',
    )!.progress;
    await command(page, 'traffic.step', '0.5');
    expect(
      (await snapshot(page)).traffic.vehicles.find(
        ({ approach }) => approach === 'north',
      )?.progress ?? 49,
    ).toBeGreaterThan(stoppedProgress);

    await command(page, 'traffic.clear');
    await command(page, 'traffic.spawn-each-approach');
    await command(page, 'traffic.step', '0.2');
    const paused = await snapshot(page);
    const pausedProgress = paused.traffic.vehicles.map(
      ({ progress }) => progress,
    );
    const pausedFrame = paused.renderer.renderedFrames;
    await expect
      .poll(async () => (await snapshot(page)).renderer.renderedFrames)
      .toBeGreaterThan(pausedFrame);
    expect(
      (await snapshot(page)).traffic.vehicles.map(({ progress }) => progress),
    ).toEqual(pausedProgress);
    await command(page, 'traffic.step', '0.2');
    expect(
      Math.max(
        ...(await snapshot(page)).traffic.vehicles.map(
          ({ progress }, index) => progress - (pausedProgress[index] ?? 0),
        ),
      ),
    ).toBeGreaterThan(0);

    const vehicles = (await snapshot(page)).traffic.vehicles;
    for (const approach of ['north', 'east', 'south', 'west'] as const) {
      const lane = vehicles
        .filter((vehicle) => vehicle.approach === approach)
        .sort((a, b) => a.progress - b.progress);
      for (let index = 1; index < lane.length; index += 1) {
        expect(
          lane[index].progress - lane[index - 1].progress,
        ).toBeGreaterThanOrEqual(6.39);
      }
    }
    expect(failures).toEqual([]);
  });

  test('visualizes paths and detection bounds within performance limits @visual', async ({
    page,
  }) => {
    const failures = monitorFailures(page);
    await openReady(page);
    await command(page, 'runtime.pause-resume');
    await command(page, 'traffic.clear');
    await command(page, 'traffic.spawn-each-approach');
    await command(page, 'traffic.step', '3');
    await command(page, 'traffic.spawn-each-approach');
    await page.evaluate(() =>
      window.__VANTA_TEST__!.setDebugToggle('visual.navigation', true),
    );
    await expect
      .poll(async () => (await snapshot(page)).traffic.visualizationVisible)
      .toBe(true);
    await expect
      .poll(async () => {
        const runtime = (await snapshot(page)).performance.runtime;
        return runtime.enabled
          ? (runtime.systems.traffic?.update?.samples ?? 0)
          : 0;
      })
      .toBeGreaterThan(0);
    const state = await snapshot(page);
    expect(state.traffic.count).toBeGreaterThanOrEqual(6);
    expect(
      state.traffic.catalog.every(({ activeVehicles }) => activeVehicles > 0),
    ).toBe(true);
    expect(state.performance.renderer.drawCalls).toBeLessThan(150);
    expect(state.performance.renderer.triangles).toBeLessThan(150_000);
    const runtime = state.performance.runtime;
    expect(runtime.enabled).toBe(true);
    expect(
      runtime.enabled
        ? (runtime.systems.traffic?.update?.p95Ms ?? Infinity)
        : Infinity,
    ).toBeLessThan(5);

    await command(
      page,
      'camera.preview-anchor',
      'camera.intersection-overhead',
    );
    await page.screenshot({
      path: screenshotPath('traffic-002-overhead-four-approaches.png'),
      animations: 'disabled',
    });
    await page.evaluate(() =>
      window.__VANTA_TEST__!.setDebugToggle('visual.navigation', false),
    );
    await command(page, 'camera.release-preview');
    await command(page, 'camera.preview-anchor', 'camera.signal-two-shot');
    await command(page, 'traffic.step', '5');
    const queued = await snapshot(page);
    expect(queued.traffic.signal.groups['east-west']).toBe('red');
    expect(
      queued.traffic.vehicles.some(
        ({ signalGroup }) => signalGroup === 'east-west',
      ),
    ).toBe(true);
    await page.screenshot({
      path: screenshotPath('traffic-002-red-queue.png'),
      animations: 'disabled',
    });
    await command(page, 'camera.release-preview');
    await command(
      page,
      'camera.preview-anchor',
      'camera.traffic-signal-north-review',
    );
    await command(page, 'traffic.step', '4');
    expect((await snapshot(page)).traffic.signal.phase).toBe(
      'north-south-yellow',
    );
    await command(page, 'traffic.step', '3');
    expect((await snapshot(page)).traffic.signal.groups).toEqual({
      'north-south': 'red',
      'east-west': 'red',
    });
    await page.screenshot({
      path: screenshotPath('traffic-002-all-red.png'),
      animations: 'disabled',
    });
    await command(page, 'camera.release-preview');
    await command(page, 'camera.preview-anchor', 'camera.signal-two-shot');
    const heldProgress = (await snapshot(page)).traffic.vehicles
      .filter(({ signalGroup }) => signalGroup === 'east-west')
      .map(({ progress }) => progress);
    await command(page, 'traffic.step', '1.5');
    const released = await snapshot(page);
    expect(released.traffic.signal.groups['east-west']).toBe('green');
    expect(
      released.traffic.vehicles
        .filter(({ signalGroup }) => signalGroup === 'east-west')
        .some(({ progress }, index) => progress > (heldProgress[index] ?? 0)),
    ).toBe(true);
    await page.screenshot({
      path: screenshotPath('traffic-002-green-release.png'),
      animations: 'disabled',
    });
    await command(page, 'runtime.pause-resume');
    await command(page, 'time.night');
    await expect
      .poll(async () => {
        const lighting = (await snapshot(page)).lighting;
        return [lighting.preset, lighting.nightBlend, lighting.transitioning];
      })
      .toEqual(['night', 1, false]);
    await command(page, 'runtime.pause-resume');
    await page.screenshot({
      path: screenshotPath('traffic-002-night-signals.png'),
      animations: 'disabled',
    });
    await command(page, 'runtime.pause-resume');
    await command(page, 'time.day');
    await expect
      .poll(async () => {
        const lighting = (await snapshot(page)).lighting;
        return [lighting.preset, lighting.nightBlend, lighting.transitioning];
      })
      .toEqual(['day', 0, false]);
    await command(page, 'runtime.pause-resume');
    const greenRemaining = (await snapshot(page)).traffic.signal.remaining;
    if (greenRemaining > 10) {
      await command(page, 'traffic.step', '10');
      await command(page, 'traffic.step', `${greenRemaining - 9.9}`);
    } else {
      await command(page, 'traffic.step', `${greenRemaining + 0.1}`);
    }
    expect((await snapshot(page)).traffic.signal.phase).toBe(
      'east-west-yellow',
    );
    await page.screenshot({
      path: screenshotPath('traffic-002-yellow-decision.png'),
      animations: 'disabled',
    });
    await command(page, 'camera.release-preview');
    await command(page, 'player.teleport-position', '-5,0,17,3.141593');
    await page.screenshot({
      path: screenshotPath('traffic-002-street-level.png'),
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 430, height: 800 });
    await page.screenshot({
      path: screenshotPath('traffic-002-narrow.png'),
      animations: 'disabled',
    });
    expect((await snapshot(page)).runtimeErrors.count).toBe(0);
    expect(failures).toEqual([]);
  });

  test('keeps the traffic pool stable through a sector unload', async ({
    page,
  }) => {
    const failures = monitorFailures(page);
    await openReady(page);
    const baseline = await snapshot(page);
    const unloadCount = baseline.world.sectors.unloadCount;
    await command(page, 'player.teleport-position', '38,0,24,0');
    await expect
      .poll(async () => (await snapshot(page)).world.sectors.unloadCount)
      .toBeGreaterThan(unloadCount);
    const streamed = await snapshot(page);
    expect(streamed.traffic.pooledModels).toBe(8);
    expect(streamed.performance.assets.instanceReferences).toBeLessThanOrEqual(
      baseline.performance.assets.instanceReferences,
    );
    expect(streamed.runtimeErrors.count, streamed.runtimeErrors.last).toBe(0);
    expect(failures).toEqual([]);
  });
});

async function openReady(page: Page): Promise<void> {
  await page.goto(appUrl);
  await expect
    .poll(
      async () =>
        page.evaluate(
          () => window.__VANTA_TEST__?.snapshot().gameState ?? 'unavailable',
        ),
      { timeout: 20_000 },
    )
    .toBe('playing');
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
    async ({ commandId, commandArgument }) =>
      window.__VANTA_TEST__!.executeDebugCommand(commandId, commandArgument),
    { commandId: id, commandArgument: argument },
  );
}

function monitorFailures(page: Page): string[] {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('requestfailed', (request) => {
    const errorText = request.failure()?.errorText ?? 'unknown';
    // Asset fallback probes cancel redundant fetches once one source succeeds.
    if (errorText === 'net::ERR_ABORTED') return;
    failures.push(`request failed: ${request.url()} ${errorText}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(message.text());
  });
  return failures;
}

function screenshotPath(name: string): string {
  return path.join(process.cwd(), 'docs', 'screenshots', 'traffic-002', name);
}
