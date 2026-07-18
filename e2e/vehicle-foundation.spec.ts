import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import type { BrowserTestApi } from '../src/debug/BrowserTestBridge';

const appUrl = '/?e2e=1&debug=1&skipPicker=1&npcFixtures=1&sparringFixture=1';

test('vehicle ownership, driving, pause, recovery, responsive HUD, and restoration @visual', async ({
  page,
}, testInfo) => {
  const failures: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(message.text());
  });
  page.on('pageerror', (error) => failures.push(error.message));
  await page.goto(appUrl);
  await expect
    .poll(() =>
      page.evaluate(() => window.__VANTA_TEST__?.snapshot().ready ?? false),
    )
    .toBe(true);
  await page.evaluate(() =>
    window.__VANTA_TEST__!.executeDebugCommand(
      'player.teleport-position',
      '4.25,0.22,19,0',
    ),
  );
  await expect(page.locator('.interaction-prompt')).toContainText(
    'Enter Pickup Truck',
  );

  const gamepad = virtualGamepad();
  await pulseButton(page, gamepad, 2);
  await expect
    .poll(async () => (await snapshot(page)).vehicle.controller.mode)
    .toBe('driving');
  let state = await snapshot(page);
  expect(state.vehicle.controller).toMatchObject({
    occupantId: 'player',
    grounded: true,
    ownership: {
      movement: 'vehicle',
      camera: 'vehicle-focus',
      input: 'vehicle',
    },
  });
  expect(state.camera.gameplayFocusOwner).toBe('vehicle-controller');
  expect(state.quickbar.visible).toBe(false);
  expect(state.vehicle.hud.visible).toBe(true);
  await expect(page.locator('.vehicle-hud')).toBeVisible();
  await screenshot(page, testInfo, 'vehicle-driving-desktop');

  const startZ = state.vehicle.controller.position.z;
  await page.keyboard.down('w');
  await page.waitForTimeout(700);
  await page.keyboard.up('w');
  await expect
    .poll(async () => (await snapshot(page)).vehicle.controller.position.z)
    .toBeLessThan(startZ - 0.2);

  await page.keyboard.press('p');
  await expect
    .poll(async () => (await snapshot(page)).gameState)
    .toBe('paused');
  const paused = (await snapshot(page)).vehicle.controller.position;
  await page.waitForTimeout(250);
  expect((await snapshot(page)).vehicle.controller.position).toEqual(paused);
  await page.keyboard.press('p');
  await expect
    .poll(async () => (await snapshot(page)).gameState)
    .toBe('playing');

  const recoveries = (await snapshot(page)).vehicle.controller.recoveryCount;
  await pulseButton(page, gamepad, 12);
  await expect
    .poll(async () => (await snapshot(page)).vehicle.controller.recoveryCount)
    .toBe(recoveries + 1);

  await page.setViewportSize({ width: 390, height: 844 });
  const hud = page.locator('.vehicle-hud');
  await expect(hud).toBeVisible();
  const box = await hud.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await screenshot(page, testInfo, 'vehicle-driving-narrow');

  await pulseButton(page, gamepad, 2);
  await expect
    .poll(async () => (await snapshot(page)).vehicle.controller.mode)
    .toBe('on-foot');
  state = await snapshot(page);
  expect(state.vehicle.controller.occupantId).toBeUndefined();
  expect(state.vehicle.controller.ownership).toEqual({
    movement: 'player',
    camera: 'gameplay',
    input: 'on-foot',
  });
  expect(state.camera.gameplayFocusOwner).toBeUndefined();
  expect(state.quickbar.visible).toBe(true);
  expect(state.vehicle.hud.visible).toBe(false);
  expect(state.player.position.y).toBeGreaterThanOrEqual(-0.02);
  expect(state.runtimeErrors.count).toBe(0);
  expect(failures).toEqual([]);
});

async function snapshot(page: Page) {
  return page.evaluate(() => window.__VANTA_TEST__!.snapshot());
}

async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
}

function virtualGamepad() {
  return {
    connected: true,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => 0),
  };
}

async function pulseButton(
  page: Page,
  gamepad: ReturnType<typeof virtualGamepad>,
  index: number,
) {
  gamepad.buttons[index] = 1;
  await page.evaluate(
    (next) => window.__VANTA_TEST__!.setVirtualGamepad(next),
    gamepad,
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
  gamepad.buttons[index] = 0;
  await page.evaluate(
    (next) => window.__VANTA_TEST__!.setVirtualGamepad(next),
    gamepad,
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
}

declare global {
  interface Window {
    __VANTA_TEST__?: BrowserTestApi;
  }
}
