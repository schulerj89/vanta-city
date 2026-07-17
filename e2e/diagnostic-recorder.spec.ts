import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { BrowserTestApi } from '../src/debug/BrowserTestBridge';
import type { DiagnosticTrace } from '../src/debug/DiagnosticTrace';

test('records movement through dialogue restore, freezes, exports, and reads back cleanly', async ({
  page,
}) => {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(`console: ${message.text()}`);
  });

  await page.goto('/?e2e=1&debug=1&skipPicker=1&npcFixtures=1');
  await expect.poll(() => hasReadyBridge(page)).toBe(true);
  await command(page, 'diagnostics.start', '5');

  const before = await playerPosition(page);
  await page.keyboard.down('w');
  await expect
    .poll(async () => distance(await playerPosition(page), before))
    .toBeGreaterThan(0.2);
  await page.keyboard.up('w');

  await command(page, 'player.teleport', 'spawn.player-talk-mack');
  await expect
    .poll(() => selectedInteraction(page))
    .toBe('interaction.npc.mack');
  await page.keyboard.press('g');
  await expect.poll(() => gameState(page)).toBe('dialogue');
  await expect
    .poll(() => cameraOwner(page))
    .toBe('dialogue:conversation.mack.introduction');
  await expect
    .poll(() => traceHasCameraMode(page, 'conversation'), {
      message: 'recorder should sample the conversation camera before release',
    })
    .toBe(true);

  await command(page, 'conversation.end');
  await expect.poll(() => gameState(page)).toBe('playing');
  await expect.poll(() => cameraOwner(page)).toBe('gameplay');
  await expect.poll(() => cameraTransition(page)).toBe(1);
  await command(page, 'diagnostics.freeze');

  const download = page.waitForEvent('download');
  await command(page, 'diagnostics.export');
  expect((await download).suggestedFilename()).toBe(
    'vanta-city-diagnostic-trace.json',
  );

  const serialized = await page.evaluate(() =>
    window.__VANTA_TEST__!.exportDiagnosticTrace(),
  );
  const trace = JSON.parse(serialized) as DiagnosticTrace;
  const summary = await page.evaluate(
    (input) => window.__VANTA_TEST__!.readbackDiagnosticTrace(input),
    serialized,
  );

  expect(trace.schema).toBe('vanta-city.diagnostic-trace');
  expect(trace.version).toBe(1);
  expect(trace.state).toBe('frozen');
  expect(trace.frames.length).toBeGreaterThan(2);
  expect(trace.frames.length).toBeLessThanOrEqual(trace.config.frameCapacity);
  expect(trace.events.map(({ type }) => type)).toEqual(
    expect.arrayContaining([
      'interaction:started',
      'interaction:completed',
      'conversation:started',
      'dialogue:started',
      'game-state:changed',
      'conversation:ended',
      'recorder:frozen',
    ]),
  );
  expect(
    trace.frames.some(({ player }) =>
      ['walking', 'running'].includes(player.movementState),
    ),
  ).toBe(true);
  expect(
    trace.frames.some(({ camera }) => camera.mode === 'conversation'),
  ).toBe(true);
  expect(
    trace.frames.some(({ interaction }) =>
      interaction.lineOfSightDecisions.some(
        ({ targetId, result }) =>
          targetId === 'interaction.npc.mack' && result === 'clear',
      ),
    ),
  ).toBe(true);
  expect(trace.frames.at(-1)?.camera.owner).toBe('gameplay');
  expect(serialized).not.toContain('You’re late.');
  expect(summary).toMatchObject({
    frameCount: trace.frames.length,
    eventCount: trace.events.length,
    lastGameState: 'playing',
  });
  expect(failures).toEqual([]);
});

async function hasReadyBridge(page: Page): Promise<boolean> {
  return page.evaluate(() => window.__VANTA_TEST__?.snapshot().ready === true);
}

async function command(
  page: Page,
  id: string,
  argument?: string,
): Promise<void> {
  await page.evaluate(
    async ({ commandId, commandArgument }) => {
      const api: BrowserTestApi | undefined = window.__VANTA_TEST__;
      if (!api) throw new Error('Browser test bridge is unavailable');
      await api.executeDebugCommand(commandId, commandArgument);
    },
    { commandId: id, commandArgument: argument },
  );
}

async function playerPosition(page: Page) {
  return page.evaluate(() => window.__VANTA_TEST__!.snapshot().player.position);
}

async function selectedInteraction(page: Page) {
  return page.evaluate(
    () => window.__VANTA_TEST__!.snapshot().interaction.activeTargetId,
  );
}

async function gameState(page: Page) {
  return page.evaluate(() => window.__VANTA_TEST__!.snapshot().gameState);
}

async function cameraOwner(page: Page) {
  return page.evaluate(() => window.__VANTA_TEST__!.snapshot().camera.owner);
}

async function cameraTransition(page: Page) {
  return page.evaluate(
    () => window.__VANTA_TEST__!.snapshot().camera.transitionProgress,
  );
}

async function traceHasCameraMode(
  page: Page,
  mode: DiagnosticTrace['frames'][number]['camera']['mode'],
): Promise<boolean> {
  return page.evaluate((expectedMode) => {
    const serialized = window.__VANTA_TEST__!.exportDiagnosticTrace();
    const trace = JSON.parse(serialized) as DiagnosticTrace;
    return trace.frames.some(({ camera }) => camera.mode === expectedMode);
  }, mode);
}

function distance(
  left: { readonly x: number; readonly z: number },
  right: { readonly x: number; readonly z: number },
): number {
  return Math.hypot(left.x - right.x, left.z - right.z);
}
