import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import type {
  BrowserTestApi,
  BrowserTestSnapshot,
} from '../src/debug/BrowserTestBridge';

const appUrl = '/?e2e=1&debug=1';

test.describe('playable debug district', () => {
  test('starts ready with a grounded player, valid visual, world, and camera', async ({
    page,
  }, testInfo) => {
    const runtimeFailures = monitorRuntimeFailures(page);
    await openReadyApp(page);

    await expect
      .poll(async () => (await snapshot(page)).character.source, {
        message: 'selected character visual should finish loading',
      })
      .not.toBe('loading');
    const state = await snapshot(page);

    expect(state.gameState).toBe('playing');
    expect(state.renderer.initialized).toBe(true);
    expect(state.renderer.width).toBeGreaterThan(0);
    expect(state.renderer.height).toBeGreaterThan(0);
    expect(state.world.levelId).toBe('test-district');
    expect(state.world.defaultSpawnId).toBe('spawn.player-default');
    expect(state.world.declaredColliderCount).toBeGreaterThan(0);
    expect(state.world.initializedColliderCount).toBe(
      state.world.declaredColliderCount,
    );
    expect(state.player.exists).toBe(true);
    expectFiniteVector(state.player.position, 'player position');
    expectFiniteVector(state.player.velocity, 'player velocity');
    expect(
      state.player.position.y,
      `player fell below world floor: y=${state.player.position.y}, floor=${state.world.floorHeight}`,
    ).toBeGreaterThanOrEqual(state.world.floorHeight - 0.02);
    expect(Math.abs(state.player.velocity.y)).toBeLessThan(0.05);

    expect(state.character.loadedDefinitionId).toBe(state.selectedCharacterId);
    expect(state.character.attached).toBe(true);
    expect(
      state.character.bounds,
      'character should report finite bounds',
    ).toBeDefined();
    const bounds = state.character.bounds;
    if (!bounds) throw new Error('Character bounds were unavailable');
    expectFiniteVector(bounds.min, 'character bounds minimum');
    expectFiniteVector(bounds.max, 'character bounds maximum');
    expect(
      Math.abs(bounds.min.y - state.player.position.y),
      'visual bottom should align with the player ground-contact plane',
    ).toBeLessThanOrEqual(0.2);

    expect(state.camera.active).toBe(true);
    expectFiniteVector(state.camera.position, 'camera position');
    expectFiniteVector(state.camera.target, 'camera target');
    expect(state.camera.distance).toBeGreaterThanOrEqual(
      state.camera.safetyMinDistance - 0.02,
    );
    expect(state.camera.distance).toBeLessThanOrEqual(
      state.camera.safetyMaxDistance + 0.02,
    );
    expect(state.runtimeErrors.count, state.runtimeErrors.last).toBe(0);
    expect(runtimeFailures, formatRuntimeFailures(runtimeFailures)).toEqual([]);

    await executeCommand(page, 'helpers.toggle', 'collision');
    await executeCommand(page, 'helpers.toggle', 'spawnPoints');
    await attachScreenshot(page, testInfo, 'initial-debug-district');

    await page.reload();
    await waitForReadyState(page);
    const reloaded = await snapshot(page);
    expect(reloaded.gameState).toBe('playing');
    expect(reloaded.world.levelId).toBe('test-district');
    expect(reloaded.player.grounded).toBe(true);
    expect(reloaded.runtimeErrors.count, reloaded.runtimeErrors.last).toBe(0);
  });

  test('moves, decelerates, pauses, resumes, and completes an interaction', async ({
    page,
  }, testInfo) => {
    await openReadyApp(page);
    const initial = await snapshot(page);

    await page.keyboard.down('w');
    await expect
      .poll(
        async () =>
          horizontalDistance(
            (await snapshot(page)).player.position,
            initial.player.position,
          ),
        {
          message:
            'simulated forward input should move the player horizontally',
        },
      )
      .toBeGreaterThan(0.5);
    await page.keyboard.up('w');
    await expect
      .poll(
        async () => horizontalSpeed((await snapshot(page)).player.velocity),
        {
          message: 'released movement input should decelerate the player',
        },
      )
      .toBeLessThan(0.1);
    const stopped = await snapshot(page);
    expect(
      stopped.player.position.y,
      'movement should not take the player below the world floor',
    ).toBeGreaterThanOrEqual(stopped.world.floorHeight - 0.02);

    await page.keyboard.press('p');
    await expect
      .poll(async () => (await snapshot(page)).gameState)
      .toBe('paused');
    const pausedAt = (await snapshot(page)).player.position;
    await page.keyboard.down('w');
    await page.waitForTimeout(350);
    const pausedAfterInput = (await snapshot(page)).player.position;
    expect(
      horizontalDistance(pausedAfterInput, pausedAt),
      'paused simulation should keep player position stable',
    ).toBeLessThan(0.02);

    await page.keyboard.press('p');
    await expect
      .poll(async () => (await snapshot(page)).gameState)
      .toBe('playing');
    await expect
      .poll(
        async () =>
          horizontalDistance((await snapshot(page)).player.position, pausedAt),
        { message: 'resuming should restore held movement input' },
      )
      .toBeGreaterThan(0.3);
    await page.keyboard.up('w');

    await executeCommand(page, 'player.teleport', 'spawn.player-garage');
    await expect
      .poll(async () => (await snapshot(page)).interaction.activeTargetId, {
        message: 'garage door should become the selected interaction candidate',
      })
      .toBe('interaction.garage-door');
    await attachScreenshot(page, testInfo, 'player-beside-interactable');
    await page.keyboard.press('e');
    await expect
      .poll(async () => (await snapshot(page)).interaction.completedTargetIds)
      .toContain('interaction.garage-door');
  });

  test('uses a fallback for an invalid character and persists a valid selection', async ({
    page,
  }, testInfo) => {
    await openReadyApp(page);
    await executeCommand(page, 'player.select-character', 'test-invalid-asset');
    await expect
      .poll(async () => (await snapshot(page)).character.loadedDefinitionId, {
        message:
          'invalid test character should resolve through fallback loading',
      })
      .toBe('test-invalid-asset');
    const fallback = await snapshot(page);
    expect(fallback.selectedCharacterId).toBe('test-invalid-asset');
    expect(fallback.character.source).toBe('placeholder');
    expect(fallback.character.attached).toBe(true);
    expect(fallback.character.bounds).toBeDefined();
    expect(fallback.runtimeErrors.count, fallback.runtimeErrors.last).toBe(0);
    await attachScreenshot(page, testInfo, 'character-fallback-debug');

    await executeCommand(page, 'player.select-character', 'vanta-placeholder');
    await expect
      .poll(async () => (await snapshot(page)).character.loadedDefinitionId)
      .toBe('vanta-placeholder');
    await page.reload();
    await waitForReadyState(page);
    const reloaded = await snapshot(page);
    expect(reloaded.selectedCharacterId).toBe('vanta-placeholder');
    expect(reloaded.character.loadedDefinitionId).toBe('vanta-placeholder');
  });

  test('opens the picker in-place and supports keyboard-only confirmation', async ({
    page,
  }) => {
    await openReadyApp(page);
    await executeCommand(page, 'ui.open-character-picker');
    await expect
      .poll(async () => (await snapshot(page)).picker.open)
      .toBe(true);
    const opened = await snapshot(page);
    expect(opened.gameState).toBe('character-select');
    expect(opened.picker.registeredCharacterIds).toEqual(
      expect.arrayContaining(['vanta-placeholder', 'modular-man']),
    );

    await page.keyboard.press('ArrowRight');
    await expect
      .poll(async () => (await snapshot(page)).picker.focusedCharacterId)
      .toBe('modular-man');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Space');
    await page.keyboard.press('Enter');
    await expect
      .poll(async () => (await snapshot(page)).picker.open)
      .toBe(false);
    const confirmed = await snapshot(page);
    expect(confirmed.gameState).toBe('playing');
    expect(confirmed.picker.confirmedCharacterId).toBe('vanta-placeholder');

    await page.keyboard.press('k');
    await expect
      .poll(async () => (await snapshot(page)).picker.open)
      .toBe(true);
    await page.keyboard.press('Escape');
    await expect
      .poll(async () => (await snapshot(page)).picker.open)
      .toBe(false);
  });

  test('spawns conversation NPCs and signals Mack dialogue through Talk', async ({
    page,
  }) => {
    await openReadyApp(page);
    await expect.poll(async () => (await snapshot(page)).npcs.count).toBe(3);
    const initial = await snapshot(page);
    expect(
      initial.npcs.snapshots.map(({ definitionId }) => definitionId),
    ).toEqual(['mack', 'nox', 'raze']);
    expect(
      initial.npcs.snapshots.every(({ modelFallback }) => modelFallback),
    ).toBe(true);

    await executeCommand(page, 'player.teleport', 'spawn.npc-mechanic');
    await expect
      .poll(async () => (await snapshot(page)).interaction.activeTargetId)
      .toBe('interaction.npc.mack');
    await page.keyboard.press('e');
    await expect
      .poll(async () => (await snapshot(page)).gameState)
      .toBe('dialogue');
    const talking = await snapshot(page);
    expect(talking.conversation).toEqual({
      npcId: 'mack',
      conversationId: 'conversation.mack.introduction',
    });
    expect(
      talking.npcs.snapshots.find(
        ({ definitionId }) => definitionId === 'mack',
      ),
    ).toMatchObject({
      interactionState: 'conversation',
      conversationState: 'active',
    });
    expect(talking.interaction.activeTargetId).toBeUndefined();

    await executeCommand(page, 'conversation.end');
    await expect
      .poll(async () => (await snapshot(page)).gameState)
      .toBe('playing');
    expect((await snapshot(page)).conversation.npcId).toBeUndefined();
  });
});

