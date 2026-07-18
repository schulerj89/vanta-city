import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import type {
  BrowserTestApi,
  BrowserTestSnapshot,
} from '../src/debug/BrowserTestBridge';

const appUrl = '/?e2e=1&debug=1&skipPicker=1&dialogueTypewriter=0';

test('Walk the Block advances through canonical world hooks and rewards once @visual', async ({
  page,
}, testInfo) => {
  const errors = monitorErrors(page);
  await openReady(page);
  expect((await snapshot(page)).npcs.snapshots).toEqual([
    expect.objectContaining({ definitionId: 'mack', modelSource: 'asset' }),
  ]);

  await command(page, 'player.teleport-position', '0,0.22,0,0');
  await expect
    .poll(async () => activeMission(await snapshot(page)))
    .toMatchObject({
      id: 'ash-001-walk-the-block',
      currentObjectiveId: 'ash-001-talk-to-mack',
      status: 'active',
    });
  let state = await snapshot(page);
  expect(state.missions.runtime.highlights).toEqual([
    expect.objectContaining({
      channels: ['world'],
      target: { kind: 'spawn', referenceId: 'spawn.npc-mechanic' },
    }),
  ]);
  expect(state.missions.hud).toMatchObject({
    objectiveVisible: true,
    missionId: 'ash-001-walk-the-block',
    objectiveId: 'ash-001-talk-to-mack',
  });
  await attachScreenshot(page, testInfo, 'mission-active-desktop');

  await expect
    .poll(async () => (await snapshot(page)).cinematic.cinematicId)
    .toBe('cinematic.ash-001.opening');
  await page.evaluate(() => window.__VANTA_TEST__!.requestCinematicSkip());
  await page.evaluate(() => window.__VANTA_TEST__!.confirmCinematicSkip());
  await expect
    .poll(async () => (await snapshot(page)).gameState)
    .toBe('playing');
  expect(activeMission(await snapshot(page))?.currentObjectiveId).toBe(
    'ash-001-talk-to-mack',
  );

  await completeMackConversation(page);
  await expect
    .poll(async () => activeMission(await snapshot(page))?.currentObjectiveId)
    .toBe('ash-001-check-signal-corner');
  state = await snapshot(page);
  expect(state.missions.runtime.highlights[0]).toMatchObject({
    channels: ['world', 'map'],
    target: {
      kind: 'interaction',
      referenceId: 'interaction.signal-controller',
    },
  });
  await page.keyboard.press('m');
  await expect.poll(async () => (await snapshot(page)).gameState).toBe('map');
  await expect
    .poll(async () => (await snapshot(page)).fullWorldMap.highlightCount)
    .toBe(1);
  await expect(
    page.locator('[data-highlight-id="highlight.ash-001.signal-corner"]'),
  ).toBeVisible();
  await page.keyboard.press('m');
  await expect
    .poll(async () => (await snapshot(page)).gameState)
    .toBe('playing');

  await command(page, 'player.teleport-position', '10.2,0.22,9.5,3.141593');
  await expect
    .poll(async () => (await snapshot(page)).interaction.activeTargetId)
    .toBe('interaction.signal-controller');
  await page.keyboard.press('g');
  await expect
    .poll(async () => activeMission(await snapshot(page))?.currentObjectiveId)
    .toBe('ash-001-walk-south-approach');
  expect((await snapshot(page)).missions.runtime.highlights[0]).toMatchObject({
    channels: ['map'],
    target: {
      kind: 'landmark',
      referenceId: 'landmark.south-approach',
    },
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await attachScreenshot(page, testInfo, 'mission-active-narrow');
  await command(page, 'player.teleport', 'spawn.approach-south');
  await expect
    .poll(async () => activeMission(await snapshot(page))?.currentObjectiveId)
    .toBe('ash-001-return-to-mack');

  await page.setViewportSize({ width: 1920, height: 800 });
  await attachScreenshot(page, testInfo, 'mission-return-ultrawide');
  await completeMackConversation(page);
  await expect
    .poll(async () => mission(await snapshot(page)).status)
    .toBe('completed');
  state = await snapshot(page);
  expect(state.missions.runtime).toMatchObject({
    activeMissionId: undefined,
    facts: {
      'rook-arrived-in-ashfall': true,
      'junction-surveillance-checked': true,
      'mack-trust': 'conditional',
    },
  });
  expect(state.missions.persistence).toEqual(
    JSON.parse(JSON.stringify(state.missions.persistence)),
  );
  expect(state.money.account.balance).toBe(575);
  expect(state.missions.hud.objectiveVisible).toBe(false);
  expect(state.runtimeErrors.count, state.runtimeErrors.last).toBe(0);
  expect(errors).toEqual([]);
});

test('mission debug controls expose cancellation and retry-ready restoration', async ({
  page,
}) => {
  const errors = monitorErrors(page);
  await openReady(page);
  await command(page, 'mission.start', 'ash-001-walk-the-block');
  await command(page, 'mission.fail');
  await expect
    .poll(async () => mission(await snapshot(page)))
    .toMatchObject({
      status: 'failed',
      retryReady: true,
      failureReason: 'debug-request',
    });
  await command(page, 'mission.retry', 'ash-001-walk-the-block');
  await expect
    .poll(async () => activeMission(await snapshot(page)))
    .toMatchObject({
      status: 'active',
      attempt: 2,
      currentObjectiveId: 'ash-001-enter-junction',
    });
  await command(page, 'mission.cancel');
  const cancelled = await snapshot(page);
  expect(mission(cancelled)).toMatchObject({
    status: 'cancelled',
    rewardGranted: false,
  });
  expect(cancelled.missions.runtime.highlights).toEqual([]);
  expect(cancelled.money.account.balance).toBe(500);
  expect(cancelled.runtimeErrors.count).toBe(0);
  expect(errors).toEqual([]);
});

async function completeMackConversation(page: Page): Promise<void> {
  await command(page, 'player.teleport', 'spawn.player-talk-mack');
  await expect
    .poll(async () => (await snapshot(page)).interaction.activeTargetId)
    .toBe('interaction.npc.mack');
  await page.keyboard.press('g');
  await expect
    .poll(async () => (await snapshot(page)).gameState)
    .toBe('dialogue');
  for (let lineIndex = 0; lineIndex < 4; lineIndex += 1) {
    await expect
      .poll(async () => (await snapshot(page)).dialogue.session.lineIndex)
      .toBe(lineIndex);
    if (lineIndex === 3) await command(page, 'dialogue.advance');
    else await page.keyboard.press('Enter');
  }
  await expect
    .poll(async () => (await snapshot(page)).gameState)
    .toBe('playing');
}

async function openReady(page: Page): Promise<void> {
  await page.goto(appUrl);
  await expect
    .poll(() =>
      page.evaluate(() => window.__VANTA_TEST__?.snapshot().ready ?? false),
    )
    .toBe(true);
}

async function snapshot(page: Page): Promise<BrowserTestSnapshot> {
  return page.evaluate(() => window.__VANTA_TEST__!.snapshot());
}

function mission(snapshot: BrowserTestSnapshot) {
  return snapshot.missions.runtime.missions.find(
    ({ id }) => id === 'ash-001-walk-the-block',
  )!;
}

function activeMission(snapshot: BrowserTestSnapshot) {
  return snapshot.missions.runtime.missions.find(
    ({ id }) => id === snapshot.missions.runtime.activeMissionId,
  );
}

async function command(
  page: Page,
  id: string,
  argument?: string,
): Promise<void> {
  await page.evaluate(
    ({ id, argument }) =>
      window.__VANTA_TEST__!.executeDebugCommand(id, argument),
    { id, argument },
  );
}

async function attachScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  await testInfo.attach(name, {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
}

function monitorErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

declare global {
  interface Window {
    __VANTA_TEST__?: BrowserTestApi;
  }
}
