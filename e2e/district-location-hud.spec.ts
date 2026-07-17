import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import type {
  BrowserTestApi,
  BrowserTestSnapshot,
} from '../src/debug/BrowserTestBridge';

const appUrl = '/?e2e=1&debug=1&skipPicker=1';
const approaches = [
  ['spawn.approach-north', 'landmark.north-approach', 'approach-north'],
  ['spawn.approach-east', 'landmark.east-approach', 'approach-east'],
  ['spawn.approach-south', 'landmark.south-approach', 'approach-south'],
  ['spawn.approach-west', 'landmark.west-approach', 'approach-west'],
] as const;

test.describe('Ashfall Junction and location HUD', () => {
  test('grounds all four approaches and reports authored locations', async ({
    page,
  }, testInfo) => {
    await openReadyApp(page);
    for (const [spawnId, locationId, screenshotName] of approaches) {
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
          ground: expect.stringMatching(/^c\.road-/),
          location: locationId,
        });
      const state = await snapshot(page);
      expect(state.locationHud.coordinates).toMatch(
        /^X [+-]\d+\.\d · Y [+-]\d+\.\d · Z [+-]\d+\.\d$/,
      );
      expect(state.runtimeErrors.count, state.runtimeErrors.last).toBe(0);
      await attachScreenshot(page, testInfo, screenshotName);
    }

    await command(page, 'player.teleport-position', '10.2,0.22,9.5,3.141593');
    await expect
      .poll(async () => (await snapshot(page)).locationHud.locationId)
      .toBe('landmark.signal-corner');
    await expect
      .poll(async () => (await snapshot(page)).interaction.activeTargetId)
      .toBe('interaction.signal-controller');
    await attachScreenshot(page, testInfo, 'signal-corner-and-location-hud');
    await page.keyboard.press('g');
    await expect
      .poll(async () => (await snapshot(page)).interaction.completedTargetIds)
      .toContain('interaction.signal-controller');
  });

  test('has no default NPCs or sparring target and recovers camera obstruction', async ({
    page,
  }) => {
    await openReadyApp(page);
    const initial = await snapshot(page);
    expect(initial.npcs).toEqual({ count: 0, snapshots: [] });
    expect(initial.sparringTarget.loaded).toBe(false);
    expect(initial.interaction.activeTargetId).toBeUndefined();

    await command(page, 'player.teleport-position', '-15,0.22,10,3.141593');
    await expect
      .poll(async () => (await snapshot(page)).camera.obstructed)
      .toBe(true);
    await command(page, 'player.teleport', 'spawn.player-default');
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

  test('captures overhead collision map and stays clear of health at narrow width', async ({
    page,
  }, testInfo) => {
    await openReadyApp(page);
    await command(page, 'helpers.toggle', 'collision');
    await command(page, 'helpers.toggle', 'spawnPoints');
    await command(page, 'helpers.toggle', 'triggers');
    await command(
      page,
      'camera.preview-anchor',
      'camera.intersection-overhead',
    );
    await expect
      .poll(async () => {
        const camera = (await snapshot(page)).camera;
        return {
          mode: camera.mode,
          anchor: camera.activeAnchorId,
          ready: camera.transitionProgress > 0.98,
          overhead: camera.position.y > 58,
        };
      })
      .toEqual({
        mode: 'cinematic',
        anchor: 'camera.intersection-overhead',
        ready: true,
        overhead: true,
      });
    await attachScreenshot(page, testInfo, 'intersection-overhead-collision');
    await command(page, 'camera.release-preview');

    await page.keyboard.press('p');
    await expect
      .poll(async () => (await snapshot(page)).gameState)
      .toBe('paused');
    expect((await snapshot(page)).locationHud.visible).toBe(true);
    await page.keyboard.press('p');
    await expect
      .poll(async () => (await snapshot(page)).gameState)
      .toBe('playing');
    await page.keyboard.press('h');
    await expect
      .poll(async () => (await snapshot(page)).controls.help.open)
      .toBe(true);
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
    await attachScreenshot(page, testInfo, 'intersection-narrow-hud');
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
