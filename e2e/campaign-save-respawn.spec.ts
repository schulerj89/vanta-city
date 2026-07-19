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
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pagehide')),
  );
  expect(
    await page.evaluate(
      (key) => localStorage.getItem(key),
      CAMPAIGN_SAVE_STORAGE_KEY,
    ),
  ).toBeNull();
  expect(failures).toEqual([]);
});

test('mission reward survives repeated reload and death uses clinic fallback once', async ({
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
  expect(state.playerDeath.lastRespawnId).toBe('spawn.player.clinic');
  expect(state.money.account.balance).toBe(575);
  expect(state.missions.runtime.missions[0]?.status).toBe('completed');
  expect(state.camera).toMatchObject({ mode: 'gameplay', owner: 'gameplay' });
  expect(state.runtimeErrors.count).toBe(0);
  expect(failures).toEqual([]);
});

test('page hide saves a remote pose and boot restores its collider residency', async ({
  page,
}) => {
  const failures = monitor(page);
  await command(page, 'player.teleport-position', '40,0.22,0,0.75');
  await expect
    .poll(async () => (await snapshot(page)).player.grounded)
    .toBe(true);
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pagehide')),
  );
  expect(
    await page.evaluate((key) => {
      const stored = JSON.parse(localStorage.getItem(key)!) as {
        player: { position: [number, number, number] };
      };
      return stored.player.position;
    }, CAMPAIGN_SAVE_STORAGE_KEY),
  ).toEqual([40, expect.any(Number), 0]);

  await page.reload();
  await ready(page);
  await expect
    .poll(async () => (await snapshot(page)).player.grounded)
    .toBe(true);
  let state = await snapshot(page);
  expect(state.player.position.x).toBeCloseTo(40, 1);
  expect(state.player.position.z).toBeCloseTo(0, 1);
  expect(state.player.groundColliderId).not.toBe('');
  expect(state.world.sectors.active).toContain('sector.east-rim-north');
  expect(state.world.activeDeclaredColliderCount).toBeGreaterThan(0);

  await mutateStoredPosition(page, [500, 0, 500]);
  await page.reload();
  await ready(page);
  state = await snapshot(page);
  expect(state.player.position.x).toBeCloseTo(0, 1);
  expect(state.player.position.z).toBeCloseTo(19, 1);
  expect(state.player.grounded).toBe(true);

  await mutateStoredPosition(page, [0, 20, 0]);
  await page.reload();
  await ready(page);
  state = await snapshot(page);
  expect(state.player.position.x).toBeCloseTo(0, 1);
  expect(state.player.position.z).toBeCloseTo(19, 1);
  expect(state.player.grounded).toBe(true);
  expect(failures).toEqual([]);
});

test('opening save replays until its canonical landing checkpoint', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const failures = monitor(page);
  const openingUrl =
    '/?e2e=1&opening=1&skipTitle=1&traffic=0&dialogueTypewriter=0';
  await page.goto(openingUrl);
  await bridgeReady(page);
  await expect
    .poll(async () => (await snapshot(page)).cinematic.shotId)
    .toBe('shot.ash-001.northbar-establish');
  expect(
    await page.evaluate(() => window.__VANTA_TEST__!.campaignSaveNow()),
  ).toBe(true);

  await page.reload();
  await bridgeReady(page);
  await expect
    .poll(async () => (await snapshot(page)).cinematic.shotId)
    .toBe('shot.ash-001.northbar-establish');
  expect((await snapshot(page)).world.levelId).toBe('northbar-coach-depot');

  expect(
    await page.evaluate(() => window.__VANTA_TEST__!.requestCinematicSkip()),
  ).toBe(true);
  expect(
    await page.evaluate(() => window.__VANTA_TEST__!.confirmCinematicSkip()),
  ).toBe(true);
  await expect
    .poll(async () => (await snapshot(page)).cinematic, { timeout: 15_000 })
    .toMatchObject({
      state: 'idle',
      lastResult: 'skipped',
      committedLandingTransactionId: 'transaction.ash-001.northbar-arrival',
    });
  await expect
    .poll(async () => (await snapshot(page)).world.levelId)
    .toBe('test-district');
  let state = await snapshot(page);
  expect(state.missions.runtime.facts['rook-arrived-in-ashfall']).toBe(true);
  await expect.poll(() => storedArrivalCheckpoint(page)).toBe(true);

  await page.reload();
  await ready(page);
  state = await snapshot(page);
  expect(state.world.levelId).toBe('test-district');
  expect(state.cinematic.state).toBe('idle');
  expect(state.missions.runtime.facts['rook-arrived-in-ashfall']).toBe(true);
  expect(failures).toEqual([]);
});

