import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import type {
  BrowserTestApi,
  BrowserTestSnapshot,
} from '../src/debug/BrowserTestBridge';

const appUrl = '/?e2e=1&debug=1&skipPicker=1';

test.describe('authoritative intersection collision', () => {
  test('checks all four road approaches and walks the north crossing without foot drift', async ({
    page,
  }, testInfo) => {
    await openReadyApp(page);
    await command(page, 'helpers.toggle', 'collision');
    for (const spawn of [
      'spawn.approach-north',
      'spawn.approach-east',
      'spawn.approach-south',
      'spawn.approach-west',
    ] as const) {
      await command(page, 'player.teleport', spawn);
      const start = await snapshot(page);
      expect(start.player.grounded).toBe(true);
      expect(start.player.groundColliderId).toMatch(/^c\.road-/);
      expect(
        Math.abs(start.player.footClearance ?? Infinity),
      ).toBeLessThanOrEqual(0.02);
    }
    await command(page, 'player.teleport', 'spawn.approach-north');
    const start = await snapshot(page);
    await page.keyboard.down('w');
    await expect
      .poll(() => moved(page, start.player.position))
      .toBeGreaterThan(1);
    await page.keyboard.up('w');
    const traversed = await snapshot(page);
    expect(traversed.player.grounded).toBe(true);
    expect(traversed.player.groundColliderId).toBe('c.road-north-south');
    expect(
      Math.abs(traversed.player.footClearance ?? Infinity),
    ).toBeLessThanOrEqual(0.02);
    expect(traversed.runtimeErrors.count, traversed.runtimeErrors.last).toBe(0);
    await attachScreenshot(page, testInfo, 'intersection-road-collision');
  });

  test('repeats camera clipping and smooth recovery against a corner ruin', async ({
    page,
  }, testInfo) => {
    await openReadyApp(page);
    await command(page, 'helpers.toggle', 'collision');
    for (let run = 0; run < 3; run += 1) {
      await command(page, 'player.teleport-position', '-15,0.22,10,3.141593');
      await expect
        .poll(async () => (await snapshot(page)).camera.obstructed)
        .toBe(true);
      const obstructed = await snapshot(page);
      expect(obstructed.world.collision.lastCameraHitId).toBe(
        'c.ruin-northwest',
      );
      expect(obstructed.camera.actualDistance).toBeLessThan(
        obstructed.camera.desiredDistance - 0.2,
      );
      if (run === 0)
        await attachScreenshot(
          page,
          testInfo,
          'corner-ruin-camera-obstruction',
        );

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
    }
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
      return state?.ready && state.gameState === 'playing';
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

async function moved(
  page: Page,
  origin: BrowserTestSnapshot['player']['position'],
): Promise<number> {
  const position = (await snapshot(page)).player.position;
  return Math.hypot(position.x - origin.x, position.z - origin.z);
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
}

declare global {
  interface Window {
    __VANTA_TEST__?: BrowserTestApi;
  }
}
