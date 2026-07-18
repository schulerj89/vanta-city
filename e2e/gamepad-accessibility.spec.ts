import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { BrowserTestSnapshot } from '../src/debug/BrowserTestBridge';

declare global {
  interface Window {
    __VANTA_GAMEPAD_STUB__?: {
      setButton(index: number, pressed: boolean): void;
      setAxes(axes: readonly number[]): void;
    };
  }
}

test('standard gamepad owns picker, gameplay, dialogue, restore, and narrow help', async ({
  page,
}) => {
  await installGamepadStub(page);
  await page.goto('/?e2e=1&dialogueTypewriter=0&npcFixtures=1');
  await page.waitForFunction(() => window.__VANTA_TEST__ !== undefined);
  await expect
    .poll(async () => (await snapshot(page)).gameState)
    .toBe('playing');
  await pressButton(page, 3);
  await expect.poll(async () => (await snapshot(page)).picker.open).toBe(true);
  await expect
    .poll(async () => {
      const picker = (await snapshot(page)).picker;
      return (
        picker.availableCharacterIds.length + picker.fallbackCharacterIds.length
      );
    })
    .toBeGreaterThanOrEqual(2);

  await setButton(page, 15, true);
  await expect
    .poll(async () => (await snapshot(page)).picker.focusedCharacterId)
    .toBe('punk');
  await page.waitForTimeout(150);
  expect((await snapshot(page)).picker.focusedCharacterId).toBe('punk');
  await setButton(page, 15, false);
  await pressButton(page, 0);
  await expect
    .poll(async () => (await snapshot(page)).gameState)
    .toBe('playing');
  expect((await snapshot(page)).selectedCharacterId).toBe('punk');

  const movementStart = (await snapshot(page)).player.position;
  await setAxes(page, [0.65, -0.8, 0.5, -0.25]);
  await expect
    .poll(async () =>
      horizontalDistance((await snapshot(page)).player.position, movementStart),
    )
    .toBeGreaterThan(0.2);
  await setAxes(page, [0, 0, 0, 0]);

  await command(page, 'player.teleport', 'spawn.player-talk-mack');
  await expect
    .poll(async () => (await snapshot(page)).interaction.activeTargetId)
    .toBe('interaction.npc.mack');
  await pressButton(page, 2);
  await expect
    .poll(async () => (await snapshot(page)).gameState)
    .toBe('dialogue');
  await expect
    .poll(async () => (await snapshot(page)).dialogue.session.lineIndex)
    .toBe(0);
  await pressButton(page, 3);
  expect((await snapshot(page)).gameState).toBe('dialogue');
  expect((await snapshot(page)).picker.open).toBe(false);
  const dialogueCamera = (await snapshot(page)).camera;
  const expectedReturnPosition = dialogueCamera.gameplayReturnPosition;
  const expectedReturnTarget = dialogueCamera.gameplayReturnTarget;
  if (!expectedReturnPosition || !expectedReturnTarget) {
    throw new Error('Dialogue camera did not capture an exact gameplay return');
  }
  await pressButton(page, 0);
  await expect
    .poll(async () => (await snapshot(page)).dialogue.session.lineIndex)
    .toBe(1);
  await pressButton(page, 1);
  await expect
    .poll(async () => (await snapshot(page)).gameState)
    .toBe('playing');
  await expect
    .poll(async () => (await snapshot(page)).camera.transitionProgress)
    .toBe(1);
  const restoredCamera = (await snapshot(page)).camera;
  expect(
    vectorDistance(restoredCamera.position, expectedReturnPosition),
  ).toBeLessThan(0.06);
  expect(
    vectorDistance(restoredCamera.target, expectedReturnTarget),
  ).toBeLessThan(0.06);

  await page.setViewportSize({ width: 360, height: 640 });
  await pressButton(page, 8);
  await expect(page.getByRole('dialog', { name: 'Controls' })).toBeVisible();
  await pressButton(page, 9);
  expect((await snapshot(page)).gameState).toBe('paused');
  expect((await snapshot(page)).controls.help.open).toBe(true);
  await expect(
    page.getByText('Left stick', { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText('D-pad right', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('checkbox', { name: /Reduce camera motion/ }),
  ).toBeVisible();
  await expect(
    page.getByRole('checkbox', { name: /Animate dialogue text/ }),
  ).toBeVisible();
  const panelBox = await page.locator('.help-overlay__panel').boundingBox();
  if (!panelBox) throw new Error('Help panel has no bounds');
  expect(panelBox.width).toBeLessThanOrEqual(360);
  expect(panelBox.height).toBeLessThanOrEqual(640);

  await page.getByRole('checkbox', { name: /Reduce camera motion/ }).check();
  await page.getByRole('checkbox', { name: /Animate dialogue text/ }).uncheck();
  await pressButton(page, 1);
  await expect(page.getByRole('dialog', { name: 'Controls' })).toBeHidden();
  expect((await snapshot(page)).gameState).toBe('playing');
  await page.reload();
  await page.waitForFunction(() => window.__VANTA_TEST__ !== undefined);
  expect((await snapshot(page)).controls.help.preferences).toEqual({
    reducedCameraMotion: true,
    dialogueTypewriter: false,
  });
  expect((await snapshot(page)).runtimeErrors.count).toBe(0);
});

async function installGamepadStub(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 17 }, () => ({
      pressed: false,
      touched: false,
      value: 0,
    }));
    const axes = [0, 0, 0, 0];
    const gamepad = {
      axes,
      buttons,
      connected: true,
      id: 'Playwright virtual standard gamepad',
      index: 0,
      mapping: 'standard',
      timestamp: 0,
    } as unknown as Gamepad;
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [gamepad],
    });
    window.__VANTA_GAMEPAD_STUB__ = {
      setButton: (index, pressed) => {
        buttons[index] = {
          pressed,
          touched: pressed,
          value: Number(pressed),
        };
      },
      setAxes: (values) => axes.splice(0, 4, ...values),
    };
  });
}

async function setButton(
  page: Page,
  index: number,
  pressed: boolean,
): Promise<void> {
  await page.evaluate(
    ({ button, down }) =>
      window.__VANTA_GAMEPAD_STUB__?.setButton(button, down),
    { button: index, down: pressed },
  );
}

async function pressButton(page: Page, index: number): Promise<void> {
  await setButton(page, index, true);
  await waitForAnimationFrames(page, 3);
  await setButton(page, index, false);
  await waitForAnimationFrames(page, 2);
}

async function waitForAnimationFrames(
  page: Page,
  count: number,
): Promise<void> {
  await page.evaluate(
    (remaining) =>
      new Promise<void>((resolve) => {
        const next = (): void => {
          remaining -= 1;
          if (remaining === 0) resolve();
          else requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      }),
    count,
  );
}

async function setAxes(page: Page, axes: readonly number[]): Promise<void> {
  await page.evaluate(
    (values) => window.__VANTA_GAMEPAD_STUB__?.setAxes(values),
    axes,
  );
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
    ({ commandId, commandArgument }) =>
      window.__VANTA_TEST__!.executeDebugCommand(commandId, commandArgument),
    { commandId: id, commandArgument: argument },
  );
}

function horizontalDistance(
  a: { readonly x: number; readonly z: number },
  b: { readonly x: number; readonly z: number },
): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function vectorDistance(
  a: { readonly x: number; readonly y: number; readonly z: number },
  b: { readonly x: number; readonly y: number; readonly z: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
