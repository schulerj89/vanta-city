import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { BrowserTestApi } from '../src/debug/BrowserTestBridge';

const appUrl = '/?e2e=1&debug=1&skipPicker=1&npcFixtures=1&sparringFixture=1';

test('local theme/radio playback, preferences, interruption, and repeated lifecycle remain deterministic @smoke', async ({
  page,
}) => {
  const consoleIssues: string[] = [];
  const failedRequests: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleIssues.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) =>
    consoleIssues.push(`pageerror: ${error.message}`),
  );
  page.on('requestfailed', (request) => failedRequests.push(request.url()));

  await page.goto(appUrl);
  await ready(page);
  await page.keyboard.press('w');
  await expect
    .poll(async () => (await snapshot(page)).audio.loadState)
    .toBe('loaded');
  await expect
    .poll(async () => (await snapshot(page)).audio.activeTrackId)
    .toBe('theme.cinder-ledger');
  expect((await snapshot(page)).audio).toMatchObject({
    contextState: 'running',
    activeChannel: 'theme',
    liveSources: 1,
    cachedBuffers: 1,
  });

  await page.evaluate(() => window.__VANTA_TEST__!.audioPause());
  expect((await snapshot(page)).audio.liveSources).toBe(0);
  await page.evaluate(() => window.__VANTA_TEST__!.audioResume());
  await expect
    .poll(async () => (await snapshot(page)).audio.activeChannel)
    .toBe('theme');

  await page.evaluate(() =>
    window.__VANTA_TEST__!.setAudioPreferences({
      masterVolume: 0.35,
      radioVolume: 0.45,
      muted: true,
      monoOutput: true,
    }),
  );
  expect((await snapshot(page)).audio.preferences).toMatchObject({
    masterVolume: 0.35,
    radioVolume: 0.45,
    muted: true,
    monoOutput: true,
  });

  await page.evaluate(() =>
    window.__VANTA_TEST__!.executeDebugCommand(
      'player.teleport-position',
      '4.25,0.22,19,0',
    ),
  );
  const gamepad = virtualGamepad();
  for (let cycle = 0; cycle < 3; cycle += 1) {
    await pulseButton(page, gamepad, 2);
    await expect
      .poll(async () => (await snapshot(page)).vehicle.controller.mode)
      .toBe('driving');
    await expect
      .poll(async () => (await snapshot(page)).audio.activeChannel)
      .toBe('radio');
    expect((await snapshot(page)).audio.liveSources).toBe(1);
    await page.keyboard.press('p');
    await expect
      .poll(async () => (await snapshot(page)).gameState)
      .toBe('paused');
    expect((await snapshot(page)).audio.liveSources).toBe(0);
    await page.keyboard.press('p');
    await expect
      .poll(async () => (await snapshot(page)).audio.activeChannel)
      .toBe('radio');
    await pulseButton(page, gamepad, 2);
    await expect
      .poll(async () => (await snapshot(page)).vehicle.controller.mode)
      .toBe('on-foot');
    await expect
      .poll(async () => (await snapshot(page)).audio.activeChannel)
      .toBe('theme');
    expect((await snapshot(page)).audio.liveSources).toBe(1);
  }

  const state = await snapshot(page);
  expect(state.audio.cachedBuffers).toBe(2);
  expect(state.audio.sourcesStopped).toBe(state.audio.sourcesCreated - 1);
  expect(state.runtimeErrors.count).toBe(0);
  expect(
    failedRequests.filter((url) => !url.startsWith(new URL(page.url()).origin)),
  ).toEqual([]);
  expect(
    consoleIssues.filter(
      (message) =>
        !/GL Driver Message .*GPU stall due to ReadPixels/.test(message),
    ),
  ).toEqual([]);

  await page.reload();
  await ready(page);
  expect((await snapshot(page)).audio.preferences).toMatchObject({
    masterVolume: 0.35,
    radioVolume: 0.45,
    muted: true,
    monoOutput: true,
  });
});

test('local audio failure is bounded and visible through the public snapshot', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`${appUrl}&audioFail=1`);
  await ready(page);
  await page.keyboard.press('w');
  await expect
    .poll(async () => (await snapshot(page)).audio.loadState)
    .toBe('error');
  expect((await snapshot(page)).audio).toMatchObject({
    liveSources: 0,
    cachedBuffers: 0,
    lastError: 'Local audio request failed with HTTP 503',
  });
  expect((await snapshot(page)).runtimeErrors.count).toBe(0);
  expect(pageErrors).toEqual([]);
});

async function ready(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => window.__VANTA_TEST__?.snapshot().ready ?? false),
    )
    .toBe(true);
}

async function snapshot(page: Page) {
  return page.evaluate(() => window.__VANTA_TEST__!.snapshot());
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
