import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const evidenceDirectory = 'docs/screenshots/presentation-002';
const gameplayUrl =
  '/?e2e=1&debug=0&skipPicker=1&traffic=1&trafficMax=6&time=13';

test.describe('Vanta City title presentation @visual', () => {
  test('desktop default and focused Start remain clean and intentional', async ({
    page,
  }) => {
    const diagnostics = monitor(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/?e2e=1&title=1&traffic=0');
    const title = page.getByTestId('title-screen');
    await expect(title).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'VANTA CITY' }),
    ).toBeVisible();
    await expect(page.getByText('Ashfall City · September 1997')).toBeVisible();

    await page.evaluate(() =>
      (document.activeElement as HTMLElement | null)?.blur(),
    );
    await capture(page, 'title-desktop-default');
    await page.getByTestId('title-start').focus();
    await expect(page.getByTestId('title-start')).toBeFocused();
    await capture(page, 'title-desktop-start-focused');
    await expectNoOverflow(page, 1280, 720);
    expect(diagnostics).toMatchObject({ errors: [], failed: [], external: [] });
  });

  test('narrow 125 percent text and reduced motion preserve the safe column', async ({
    page,
  }) => {
    const diagnostics = monitor(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?e2e=1&title=1&traffic=0');
    await page.evaluate(() =>
      document.documentElement.style.setProperty('--ui-text-scale', '1.25'),
    );
    await expect(page.getByTestId('title-start')).toBeFocused();
    await capture(page, 'title-narrow-large-reduced');
    await expectNoOverflow(page, 390, 844);
    expect(diagnostics).toMatchObject({ errors: [], failed: [], external: [] });
  });

  test('ultrawide crop keeps Music focus visible', async ({ page }) => {
    const diagnostics = monitor(page);
    await page.setViewportSize({ width: 1920, height: 800 });
    await page.goto('/?e2e=1&title=1&traffic=0');
    await page.getByTestId('title-music').focus();
    await expect(page.getByTestId('title-music')).toBeFocused();
    await capture(page, 'title-ultrawide-music-focused');
    await expectNoOverflow(page, 1920, 800);
    expect(diagnostics).toMatchObject({ errors: [], failed: [], external: [] });
  });

  test('a real pre-loader renderer failure becomes the one canonical fatal presentation', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.getContext = function () {
        return null;
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    await page.goto('/?e2e=1&title=1&traffic=0');
    await expect(page.getByTestId('title-start')).toBeFocused();

    await page.getByTestId('title-start').click();

    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Vanta City could not start');
    await expect(alert).toContainText(/WebGL/i);
    await expect(page.getByTestId('loading-retry')).toBeFocused();
    await expect(page.getByTestId('title-screen')).toHaveCount(0);
    await expect(page.getByTestId('loading-screen')).toHaveCount(1);
    await expect(page.locator('[data-ui-zone="presentation"]')).toHaveCount(1);
    await expect(
      page.locator('[data-ui-zone="presentation"] > .loading-screen'),
    ).toHaveCount(1);
  });
});

