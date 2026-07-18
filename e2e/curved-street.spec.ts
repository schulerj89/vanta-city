import { expect, test } from '@playwright/test';
import type { ConsoleMessage, Page } from '@playwright/test';
import type {
  BrowserTestApi,
  BrowserTestSnapshot,
} from '../src/debug/BrowserTestBridge';

const appUrl =
  '/?e2e=1&debug=1&skipPicker=1&traffic=1&trafficCadence=0&trafficMax=6&time=13';
const screenshotRoot = 'docs/screenshots/world-001';

test.describe('WORLD-001 spline-derived curved street', () => {
  test('streams, grounds, maps, and routes traffic through the east quay curve @visual', async ({
    page,
  }) => {
    const consoleIssues = monitorConsoleIssues(page);
    await openReady(page);
    await command(page, 'player.teleport-position', '33.5,0.5,2,1.0');
    await expect
      .poll(async () => (await snapshot(page)).world.sectors.active)
      .toContain('sector.east-quay');
    await expect
      .poll(async () => (await snapshot(page)).player.groundColliderId)
      .toMatch(/^c\.road-east-quay-curve\.segment-/);

    await expect(
      page.locator('[data-entry-id="v.road-east-quay-curve"]'),
    ).toBeVisible();
    await expect(page.locator('[data-layer="roads"] path')).toHaveCount(1);
    await expect(page.locator('[data-layer="structures"] rect')).toHaveCount(
      10,
    );

    await command(page, 'traffic.clear');
    await command(page, 'traffic.spawn-each-approach');
    await command(page, 'traffic.step', '2');
    const state = await snapshot(page);
    const curvedIncoming = state.traffic.vehicles.find(
      ({ approach }) => approach === 'east',
    );
    expect(curvedIncoming).toBeDefined();
    expect(Math.abs(curvedIncoming!.directionZ)).toBeGreaterThan(0.1);
    expect(state.performance.renderer.drawCalls).toBeLessThan(150);
    expect(state.performance.renderer.triangles).toBeLessThan(150_000);

    await command(page, 'traffic.step', '10');
    const nearBoundary = (await snapshot(page)).traffic.vehicles.find(
      ({ approach }) => approach === 'east',
    );
    expect(nearBoundary?.stoppingReason).not.toBe('static-world');
    await command(page, 'traffic.step', '10');
    expect(
      (await snapshot(page)).traffic.vehicles.some(
        ({ approach }) => approach === 'east',
      ),
    ).toBe(false);
    await command(page, 'traffic.clear');
    await command(page, 'traffic.spawn-each-approach');
    await command(page, 'traffic.step', '1');

    await command(page, 'camera.preview-anchor', 'camera.east-quay-overhead');
    await expectCameraAnchor(page, 'camera.east-quay-overhead');
    await page.screenshot({
      path: `${screenshotRoot}/curve-day-overhead.png`,
      animations: 'disabled',
    });
    await command(page, 'camera.release-preview');
    await command(page, 'camera.preview-anchor', 'camera.east-quay-street');
    await expectCameraAnchor(page, 'camera.east-quay-street');
    await page.screenshot({
      path: `${screenshotRoot}/curve-day-street.png`,
      animations: 'disabled',
    });
    await command(page, 'time.night');
    await expect
      .poll(async () => (await snapshot(page)).lighting.transitioning)
      .toBe(false);
    await page.screenshot({
      path: `${screenshotRoot}/curve-night-street.png`,
      animations: 'disabled',
    });
    await command(page, 'camera.release-preview');

    expect((await snapshot(page)).runtimeErrors.count).toBe(0);
    expect(consoleIssues).toEqual([]);
  });
});

async function expectCameraAnchor(page: Page, id: string): Promise<void> {
  await expect
    .poll(async () => {
      const camera = (await snapshot(page)).camera;
      return {
        anchor: camera.activeAnchorId,
        transition: camera.transitionProgress,
        obstructed: camera.obstructed,
      };
    })
    .toEqual({ anchor: id, transition: 1, obstructed: false });
}

async function openReady(page: Page): Promise<void> {
  await page.goto(appUrl);
  await expect
    .poll(async () => {
      const state = await page.evaluate(() =>
        window.__VANTA_TEST__?.snapshot(),
      );
      return state?.ready && state.gameState === 'playing';
    })
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
    async ({ commandId, commandArgument }) =>
      window.__VANTA_TEST__!.executeDebugCommand(commandId, commandArgument),
    { commandId: id, commandArgument: argument },
  );
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
