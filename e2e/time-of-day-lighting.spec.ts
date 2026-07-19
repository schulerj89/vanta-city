import { expect, test } from '@playwright/test';
import type { ConsoleMessage, Page, TestInfo } from '@playwright/test';
import type {
  BrowserTestApi,
  BrowserTestSnapshot,
} from '../src/debug/BrowserTestBridge';

const appUrl =
  '/?e2e=1&debug=0&skipPicker=1&dialogueTypewriter=0&npcFixtures=1&time=13';

test.describe('time-of-day lighting', () => {
  test('keeps day/night readable, bounded, and deliberate across game states @visual', async ({
    page,
  }, testInfo) => {
    const consoleIssues = monitorConsoleIssues(page);
    await openReadyApp(page);
    await expectLighting(page, 'day', 0);
    await attachScreenshot(page, testInfo, 'ashfall-day-desktop');

    await command(page, 'time.night');
    await expectLighting(page, 'night', 1);
    const night = await snapshot(page);
    expect(night.lighting).toMatchObject({
      localLightCount: 4,
      emissiveFixtureCount: 2,
      emissiveFixtureIds: ['lamp.street-light-nw', 'lamp.street-light-se'],
      emissiveMaterialCount: 1,
      maxLocalLights: 4,
      shadowsEnabled: false,
    });
    expect(night.performance.renderer.drawCalls).toBeLessThan(260);
    await expect(page.locator('[data-layer="structures"] rect')).toHaveCount(
      39,
    );
    expect(await loadedStreetscapeTextures(page)).toHaveLength(7);
    await attachScreenshot(page, testInfo, 'ashfall-night-desktop');

    await command(page, 'time.day');
    await page.keyboard.press('p');
    await expect
      .poll(async () => (await snapshot(page)).gameState)
      .toBe('paused');
    const paused = (await snapshot(page)).lighting;
    await waitAnimationFrames(page, 8);
    expect((await snapshot(page)).lighting.transitionProgress).toBe(
      paused.transitionProgress,
    );
    await page.keyboard.press('p');
    await expectLighting(page, 'day', 0);

    await command(page, 'time.night');
    await command(page, 'dialogue.start-mack');
    await expect
      .poll(async () => (await snapshot(page)).gameState)
      .toBe('dialogue');
    await expectLighting(page, 'night', 1);
    expect((await snapshot(page)).lighting.dialogueBehavior).toBe('continue');
    expect((await snapshot(page)).runtimeErrors.count).toBe(0);
    expect(consoleIssues).toEqual([]);
  });

  test('proves day and lamp illumination at narrow width @visual', async ({
    page,
  }, testInfo) => {
    const consoleIssues = monitorConsoleIssues(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await openReadyApp(page);
    await command(page, 'player.teleport-position', '-2,0.22,5,-0.78');
    await expectLighting(page, 'day', 0);
    await attachScreenshot(page, testInfo, 'ashfall-day-narrow');
    await command(page, 'time.night');
    await expectLighting(page, 'night', 1);
    await attachScreenshot(page, testInfo, 'ashfall-night-narrow');
    expect((await snapshot(page)).runtimeErrors.count).toBe(0);
    expect(consoleIssues).toEqual([]);
  });
});

async function openReadyApp(page: Page): Promise<void> {
  await page.goto(appUrl);
  await expect
    .poll(
      async () => {
        const state = await page.evaluate(() =>
          window.__VANTA_TEST__?.snapshot(),
        );
        return state?.ready && state.gameState === 'playing';
      },
      { timeout: 20_000 },
    )
    .toBe(true);
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

async function snapshot(page: Page): Promise<BrowserTestSnapshot> {
  return page.evaluate(() => window.__VANTA_TEST__!.snapshot());
}

async function command(
  page: Page,
  id: string,
  argument?: string,
): Promise<void> {
  await page.evaluate(
    async ({ commandId, commandArgument }) =>
      window.__VANTA_TEST__!.executeDebugCommand(commandId, commandArgument),
    { commandId: id, commandArgument: argument },
  );
}

async function waitAnimationFrames(page: Page, count: number): Promise<void> {
  await page.evaluate(
    (frames) =>
      new Promise<void>((resolve) => {
        const next = (): void => {
          frames -= 1;
          if (frames === 0) resolve();
          else requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      }),
    count,
  );
}

async function loadedStreetscapeTextures(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map(({ name }) => name)
      .filter((name) =>
        /\/assets\/environment\/ashfall-buildings\/[^/]+\.generated\.jpg$/.test(
          name,
        ),
      ),
  );
}

async function attachScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

function monitorConsoleIssues(page: Page): string[] {
  const issues: string[] = [];
  page.on('console', (message: ConsoleMessage) => {
    if (
      (message.type() === 'error' || message.type() === 'warning') &&
      !/^\[\.WebGL-[^\]]+\]GL Driver Message .*GPU stall due to ReadPixels/.test(
        message.text(),
      )
    ) {
      issues.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => issues.push(`pageerror: ${error.message}`));
  return issues;
}

declare global {
  interface Window {
    __VANTA_TEST__?: BrowserTestApi;
  }
}
