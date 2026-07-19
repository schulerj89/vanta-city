import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { BrowserTestSnapshot } from '../src/debug/BrowserTestBridge';
import type { VirtualGamepadFixture } from '../src/input/GamepadInput';

const appUrl = '/?e2e=1&debug=1&skipPicker=1&npcFixtures=1';

test.describe('pause-safe full world map', () => {
  test('renders authored world facts and restores gameplay exactly', async ({
    page,
  }) => {
    const failures = monitorFailures(page);
    await openReadyApp(page);
    const before = await snapshot(page);
    await page.keyboard.press('m');
    await expect.poll(async () => (await snapshot(page)).gameState).toBe('map');
    const open = await snapshot(page);
    expect(open.fullWorldMap).toMatchObject({
      open: true,
      priorState: 'playing',
      levelId: 'test-district',
      geometryCount: 49,
      roadCount: 10,
      structureCount: 39,
      sectorCount: 22,
      placeCount: 11,
      highlightCount: 0,
      focusedTestId: 'map-close',
    });
    expect(open.camera.owner).toBe(before.camera.owner);
    expect(open.player.position).toEqual(before.player.position);
    expect(open.minimapHud.visible).toBe(false);
    expect(open.locationHud.visible).toBe(false);
    await expect(page.getByTestId('full-world-map')).toBeVisible();
    await expect(
      page
        .getByTestId('full-world-map')
        .locator('[data-entry-id="v.road-east-quay-curve"]'),
    ).toHaveCount(1);
    await expect(page.locator('[data-sector-id]')).toHaveCount(22);
    await expect(page.locator('.full-world-map__structures rect')).toHaveCount(
      39,
    );

    await page.getByTestId('map-zoom-in').click();
    await page.keyboard.down('d');
    await expect
      .poll(async () => (await snapshot(page)).fullWorldMap.center.x)
      .toBeGreaterThan(50);
    await page.keyboard.up('d');
    const adjusted = await snapshot(page);
    expect(adjusted.fullWorldMap.zoom).toBeGreaterThan(1);
    expect(adjusted.fullWorldMap.center.x).toBeGreaterThan(50);
    await page.getByTestId('map-reset').click();
    expect((await snapshot(page)).fullWorldMap).toMatchObject({
      zoom: 1,
      center: { x: 50, y: 50 },
    });

    await page.keyboard.press('m');
    await expect
      .poll(async () => (await snapshot(page)).gameState)
      .toBe('playing');
    const restored = await snapshot(page);
    expect(restored.camera.owner).toBe(before.camera.owner);
    expect(restored.camera.yaw).toBeCloseTo(before.camera.yaw, 8);
    expect(restored.camera.pitch).toBeCloseTo(before.camera.pitch, 8);
    expect(restored.player.position).toEqual(before.player.position);
    expect(restored.minimapHud.visible).toBe(true);

    await page.keyboard.press('p');
    await page.keyboard.press('m');
    await expect.poll(async () => (await snapshot(page)).gameState).toBe('map');
    expect((await snapshot(page)).fullWorldMap.priorState).toBe('paused');
    await page.keyboard.press('Escape');
    await expect
      .poll(async () => (await snapshot(page)).gameState)
      .toBe('paused');
    expect(failures).toEqual([]);
  });

  test('opens and closes with isolated gamepad controls', async ({ page }) => {
    await openReadyApp(page);
    const gamepad = virtualGamepad();
    await pulseButton(page, gamepad, 6);
    await expect.poll(async () => (await snapshot(page)).gameState).toBe('map');
    await expect
      .poll(async () => (await snapshot(page)).controls.ownership.owner)
      .toBe('map');
    await pulseButton(page, gamepad, 5);
    expect((await snapshot(page)).fullWorldMap.zoom).toBeGreaterThan(1);
    await pulseButton(page, gamepad, 1);
    await expect
      .poll(async () => (await snapshot(page)).gameState)
      .toBe('playing');
  });

  test('keeps controls reachable with narrow safe-area, 125% text, and reduced motion', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await openReadyApp(page);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '20px';
      document.documentElement.style.setProperty('--ash-safe-top', '24px');
      document.documentElement.style.setProperty('--ash-safe-bottom', '20px');
    });
    await page.keyboard.press('m');
    const map = page.getByTestId('full-world-map');
    await expect(map).toBeVisible();
    await expect(page.getByTestId('map-close')).toBeVisible();
    await expect(page.getByTestId('map-reset')).toBeVisible();
    await expect(
      page.getByText('Ashfall Crossing', { exact: true }),
    ).toBeVisible();
    const bounds = await map.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  });

  for (const sample of [
    { name: 'full-map-desktop', viewport: { width: 1280, height: 720 } },
    { name: 'full-map-narrow', viewport: { width: 390, height: 844 } },
    { name: 'full-map-ultrawide', viewport: { width: 1920, height: 800 } },
  ] as const) {
    test(`${sample.name} @visual`, async ({ page }) => {
      await page.setViewportSize(sample.viewport);
      await openReadyApp(page);
      await page.keyboard.press('m');
      await expect(page.getByTestId('full-world-map')).toBeVisible();
      await expect(page).toHaveScreenshot(`${sample.name}.png`, {
        animations: 'disabled',
        maxDiffPixelRatio: 0.012,
      });
    });
  }
});

async function openReadyApp(page: Page): Promise<void> {
  await page.goto(appUrl);
  await expect
    .poll(() =>
      page.evaluate(() => window.__VANTA_TEST__?.snapshot().gameState),
    )
    .toBe('playing');
}

async function snapshot(page: Page): Promise<BrowserTestSnapshot> {
  return page.evaluate(() => window.__VANTA_TEST__!.snapshot());
}

function virtualGamepad(): VirtualGamepadFixture {
  return {
    connected: true,
    id: 'Map gamepad',
    axes: [0, 0, 0, 0],
    buttons: Array(16).fill(0),
  };
}

async function pulseButton(
  page: Page,
  fixture: VirtualGamepadFixture,
  index: number,
): Promise<void> {
  const down = {
    ...fixture,
    buttons: fixture.buttons.map((value, button) =>
      button === index ? 1 : value,
    ),
  };
  await page.evaluate(
    (next) => window.__VANTA_TEST__!.setVirtualGamepad(next),
    down,
  );
  await waitForAnimationFrames(page, 6);
  await page.evaluate(
    (next) => window.__VANTA_TEST__!.setVirtualGamepad(next),
    fixture,
  );
  await waitForAnimationFrames(page, 4);
}

async function waitForAnimationFrames(
  page: Page,
  count: number,
): Promise<void> {
  await page.evaluate(
    (remaining) =>
      new Promise<void>((resolve) => {
        const frame = (): void => {
          remaining -= 1;
          if (remaining <= 0) resolve();
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
    count,
  );
}

function monitorFailures(page: Page): string[] {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(`console: ${message.text()}`);
  });
  return failures;
}

declare global {
  interface Window {
    __VANTA_TEST__?: import('../src/debug/BrowserTestBridge').BrowserTestApi;
  }
}
