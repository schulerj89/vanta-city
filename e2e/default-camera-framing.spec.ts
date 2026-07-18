import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import type {
  BrowserTestApi,
  BrowserTestSnapshot,
} from '../src/debug/BrowserTestBridge';
import { CameraPreferenceStore } from '../src/camera/CameraPreferences';

const appUrl =
  '/?e2e=1&debug=1&skipPicker=1&npcFixtures=1&sparringFixture=1&dialogueTypewriter=0';

test.describe('default gameplay camera framing', () => {
  test('keeps closer full-body framing through viewport, obstruction, dialogue, and combat layers @visual', async ({
    page,
  }, testInfo) => {
    test.slow();
    await page.setViewportSize({ width: 1280, height: 720 });
    await openReadyApp(page);

    const initial = await snapshot(page);
    expect(initial.camera).toMatchObject({
      mode: 'gameplay',
      owner: 'gameplay',
      desiredDistance: 4.4,
    });
    expect(initial.camera.actualDistance).toBeCloseTo(4.4, 2);
    await capture(page, testInfo, 'default-camera-desktop');

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('#game')).toHaveJSProperty('clientWidth', 390);
    expect((await snapshot(page)).camera.desiredDistance).toBe(4.4);
    await capture(page, testInfo, 'default-camera-narrow');

    await page.setViewportSize({ width: 1280, height: 720 });
    await command(page, 'player.teleport-position', '-15,0.22,10,3.141593');
    await expect
      .poll(async () => (await snapshot(page)).camera.obstructed)
      .toBe(true);
    const obstructed = await snapshot(page);
    expect(obstructed.camera.actualDistance).toBeLessThan(4.6);
    expect(obstructed.world.collision.lastCameraHitId).toBe('c.ruin-northwest');
    await capture(page, testInfo, 'default-camera-near-wall');

    await command(page, 'player.teleport', 'spawn.player-talk-mack');
    await expect
      .poll(async () => (await snapshot(page)).camera.obstructed)
      .toBe(false);
    await expect
      .poll(async () => (await snapshot(page)).camera.actualDistance)
      .toBeCloseTo(4.4, 1);
    const beforeDialogue = (await snapshot(page)).camera;
    await command(page, 'dialogue.start-mack');
    await expect
      .poll(async () => (await snapshot(page)).camera.transitionProgress)
      .toBe(1);
    expect((await snapshot(page)).camera.mode).toBe('conversation');
    await command(page, 'conversation.end');
    await expect
      .poll(async () => (await snapshot(page)).camera.transitionProgress)
      .toBe(1);
    const afterDialogue = await snapshot(page);
    expect(afterDialogue.camera.mode).toBe('gameplay');
    expect(afterDialogue.camera.desiredDistance).toBe(4.4);
    expectVectorClose(afterDialogue.camera.position, beforeDialogue.position);
    expectVectorClose(afterDialogue.camera.target, beforeDialogue.target);
    await capture(page, testInfo, 'default-camera-after-dialogue');

    await command(page, 'sparring-target.teleport-player');
    await expect
      .poll(
        async () => (await snapshot(page)).sparringTarget.engagement.engaged,
      )
      .toBe(true);
    await page.keyboard.press('j');
    await expect
      .poll(async () => (await snapshot(page)).camera.gameplayFocusOwner)
      .toBe('debug-sparring-target');
    await expect
      .poll(async () => (await snapshot(page)).camera.actualDistance)
      .toBeCloseTo(4.25, 1);
    const combat = await snapshot(page);
    expect(combat.camera.desiredDistance).toBe(4.4);
    expect(combat.camera.gameplayFocusDistance).toBe(4.25);
    await capture(page, testInfo, 'default-camera-combat-focus');

    expect((await snapshot(page)).runtimeErrors.count).toBe(0);
  });

  test('keeps an existing saved follow distance authoritative', async ({
    page,
  }) => {
    await page.addInitScript(
      ({ key, payload }) => localStorage.setItem(key, payload),
      {
        key: CameraPreferenceStore.storageKey,
        payload: JSON.stringify({
          version: CameraPreferenceStore.version,
          preferences: {
            horizontalSensitivity: 0.0025,
            verticalSensitivity: 0.0025,
            invertY: false,
            followDistance: 7,
            automaticRecenter: true,
            shoulderSide: 'right',
          },
        }),
      },
    );
    await openReadyApp(page);

    const state = await snapshot(page);
    expect(state.camera.desiredDistance).toBe(7);
    expect(state.camera.actualDistance).toBeCloseTo(7, 2);
  });
});

async function openReadyApp(page: Page): Promise<void> {
  await page.goto(appUrl);
  await expect
    .poll(
      async () => {
        const state = await page.evaluate(() =>
          window.__VANTA_TEST__?.snapshot(),
        );
        return state?.ready && state.gameState === 'playing';
      },
      { timeout: 15_000 },
    )
    .toBe(true);
}

async function snapshot(page: Page): Promise<BrowserTestSnapshot> {
  return page.evaluate(() => window.__VANTA_TEST__!.snapshot());
}

async function command(page: Page, id: string, argument?: string) {
  await page.evaluate(
    async ({ commandId, commandArgument }) =>
      window.__VANTA_TEST__!.executeDebugCommand(commandId, commandArgument),
    { commandId: id, commandArgument: argument },
  );
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
}

function expectVectorClose(
  actual: { readonly x: number; readonly y: number; readonly z: number },
  expected: { readonly x: number; readonly y: number; readonly z: number },
): void {
  expect(actual.x).toBeCloseTo(expected.x, 2);
  expect(actual.y).toBeCloseTo(expected.y, 2);
  expect(actual.z).toBeCloseTo(expected.z, 2);
}

declare global {
  interface Window {
    __VANTA_TEST__?: BrowserTestApi;
  }
}
