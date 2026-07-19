import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BrowserTestSnapshot } from '../src/debug/BrowserTestBridge';

const outputDirectory = join(process.cwd(), 'docs/screenshots/world-002ab');
const appUrl = '/?e2e=1&skipPicker=1&traffic=0';

test('captures final Junction rims, bounds, maps, and clean runtime evidence', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const faults = monitorFaults(page);
  await mkdir(outputDirectory, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(appUrl);
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__VANTA_TEST__?.snapshot().gameState ?? 'unavailable',
      ),
    )
    .toBe('playing');
  await command(page, 'time.day');

  for (const [name, spawnId, sectorId, anchorId] of [
    [
      'west-rim-day',
      'spawn.rim-west',
      'sector.west-rim-north',
      'camera.world-002b.west-rim',
    ],
    [
      'east-rim-curve-day',
      'spawn.rim-east',
      'sector.east-rim-north',
      'camera.world-002b.east-rim',
    ],
    [
      'south-rim-day',
      'spawn.rim-south',
      'sector.south-rim-east',
      'camera.world-002b.south-rim',
    ],
    [
      'north-contact-entrance-day',
      'spawn.ash-001.contact',
      'sector.north-rim-east',
      'camera.ash-001.contact-reveal',
    ],
  ] as const) {
    await teleportAndPreview(page, spawnId, sectorId, anchorId);
    await page.screenshot({ path: join(outputDirectory, `${name}.png`) });
  }

  await page.goto(`${appUrl}&streaming=0`);
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__VANTA_TEST__?.snapshot().gameState ?? 'unavailable',
      ),
    )
    .toBe('playing');
  await command(page, 'time.day');
  await command(page, 'camera.preview-anchor', 'camera.world-002b.overhead');
  await waitForFrames(page, 2);
  await page.screenshot({
    path: join(outputDirectory, 'overhead-final-bounds-day.png'),
  });

  await command(page, 'time.night');
  await expect
    .poll(async () => (await snapshot(page)).lighting.nightBlend)
    .toBeGreaterThan(0.95);
  await command(page, 'camera.preview-anchor', worldContactAnchor);
  await waitForFrames(page, 2);
  await page.screenshot({
    path: join(outputDirectory, 'north-contact-entrance-night.png'),
  });

  await page.keyboard.press('m');
  await expect(page.getByTestId('full-world-map')).toBeVisible();
  await page.screenshot({ path: join(outputDirectory, 'full-map-final.png') });
  await page.keyboard.press('m');
  await expect
    .poll(async () => (await snapshot(page)).gameState)
    .toBe('playing');

  await page.setViewportSize({ width: 390, height: 844 });
  await waitForFrames(page, 2);
  await page.screenshot({
    path: join(outputDirectory, 'north-contact-narrow-night.png'),
  });

  const final = await snapshot(page);
  const report = {
    viewport: { desktop: '1280x720', narrow: '390x844' },
    selectedVisibilityProfile: 'baseline-26-32-24',
    levelId: final.world.levelId,
    bounds: final.minimapHud.bounds,
    sectors: final.world.sectors,
    renderer: final.performance.renderer,
    assets: final.performance.assets,
    runtimeErrors: final.runtimeErrors,
    faults,
    screenshots: [
      'west-rim-day.png',
      'east-rim-curve-day.png',
      'south-rim-day.png',
      'north-contact-entrance-day.png',
      'overhead-final-bounds-day.png',
      'north-contact-entrance-night.png',
      'full-map-final.png',
      'north-contact-narrow-night.png',
    ],
  };
  await writeFile(
    join(outputDirectory, 'capture-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  expect(final.runtimeErrors.count).toBe(0);
  expect(faults.consoleErrors).toEqual([]);
  expect(faults.pageErrors).toEqual([]);
  expect(faults.failedRequests).toEqual([]);
  expect(faults.externalRequests).toEqual([]);
});

const worldContactAnchor = 'camera.ash-001.contact-reveal';

async function teleportAndPreview(
  page: Page,
  spawnId: string,
  sectorId: string,
  anchorId: string,
): Promise<void> {
  await command(page, 'camera.release-preview');
  await command(page, 'player.teleport', spawnId);
  await expect
    .poll(async () => (await snapshot(page)).world.sectors)
    .toMatchObject({ active: expect.arrayContaining([sectorId]), pending: [] });
  if (anchorId) await command(page, 'camera.preview-anchor', anchorId);
  else {
    await expect
      .poll(async () => (await snapshot(page)).camera)
      .toMatchObject({ owner: 'gameplay', transitionProgress: 1 });
  }
  await waitForFrames(page, 2);
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
