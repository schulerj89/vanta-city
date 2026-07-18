import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import type {
  BrowserTestApi,
  BrowserTestSnapshot,
} from '../src/debug/BrowserTestBridge';

const appUrl = '/?e2e=1&debug=0&skipPicker=1&npcFixtures=1&time=13';

test('open HUD stays legible through live state and viewport changes @visual', async ({
  page,
}, testInfo) => {
  const failures = monitorFailures(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await openReady(page);
  await expect(page.locator('.minimap-hud__map')).toHaveCSS(
    'clip-path',
    /polygon/,
  );
  await assertOwnedHudClear(page);
  await capture(page, testInfo, 'live-exploration-bright-1280x720');

  await command(page, 'player.money-credit', '100');
  await expect
    .poll(async () => (await snapshot(page)).money.hud.delta)
    .toBe('+$100');
  await expect
    .poll(async () => (await snapshot(page)).money.hud.displayedBalance)
    .toBe(600);
  await capture(page, testInfo, 'live-money-credit-bright-1280x720');

  for (let index = 0; index < 6; index += 1)
    await command(page, 'player.health-damage');
  await expect
    .poll(async () => (await snapshot(page)).healthHud.player.current)
    .toBe(40);
  await expect(page.locator('.health-hud__player')).toHaveAttribute(
    'data-status',
    'low',
  );
  await capture(page, testInfo, 'live-low-health-noisy-1280x720');

  await command(page, 'mission.start', 'ash-001-walk-the-block');
  await expect
    .poll(async () => (await snapshot(page)).missions.hud.objectiveVisible)
    .toBe(true);
  await expect
    .poll(async () => (await snapshot(page)).missions.hud.notificationVisible)
    .toBe(true);
  await command(page, 'time.night');
  await expectLighting(page, 'night', 1);
  await capture(page, testInfo, 'live-mission-update-dark-1280x720');

  await page.setViewportSize({ width: 390, height: 844 });
  await assertOwnedHudClear(page);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await capture(page, testInfo, 'live-mission-update-dark-390x844');

  await page.setViewportSize({ width: 1920, height: 800 });
  await command(page, 'player.health-reset');
  await command(page, 'time.day');
  await expectLighting(page, 'day', 0);
  await page.keyboard.press('m');
  await expect.poll(async () => (await snapshot(page)).gameState).toBe('map');
  await page.keyboard.press('m');
  await expect
    .poll(async () => (await snapshot(page)).gameState)
    .toBe('playing');
  await expect
    .poll(async () => (await snapshot(page)).minimapHud.visible)
    .toBe(true);
  await assertOwnedHudClear(page);
  await capture(page, testInfo, 'live-restored-noisy-1920x800');

  const final = await snapshot(page);
  expect(final.runtimeErrors.count, final.runtimeErrors.last).toBe(0);
  expect(failures.runtime).toEqual([]);
  const unexpectedRequests = failures.requests.filter(
    (failure) =>
      !(
        failure.method === 'HEAD' &&
        failure.url.includes('/assets/') &&
        failure.error.includes('ERR_ABORTED')
      ),
  );
  expect(unexpectedRequests).toEqual([]);
  await testInfo.attach('request-failure-inspection.json', {
    body: Buffer.from(
      JSON.stringify(
        {
          expectedAbortedAssetProbes: failures.requests.length,
          unexpectedRequests,
        },
        null,
        2,
      ),
    ),
    contentType: 'application/json',
  });
});

async function openReady(page: Page): Promise<void> {
  await page.goto(appUrl);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const current = window.__VANTA_TEST__?.snapshot();
        return current?.ready && current.gameState === 'playing';
      }),
    )
    .toBe(true);
}

async function snapshot(page: Page): Promise<BrowserTestSnapshot> {
  return page.evaluate(() => window.__VANTA_TEST__!.snapshot());
}

async function expectLighting(
  page: Page,
  preset: 'day' | 'night',
  nightBlend: number,
): Promise<void> {
  await expect
    .poll(async () => {
      const lighting = (await snapshot(page)).lighting;
      return {
        preset: lighting.preset,
        nightBlend: lighting.nightBlend,
        transitioning: lighting.transitioning,
      };
    })
    .toEqual({ preset, nightBlend, transitioning: false });
}

async function command(
  page: Page,
  id: string,
  argument?: string,
): Promise<void> {
  await page.evaluate(
    async ({ commandId, commandArgument }) => {
      await window.__VANTA_TEST__!.executeDebugCommand(
        commandId,
        commandArgument,
      );
    },
    { commandId: id, commandArgument: argument },
  );
}

async function assertOwnedHudClear(page: Page): Promise<void> {
  const selectors = [
    '.minimap-hud',
    '.location-hud',
    '.quickbar',
    '.money-hud',
    '.health-hud__player',
    '.mission-objective-hud:not([hidden])',
    '.mission-notification:not([hidden])',
  ];
  const rectangles = await page.evaluate((ownedSelectors) => {
    return ownedSelectors.flatMap((selector) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element || element.getClientRects().length === 0) return [];
      const rect = element.getBoundingClientRect();
      return [
        {
          selector,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
      ];
    });
  }, selectors);
  for (const rectangle of rectangles) {
    expect(rectangle.x, rectangle.selector).toBeGreaterThanOrEqual(0);
    expect(rectangle.y, rectangle.selector).toBeGreaterThanOrEqual(0);
    expect(
      rectangle.x + rectangle.width,
      rectangle.selector,
    ).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
    expect(
      rectangle.y + rectangle.height,
      rectangle.selector,
    ).toBeLessThanOrEqual(await page.evaluate(() => window.innerHeight));
  }
  for (let left = 0; left < rectangles.length; left += 1) {
    for (let right = left + 1; right < rectangles.length; right += 1) {
      const a = rectangles[left];
      const b = rectangles[right];
      expect(overlaps(a, b), `${a.selector} overlaps ${b.selector}`).toBe(
        false,
      );
    }
  }
}

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

async function capture(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

function monitorFailures(page: Page): {
  readonly runtime: string[];
  readonly requests: Array<{
    readonly method: string;
    readonly url: string;
    readonly error: string;
  }>;
} {
  const runtime: string[] = [];
  const requests: Array<{ method: string; url: string; error: string }> = [];
  page.on('pageerror', (error) => runtime.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') runtime.push(`console: ${message.text()}`);
  });
  page.on('requestfailed', (request) => {
    requests.push({
      method: request.method(),
      url: request.url(),
      error: request.failure()?.errorText ?? '',
    });
  });
  return { runtime, requests };
}

declare global {
  interface Window {
    __VANTA_TEST__?: BrowserTestApi;
  }
}