test.describe('Vanta City loading presentation @visual', () => {
  test('measurable local progress is labelled on desktop', async ({ page }) => {
    const diagnostics = monitor(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await openGameplay(page);
    await installLoadingFixture(page, 'measurable');
    const progress = page.getByRole('progressbar', {
      name: 'Startup progress',
    });
    await expect(progress).toHaveAttribute('value', '0.46');
    await expect(page.getByText(/46%/)).toBeVisible();
    await capture(page, 'loading-measurable-desktop');
    await expectNoOverflow(page, 1280, 720);
    expect(diagnostics).toMatchObject({ errors: [], failed: [], external: [] });
  });

  test('narrow indeterminate character readiness has no invented percent', async ({
    page,
  }) => {
    const diagnostics = monitor(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await openGameplay(page);
    await installLoadingFixture(page, 'indeterminate');
    const progress = page.getByRole('progressbar', {
      name: 'Startup progress',
    });
    await expect(progress).not.toHaveAttribute('value');
    await expect(
      page.getByText('Preparing character · Indeterminate'),
    ).toBeVisible();
    await capture(page, 'loading-indeterminate-narrow');
    await expectNoOverflow(page, 390, 844);
    expect(diagnostics).toMatchObject({ errors: [], failed: [], external: [] });
  });

  test('ultrawide slow state exposes elapsed truth without fake completion', async ({
    page,
  }) => {
    const diagnostics = monitor(page);
    await page.setViewportSize({ width: 1920, height: 800 });
    await openGameplay(page);
    await installLoadingFixture(page, 'slow');
    await expect(page.getByTestId('loading-screen')).toHaveAttribute(
      'role',
      'region',
    );
    await expect(page.locator('.loading-screen__phase')).toHaveAttribute(
      'aria-live',
      'polite',
    );
    await expect(page.locator('.loading-screen__elapsed')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    await expect(
      page.getByText('Preparing district · Indeterminate'),
    ).toBeVisible();
    await expect(
      page.getByText('Still working locally · 5 seconds elapsed'),
    ).toBeVisible();
    await expect(
      page.getByRole('progressbar', { name: 'Startup progress' }),
    ).not.toHaveAttribute('value');
    await capture(page, 'loading-slow-ultrawide');
    await expectNoOverflow(page, 1920, 800);
    expect(diagnostics).toMatchObject({ errors: [], failed: [], external: [] });
  });

  test('fatal startup exposes the real error and focused Retry', async ({
    page,
  }) => {
    const diagnostics = monitor(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await openGameplay(page);
    await installLoadingFixture(page, 'fatal');
    await expect(page.getByRole('alert')).toContainText(
      'Renderer initialization failed: WebGL context unavailable',
    );
    await expect(page.getByTestId('loading-retry')).toBeFocused();
    await capture(page, 'loading-fatal-retry-focused');
    expect(diagnostics).toMatchObject({ errors: [], failed: [], external: [] });
  });

  test('playable fallback remains bounded over bright noisy gameplay', async ({
    page,
  }) => {
    const diagnostics = monitor(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await openGameplay(page);
    await installLoadingFixture(page, 'fallback');
    await expect(page.getByText('Ashfall City is ready')).toBeVisible();
    await expect(page.getByTestId('loading-dismiss')).toBeVisible();
    const box = await page.getByTestId('loading-screen').boundingBox();
    expect(box?.width).toBeLessThan(520);
    expect(box?.height).toBeLessThan(300);
    await capture(page, 'loading-fallback-bright-noisy');
    expect(diagnostics).toMatchObject({ errors: [], failed: [], external: [] });
  });
});

type FixtureMode =
  'measurable' | 'indeterminate' | 'slow' | 'fatal' | 'fallback';

async function openGameplay(page: Page): Promise<void> {
  await page.goto(gameplayUrl);
  await expect
    .poll(
      () =>
        page.evaluate(() => window.__VANTA_TEST__?.snapshot().ready ?? false),
      { timeout: 20_000 },
    )
    .toBe(true);
}

async function installLoadingFixture(
  page: Page,
  mode: FixtureMode,
): Promise<void> {
  await page.evaluate(async (fixtureMode) => {
    const moduleUrl = '/src/ui/LoadingScreen.ts';
    const loadingModule = (await import(
      /* @vite-ignore */ moduleUrl
    )) as unknown as typeof import('../src/ui/LoadingScreen');
    const { LoadingScreen } = loadingModule;
    const mount = document.querySelector<HTMLElement>(
      '[data-ui-zone="presentation"]',
    );
    if (!mount) throw new Error('Presentation mount unavailable');
    if (fixtureMode === 'fatal') {
      LoadingScreen.createFatal(
        mount,
        new Error('Renderer initialization failed: WebGL context unavailable'),
      );
      return;
    }
    const listeners = new Set<(status: unknown) => void>();
    const assets = {
      onStatus(listener: (status: unknown) => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    let currentTime = 0;
    const screen = new LoadingScreen(mount, assets as never, () => currentTime);
    if (fixtureMode === 'slow') currentTime = 5_200;
    if (fixtureMode === 'measurable') {
      for (const listener of listeners)
        listener({ id: 'district.geometry', phase: 'loading', progress: 0.46 });
    } else if (fixtureMode === 'indeterminate') {
      screen.markWorldReady();
    } else if (fixtureMode === 'fallback') {
      for (const listener of listeners)
        listener({
          id: 'character.optional-jacket',
          phase: 'error',
          progress: 0,
          error: new Error('Optional local presentation unavailable'),
        });
      screen.markWorldReady();
      screen.markCharacterReady(false);
      screen.complete();
    }
  }, mode);
  await expect(page.getByTestId('loading-screen')).toBeVisible();
  if (mode === 'slow')
    await expect(page.getByText(/seconds elapsed/)).toBeVisible({
      timeout: 2_500,
    });
}

async function capture(page: Page, name: string): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  await page.screenshot({
    path: `${evidenceDirectory}/${name}.png`,
    animations: 'disabled',
  });
}

async function expectNoOverflow(
  page: Page,
  width: number,
  height: number,
): Promise<void> {
  expect(
    await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    })),
  ).toEqual({ width, height });
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
