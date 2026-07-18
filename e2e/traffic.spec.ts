import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import path from 'node:path';
import type { BrowserTestSnapshot } from '../src/debug/BrowserTestBridge';

const appUrl =
  '/?e2e=1&debug=1&skipPicker=1&traffic=1&trafficCadence=0&trafficMax=6&trafficSpeed=20';

test.describe('bounded autonomous traffic', () => {
  test('repeats spawn, drive, opposite-edge despawn, and clear without console errors', async ({
    page,
  }) => {
    const failures = monitorFailures(page);
    await openReady(page);
    for (let run = 1; run <= 2; run += 1) {
      await command(page, 'traffic.spawn-each-approach');
      await expect
        .poll(async () => (await snapshot(page)).traffic.spawned)
        .toBe(run * 4);
      const spawned = (await snapshot(page)).traffic;
      expect(
        new Set(spawned.vehicles.map(({ vehicleType }) => vehicleType)),
      ).toEqual(new Set(spawned.catalog.map(({ id }) => id)));
      expect(
        spawned.catalog.every(({ activeVehicles }) => activeVehicles > 0),
      ).toBe(true);
      await command(page, 'traffic.step', '3');
      await command(page, 'traffic.step', '3');
      expect((await snapshot(page)).traffic.despawned).toBe(run * 4);
      expect((await snapshot(page)).traffic.count).toBe(0);
      await command(page, 'traffic.clear');
    }
    const state = await snapshot(page);
    expect(state.traffic.pooledModels).toBe(6);
    expect(state.traffic.catalog).toEqual([
      expect.objectContaining({ id: 'pickup-truck', pooledModels: 3 }),
      expect.objectContaining({ id: 'sports-car', pooledModels: 3 }),
    ]);
    expect(state.runtimeErrors.count, state.runtimeErrors.last).toBe(0);
    expect(failures).toEqual([]);
  });

  test('stops for the player, resumes, follows without overlap, and freezes on pause', async ({
    page,
  }) => {
    await openReady(page);
    await command(page, 'player.teleport-position', '-1.5,0,10,0');
    await command(page, 'traffic.spawn-each-approach');
    await command(page, 'traffic.step', '0.4');
    await command(page, 'traffic.step', '0.4');
    expect(
      (await snapshot(page)).traffic.vehicles.some(
        ({ stoppingReason }) => stoppingReason === 'player',
      ),
    ).toBe(true);
    const stopped = await snapshot(page);
    expect(stopped.traffic.count).toBeLessThanOrEqual(
      stopped.traffic.maxPopulation,
    );

    await command(page, 'player.teleport-position', '10,0,10,0');
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
    await command(page, 'runtime.pause-resume');
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
    await command(page, 'runtime.pause-resume');
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
  });

  test('visualizes paths and detection bounds within performance limits @visual', async ({
    page,
  }) => {
    await openReady(page);
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
    expect(state.traffic.count).toBeLessThanOrEqual(6);
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
      path: screenshotPath('traffic-overhead.png'),
      animations: 'disabled',
    });
    await command(page, 'camera.release-preview');
    await command(page, 'player.teleport-position', '-5,0,17,3.141593');
    await page.screenshot({
      path: screenshotPath('traffic-street-level.png'),
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 430, height: 800 });
    await page.screenshot({
      path: screenshotPath('traffic-narrow.png'),
      animations: 'disabled',
    });
    expect((await snapshot(page)).runtimeErrors.count).toBe(0);
  });
});

async function openReady(page: Page): Promise<void> {
  await page.goto(appUrl);
  await expect
    .poll(async () =>
      page.evaluate(
        () => window.__VANTA_TEST__?.snapshot().gameState ?? 'unavailable',
      ),
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
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(message.text());
  });
  return failures;
}

function screenshotPath(name: string): string {
  return path.join(process.cwd(), 'docs', 'screenshots', name);
}
