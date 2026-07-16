import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import type {
  BrowserTestApi,
  BrowserTestSnapshot,
} from '../src/debug/BrowserTestBridge';

const appUrl = '/?e2e=1&debug=1&skipPicker=1';

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
    expect(angleDistance(state.player.facingYaw, Math.PI)).toBeLessThan(0.001);
    expectFiniteVector(state.player.position, 'player position');
    expectFiniteVector(state.player.velocity, 'player velocity');
    expect(
      state.player.position.y,
      `player fell below world floor: y=${state.player.position.y}, floor=${state.world.floorHeight}`,
    ).toBeGreaterThanOrEqual(state.world.floorHeight - 0.02);
    expect(Math.abs(state.player.velocity.y)).toBeLessThan(0.05);

    expect(state.character.loadedDefinitionId).toBe(state.selectedCharacterId);
    expect(state.character.source).toBe('asset');
    expect(state.character.attached).toBe(true);
    expect(
      state.character.bounds,
      'character should report finite bounds',
    ).toBeDefined();
    const bounds = state.character.bounds;
    if (!bounds) throw new Error('Character bounds were unavailable');
    expectFiniteVector(bounds.min, 'character bounds minimum');
    expectFiniteVector(bounds.max, 'character bounds maximum');
    expect(bounds.max.y - bounds.min.y).toBeLessThanOrEqual(1.82);
    expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(0.78);
    expect(bounds.max.z - bounds.min.z).toBeLessThanOrEqual(0.78);
    expect(
      Math.abs(bounds.min.y - state.player.position.y),
      'visual bottom should align with the player ground-contact plane',
    ).toBeLessThanOrEqual(0.2);

    expect(state.camera.active).toBe(true);
    expect(
      state.camera.position.z,
      'default camera should begin behind the player and look into the district',
    ).toBeGreaterThan(state.player.position.z);
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

    await page.keyboard.press('q');
    await expect
      .poll(async () => (await snapshot(page)).camera.shoulderSide, {
        message: 'shoulder switch action should update the gameplay camera',
      })
      .not.toBe(initial.camera.shoulderSide);
    await expect
      .poll(async () => (await snapshot(page)).camera.shoulderOffset, {
        message: 'shoulder offset should transition to the selected side',
      })
      .toBeLessThan(-0.65);

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
      .poll(async () => (await snapshot(page)).character.animationState)
      .toBe('idle');

    await page.keyboard.down('Shift');
    await page.keyboard.down('w');
    await expect
      .poll(async () => (await snapshot(page)).character.animationState)
      .toBe('run');
    await page.keyboard.up('w');
    await page.keyboard.up('Shift');
    await expect
      .poll(async () => (await snapshot(page)).character.animationState)
      .toBe('idle');
    const afterRun = await snapshot(page);
    expect(afterRun.character.bounds).toBeDefined();
    expect(
      Math.abs(afterRun.character.bounds!.min.y - afterRun.player.position.y),
      'animation root translation must not pull the visual off the ground plane',
    ).toBeLessThanOrEqual(0.2);
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

    // Reset away from the road barrier before isolating pause/resume input.
    await executeCommand(page, 'player.teleport', 'spawn.player-default');
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

  test('keeps WASD, Down, character facing, sprint, and orbit controls independent', async ({
    page,
  }) => {
    await openReadyApp(page);
    const canvas = page.locator('canvas');
    expect(await canvas.count()).toBe(1);
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Game canvas has no visible bounds');

    for (const characterId of ['casual', 'punk']) {
      await executeCommand(page, 'player.select-character', characterId);
      await expect
        .poll(async () => (await snapshot(page)).character.loadedDefinitionId)
        .toBe(characterId);
      const loaded = await snapshot(page);
      expect(loaded.character.source).toBe('asset');
      expect(loaded.character.appliedRotation).toBe('0.00, 0.00, 0.00');

      for (const [key, axis] of [
        ['w', 'forward'],
        ['s', 'backward'],
        ['a', 'left'],
        ['d', 'right'],
      ] as const) {
        await executeCommand(page, 'player.teleport', 'spawn.player-default');
        const before = await snapshot(page);
        await page.keyboard.down(key);
        await expect
          .poll(
            async () =>
              horizontalDistance(
                (await snapshot(page)).player.position,
                before.player.position,
              ),
            { message: `${characterId} ${key} should move ${axis}` },
          )
          .toBeGreaterThan(0.35);
        const moving = await snapshot(page);
        await page.keyboard.up(key);

        const expected = cameraRelativeAxis(before.camera.yaw, axis);
        const deltaX = moving.player.position.x - before.player.position.x;
        const deltaZ = moving.player.position.z - before.player.position.z;
        expect(
          deltaX * expected.x + deltaZ * expected.z,
          `${characterId} ${key} should follow the visible camera ${axis} axis`,
        ).toBeGreaterThan(0.3);
        expect(moving.player.movementState).toBe('walking');
        expect(moving.character.animationState).toBe('walk');
        expect(
          moving.player.velocity.x * Math.sin(moving.player.facingYaw) +
            moving.player.velocity.z * Math.cos(moving.player.facingYaw),
          `${characterId} presentation facing should agree with simulation velocity`,
        ).toBeGreaterThan(0);
      }

      await executeCommand(page, 'player.teleport', 'spawn.player-default');
      const beforeDown = await snapshot(page);
      await page.keyboard.down('ArrowDown');
      await page.waitForTimeout(1900);
      const afterDown = await snapshot(page);
      await page.keyboard.up('ArrowDown');
      const backward = cameraRelativeAxis(beforeDown.camera.yaw, 'backward');
      expect(
        (afterDown.player.position.x - beforeDown.player.position.x) *
          backward.x +
          (afterDown.player.position.z - beforeDown.player.position.z) *
            backward.z,
      ).toBeGreaterThan(1);
      expect(
        angleDistance(afterDown.camera.yaw, beforeDown.camera.yaw),
        'ArrowDown must move backward without owning or spinning the camera',
      ).toBeLessThan(0.02);

      await executeCommand(page, 'player.teleport', 'spawn.player-default');
      await page.keyboard.down('Shift');
      await page.keyboard.down('w');
      await expect
        .poll(async () => (await snapshot(page)).player.movementState)
        .toBe('running');
      expect((await snapshot(page)).character.animationState).toBe('run');
      await page.keyboard.up('w');
      await page.keyboard.up('Shift');

      await expect
        .poll(async () =>
          horizontalSpeed((await snapshot(page)).player.velocity),
        )
        .toBeLessThan(0.1);
      const beforeOrbit = await snapshot(page);
      await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.5);
      await page.mouse.down();
      await page.mouse.move(
        box.x + box.width * 0.75,
        box.y + box.height * 0.5,
        {
          steps: 4,
        },
      );
      await page.mouse.up();
      await expect
        .poll(async () =>
          angleDistance(
            (await snapshot(page)).camera.yaw,
            beforeOrbit.camera.yaw,
          ),
        )
        .toBeGreaterThan(0.05);
      const afterOrbit = await snapshot(page);
      expect(
        horizontalDistance(
          afterOrbit.player.position,
          beforeOrbit.player.position,
        ),
        'camera orbit must not mutate the authoritative player transform',
      ).toBeLessThan(0.02);
      expect(
        afterOrbit.runtimeErrors.count,
        afterOrbit.runtimeErrors.last,
      ).toBe(0);
    }
  });

  test('keeps feet grounded at named curb, ramp, stair, and elevation transitions', async ({
    page,
  }) => {
    await openReadyApp(page);
    const footTolerance = 0.02;
    const locations = [
      ['spawn.grounding-curb-west', 'c.curb-west'],
      ['spawn.grounding-ramp-low', 'c.deck-ramp'],
      ['spawn.grounding-ramp-high', 'c.loading-deck'],
      ['spawn.grounding-stairs-low', 'c.stair-1'],
    ] as const;

    for (const [spawnId, supportId] of locations) {
      await executeCommand(page, 'player.teleport', spawnId);
      await expect
        .poll(async () => (await snapshot(page)).player.grounded, {
          message: `${spawnId} should remain grounded`,
        })
        .toBe(true);
      const state = await snapshot(page);
      expect(state.player.groundColliderId).toBe(supportId);
      expect(
        Math.abs(state.player.footClearance ?? Number.POSITIVE_INFINITY),
        `${spawnId} rendered feet should stay within ${footTolerance}m of the simulation foot plane`,
      ).toBeLessThanOrEqual(footTolerance);
    }

    await executeCommand(page, 'player.teleport', 'spawn.grounding-ramp-low');
    await page.keyboard.down('w');
    await expect
      .poll(async () => (await snapshot(page)).player.position.y, {
        message: 'forward walking should climb the loading ramp',
      })
      .toBeGreaterThan(0.6);
    await page.keyboard.up('w');
    const uphill = await snapshot(page);
    expect(uphill.player.grounded).toBe(true);
    expect(uphill.player.groundColliderId).toBe('c.deck-ramp');
    expect(
      Math.abs(uphill.player.footClearance ?? Infinity),
    ).toBeLessThanOrEqual(footTolerance);

    await page.keyboard.down('s');
    await expect
      .poll(async () => (await snapshot(page)).player.position.y, {
        message: 'reverse walking should descend the loading ramp',
      })
      .toBeLessThan(0.2);
    await page.keyboard.up('s');
    const downhill = await snapshot(page);
    expect(downhill.player.grounded).toBe(true);
    expect(downhill.player.groundNormal.y).toBeGreaterThan(0.95);
    expect(
      Math.abs(downhill.player.footClearance ?? Infinity),
    ).toBeLessThanOrEqual(footTolerance);
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

    await executeCommand(page, 'player.select-character', 'casual');
    await expect
      .poll(async () => (await snapshot(page)).character.loadedDefinitionId)
      .toBe('casual');
    await page.reload();
    await waitForReadyState(page);
    const reloaded = await snapshot(page);
    expect(reloaded.selectedCharacterId).toBe('casual');
    expect(reloaded.character.loadedDefinitionId).toBe('casual');
    expect(reloaded.character.source).toBe('asset');
  });

  test('opens the picker in-place and supports keyboard-only confirmation', async ({
    page,
  }, testInfo) => {
    await openReadyApp(page);
    await executeCommand(page, 'ui.open-character-picker');
    await expect
      .poll(async () => (await snapshot(page)).picker.open)
      .toBe(true);
    const opened = await snapshot(page);
    expect(opened.gameState).toBe('character-select');
    expect(opened.picker.registeredCharacterIds).toEqual(['casual', 'punk']);
    expect(opened.picker.availableCharacterIds).toEqual(
      expect.arrayContaining(['casual', 'punk']),
    );
    await attachScreenshot(page, testInfo, 'two-character-picker');

    await page.keyboard.press('ArrowRight');
    await expect
      .poll(async () => (await snapshot(page)).picker.focusedCharacterId)
      .toBe('punk');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Space');
    await page.keyboard.press('Enter');
    await expect
      .poll(async () => (await snapshot(page)).picker.open)
      .toBe(false);
    const confirmed = await snapshot(page);
    expect(confirmed.gameState).toBe('playing');
    expect(confirmed.picker.confirmedCharacterId).toBe('casual');

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

  test('runs the Mack conversation deterministically through the dialogue UI', async ({
    page,
  }, testInfo) => {
    const runtimeFailures = monitorRuntimeFailures(page);
    await openReadyApp(page);
    await executeCommand(page, 'dialogue.set-typewriter', 'off');
    await executeCommand(page, 'dialogue.start-mack');

    await expect
      .poll(async () => (await snapshot(page)).dialogue.session.state)
      .toBe('ready');
    await expect
      .poll(async () => (await snapshot(page)).dialogue.ui.renderedText)
      .toBe('You’re late.');
    const first = await snapshot(page);
    expect(first.gameState).toBe('dialogue');
    expect(first.dialogue.session).toMatchObject({
      conversationId: 'conversation.mack.introduction',
      lineIndex: 0,
      speakerId: 'mack',
      fullText: 'You’re late.',
    });
    expect(first.dialogue.ui).toMatchObject({
      visible: true,
      speakerName: 'Mack',
      renderedText: 'You’re late.',
    });
    expect(first.dialogue.ui.portraitResolution).toContain('fallback');

    const stoppedAt = first.player.position;
    await page.keyboard.down('w');
    await page.waitForTimeout(250);
    const duringDialogue = await snapshot(page);
    await page.keyboard.up('w');
    expect(
      horizontalDistance(duringDialogue.player.position, stoppedAt),
      'dialogue game state should suppress normal player movement',
    ).toBeLessThan(0.02);

    await page.keyboard.press('Enter');
    await expect
      .poll(async () => (await snapshot(page)).dialogue.session.lineIndex)
      .toBe(1);
    await expect
      .poll(async () => (await snapshot(page)).dialogue.ui.renderedText)
      .toBe('Your nephew was supposed to meet me.');
    const rook = await snapshot(page);
    expect(rook.dialogue.ui).toMatchObject({
      speakerName: 'Rook',
      renderedText: 'Your nephew was supposed to meet me.',
      portraitResolution: 'fallback:player-identity-fallback',
    });

    await page.keyboard.press('Enter');
    await expect
      .poll(async () => (await snapshot(page)).dialogue.session.lineIndex)
      .toBe(2);
    await page.keyboard.press('Enter');
    await expect
      .poll(async () => (await snapshot(page)).dialogue.session.lineIndex)
      .toBe(3);
    await expect
      .poll(async () => (await snapshot(page)).dialogue.ui.renderedText)
      .toBe(
        'Walk around the block. If anyone follows you, don’t bring them back here.',
      );
    const warning = await snapshot(page);
    expect(warning.dialogue.ui.renderedText).toBe(
      'Walk around the block. If anyone follows you, don’t bring them back here.',
    );
    await attachScreenshot(page, testInfo, 'mack-dialogue');

    await page.keyboard.press('Enter');
    await expect
      .poll(async () => (await snapshot(page)).gameState)
      .toBe('playing');
    const completed = await snapshot(page);
    expect(completed.dialogue.session.state).toBe('idle');
    expect(completed.dialogue.ui.visible).toBe(false);
    expect(completed.dialogue.completedConversationIds).toContain(
      'conversation.mack.introduction',
    );
    expect(runtimeFailures, formatRuntimeFailures(runtimeFailures)).toEqual([]);
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

function cameraRelativeAxis(
  yaw: number,
  axis: 'forward' | 'backward' | 'left' | 'right',
): { readonly x: number; readonly z: number } {
  const forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
  const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  switch (axis) {
    case 'forward':
      return forward;
    case 'backward':
      return { x: -forward.x, z: -forward.z };
    case 'left':
      return { x: -right.x, z: -right.z };
    case 'right':
      return right;
  }
}

function angleDistance(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
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
