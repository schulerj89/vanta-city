import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import type { BrowserTestSnapshot } from '../src/debug/BrowserTestBridge';

const appUrl = '/?e2e=1&skipPicker=1&dialogueTypewriter=0&traffic=0';
const openingId = 'cinematic.ash-001.opening';

test('opening progression, pause, skip cancellation/confirmation, and exact restoration @visual', async ({
  page,
}, testInfo) => {
  const diagnostics = monitorPage(page);
  await openReady(page);
  const before = await snapshot(page);

  expect(await start(page)).toBe(true);
  await expect
    .poll(async () => (await snapshot(page)).gameState)
    .toBe('cinematic');
  await advance(page, 0.5);
  await expect
    .poll(async () => (await snapshot(page)).cinematic)
    .toMatchObject({
      state: 'playing',
      shotId: 'shot.ash-001.north-arrival',
      speakerId: 'mack',
      playbackSequence: 1,
    });
  await expect
    .poll(async () => (await snapshot(page)).controls.ownership.owner)
    .toBe('cinematic');
  expect((await snapshot(page)).controls.ownership.acceptedActions).toEqual(
    expect.arrayContaining(['pause', 'skipCinematic']),
  );
  await attach(page, testInfo, 'opening-arrival-desktop');

  await page.keyboard.press('p');
  await expect
    .poll(async () => (await snapshot(page)).cinematic.state)
    .toBe('paused');
  const pausedAt = (await snapshot(page)).cinematic.shotElapsedSeconds;
  await advance(page, 2);
  expect((await snapshot(page)).cinematic.shotElapsedSeconds).toBe(pausedAt);
  await page.keyboard.press('p');
  await expect
    .poll(async () => (await snapshot(page)).cinematic.state)
    .toBe('playing');

  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('dialog', { name: 'Skip this scene?' }),
  ).toBeVisible();
  await expect(page.getByTestId('cinematic-skip-cancel')).toBeFocused();
  const skipAt = (await snapshot(page)).cinematic.shotElapsedSeconds;
  await advance(page, 2);
  expect((await snapshot(page)).cinematic.shotElapsedSeconds).toBe(skipAt);
  await attach(page, testInfo, 'skip-confirmation-desktop');
  await page.getByTestId('cinematic-skip-cancel').click();
  await expect(page.getByTestId('cinematic-skip-confirmation')).toBeHidden();
  expect((await snapshot(page)).cinematic.emittedEventIds).toEqual([
    'cinematic.ash-001.opening.entered',
  ]);

  await advance(page, 3.5);
  await expect
    .poll(async () => (await snapshot(page)).cinematic.shotId)
    .toBe('shot.ash-001.junction-watch');
  await attach(page, testInfo, 'opening-junction-desktop');
  await advance(page, 3.3);
  await expect
    .poll(async () => (await snapshot(page)).cinematic.shotId)
    .toBe('shot.ash-001.mack-position');
  await attach(page, testInfo, 'opening-mack-desktop');
  await advance(page, 3.6);
  await expect
    .poll(async () => (await snapshot(page)).cinematic)
    .toMatchObject({
      state: 'idle',
      lastResult: 'completed',
    });
  expectRestored(await snapshot(page), before);

  expect(await start(page)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('cinematic-skip-confirmation')).toBeVisible();
  await page.getByTestId('cinematic-skip-confirm').click();
  await expect
    .poll(async () => (await snapshot(page)).cinematic)
    .toMatchObject({
      state: 'idle',
      lastResult: 'skipped',
      playbackSequence: 2,
    });
  expectRestored(await snapshot(page), before);
  expect((await snapshot(page)).runtimeErrors.count).toBe(0);
  expectCleanDiagnostics(diagnostics);
});