async function openReadyApp(page: Page): Promise<void> {
  await page.goto(appUrl);
  await waitForReadyState(page);
}

async function waitForReadyState(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            window.__VANTA_TEST__?.snapshot().gameState ??
            'test bridge not installed',
        ),
      {
        message:
          'application should start and expose playing state through its development test bridge',
      },
    )
    .toBe('playing');
  await expect
    .poll(async () => (await snapshot(page)).renderer.initialized, {
      message: 'Three.js renderer should initialize and render a frame',
    })
    .toBe(true);
  await expect
    .poll(async () => (await snapshot(page)).player.grounded, {
      message: 'player should settle on the world floor',
    })
    .toBe(true);
}

async function snapshot(page: Page): Promise<BrowserTestSnapshot> {
  return page.evaluate(() => {
    const api = window.__VANTA_TEST__;
    if (!api) throw new Error('Vanta browser test bridge is unavailable');
    return api.snapshot();
  });
}

async function executeCommand(
  page: Page,
  id: string,
  argument?: string,
): Promise<void> {
  await page.evaluate(
    async ({ commandId, commandArgument }) => {
      const api: BrowserTestApi | undefined = window.__VANTA_TEST__;
      if (!api) throw new Error('Vanta browser test bridge is unavailable');
      await api.executeDebugCommand(commandId, commandArgument);
    },
    { commandId: id, commandArgument: argument },
  );
}

function monitorRuntimeFailures(page: Page): string[] {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  return failures;
}

function formatRuntimeFailures(failures: readonly string[]): string {
  return failures.length === 0
    ? 'no uncaught browser errors'
    : `uncaught browser errors:\n${failures.join('\n')}`;
}

function expectFiniteVector(
  value: { readonly x: number; readonly y: number; readonly z: number },
  label: string,
): void {
  expect(Number.isFinite(value.x), `${label}.x must be finite`).toBe(true);
  expect(Number.isFinite(value.y), `${label}.y must be finite`).toBe(true);
  expect(Number.isFinite(value.z), `${label}.z must be finite`).toBe(true);
}

function horizontalDistance(
  a: { readonly x: number; readonly z: number },
  b: { readonly x: number; readonly z: number },
): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function horizontalSpeed(velocity: {
  readonly x: number;
  readonly z: number;
}): number {
  return Math.hypot(velocity.x, velocity.z);
}

async function attachScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  await testInfo.attach(name, {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
}
