import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type {
  BrowserTestApi,
  BrowserTestSnapshot,
} from '../src/debug/BrowserTestBridge';

const appUrl = '/?e2e=1&debug=1&skipPicker=1&sparringFixture=1';

test.beforeEach(async ({ page }) => {
  await page.goto(appUrl);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__VANTA_TEST__?.snapshot().gameState ??
          'test bridge not installed',
      ),
    )
    .toBe('playing');
  await executeCommand(page, 'player.handgun-purchase');
  await expect
    .poll(async () => (await snapshot(page)).player.equipment.equippedId)
    .toBe('handgun');
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
});

test('moves an accessible bounded reticle and releases it for pause and unequip', async ({
  page,
}) => {
  const reticle = page.getByRole('img', { name: 'Weapon aim reticle' });
  expect((await snapshot(page)).weaponAim.releaseReason).toBeUndefined();
  await expect(reticle).toBeVisible();
  await expect(reticle.locator('.weapon-reticle__dot')).toHaveCount(1);

  await page.mouse.move(120, 140);
  await expect
    .poll(async () => (await snapshot(page)).weaponAim.screen.x)
    .toBeCloseTo(120, 0);
  await expect
    .poll(async () => (await snapshot(page)).weaponAim.screen.y)
    .toBeCloseTo(140, 0);

  await page.mouse.move(1, 1);
  await expect
    .poll(async () => (await snapshot(page)).weaponAim.screen)
    .toEqual({ x: 24, y: 24 });

  await page.evaluate(() => {
    const input = document.createElement('input');
    input.id = 'weapon-focus-fixture';
    input.setAttribute('aria-label', 'Weapon focus fixture');
    document.querySelector('#game')?.append(input);
    input.focus();
  });
  await expect(reticle).toBeHidden();
  expect((await snapshot(page)).weaponAim.releaseReason).toBe('ui-focused');
  await page.evaluate(() => {
    document.querySelector<HTMLInputElement>('#weapon-focus-fixture')?.remove();
  });
  await expect(reticle).toBeVisible();

  await page.keyboard.press('KeyP');
  await expect(reticle).toBeHidden();
  expect((await snapshot(page)).weaponAim.releaseReason).toBe('state:paused');
  await page.keyboard.press('KeyP');
  await expect(reticle).toBeVisible();

  await page.keyboard.press('Digit1');
  await expect(reticle).toBeHidden();
  expect((await snapshot(page)).weaponAim.releaseReason).toBe('no-equipment');
  expect((await snapshot(page)).runtimeErrors.count).toBe(0);
});

test('delivers aimed repeat-fire damage, death, and impact-timed knife damage', async ({
  page,
}) => {
  await executeCommand(page, 'weapon.aim-center');
  await executeCommand(page, 'weapon.target-at-aim', '6');
  await page.keyboard.press('KeyU');
  await expect
    .poll(async () => (await snapshot(page)).sparringTarget.health?.current)
    .toBe(66);
  expect((await snapshot(page)).weaponCombat.lastResult).toMatchObject({
    outcome: 'hit',
    targetId: 'debug.sparring-target',
    damage: 34,
  });

  await expect
    .poll(async () => (await snapshot(page)).player.actionBusy)
    .toBe(false);

  await page.keyboard.down('KeyU');
  await expect
    .poll(async () => (await snapshot(page)).sparringTarget.health?.alive, {
      timeout: 5_000,
    })
    .toBe(false);
  await page.keyboard.up('KeyU');
  expect(
    (await snapshot(page)).weaponCombat.gunSequence,
  ).toBeGreaterThanOrEqual(3);
  await expect
    .poll(async () => (await snapshot(page)).player.actionBusy)
    .toBe(false);

  await executeCommand(page, 'sparring-target.reset');
  await executeCommand(page, 'sparring-target.teleport-to-player');
  await page.keyboard.press('Digit2');
  await page.keyboard.press('KeyU');
  await expect
    .poll(async () => (await snapshot(page)).weaponCombat.knifeSequence)
    .toBe(1);
  expect((await snapshot(page)).sparringTarget.health?.current).toBe(55);
  expect((await snapshot(page)).weaponCombat.lastResult).toMatchObject({
    outcome: 'hit',
    targetId: 'debug.sparring-target',
    damage: 45,
  });
  expect((await snapshot(page)).runtimeErrors.count).toBe(0);
});

async function snapshot(page: Page): Promise<BrowserTestSnapshot> {
  return page.evaluate(() => window.__VANTA_TEST__!.snapshot());
}

async function executeCommand(
  page: Page,
  id: string,
  argument?: string,
): Promise<void> {
  await page.evaluate(
    async ({ commandId, commandArgument }) => {
      const api: BrowserTestApi | undefined = window.__VANTA_TEST__;
      if (!api) throw new Error('Vanta browser test bridge is unavailable');
      await api.executeDebugCommand(commandId, commandArgument);
    },
    { commandId: id, commandArgument: argument },
  );
}