test('normal opening completion automatically persists its landing checkpoint', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const failures = monitor(page);
  const openingUrl =
    '/?e2e=1&opening=1&skipTitle=1&traffic=0&dialogueTypewriter=0';
  await page.goto(openingUrl);
  await bridgeReady(page);
  await expect
    .poll(
      async () => {
        await page.evaluate(() => window.__VANTA_TEST__!.advanceCinematic(100));
        return (await snapshot(page)).cinematic.state;
      },
      { timeout: 20_000 },
    )
    .toBe('idle');
  expect((await snapshot(page)).cinematic.lastResult).toBe('completed');
  await expect.poll(() => storedArrivalCheckpoint(page)).toBe(true);

  await page.reload();
  await ready(page);
  const state = await snapshot(page);
  expect(state.world.levelId).toBe('test-district');
  expect(state.cinematic.state).toBe('idle');
  expect(state.missions.runtime.facts['rook-arrived-in-ashfall']).toBe(true);
  expect(failures).toEqual([]);
});

test('failed opening landing remains uncommitted and replays after reload', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const failures = monitor(page);
  const openingUrl =
    '/?e2e=1&opening=1&skipTitle=1&traffic=0&dialogueTypewriter=0';
  await page.goto(openingUrl);
  await bridgeReady(page);
  await page.evaluate(() =>
    window.__VANTA_TEST__!.setCinematicParticipantAvailable('mack', false),
  );
  await page.evaluate(() => window.__VANTA_TEST__!.advanceCinematic(0.1));
  await expect
    .poll(async () => (await snapshot(page)).cinematic.state, {
      timeout: 15_000,
    })
    .toBe('idle');
  let state = await snapshot(page);
  expect(state.cinematic).toMatchObject({
    lastResult: 'failed',
    committedLandingTransactionId: undefined,
  });
  expect(state.missions.runtime.facts['rook-arrived-in-ashfall']).toBe(false);
  await expect.poll(() => storedArrivalCheckpoint(page)).toBe(false);

  await page.reload();
  await bridgeReady(page);
  await expect
    .poll(async () => (await snapshot(page)).cinematic.shotId)
    .toBe('shot.ash-001.northbar-establish');
  state = await snapshot(page);
  expect(state.world.levelId).toBe('northbar-coach-depot');
  expect(state.missions.runtime.facts['rook-arrived-in-ashfall']).toBe(false);
  expect(failures).toEqual([]);
});

async function ready(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => window.__VANTA_TEST__?.snapshot().gameState),
    )
    .toBe('playing');
}

async function bridgeReady(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => window.__VANTA_TEST__?.snapshot().ready))
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
    ({ commandId, commandArgument }) =>
      window.__VANTA_TEST__!.executeDebugCommand(commandId, commandArgument),
    { commandId: id, commandArgument: argument },
  );
}

async function mutateStoredPosition(
  page: Page,
  position: [number, number, number],
): Promise<void> {
  await page.evaluate(
    ({ key, nextPosition }) => {
      const stored = JSON.parse(localStorage.getItem(key)!) as {
        player: { position: [number, number, number] };
      };
      stored.player.position = nextPosition;
      localStorage.setItem(key, JSON.stringify(stored));
    },
    { key: CAMPAIGN_SAVE_STORAGE_KEY, nextPosition: position },
  );
}

async function storedArrivalCheckpoint(
  page: Page,
): Promise<boolean | undefined> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const stored = JSON.parse(raw) as {
      mission: { facts: Record<string, string | number | boolean> };
    };
    return stored.mission.facts['rook-arrived-in-ashfall'] === true;
  }, CAMPAIGN_SAVE_STORAGE_KEY);
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
