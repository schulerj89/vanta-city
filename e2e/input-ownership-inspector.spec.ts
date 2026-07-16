import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import type { BrowserTestSnapshot } from '../src/debug/BrowserTestBridge';
import type { VirtualGamepadFixture } from '../src/input/GamepadInput';

test('inspects gameplay, help, picker, and dialogue ownership', async ({
  page,
}, testInfo) => {
  const gamepad = virtualGamepad();
  await installPointerLockStub(page);
  await page.goto('/?e2e=1&debug=1&skipPicker=1&dialogueTypewriter=0');
  await page.waitForFunction(() => window.__VANTA_TEST__ !== undefined);
  await expect
    .poll(async () => (await snapshot(page)).gameState)
    .toBe('playing');

  await setVirtualGamepad(page, gamepad);
  await page.keyboard.down('w');
  gamepad.axes = [0.65, -0.8, 0.55, -0.25];
  await setVirtualGamepad(page, gamepad);
  await expect
    .poll(
      async () => (await snapshot(page)).controls.ownership.activeInputFamily,
    )
    .toBe('mixed');
  await expect
    .poll(async () => (await snapshot(page)).controls.ownership.activeDevice)
    .toBe('gamepad');
  const canvas = page.locator('canvas');
  await canvas.click({ position: { x: 500, y: 300 } });
  await expect
    .poll(async () => (await snapshot(page)).controls.ownership.pointerLocked)
    .toBe(true);
  await showInputSectionOnly(page);
  await attachScreenshot(page, testInfo, 'input-ownership-gameplay');

  await page.keyboard.up('w');
  gamepad.axes = [0, 0, 0, 0];
  await setVirtualGamepad(page, gamepad);
  await waitForAnimationFrames(page, 2);
  await page.keyboard.press('r');
  await expect
    .poll(async () => (await snapshot(page)).controls.ownership.activeDevice)
    .toBe('keyboard');
  gamepad.axes = [0.7, 0, 0, 0];
  await setVirtualGamepad(page, gamepad);
  await expect
    .poll(async () => (await snapshot(page)).controls.ownership.activeDevice)
    .toBe('gamepad');
  gamepad.axes = [0, 0, 0, 0];
  await setVirtualGamepad(page, gamepad);
  await pulseButton(page, gamepad, 9);
  await expect
    .poll(async () => (await snapshot(page)).gameState)
    .toBe('paused');
  await expect
    .poll(async () => (await snapshot(page)).controls.ownership.owner)
    .toBe('paused');
  await pulseButton(page, gamepad, 9);
  await expect
    .poll(async () => (await snapshot(page)).gameState)
    .toBe('playing');

  await pulseButton(page, gamepad, 8);
  await expect(page.getByRole('dialog', { name: 'Controls' })).toBeVisible();
  await expect
    .poll(async () => (await snapshot(page)).controls.ownership.owner)
    .toBe('help');
  expect((await snapshot(page)).controls.ownership.pointerLocked).toBe(false);
  await pulseButton(page, gamepad, 9);
  await expect
    .poll(
      async () =>
        (await snapshot(page)).controls.ownership.mostRecentRejected?.reason,
    )
    .toBe('help-modal-owns-input');
  await page.getByRole('checkbox', { name: /Reduce camera motion/ }).check();
  await expect
    .poll(
      async () =>
        (await snapshot(page)).controls.ownership.accessibility
          .reducedCameraMotion,
    )
    .toBe(true);
  await attachScreenshot(page, testInfo, 'input-ownership-help');

  await pulseButton(page, gamepad, 1);
  await expect(page.getByRole('dialog', { name: 'Controls' })).toBeHidden();
  await pulseButton(page, gamepad, 3);
  await expect
    .poll(async () => (await snapshot(page)).controls.ownership.owner)
    .toBe('picker');
  await pulseButton(page, gamepad, 9);
  await expect
    .poll(
      async () =>
        (await snapshot(page)).controls.ownership.mostRecentRejected?.reason,
    )
    .toBe('picker-modal-owns-input');
  await attachScreenshot(page, testInfo, 'input-ownership-picker');

  await pulseButton(page, gamepad, 1);
  await expect
    .poll(async () => (await snapshot(page)).gameState)
    .toBe('playing');
  await command(page, 'player.teleport', 'spawn.npc-mechanic');
  await expect
    .poll(async () => (await snapshot(page)).interaction.activeTargetId)
    .toBe('interaction.npc.mack');
  await pulseButton(page, gamepad, 2);
  await expect
    .poll(async () => (await snapshot(page)).controls.ownership.owner)
    .toBe('dialogue');
  await pulseButton(page, gamepad, 3);
  await expect
    .poll(
      async () =>
        (await snapshot(page)).controls.ownership.mostRecentRejected?.reason,
    )
    .toBe('dialogue-owns-input');
  await attachScreenshot(page, testInfo, 'input-ownership-dialogue');

  await setVirtualGamepad(page, {
    connected: false,
    axes: [],
    buttons: [],
  });
  await expect
    .poll(
      async () => (await snapshot(page)).controls.ownership.gamepad.connected,
    )
    .toBe(false);
  await setVirtualGamepad(page, virtualGamepad());
  await expect
    .poll(
      async () => (await snapshot(page)).controls.ownership.gamepad.connected,
    )
    .toBe(true);
  const final = await snapshot(page);
  expect(
    final.controls.ownership.timeline.some(({ summary }) =>
      summary.includes('gamepad disconnected'),
    ),
  ).toBe(true);
  expect(final.runtimeErrors.count, final.runtimeErrors.last).toBe(0);
});

interface MutableVirtualGamepad {
  connected: boolean;
  axes: number[];
  buttons: number[];
}

function virtualGamepad(): MutableVirtualGamepad {
  return {
    connected: true,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => 0),
  };
}

async function pulseButton(
  page: Page,
  gamepad: MutableVirtualGamepad,
  index: number,
): Promise<void> {
  gamepad.buttons[index] = 1;
  await setVirtualGamepad(page, gamepad);
  await waitForAnimationFrames(page, 3);
  gamepad.buttons[index] = 0;
  await setVirtualGamepad(page, gamepad);
  await waitForAnimationFrames(page, 2);
}

async function setVirtualGamepad(
  page: Page,
  fixture: VirtualGamepadFixture,
): Promise<void> {
  await page.evaluate(
    (next) => window.__VANTA_TEST__!.setVirtualGamepad(next),
    fixture,
  );
}

async function installPointerLockStub(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let lockedElement: Element | null = null;
    const setLockedElement = (element: Element | null): void => {
      lockedElement = element;
    };
    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true,
      get: () => lockedElement,
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'requestPointerLock', {
      configurable: true,
      value: function requestPointerLock(
        this: HTMLCanvasElement,
      ): Promise<void> {
        setLockedElement(this);
        document.dispatchEvent(new Event('pointerlockchange'));
        return Promise.resolve();
      },
    });
    Object.defineProperty(document, 'exitPointerLock', {
      configurable: true,
      value: (): void => {
        setLockedElement(null);
        document.dispatchEvent(new Event('pointerlockchange'));
      },
    });
  });
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

async function showInputSectionOnly(page: Page): Promise<void> {
  await page.locator('.debug-section').evaluateAll((sections) => {
    for (const section of sections) {
      (section as HTMLDetailsElement).open =
        section.getAttribute('data-debug-section') === 'Input / Ownership';
    }
  });
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

async function attachScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, {
    path,
    contentType: 'image/png',
  });
}
