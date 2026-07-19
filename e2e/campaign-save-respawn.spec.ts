import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { BrowserTestSnapshot } from '../src/debug/BrowserTestBridge';
import { CAMPAIGN_SAVE_STORAGE_KEY } from '../src/save/CampaignSaveSchema';
import { TITLE_STARTED_STORAGE_KEY } from '../src/ui/TitleScreen';
import { TEST_HANDGUN_PRICE } from '../src/economy/HandgunPurchase';

const appUrl = '/?e2e=1&debug=1&skipPicker=1&dialogueTypewriter=0';

test.beforeEach(async ({ page }) => {
  await page.goto(appUrl);
  await ready(page);
  await page.evaluate(
    ({ campaignKey, titleKey }) => {
      localStorage.removeItem(campaignKey);
      localStorage.removeItem(titleKey);
    },
    {
      campaignKey: CAMPAIGN_SAVE_STORAGE_KEY,
      titleKey: TITLE_STARTED_STORAGE_KEY,
    },
  );
  await page.reload();
  await ready(page);
});

test('new campaign, purchase, reload, corrupt fallback, and scoped reset', async ({
  page,
}) => {
  const failures = monitor(page);
  let state = await snapshot(page);
  expect(state.player.equipment.ownedIds).toEqual([]);
  expect(state.quickbar.slots).toEqual([
    expect.objectContaining({ itemId: 'handgun', owned: false }),
    expect.objectContaining({ itemId: 'knife', owned: false }),
  ]);

  await command(page, 'player.handgun-purchase');
  expect(
    await page.evaluate(() => window.__VANTA_TEST__!.campaignSaveNow()),
  ).toBe(true);
  state = await snapshot(page);
  expect(state.money.account.balance).toBe(500 - TEST_HANDGUN_PRICE);
  expect(state.player.equipment).toMatchObject({
    ownedIds: ['handgun'],
    equippedId: 'handgun',
  });

  await page.reload();
  await ready(page);
  state = await snapshot(page);
  expect(state.money.account.balance).toBe(500 - TEST_HANDGUN_PRICE);
  expect(state.player.equipment).toMatchObject({
    ownedIds: ['handgun'],
    equippedId: 'handgun',
  });
  expect(state.campaignSave.status).toMatchObject({
    hasSave: true,
    valid: true,
    restored: true,
  });

  await page.evaluate(
    (key) => localStorage.setItem(key, '{broken'),
    CAMPAIGN_SAVE_STORAGE_KEY,
  );
  await page.reload();
  await ready(page);
  state = await snapshot(page);
  expect(state.money.account.balance).toBe(500);
  expect(state.player.equipment.ownedIds).toEqual([]);

  await page.evaluate(() =>
    localStorage.setItem('vanta-city:audio-test', 'keep'),
  );
  expect(
    await page.evaluate(() => window.__VANTA_TEST__!.campaignReset()),
  ).toBe(true);
  expect(
    await page.evaluate(
      ({ campaignKey, titleKey }) => ({
        campaign: localStorage.getItem(campaignKey),
        title: localStorage.getItem(titleKey),
        preference: localStorage.getItem('vanta-city:audio-test'),
      }),
      {
        campaignKey: CAMPAIGN_SAVE_STORAGE_KEY,
        titleKey: TITLE_STARTED_STORAGE_KEY,
      },
    ),
  ).toEqual({ campaign: null, title: null, preference: 'keep' });
  expect(failures).toEqual([]);
});

test('mission reward survives repeated reload and death uses default fallback once', async ({
  page,
}) => {
  const failures = monitor(page);
  await command(page, 'mission.start', 'ash-001-walk-the-block');
  await command(page, 'mission.complete-objective');
  await command(page, 'mission.complete-objective');
  expect(
    await page.evaluate(() => window.__VANTA_TEST__!.campaignSaveNow()),
  ).toBe(true);
  let state = await snapshot(page);
  expect(state.money.account.balance).toBe(575);
  expect(state.missions.runtime.missions[0]).toMatchObject({
    status: 'completed',
    rewardGranted: true,
  });

  for (let reload = 0; reload < 2; reload += 1) {
    await page.reload();
    await ready(page);
    state = await snapshot(page);
    expect(state.money.account.balance).toBe(575);
    expect(state.missions.runtime.missions[0]).toMatchObject({
      status: 'completed',
      rewardGranted: true,
    });
  }

  await command(page, 'player.health-deplete');
  await page.getByRole('button', { name: 'Revive & restart' }).click();
  await expect
    .poll(async () => (await snapshot(page)).playerDeath.visible)
    .toBe(false);
  state = await snapshot(page);
  expect(state.playerDeath.lastRespawnId).toBe('spawn.player-default');
  expect(state.money.account.balance).toBe(575);
  expect(state.missions.runtime.missions[0]?.status).toBe('completed');
  expect(state.camera).toMatchObject({ mode: 'gameplay', owner: 'gameplay' });
  expect(state.runtimeErrors.count).toBe(0);
  expect(failures).toEqual([]);
});

async function ready(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => window.__VANTA_TEST__?.snapshot().gameState),
    )
    .toBe('playing');
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

function monitor(page: Page): string[] {
  const failures: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(message.text());
  });
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('requestfailed', (request) => {
    // Asset availability intentionally probes optional local candidates with HEAD.
    if (request.method() !== 'HEAD') {
      failures.push(`${request.method()} ${request.url()}`);
    }
  });
  return failures;
}
