import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import type {
  BrowserTestApi,
  BrowserTestSnapshot,
} from '../src/debug/BrowserTestBridge';
import { TEST_HANDGUN_PRICE } from '../src/economy/HandgunPurchase';
import { PLAYER_STARTING_BALANCE } from '../src/economy/PlayerMoneyAccount';

const appUrl = '/?e2e=1&debug=1&skipPicker=1';

test('player money, pickup, and handgun purchase remain authoritative', async ({
  page,
}, testInfo) => {
  const failures = monitorRuntimeFailures(page);
  await openReadyApp(page);

  let state = await snapshot(page);
  expect(state.money.account.balance).toBe(PLAYER_STARTING_BALANCE);
  expect(state.money.hud).toMatchObject({
    visible: true,
    formattedBalance: '$500',
    delta: undefined,
  });
  expect(state.player.equipment.ownedIds).toEqual(['knife']);
  expect(state.quickbar.slots[0]).toMatchObject({ owned: false });
  await assertPlayerHudLayout(page, 1280);
  await attach(page, testInfo, 'money-desktop-before');

  await executeCommand(page, 'player.money-credit', '100');
  state = await snapshot(page);
  expect(state.money.account.balance).toBe(600);
  expect(state.money.hud).toMatchObject({
    authoritativeBalance: 600,
    animating: true,
    delta: '+$100',
    deltaKind: 'credit',
  });
  await waitForDisplayedBalance(page, 600);
  await attach(page, testInfo, 'money-desktop-after-credit');
  await waitForDeltaToClear(page);

  await executeCommand(page, 'player.money-spend', '50');
  state = await snapshot(page);
  expect(state.money.account.balance).toBe(550);
  expect(state.money.hud).toMatchObject({
    authoritativeBalance: 550,
    delta: '−$50',
    deltaKind: 'debit',
  });
  await waitForDisplayedBalance(page, 550);
  await waitForDeltaToClear(page);

  await executeCommand(page, 'player.money-reset');
  await executeCommand(page, 'player.money-spend', '300');
  expect((await snapshot(page)).money.account.balance).toBe(200);
  await executeCommand(page, 'player.handgun-purchase');
  state = await snapshot(page);
  expect(state.money.account.balance).toBe(200);
  expect(state.player.equipment.ownedIds).not.toContain('handgun');
  expect(state.player.equipment.equippedId).toBeUndefined();
  expect(state.gameState).toBe('playing');

  await executeCommand(page, 'player.money-reset');
  await executeCommand(page, 'player.cash-pickup-spawn');
  await expect
    .poll(async () => (await snapshot(page)).money.cashPickup.spawned)
    .toBe(true);
  await page.keyboard.down('KeyW');
  await expect
    .poll(async () => (await snapshot(page)).money.account.balance)
    .toBe(PLAYER_STARTING_BALANCE + 100);
  await page.keyboard.up('KeyW');
  await expect
    .poll(async () => (await snapshot(page)).money.cashPickup.spawned)
    .toBe(false);
  state = await snapshot(page);
  expect(state.interaction.activeTargetId).not.toBe('pickup.debug-cash');
  expect(state.money.proximityPickups).toMatchObject({
    count: 0,
    collectedCount: 1,
  });

  await page.setViewportSize({ width: 390, height: 720 });
  await attach(page, testInfo, 'money-narrow-before-purchase');
  await executeCommand(page, 'player.handgun-purchase');
  await expect
    .poll(async () => (await snapshot(page)).player.equipment.equippedId)
    .toBe('handgun');
  state = await snapshot(page);
  expect(state.player.equipment.ownedIds).toContain('handgun');
  expect(state.quickbar.slots[0]).toMatchObject({
    owned: true,
    selected: true,
  });
  expect(state.money.account.balance).toBe(
    PLAYER_STARTING_BALANCE + 100 - TEST_HANDGUN_PRICE,
  );
  expect(state.character.equipmentPresentation).toMatchObject({
    itemId: 'handgun',
    attached: true,
    compatible: true,
  });
  const purchasedBalance = state.money.account.balance;
  const transactionSequence = state.money.account.transactionSequence;
  await executeCommand(page, 'player.handgun-purchase');
  state = await snapshot(page);
  expect(state.money.account.balance).toBe(purchasedBalance);
  expect(state.money.account.transactionSequence).toBe(transactionSequence);
  expect(state.gameState).toBe('playing');
  await attach(page, testInfo, 'money-narrow-after-purchase');

  await assertPlayerHudLayout(page, 390);

  expect(state.runtimeErrors.count, state.runtimeErrors.last).toBe(0);
  expect(failures, failures.join('\n')).toEqual([]);
});

async function openReadyApp(page: Page): Promise<void> {
  await page.goto(appUrl);
  await expect
    .poll(() =>
      page.evaluate(() => window.__VANTA_TEST__?.snapshot().gameState),
    )
    .toBe('playing');
  await expect
    .poll(async () => (await snapshot(page)).character.source)
    .not.toBe('loading');
}

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

async function waitForDeltaToClear(page: Page): Promise<void> {
  await expect
    .poll(async () => (await snapshot(page)).money.hud.delta, {
      timeout: 3_000,
    })
    .toBeUndefined();
}

async function waitForDisplayedBalance(
  page: Page,
  expected: number,
): Promise<void> {
  await expect
    .poll(async () => (await snapshot(page)).money.hud.displayedBalance)
    .toBe(expected);
}

async function assertPlayerHudLayout(page: Page, viewportWidth: number) {
  for (const selector of ['.money-hud', '.health-hud__player']) {
    await expect(page.locator(selector)).toBeVisible();
  }
  const moneyBox = await page.locator('.money-hud').boundingBox();
  const healthBox = await page.locator('.health-hud__player').boundingBox();
  expect(moneyBox).not.toBeNull();
  expect(healthBox).not.toBeNull();
  expect(moneyBox!.y + moneyBox!.height).toBeLessThanOrEqual(healthBox!.y);
  expect(healthBox!.x + healthBox!.width).toBeLessThanOrEqual(viewportWidth);
  expect(Math.abs(moneyBox!.x - healthBox!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(moneyBox!.width - healthBox!.width)).toBeLessThanOrEqual(1);
}

async function attach(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  await testInfo.attach(`${name}.png`, {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
}

function monitorRuntimeFailures(page: Page): string[] {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(message.text());
  });
  return failures;
}
