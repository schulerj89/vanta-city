import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type {
  BrowserTestApi,
  BrowserTestSnapshot,
} from '../src/debug/BrowserTestBridge';

const appUrl = '/?e2e=1&debug=1&skipPicker=1&dialogueTypewriter=0';
const captureDirectory = path.resolve('docs/screenshots/mission-002');

test('Walk the Block gives one briefing, reveals one destination, and rewards once @visual', async ({
  page,
}, testInfo) => {
  const errors = monitorErrors(page);
  await openReady(page);
  expect((await snapshot(page)).npcs.snapshots).toEqual([
    expect.objectContaining({ definitionId: 'mack', modelSource: 'asset' }),
  ]);

  await command(page, 'mission.start', 'ash-001-walk-the-block');
  await expect
    .poll(async () => activeMission(await snapshot(page)))
    .toMatchObject({
      id: 'ash-001-walk-the-block',
      currentObjectiveId: 'ash-001-hear-mack-out',
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
    objectiveId: 'ash-001-hear-mack-out',
  });
  await expect
    .poll(async () => (await snapshot(page)).cinematic.cinematicId)
    .toBe('cinematic.ash-001.opening');
  await page.evaluate(() => window.__VANTA_TEST__!.requestCinematicSkip());
  await page.evaluate(() => window.__VANTA_TEST__!.confirmCinematicSkip());
  await expect
    .poll(async () => (await snapshot(page)).gameState)
    .toBe('playing');
  expect(activeMission(await snapshot(page))?.currentObjectiveId).toBe(
    'ash-001-hear-mack-out',
  );

  await completeMackConversation(page, testInfo);
  await expect
    .poll(async () => activeMission(await snapshot(page))?.currentObjectiveId)
    .toBe('ash-001-meet-yard-contact');
  state = await snapshot(page);
  expect(state.missions.runtime.highlights[0]).toMatchObject({
    channels: ['world', 'map'],
    target: {
      kind: 'location',
      referenceId: 'location.ash-001.contact-yard',
    },
  });
  expect(state.missions.hud).toMatchObject({
    objectiveId: 'ash-001-meet-yard-contact',
    worldTargetReferenceId: 'location.ash-001.contact-yard',
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await attachScreenshot(page, testInfo, 'mission-contact-yard-narrow');

  await page.setViewportSize({ width: 1920, height: 800 });
  await attachScreenshot(page, testInfo, 'mission-contact-yard-ultrawide');
  // WORLD-002 owns the physical location. This branch proves the public
  // objective contract and uses the existing debug seam to exercise completion.
  await command(page, 'mission.complete-objective');
  await expect
    .poll(async () => mission(await snapshot(page)).status)
    .toBe('completed');
  state = await snapshot(page);
  expect(state.missions.runtime).toMatchObject({
    activeMissionId: undefined,
    facts: {
      'rook-arrived-in-ashfall': true,
      'rook-accepted-orin-search': true,
      'marrow-has-rook-arrival-time': true,
      'contact-yard-meeting-completed': true,
      'orin-status': 'missing',
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
      currentObjectiveId: 'ash-001-hear-mack-out',
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

async function completeMackConversation(
  page: Page,
  testInfo: TestInfo,
): Promise<void> {
  await command(page, 'player.teleport', 'spawn.player-talk-mack');
  await expect
    .poll(async () => (await snapshot(page)).interaction.activeTargetId)
    .toBe('interaction.npc.mack');
  await page.keyboard.press('g');
  await expect
    .poll(async () => (await snapshot(page)).gameState)
    .toBe('dialogue');
  await expect
    .poll(async () => (await snapshot(page)).dialogue.session.lineIndex)
    .toBe(0);
  await attachScreenshot(page, testInfo, 'mission-active-desktop');
  for (let lineIndex = 0; lineIndex < 6; lineIndex += 1) {
    await expect
      .poll(async () => (await snapshot(page)).dialogue.session.lineIndex)
      .toBe(lineIndex);
    if (lineIndex === 5) await command(page, 'dialogue.advance');
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
  await mkdir(captureDirectory, { recursive: true });
  const capturePath = path.join(captureDirectory, `${name}.png`);
  await page.screenshot({ path: capturePath });
  await testInfo.attach(name, {
    path: capturePath,
    contentType: 'image/png',
  });
}

function monitorErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) => {
    // Asset availability probes intentionally abort optional same-origin HEAD
    // requests after reading enough metadata; production GET failures still fail.
    if (request.method() !== 'HEAD') {
      errors.push(`request failed: ${request.method()} ${request.url()}`);
    }
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.hostname !== '127.0.0.1' &&
      url.hostname !== 'localhost'
    ) {
      errors.push(`unexpected external request: ${request.url()}`);
    }
  });
  return errors;
}

declare global {
  interface Window {
    __VANTA_TEST__?: BrowserTestApi;
  }
}
