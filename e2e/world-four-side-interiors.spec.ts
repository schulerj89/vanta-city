import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BrowserTestSnapshot } from '../src/debug/BrowserTestBridge';

const outputDirectory = join(process.cwd(), 'docs/screenshots/world-004');
const appUrl = '/?e2e=1&skipPicker=1&cinematics=0&traffic=0';
const performanceMode = process.env.VANTA_PERF === '1';

test.use({ video: 'on' });
test.afterEach(async ({ page }, testInfo) => {
  const video = page.video();
  await page.close();
  const fileName = testInfo.title.includes('dedicated WORLD-004')
    ? 'world-004-performance.webm'
    : 'world-004-walkthrough.webm';
  await video?.saveAs(join(outputDirectory, fileName));
});

test('proves four-side growth, both interiors, occupants, maps, and three stable streaming cycles', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const faults = monitorFaults(page);
  await mkdir(outputDirectory, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(appUrl);
  await waitForReady(page);
  await command(page, 'time.day');

  const boundaryViews = [
    ['west-boundary-day', '-45,0.22,10,1.5708'],
    ['east-boundary-day', '59,0.22,-8,-1.5708'],
    ['north-boundary-day', '20,0.22,41,3.14159'],
    ['south-boundary-day', '-20,0.22,-41,0'],
  ] as const;
  for (const [name, pose] of boundaryViews) {
    await command(page, 'camera.release-preview');
    await command(page, 'player.teleport-position', pose);
    await waitForStreaming(page);
    expect((await snapshot(page)).player.grounded, name).toBe(true);
    await waitForFrames(page, 2);
    await page.screenshot({ path: join(outputDirectory, `${name}.png`) });
  }

  await command(page, 'player.teleport', 'spawn.player.home');
  await waitForSector(page, 'sector.world-004-west-south');
  await command(page, 'camera.preview-anchor', 'camera.ashfall.rook-home-wide');
  await waitForCameraPreview(page);
  await expectInteriorOccupant(page, 'route.interior-rook-home-idle-walk');
  await expect
    .poll(async () => (await snapshot(page)).lighting.emissiveFixtureIds)
    .toContain('lamp.interior-rook-home');
  await page.screenshot({
    path: join(outputDirectory, 'rook-home-interior-day.png'),
  });

  await command(page, 'time.night');
  await expect
    .poll(async () => (await snapshot(page)).lighting.nightBlend)
    .toBeGreaterThan(0.95);
  await page.screenshot({
    path: join(outputDirectory, 'rook-home-interior-night.png'),
  });

  await command(page, 'camera.release-preview');
  await command(page, 'player.teleport-position', '54.4,0.42,27,-1.5708');
  await waitForSector(page, 'sector.world-004-east-north');
  await command(
    page,
    'camera.preview-anchor',
    'camera.ashfall.night-venue-wide',
  );
  await waitForCameraPreview(page);
  await expectInteriorOccupant(page, 'route.interior-night-venue-service');
  const venue = await snapshot(page);
  expect(venue.lighting).toMatchObject({
    localLightCount: 4,
    maxLocalLights: 4,
    nightBlend: 1,
    emissiveFixtureIds: expect.arrayContaining(['lamp.interior-night-venue']),
  });
  expect(venue.lighting.emissiveFixtureIds).not.toContain(
    'lamp.interior-rook-home',
  );
  await page.screenshot({
    path: join(outputDirectory, 'night-venue-interior-night.png'),
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await waitForFrames(page, 2);
  await page.screenshot({
    path: join(outputDirectory, 'night-venue-interior-narrow-night.png'),
  });

  await page.setViewportSize({ width: 1280, height: 720 });
  await command(page, 'camera.release-preview');
  await command(page, 'player.teleport', 'spawn.player.clinic');
  await waitForSector(page, 'sector.world-004-south-east');
  const clinic = await snapshot(page);
  expect(clinic.player).toMatchObject({
    grounded: true,
    groundColliderId: 'c.sidewalk-world-004-clinic-foyer',
  });
  await page.screenshot({
    path: join(outputDirectory, 'clinic-spawn-night.png'),
  });

  await page.keyboard.press('m');
  await expect(page.getByTestId('full-world-map')).toBeVisible();
  expect((await snapshot(page)).fullWorldMap).toMatchObject({
    geometryCount: 49,
    roadCount: 10,
    structureCount: 39,
    sectorCount: 22,
  });
  await page.screenshot({
    path: join(outputDirectory, 'full-map-desktop.png'),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await waitForFrames(page, 2);
  await page.screenshot({ path: join(outputDirectory, 'full-map-narrow.png') });
  await page.keyboard.press('m');

  await page.setViewportSize({ width: 1280, height: 720 });
  for (let warmup = 0; warmup < 2; warmup += 1) {
    await command(page, 'player.teleport', 'spawn.player.home');
    await waitForSector(page, 'sector.world-004-west-south');
    await command(page, 'player.teleport-position', '54.4,0.42,27,-1.5708');
    await waitForSector(page, 'sector.world-004-east-north');
    await command(page, 'player.teleport', 'spawn.player-default');
    await waitForStreaming(page);
  }
  const homeOwnership: OwnershipSample[] = [];
  const venueOwnership: OwnershipSample[] = [];
  for (let cycle = 0; cycle < 3; cycle += 1) {
    await command(page, 'player.teleport', 'spawn.player.home');
    await waitForSector(page, 'sector.world-004-west-south');
    homeOwnership.push(await stableOwnership(page));
    await command(page, 'player.teleport-position', '54.4,0.42,27,-1.5708');
    await waitForSector(page, 'sector.world-004-east-north');
    venueOwnership.push(await stableOwnership(page));
    await command(page, 'player.teleport', 'spawn.player-default');
    await waitForStreaming(page);
  }
  expect(homeOwnership.map(logicalOwnership).slice(1)).toEqual([
    logicalOwnership(homeOwnership[0]),
    logicalOwnership(homeOwnership[0]),
  ]);
  expect(venueOwnership.map(logicalOwnership).slice(1)).toEqual([
    logicalOwnership(venueOwnership[0]),
    logicalOwnership(venueOwnership[0]),
  ]);
  expect(homeOwnership[2].geometries).toBe(homeOwnership[1].geometries);
  expect(venueOwnership[2].geometries).toBe(venueOwnership[1].geometries);
  const coreLighting = (await snapshot(page)).lighting;
  expect(coreLighting.emissiveFixtureIds).not.toContain(
    'lamp.interior-rook-home',
  );
  expect(coreLighting.emissiveFixtureIds).not.toContain(
    'lamp.interior-night-venue',
  );

  const performance = await page.evaluate(() =>
    window.__VANTA_TEST__!.capturePerformance(1_000, 3_000),
  );
  if (performanceMode) {
    expect(performance.frameTimeP95Ms).toBeLessThanOrEqual(20);
    expect(performance.averageFps).toBeGreaterThanOrEqual(50);
    expect(performance.onePercentLowFps).toBeGreaterThanOrEqual(45);
  }
  expect(performance.renderer.triangles).toBeLessThan(150_000);
  if (performance.browserMemory.peakUsedJsHeapSize !== undefined) {
    expect(performance.browserMemory.peakUsedJsHeapSize).toBeLessThan(
      900 * 1024 * 1024,
    );
  }
  const final = await snapshot(page);
  const report = {
    bounds: final.minimapHud.bounds,
    buildingCount: 37,
    sectorCount: final.world.sectors.authored,
    textureFamilies: [
      'environment.ashfall-building.venue-terrazzo',
      'environment.ashfall-building.home-linoleum',
    ],
    occupantRoutes: [
      'route.interior-night-venue-service',
      'route.interior-rook-home-idle-walk',
    ],
    animationIntent: ['walk', 'idle'],
    homeOwnership,
    venueOwnership,
    performance,
    lighting: final.lighting,
    runtimeErrors: final.runtimeErrors,
    faults,
  };
  await writeFile(
    join(outputDirectory, 'capture-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  expect(final.runtimeErrors.count, final.runtimeErrors.last).toBe(0);
  expect(faults.consoleErrors).toEqual([]);
  expect(faults.pageErrors).toEqual([]);
  expect(faults.failedRequests).toEqual([]);
  expect(faults.externalRequests).toEqual([]);
});

test('records dedicated WORLD-004 20s/60s performance', async ({ page }) => {
  test.skip(!performanceMode, 'Set VANTA_PERF=1 for the long performance run.');
  test.setTimeout(100_000);
  const faults = monitorFaults(page);
  await mkdir(outputDirectory, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(appUrl);
  await waitForReady(page);
  await command(page, 'time.night');
  await command(page, 'player.teleport-position', '54.4,0.42,27,-1.5708');
  await waitForSector(page, 'sector.world-004-east-north');

  const performance = await page.evaluate(() =>
    window.__VANTA_TEST__!.capturePerformance(20_000, 60_000),
  );
  await writeFile(
    join(outputDirectory, 'performance-capture.json'),
    `${JSON.stringify(performance, null, 2)}\n`,
  );

  expect(performance.frameTimeP95Ms).toBeLessThanOrEqual(20);
  expect(performance.averageFps).toBeGreaterThanOrEqual(50);
  expect(performance.onePercentLowFps).toBeGreaterThanOrEqual(45);
  expect(performance.renderer.triangles).toBeLessThan(150_000);
  if (performance.browserMemory.peakUsedJsHeapSize !== undefined) {
    expect(performance.browserMemory.peakUsedJsHeapSize).toBeLessThan(
      900 * 1024 * 1024,
    );
  }
  expect(faults.consoleErrors).toEqual([]);
  expect(faults.pageErrors).toEqual([]);
  expect(faults.failedRequests).toEqual([]);
  expect(faults.externalRequests).toEqual([]);
});

interface OwnershipSample {
  readonly activeSectorCount: number;
  readonly activeDeclaredColliderCount: number;
  readonly initializedColliderCount: number;
  readonly assetInstances: number;
  readonly sourceReferences: number;
  readonly textures: number;
  readonly geometries: number;
  readonly pedestrianResidents: number;
  readonly pedestrianMixers: number;
  readonly emissiveFixtureIds: readonly string[];
  readonly emissiveMaterialCount: number;
  readonly localLightCount: number;
}

function ownership(state: BrowserTestSnapshot): OwnershipSample {
  return {
    activeSectorCount: state.world.sectors.active.length,
    activeDeclaredColliderCount: state.world.activeDeclaredColliderCount,
    initializedColliderCount: state.world.initializedColliderCount,
    assetInstances: state.performance.assets.instanceReferences,
    sourceReferences: state.performance.assets.sourceReferences,
    textures: state.performance.renderer.textures,
    geometries: state.performance.renderer.geometries,
    pedestrianResidents: state.pedestrians.residentCount,
    pedestrianMixers: state.pedestrians.mixerOwnerCount,
    emissiveFixtureIds: state.lighting.emissiveFixtureIds,
    emissiveMaterialCount: state.lighting.emissiveMaterialCount,
    localLightCount: state.lighting.localLightCount,
  };
}

function logicalOwnership(sample: OwnershipSample) {
  return {
    activeSectorCount: sample.activeSectorCount,
    activeDeclaredColliderCount: sample.activeDeclaredColliderCount,
    initializedColliderCount: sample.initializedColliderCount,
    assetInstances: sample.assetInstances,
    sourceReferences: sample.sourceReferences,
    textures: sample.textures,
    pedestrianResidents: sample.pedestrianResidents,
    pedestrianMixers: sample.pedestrianMixers,
    emissiveFixtureIds: sample.emissiveFixtureIds,
    emissiveMaterialCount: sample.emissiveMaterialCount,
    localLightCount: sample.localLightCount,
  };
}

async function stableOwnership(page: Page): Promise<OwnershipSample> {
  let previous = '';
  let matchingSamples = 0;
  let latest: OwnershipSample | undefined;
  await expect
    .poll(async () => {
      latest = ownership(await snapshot(page));
      const key = JSON.stringify(latest);
      matchingSamples = key === previous ? matchingSamples + 1 : 0;
      previous = key;
      return matchingSamples;
    })
    .toBeGreaterThanOrEqual(2);
  return latest!;
}

async function expectInteriorOccupant(
  page: Page,
  routeId: string,
): Promise<void> {
  await expect
    .poll(async () => {
      const state = await snapshot(page);
      const occupant = state.pedestrians.pedestrians.find(
        ({ routeId: candidate }) => candidate === routeId,
      );
      return occupant
        ? {
            grounded: occupant.grounded,
            animation: occupant.currentAnimation,
            routeId: occupant.routeId,
          }
        : undefined;
    })
    .toMatchObject({
      grounded: true,
      animation: expect.stringMatching(/^(walk|idle)$/),
      routeId,
    });
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

async function waitForSector(page: Page, sectorId: string): Promise<void> {
  await waitForStreaming(page);
  await expect
    .poll(async () => (await snapshot(page)).world.sectors.active)
    .toContain(sectorId);
}

async function waitForStreaming(page: Page): Promise<void> {
  await expect
    .poll(async () => (await snapshot(page)).world.sectors.pending)
    .toEqual([]);
  await expect
    .poll(async () => (await snapshot(page)).player.grounded)
    .toBe(true);
}

async function waitForCameraPreview(page: Page): Promise<void> {
  await expect
    .poll(async () => (await snapshot(page)).camera)
    .toMatchObject({
      owner: 'debug:camera-anchor-preview',
      transitionProgress: 1,
    });
}

async function command(
  page: Page,
  id: string,
  argument?: string,
): Promise<void> {
  await page.evaluate(
    ({ commandId, commandArgument }) =>
      window.__VANTA_TEST__!.executeDebugCommand(commandId, commandArgument),
    { commandId: id, commandArgument: argument },
  );
}

async function snapshot(page: Page): Promise<BrowserTestSnapshot> {
  return page.evaluate(() => window.__VANTA_TEST__!.snapshot());
}

async function waitForFrames(page: Page, count: number): Promise<void> {
  const frame = (await snapshot(page)).renderer.renderedFrames;
  await expect
    .poll(async () => (await snapshot(page)).renderer.renderedFrames)
    .toBeGreaterThanOrEqual(frame + count);
}

function monitorFaults(page: Page) {
  const faults = {
    consoleErrors: [] as string[],
    pageErrors: [] as string[],
    failedRequests: [] as string[],
    externalRequests: [] as string[],
  };
  page.on('console', (message) => {
    if (message.type() === 'error') faults.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => faults.pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    if (
      request.method() !== 'HEAD' ||
      request.failure()?.errorText !== 'net::ERR_ABORTED'
    ) {
      faults.failedRequests.push(`${request.method()} ${request.url()}`);
    }
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      !['blob:', 'data:'].includes(url.protocol) &&
      !['127.0.0.1', 'localhost'].includes(url.hostname)
    ) {
      faults.externalRequests.push(request.url());
    }
  });
  return faults;
}

declare global {
  interface Window {
    __VANTA_TEST__?: import('../src/debug/BrowserTestBridge').BrowserTestApi;
  }
}
