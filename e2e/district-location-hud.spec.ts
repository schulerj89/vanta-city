import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import type {
  BrowserTestApi,
  BrowserTestSnapshot,
} from '../src/debug/BrowserTestBridge';

const appUrl = '/?e2e=1&skipPicker=1';
const destinations = [
  ['spawn.outer-north-gate', 'landmark.north-gate', 'north-gate'],
  ['spawn.outer-south-gate', 'landmark.south-gate', 'south-gate'],
  ['spawn.outer-east-plaza', 'landmark.exchange-beacon', 'east-exchange'],
  ['spawn.outer-west-yard', 'landmark.freight-stack', 'west-service-yard'],
  ['spawn.outer-overlook', 'landmark.skyline-bench', 'raised-overlook'],
] as const;

test.describe('expanded district and location HUD', () => {
  test('grounds every outer destination and updates authored location metadata', async ({
    page,
  }, testInfo) => {
    await openReadyApp(page);

    for (const [spawnId, locationId, screenshotName] of destinations) {
      await command(page, 'player.teleport', spawnId);
      await expect
        .poll(async () => {
          const state = await snapshot(page);
          return {
            grounded: state.player.grounded,
            ground: state.player.groundColliderId,
            location: state.locationHud.locationId,
          };
        })
        .toEqual({
          grounded: true,
          ground: expect.stringMatching(/^c\./),
          location: locationId,
        });
      const state = await snapshot(page);
      expect(state.locationHud.visible).toBe(true);
      expect(state.locationHud.coordinates).toMatch(
        /^X [+-]\d+\.\d · Y [+-]\d+\.\d · Z [+-]\d+\.\d$/,
      );
      expect(
        Math.max(
          Math.abs(state.player.position.x),
          Math.abs(state.player.position.z),
        ),
      ).toBeGreaterThanOrEqual(30);
      expect(state.player.position.y).toBeGreaterThanOrEqual(-0.01);
      expect(state.runtimeErrors.count, state.runtimeErrors.last).toBe(0);
      await attachScreenshot(page, testInfo, screenshotName);
    }

    await command(page, 'player.teleport', 'spawn.outer-north-gate');
    const before = (await snapshot(page)).player.position;
    await page.keyboard.down('w');
    await expect
      .poll(async () =>
        horizontalDistance((await snapshot(page)).player.position, before),
      )
      .toBeGreaterThan(1);
    await page.keyboard.up('w');
    const walked = await snapshot(page);
    expect(walked.player.grounded).toBe(true);
    expect(walked.player.groundColliderId).not.toBe('world-floor');
  });

  test('captures the debug map and camera obstruction recovery', async ({
    page,
  }, testInfo) => {
    await openReadyApp(page);
    await command(page, 'helpers.toggle', 'collision');
    await command(page, 'helpers.toggle', 'spawnPoints');
    await command(page, 'helpers.toggle', 'triggers');
    await command(page, 'camera.preview-anchor', 'camera.district-overhead');
    await expect
      .poll(async () => {
        const camera = (await snapshot(page)).camera;
        return {
          mode: camera.mode,
          anchor: camera.activeAnchorId,
          transitioned: camera.transitionProgress > 0.98,
          overhead: camera.position.y > 100,
        };
      })
      .toEqual({
        mode: 'cinematic',
        anchor: 'camera.district-overhead',
        transitioned: true,
        overhead: true,
      });
    await attachScreenshot(page, testInfo, 'district-overhead-debug-map');
    await command(page, 'camera.release-preview');
    await expect
      .poll(async () => (await snapshot(page)).camera.mode)
      .toBe('gameplay');

    // Reset the deliberately extreme overhead composition before exercising
    // the existing gameplay-camera obstruction/recovery route.
    await openReadyApp(page);

    await command(page, 'player.teleport', 'spawn.geometry-service-entry');
    await expect
      .poll(async () => (await snapshot(page)).camera.obstructed)
      .toBe(true);
    await command(page, 'player.teleport-position', '17,0,17,0.785398');
    await expect
      .poll(async () => (await snapshot(page)).camera.obstructed)
      .toBe(false);
    await expect
      .poll(async () => {
        const camera = (await snapshot(page)).camera;
        return camera.desiredDistance - camera.actualDistance;
      })
      .toBeLessThan(0.08);
    expect((await snapshot(page)).runtimeErrors.count).toBe(0);
  });

  test('stays readable beside health through pause, dialogue, help, and narrow layout', async ({
    page,
  }, testInfo) => {
    await openReadyApp(page);
    await command(page, 'player.teleport', 'spawn.outer-east-plaza');
    await expect(
      page.getByRole('complementary', { name: 'Current location' }),
    ).toBeVisible();

    await page.keyboard.press('p');
    await expect
      .poll(async () => (await snapshot(page)).gameState)
      .toBe('paused');
    expect((await snapshot(page)).locationHud.visible).toBe(true);
    await page.keyboard.press('p');
    await expect
      .poll(async () => (await snapshot(page)).gameState)
      .toBe('playing');

    await command(page, 'dialogue.start-mack');
    await expect
      .poll(async () => (await snapshot(page)).gameState)
      .toBe('dialogue');
    expect((await snapshot(page)).locationHud.visible).toBe(true);
    await page.keyboard.press('Escape');
    await expect
      .poll(async () => (await snapshot(page)).gameState)
      .toBe('playing');

    await page.keyboard.press('h');
    await expect
      .poll(async () => (await snapshot(page)).controls.help.open)
      .toBe(true);
    expect((await snapshot(page)).locationHud.visible).toBe(true);
    await page.keyboard.press('Escape');

    await page.setViewportSize({ width: 390, height: 720 });
    const location = page.getByRole('complementary', {
      name: 'Current location',
    });
    const health = page.locator('.health-hud__player');
    await expect(location).toBeVisible();
    await expect(health).toBeVisible();
    const [locationBox, healthBox] = await Promise.all([
      location.boundingBox(),
      health.boundingBox(),
    ]);
    expect(locationBox).not.toBeNull();
    expect(healthBox).not.toBeNull();
    if (locationBox && healthBox)
      expect(overlaps(locationBox, healthBox)).toBe(false);
    await attachScreenshot(page, testInfo, 'narrow-location-and-health-hud');

    await command(page, 'ui.open-character-picker');
    await expect
      .poll(async () => (await snapshot(page)).gameState)
      .toBe('character-select');
    expect((await snapshot(page)).locationHud.visible).toBe(false);
    expect((await snapshot(page)).runtimeErrors.count).toBe(0);
  });
});

async function openReadyApp(page: Page): Promise<void> {
  await page.goto(appUrl);
  await expect
    .poll(async () => {
      const state = await page.evaluate(() =>
        window.__VANTA_TEST__?.snapshot(),
      );
      return (
        state?.ready &&
        state.gameState === 'playing' &&
        state.locationHud.visible
      );
    })
    .toBe(true);
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

function horizontalDistance(
  a: BrowserTestSnapshot['player']['position'],
  b: BrowserTestSnapshot['player']['position'],
): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

async function attachScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

declare global {
  interface Window {
    __VANTA_TEST__?: BrowserTestApi;
  }
}