test('participant failure and repeated playback leave no cinematic ownership', async ({
  page,
}) => {
  const diagnostics = monitorPage(page);
  await openReady(page);
  const before = await snapshot(page);

  expect(await start(page)).toBe(true);
  await page.evaluate(() =>
    window.__VANTA_TEST__!.setCinematicParticipantAvailable('mack', false),
  );
  await advance(page, 0.1);
  await expect
    .poll(async () => (await snapshot(page)).cinematic)
    .toMatchObject({
      state: 'idle',
      lastResult: 'failed',
      lastFailure: 'Required participant "mack" became unavailable',
    });
  expectRestored(await snapshot(page), before);

  await page.evaluate(() =>
    window.__VANTA_TEST__!.setCinematicParticipantAvailable('mack', true),
  );
  for (let index = 0; index < 3; index += 1) {
    expect(await start(page)).toBe(true);
    await page.evaluate(() => window.__VANTA_TEST__!.requestCinematicSkip());
    await page.evaluate(() => window.__VANTA_TEST__!.confirmCinematicSkip());
    await expect
      .poll(async () => (await snapshot(page)).cinematic.state)
      .toBe('idle');
    expectRestored(await snapshot(page), before);
  }
  const final = await snapshot(page);
  expect(final.cinematic.playbackSequence).toBe(4);
  expect(final.camera.owner).toBe(before.camera.owner);
  expect(final.runtimeErrors.count).toBe(0);
  expectCleanDiagnostics(diagnostics);
});

test('narrow enlarged-text and reduced-motion presentation stays readable @visual', async ({
  page,
}, testInfo) => {
  const diagnostics = monitorPage(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await openReady(page);
  await page.evaluate(() =>
    document.documentElement.style.setProperty('--ui-text-scale', '1.25'),
  );
  expect(await start(page)).toBe(true);
  await advance(page, 0.5);
  const subtitle = page.getByTestId('cinematic-presentation');
  await expect(subtitle).toBeVisible();
  await expect(subtitle).toContainText('fine morning to be late');
  await expectNoViewportOverflow(page);
  await attach(page, testInfo, 'opening-arrival-narrow-large-reduced');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('cinematic-skip-confirmation')).toBeVisible();
  await expectNoViewportOverflow(page);
  await attach(page, testInfo, 'skip-confirmation-narrow-large-reduced');
  await page.getByTestId('cinematic-skip-confirm').click();
  expect((await snapshot(page)).runtimeErrors.count).toBe(0);
  expectCleanDiagnostics(diagnostics);
});

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

async function start(page: Page): Promise<boolean> {
  return page.evaluate(
    (id) => window.__VANTA_TEST__!.startCinematic(id),
    openingId,
  );
}

async function advance(page: Page, seconds: number): Promise<void> {
  await page.evaluate(
    (value) => window.__VANTA_TEST__!.advanceCinematic(value),
    seconds,
  );
}

function expectRestored(
  after: BrowserTestSnapshot,
  before: BrowserTestSnapshot,
): void {
  expect(after.gameState).toBe(before.gameState);
  expect(after.camera.owner).toBe(before.camera.owner);
  expect(after.camera.mode).toBe(before.camera.mode);
  expect(after.player.position).toEqual(before.player.position);
  expect(after.missions.runtime.activeMissionId).toBe(
    before.missions.runtime.activeMissionId,
  );
  expect(after.fullWorldMap.open).toBe(before.fullWorldMap.open);
}

async function attach(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  await testInfo.attach(name, {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
}

async function expectNoViewportOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    width:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
    height:
      document.documentElement.scrollHeight -
      document.documentElement.clientHeight,
  }));
  expect(overflow.width).toBeLessThanOrEqual(0);
  expect(overflow.height).toBeLessThanOrEqual(0);
}

function monitorPage(page: Page) {
  const result = {
    consoleErrors: [] as string[],
    pageErrors: [] as string[],
    failedRequests: [] as string[],
  };
  page.on('console', (message) => {
    if (message.type() === 'error') result.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => result.pageErrors.push(error.message));
  page.on('requestfailed', (request) =>
    result.failedRequests.push(`${request.method()} ${request.url()}`),
  );
  return result;
}

function expectCleanDiagnostics(result: ReturnType<typeof monitorPage>): void {
  expect(result.consoleErrors).toEqual([]);
  expect(result.pageErrors).toEqual([]);
  // The existing development availability probes intentionally issue HEAD
  // requests for optional local assets. Reject every actual runtime load or
  // unrelated failed request while keeping those probes visible to review.
  expect(
    result.failedRequests.filter((request) => !request.startsWith('HEAD ')),
  ).toEqual([]);
  expect(
    result.failedRequests.every((request) => request.includes('/assets/')),
  ).toBe(true);
}
