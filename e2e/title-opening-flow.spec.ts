import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';

test('Ashfall title starts by mouse/keyboard and persists authoritative music mute @visual', async ({
  page,
}, testInfo) => {
  const diagnostics = monitor(page);
  await page.goto('/?e2e=1&title=1&traffic=0');
  const title = page.getByTestId('title-screen');
  await expect(title).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ashfall' })).toBeVisible();
  await expect(page.getByTestId('title-start')).toBeFocused();
  await screenshot(page, testInfo, 'ashfall-title-desktop');

  const music = page.getByTestId('title-music');
  await expect(music).toHaveAttribute('aria-pressed', 'false');
  await music.click();
  await expect(music).toHaveAttribute('aria-pressed', 'true');
  await expect(music).toHaveAttribute('aria-label', 'Unmute music');
  expect(
    await page.evaluate(() =>
      localStorage.getItem('vanta-city:audio-preferences'),
    ),
  ).toContain('"muted":true');

  await page.getByTestId('title-start').focus();
  await page.keyboard.press('Enter');
  await expect(title).toBeHidden();
  await waitReady(page);
  expect(diagnostics.errors).toEqual([]);
  expect(diagnostics.failed).toEqual([]);
  expect(diagnostics.external).toEqual([]);
});

test('narrow enlarged reduced-motion title remains readable @visual', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?e2e=1&title=1&traffic=0');
  await page.evaluate(() =>
    document.documentElement.style.setProperty('--ui-text-scale', '1.25'),
  );
  await expect(page.getByTestId('title-start')).toBeFocused();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await screenshot(page, testInfo, 'ashfall-title-narrow-large-reduced');
  await page.keyboard.press('Space');
  await waitReady(page);
});

test('Northbar opening uses purposeful shots and lands once at Junction @visual', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const diagnostics = monitor(page);
  await page.goto(
    '/?e2e=1&opening=1&skipTitle=1&traffic=0&dialogueTypewriter=0',
  );
  await waitReady(page);
  await expect
    .poll(() => cinematic(page).then(({ state }) => state))
    .toBe('playing');
  await expect
    .poll(() => cinematic(page).then(({ shotId }) => shotId))
    .toBe('shot.ash-001.northbar-establish');
  await screenshot(page, testInfo, 'northbar-opening-establish');

  await advance(page, 4.1);
  await expect
    .poll(() => cinematic(page).then(({ shotId }) => shotId))
    .toBe('shot.ash-001.failed-pickup-two-shot');
  await screenshot(page, testInfo, 'northbar-opening-two-shot');
  await advance(page, 4.2);
  await screenshot(page, testInfo, 'northbar-opening-mack-close');
  await advance(page, 3.4);
  await screenshot(page, testInfo, 'northbar-opening-della-carbon');

  await advance(page, 7.3);
  await expect
    .poll(() => cinematic(page).then(({ shotId }) => shotId))
    .toBe('shot.ash-001.rook-decision-close');
  const beforeSkip = await cinematic(page);
  await page.evaluate(() => window.__VANTA_TEST__!.requestCinematicSkip());
  await page.evaluate(() => window.__VANTA_TEST__!.cancelCinematicSkip());
  const afterCancel = await cinematic(page);
  expect(afterCancel.shotId).toBe(beforeSkip.shotId);
  expect(afterCancel.shotElapsedSeconds).toBe(beforeSkip.shotElapsedSeconds);
  await screenshot(page, testInfo, 'northbar-opening-rook-decision');

  await advance(page, 3.3);
  await screenshot(page, testInfo, 'northbar-opening-ticket-choice');
  await advance(page, 7);
  await screenshot(page, testInfo, 'northbar-opening-departure');
  await advance(page, 4.3);
  const transition = await cinematic(page);
  if (transition.state === 'landing')
    await screenshot(page, testInfo, 'northbar-opening-loading');
  await expect
    .poll(() => cinematic(page), { timeout: 15_000 })
    .toMatchObject({
      state: 'idle',
      lastResult: 'completed',
      committedLandingTransactionId: 'transaction.ash-001.northbar-arrival',
    });
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__VANTA_TEST__!.snapshot().locationHud.locationName,
      ),
    )
    .toBe('North Approach');
  await screenshot(page, testInfo, 'northbar-opening-junction-arrival');
  expect(diagnostics.errors).toEqual([]);
  expect(diagnostics.failed).toEqual([]);
  expect(diagnostics.external).toEqual([]);
});

test('Northbar opening remains subtitle-safe on a narrow reduced-motion viewport @visual', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    '/?e2e=1&opening=1&skipTitle=1&traffic=0&dialogueTypewriter=0',
  );
  await waitReady(page);
  await expect
    .poll(() => cinematic(page).then(({ shotId }) => shotId))
    .toBe('shot.ash-001.northbar-establish');
  await screenshot(page, testInfo, 'northbar-opening-establish-narrow-reduced');
  for (const duration of [4.1, 4.2, 3.4, 3.9, 4.1])
    await advance(page, duration);
  await expect
    .poll(() => cinematic(page).then(({ shotId }) => shotId))
    .toBe('shot.ash-001.rook-decision-close');
  await screenshot(page, testInfo, 'northbar-opening-decision-narrow-reduced');
  await page.evaluate(() => window.__VANTA_TEST__!.requestCinematicSkip());
  await page.evaluate(() => window.__VANTA_TEST__!.confirmCinematicSkip());
  await expect
    .poll(() => cinematic(page), { timeout: 15_000 })
    .toMatchObject({ state: 'idle', lastResult: 'skipped' });
  await screenshot(page, testInfo, 'northbar-opening-junction-narrow-reduced');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

async function waitReady(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => window.__VANTA_TEST__?.snapshot().ready ?? false),
    )
    .toBe(true);
}

async function cinematic(page: Page) {
  return page.evaluate(() => window.__VANTA_TEST__!.snapshot().cinematic);
}

async function advance(page: Page, seconds: number): Promise<void> {
  await page.evaluate(
    (value) => window.__VANTA_TEST__!.advanceCinematic(value),
    seconds,
  );
}

async function screenshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let frames = 0;
        const next = () => {
          frames += 1;
          if (frames >= 30) resolve();
          else requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      }),
  );
  await testInfo.attach(name, {
    body: await page.screenshot({
      path: `docs/screenshots/cinematic-004/${name}.png`,
    }),
    contentType: 'image/png',
  });
}

function monitor(page: Page) {
  const errors: string[] = [];
  const failed: string[] = [];
  const external: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) => {
    if (request.method() !== 'HEAD')
      failed.push(`${request.method()} ${request.url()}`);
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      !['blob:', 'data:'].includes(url.protocol) &&
      !['127.0.0.1', 'localhost'].includes(url.hostname)
    )
      external.push(request.url());
  });
  return { errors, failed, external };
}
