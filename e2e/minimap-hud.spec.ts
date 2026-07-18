import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import type { BrowserTestSnapshot } from '../src/debug/BrowserTestBridge';

const appUrl = '/?e2e=1&debug=1&skipPicker=1&npcFixtures=1';

test.describe('north-up minimap HUD', () => {
  test('projects default and corner poses, exposes layers, and stays clean @visual', async ({
    page,
  }, testInfo) => {
    const failures = monitorFailures(page);
    await openReadyApp(page);
    const initial = await snapshot(page);
    expect(initial.minimapHud).toMatchObject({
      visible: true,
      orientation: 'north-up',
      levelId: 'test-district',
      bounds: { minX: -28, maxX: 42, minZ: -28, maxZ: 28 },
      layers: {
        roads: true,
        structures: true,
        landmarks: true,
        interactions: true,
        spawns: false,
      },
    });
    await expect(page.getByTestId('minimap-hud')).toBeVisible();
    await expect(page.locator('[data-layer="roads"] rect')).toHaveCount(2);
    await expect(page.locator('[data-layer="roads"] path')).toHaveCount(1);
    await expect(page.locator('[data-layer="structures"] rect')).toHaveCount(
      10,
    );
    await expect(page.locator('[data-layer="landmarks"] circle')).toHaveCount(
      5,
    );
    await assertNoGameplayHudOverlap(page);
    await capture(page, testInfo, 'minimap-default');

    const corners = [
      ['spawn.corner-northwest', { x: 27.143, y: 33.929 }, 315],
      ['spawn.corner-northeast', { x: 52.857, y: 33.929 }, 45],
      ['spawn.corner-southwest', { x: 27.143, y: 66.071 }, 225],
      ['spawn.corner-southeast', { x: 52.857, y: 66.071 }, 135],
    ] as const;
    for (const [spawnId, projected, heading] of corners) {
      await command(page, 'player.teleport', spawnId);
      await expect
        .poll(async () => (await snapshot(page)).minimapHud.projected)
        .toEqual({
          x: expect.closeTo(projected.x, 1),
          y: expect.closeTo(projected.y, 1),
        });
      expect((await snapshot(page)).minimapHud.headingDegrees).toBeCloseTo(
        heading,
        2,
      );
      await capture(page, testInfo, `minimap-${spawnId.split('.').at(-1)}`);
    }

    await page.evaluate(() =>
      window.__VANTA_TEST__!.setDebugToggle('minimap.layer.spawns', true),
    );
    await expect(page.locator('[data-layer="spawns"]')).toBeVisible();
    expect((await snapshot(page)).minimapHud.layers.spawns).toBe(true);
    expect((await snapshot(page)).runtimeErrors.count).toBe(0);
    expect(failures).toEqual([]);
  });

  test('uses safe narrow, pause, and dialogue layouts without collisions @visual', async ({
    page,
  }, testInfo) => {
    const failures = monitorFailures(page);
    await openReadyApp(page);

    await page.setViewportSize({ width: 390, height: 720 });
    await assertNoGameplayHudOverlap(page);
    await capture(page, testInfo, 'minimap-narrow');

    await page.keyboard.press('p');
    await expect
      .poll(async () => (await snapshot(page)).gameState)
      .toBe('paused');
    expect((await snapshot(page)).minimapHud.visible).toBe(true);
    await assertNoGameplayHudOverlap(page);
    await capture(page, testInfo, 'minimap-paused');
    await page.keyboard.press('p');
    await expect
      .poll(async () => (await snapshot(page)).gameState)
      .toBe('playing');

    await command(page, 'dialogue.start-mack');
    await expect
      .poll(async () => (await snapshot(page)).gameState)
      .toBe('dialogue');
    expect((await snapshot(page)).minimapHud.visible).toBe(true);
    await expect(page.getByTestId('dialogue-box')).toBeVisible();
    await assertNoGameplayHudOverlap(page, true);
    await capture(page, testInfo, 'minimap-dialogue');
    expect((await snapshot(page)).runtimeErrors.count).toBe(0);
    expect(failures).toEqual([]);
  });
});

async function openReadyApp(page: Page): Promise<void> {
  await page.goto(appUrl);
  await expect
    .poll(async () => {
      const state = await page.evaluate(() =>
        window.__VANTA_TEST__?.snapshot(),
      );
      return (
        state?.ready &&
        state.gameState === 'playing' &&
        state.minimapHud.visible
      );
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
    ({ commandId, commandArgument }) =>
      window.__VANTA_TEST__!.executeDebugCommand(commandId, commandArgument),
    { commandId: id, commandArgument: argument },
  );
}

async function assertNoGameplayHudOverlap(
  page: Page,
  includeDialogue = false,
): Promise<void> {
  const minimap = page.getByTestId('minimap-hud');
  const peers = [
    ['location', page.getByRole('complementary', { name: 'Current location' })],
    ['quickbar', page.locator('.quickbar')],
    ['health', page.locator('.health-hud__player')],
    ['money', page.locator('.money-hud')],
    ['debug', page.locator('.debug-panel')],
    ['help', page.getByRole('button', { name: 'Help' })],
    ...(includeDialogue
      ? ([['dialogue', page.getByTestId('dialogue-box')]] as const)
      : []),
  ] as const;
  const minimapBox = await minimap.boundingBox();
  if (!minimapBox) throw new Error('Minimap has no visible bounds');
  for (const [name, peer] of peers) {
    if ((await peer.count()) === 0) continue;
    const box = await peer.boundingBox();
    if (box) {
      expect(
        overlaps(minimapBox, box),
        `minimap overlaps ${name}: ${JSON.stringify({ minimapBox, box })}`,
      ).toBe(false);
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

function monitorFailures(page: Page): string[] {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(`console: ${message.text()}`);
  });
  return failures;
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

declare global {
  interface Window {
    __VANTA_TEST__?: import('../src/debug/BrowserTestBridge').BrowserTestApi;
  }
}
