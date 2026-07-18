import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import path from 'node:path';

const appUrl =
  '/?e2e=1&debug=1&skipPicker=1&npcFixtures=1&sparringFixture=1&hostileOpponent=1&dialogueTypewriter=0';

test('hostile debug opponent fights, gates, downs, and revives cleanly @visual', async ({
  page,
}, testInfo) => {
  test.slow();
  const runtimeFailures: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeFailures.push(message.text());
  });
  page.on('pageerror', (error) => runtimeFailures.push(error.message));
  await page.goto(appUrl);
  await expect
    .poll(async () => Boolean(await page.evaluate(() => window.__VANTA_TEST__)))
    .toBe(true);
  await expect
    .poll(async () => (await snapshot(page)).gameState)
    .toBe('playing');
  await expect
    .poll(async () => (await snapshot(page)).sparringTarget.loaded)
    .toBe(true);

  await command(page, 'player.teleport-position', '16,0.2,5.5,0');
  await expect
    .poll(async () => (await snapshot(page)).sparringTarget.opponent.state)
    .toBe('approach');
  const approaching = await snapshot(page);
  expect(approaching.sparringTarget.opponent).toMatchObject({
    active: true,
    shouldMove: true,
    damageSequence: 0,
  });
  await capture(page, testInfo, 'opponent-approach.png');

  await expect
    .poll(async () => (await snapshot(page)).healthHud.player.current)
    .toBeLessThan(100);
  const attacked = await snapshot(page);
  expect(attacked.sparringTarget.opponent).toMatchObject({
    attackSequence: expect.any(Number),
    damageSequence: expect.any(Number),
  });
  expect(attacked.sparringTarget.opponent.distance).toBeGreaterThanOrEqual(0.9);
  await capture(page, testInfo, 'opponent-attack.png');

  await page.keyboard.press('p');
  await expect
    .poll(async () => (await snapshot(page)).gameState)
    .toBe('paused');
  const pausedHealth = (await snapshot(page)).healthHud.player.current;
  await animationFrames(page, 5);
  expect((await snapshot(page)).healthHud.player.current).toBe(pausedHealth);
  expect((await snapshot(page)).sparringTarget.opponent.state).toBe('idle');
  await page.keyboard.press('p');
  await expect
    .poll(async () => (await snapshot(page)).gameState)
    .toBe('playing');

  await command(page, 'dialogue.start-mack');
  await expect
    .poll(async () => (await snapshot(page)).gameState)
    .toBe('dialogue');
  const dialogueHealth = (await snapshot(page)).healthHud.player.current;
  await animationFrames(page, 5);
  expect((await snapshot(page)).healthHud.player.current).toBe(dialogueHealth);
  expect((await snapshot(page)).sparringTarget.opponent.state).toBe('idle');
  await command(page, 'conversation.end');
  await expect
    .poll(async () => (await snapshot(page)).gameState)
    .toBe('playing');

  const beforeDeath = (await snapshot(page)).player.position;
  await command(page, 'player.health-deplete');
  await expect(page.getByRole('dialog', { name: 'DOWNED' })).toBeVisible();
  const downed = await snapshot(page);
  expect(downed.player.position).toEqual(beforeDeath);
  expect(downed.playerDeath).toMatchObject({
    visible: true,
    controlsSuppressed: true,
    cameraOwned: true,
    depletionSequence: 1,
  });
  expect(downed.character.death).toMatchObject({
    depleted: true,
    nativeClip: true,
    fadeFallback: false,
  });
  expect(downed.camera).toMatchObject({
    mode: 'cinematic',
    owner: 'player-death-presentation',
  });
  await expect
    .poll(() =>
      page
        .locator('.death-overlay__content')
        .evaluate((element) => getComputedStyle(element).opacity),
    )
    .toBe('1');
  await capture(page, testInfo, 'downed-overlay-desktop.png');

  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, testInfo, 'downed-overlay-narrow.png');
  await page.getByRole('button', { name: 'Revive & restart' }).click();
  await expect(page.getByRole('dialog', { name: 'DOWNED' })).toBeHidden();
  await expect
    .poll(async () => (await snapshot(page)).healthHud.player.current)
    .toBe(100);
  const revived = await snapshot(page);
  expect(revived.playerDeath).toMatchObject({
    visible: false,
    controlsSuppressed: false,
    cameraOwned: false,
    reviveSequence: 1,
  });
  expect(revived.camera).toMatchObject({ mode: 'gameplay', owner: 'gameplay' });
  expect(revived.sparringTarget.health).toMatchObject({ current: 100 });

  const revivedPosition = revived.player.position;
  await page.keyboard.down('w');
  await expect
    .poll(async () =>
      distance((await snapshot(page)).player.position, revivedPosition),
    )
    .toBeGreaterThan(0.1);
  await page.keyboard.up('w');

  await toggle(page, 'sparring-target.active', false);
  await expect
    .poll(async () => (await snapshot(page)).sparringTarget.listenerCount)
    .toBe(0);
  await toggle(page, 'sparring-target.active', true);
  await expect
    .poll(async () => (await snapshot(page)).sparringTarget.listenerCount)
    .toBe(3);
  expect((await snapshot(page)).world.collision.dynamicCapsuleCount).toBe(1);
  expect(runtimeFailures).toEqual([]);
  expect((await snapshot(page)).runtimeErrors.count).toBe(0);
});

async function snapshot(page: Page) {
  return page.evaluate(() => {
    if (!window.__VANTA_TEST__) throw new Error('Test bridge unavailable');
    return window.__VANTA_TEST__.snapshot();
  });
}

async function command(page: Page, id: string, argument?: string) {
  await page.evaluate(
    async ([commandId, commandArgument]) => {
      if (!window.__VANTA_TEST__) throw new Error('Test bridge unavailable');
      await window.__VANTA_TEST__.executeDebugCommand(
        commandId,
        commandArgument,
      );
    },
    [id, argument] as const,
  );
}

async function toggle(page: Page, id: string, enabled: boolean) {
  await page.evaluate(
    ([toggleId, value]) => {
      if (!window.__VANTA_TEST__) throw new Error('Test bridge unavailable');
      window.__VANTA_TEST__.setDebugToggle(toggleId, value);
    },
    [id, enabled] as const,
  );
}

async function animationFrames(page: Page, count: number) {
  await page.evaluate(
    (frames) =>
      new Promise<void>((resolve) => {
        let remaining = frames;
        const tick = () => {
          remaining -= 1;
          if (remaining <= 0) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    count,
  );
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  const output = path.join(
    process.cwd(),
    'docs',
    'screenshots',
    'combat-death',
    name,
  );
  await page.screenshot({ path: output, fullPage: true });
  await testInfo.attach(name, {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
}

function distance(
  a: { readonly x: number; readonly z: number },
  b: { readonly x: number; readonly z: number },
) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
