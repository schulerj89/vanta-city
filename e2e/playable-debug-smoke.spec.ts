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

  test('groups the developer menu, retains actions, isolates focused input, and fits narrow screens', async ({
    page,
  }) => {
    const runtimeFailures = monitorRuntimeFailures(page);
    await openReadyApp(page);
    const panel = page.getByRole('complementary', { name: 'Developer tools' });
    await expect(panel).toBeVisible();

    const expectedSections = [
      'Player / Coordinates',
      'Input / Ownership',
      'Collision / Physics',
      'Camera',
      'World / Level / Spawns',
      'Characters / Assets',
      'Interactions',
      'Dialogue / Conversation',
      'Runtime / State',
      'Commands / Actions',
    ];
    await expect(panel.locator('.debug-section__heading')).toHaveText(
      expectedSections,
    );
    await expect(
      panel
        .locator('[data-debug-value="player.position"]')
        .locator('xpath=ancestor::details'),
    ).toHaveAttribute('data-debug-section', 'Player / Coordinates');
    await expect(
      panel
        .locator('[data-debug-value="camera.owner"]')
        .locator('xpath=ancestor::details'),
    ).toHaveAttribute('data-debug-section', 'Camera');
    await expect(
      panel
        .locator('[data-debug-value="interaction.selected"]')
        .locator('xpath=ancestor::details'),
    ).toHaveAttribute('data-debug-section', 'Interactions');

    const actions = panel.locator('[data-debug-section="Commands / Actions"]');
    await actions.locator('summary').press('Enter');
    await expect(actions).toHaveAttribute('open', '');
    const retainedCommands = await actions
      .locator('[data-debug-command]')
      .evaluateAll((commands) =>
        commands.map((command) => command.getAttribute('data-debug-command')),
      );
    expect(retainedCommands).toEqual(
      expect.arrayContaining([
        'runtime.pause-resume',
        'helpers.toggle',
        'camera.set-horizontal-sensitivity',
        'camera.set-vertical-sensitivity',
        'camera.set-follow-distance',
        'camera.set-shoulder',
        'player.reset',
        'player.play-character-action',
        'sparring-target.reset',
        'ui.open-character-picker',
        'dialogue.start-mack',
        'dialogue.advance',
        'dialogue.set-typewriter',
        'player.select-character',
        'player.cycle-character',
        'player.reload-character',
        'conversation.end',
        'level.reload',
        'player.teleport',
      ]),
    );
    const retainedToggles = await actions
      .locator('[data-debug-toggle]')
      .evaluateAll((toggles) =>
        toggles.map((toggle) => toggle.getAttribute('data-debug-toggle')),
      );
    expect(retainedToggles).toEqual([
      'visual.collision',
      'visual.triggers',
      'visual.entityIds',
      'visual.spawnPoints',
      'visual.interactionRanges',
      'visual.navigation',
      'visual.characterAlignment',
      'visual.combatVolumes',
      'sparring-target.active',
      'camera.invert-y',
      'camera.automatic-recenter',
    ]);

    const positionBeforeTyping = (await snapshot(page)).player.position;
    const teleportField = actions.locator(
      '[data-debug-command="player.teleport"] input',
    );
    await teleportField.focus();
    await page.keyboard.press('w');
    await page.waitForTimeout(200);
    expect(
      horizontalDistance(
        (await snapshot(page)).player.position,
        positionBeforeTyping,
      ),
      'typing a bound gameplay key into a command field must not move the player',
    ).toBeLessThan(0.02);
    await teleportField.fill('spawn.player-default');
    await teleportField.press('Enter');
    await expect(actions).toHaveAttribute('open', '');

    await actions.locator('summary').press('Enter');
    await expect(actions).not.toHaveAttribute('open', '');
    await actions.locator('summary').press('Enter');
    await expect(actions).toHaveAttribute('open', '');

    await page.setViewportSize({ width: 390, height: 844 });
    const box = await panel.boundingBox();
    if (!box) throw new Error('Developer panel has no visible bounds');
    expect(box.width).toBeCloseTo(390, 0);
    expect(box.y + box.height).toBeCloseTo(844, 0);
    expect(box.height).toBeLessThanOrEqual(844 * 0.52 + 1);
    expect(runtimeFailures, formatRuntimeFailures(runtimeFailures)).toEqual([]);
  });

  test('moves, decelerates, pauses, resumes, and completes an interaction', async ({
    page,
  }, testInfo) => {
    await openReadyApp(page);
    const initial = await snapshot(page);

    await page.keyboard.press('v');
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

    await page.keyboard.press('r');
    await page.keyboard.down('w');
    await expect
      .poll(async () => (await snapshot(page)).character.animationState)
      .toBe('run');
    await page.keyboard.up('w');
    await page.keyboard.press('r');
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
    await page.keyboard.press('g');
    await expect
      .poll(async () => (await snapshot(page)).interaction.completedTargetIds)
      .toContain('interaction.garage-door');
    const action = (await snapshot(page)).character.characterAction;
    expect(action).toMatchObject({
      lastRequested: 'interact',
      lastSource: 'interaction:garage-door',
      lastAccepted: true,
    });
  });

  test('keeps movement, run mode, character facing, and orbit controls independent', async ({
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
          angleDistance(
            moving.player.desiredFacingYaw,
            Math.atan2(moving.player.velocity.x, moving.player.velocity.z),
          ),
          `${characterId} desired heading should follow accelerated velocity`,
        ).toBeLessThan(0.05);
        expect(moving.player.presentationFacingYaw).toBeCloseTo(
          moving.player.facingYaw,
          5,
        );
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
      await page.keyboard.press('r');
      await page.keyboard.down('w');
      await expect
        .poll(async () => (await snapshot(page)).player.movementState)
        .toBe('running');
      expect((await snapshot(page)).character.animationState).toBe('run');
      await page.keyboard.up('w');
      expect((await snapshot(page)).player.runMode).toBe(true);
      await page.keyboard.press('r');
      await expect
        .poll(async () => (await snapshot(page)).player.runMode)
        .toBe(false);

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

  test('smooths sustained running circles, reversals, and pause restoration', async ({
    page,
  }, testInfo) => {
    const runtimeFailures = monitorRuntimeFailures(page);
    await openReadyApp(page);
    const debugPanel = page.getByRole('complementary', {
      name: 'Developer tools',
    });
    for (const id of [
      'player.heading-desired',
      'player.heading-current',
      'player.heading-error',
      'player.heading-turn-rate',
      'player.heading-smoothing',
    ]) {
      await expect(
        debugPanel.locator(`[data-debug-value="${id}"]`),
      ).toHaveCount(1);
    }

    for (const characterId of ['casual', 'punk']) {
      await executeCommand(page, 'player.select-character', characterId);
      await expect
        .poll(async () => (await snapshot(page)).character.loadedDefinitionId)
        .toBe(characterId);
      await executeCommand(page, 'player.teleport', 'spawn.player-default');
      if (!(await snapshot(page)).player.runMode) {
        await page.keyboard.press('r');
      }
      await expect
        .poll(async () => (await snapshot(page)).player.runMode)
        .toBe(true);
      await page.keyboard.down('w');
      await expect
        .poll(async () => (await snapshot(page)).character.animationState)
        .toBe('run');
      const forward = await snapshot(page);

      await page.keyboard.down('q');
      await expect
        .poll(
          async () => Math.abs((await snapshot(page)).player.facingTurnRate),
          { message: `${characterId} should enter a smooth left arc` },
        )
        .toBeGreaterThan(0.1);
      await attachScreenshot(page, testInfo, `${characterId}-turn-left-early`);
      await page.waitForTimeout(900);
      const leftCircle = await snapshot(page);
      await attachScreenshot(page, testInfo, `${characterId}-turn-left-late`);
      expect(leftCircle.character.animationGraph).toMatchObject({
        requestedClip: 'run',
        resolvedClip: 'run',
        fallback: 'none',
      });
      expect(leftCircle.character.animationState).toBe('run');
      expect(leftCircle.player.grounded).toBe(true);
      expect(
        angleDistance(leftCircle.player.facingYaw, forward.player.facingYaw),
      ).toBeGreaterThan(0.2);

      await page.keyboard.up('q');
      await page.keyboard.down('e');
      await expect
        .poll(async () => (await snapshot(page)).player.facingTurnRate)
        .toBeGreaterThan(0.1);
      await page.waitForTimeout(900);
      const rightCircle = await snapshot(page);
      await attachScreenshot(page, testInfo, `${characterId}-turn-right-late`);
      expect(rightCircle.character.animationState).toBe('run');
      expect(rightCircle.player.grounded).toBe(true);
      expect(rightCircle.player.facingTurnRate).toBeGreaterThan(0);

      await page.keyboard.up('e');
      await page.keyboard.up('w');
      await page.keyboard.down('s');
      await expect
        .poll(async () => Math.abs((await snapshot(page)).player.facingError), {
          message: `${characterId} reversal should produce heading error`,
        })
        .toBeGreaterThan(1);
      const reversing = await snapshot(page);
      await attachScreenshot(page, testInfo, `${characterId}-reverse-mid-turn`);
      expect(['walk', 'run']).toContain(reversing.character.animationState);
      expect(
        angleDistance(
          reversing.player.facingYaw,
          reversing.player.desiredFacingYaw,
        ),
        '180-degree reversal should retain visible current-to-desired lag',
      ).toBeGreaterThan(0.5);
      await expect
        .poll(async () => (await snapshot(page)).character.animationState)
        .toBe('run');

      await page.keyboard.press('p');
      await expect
        .poll(async () => (await snapshot(page)).gameState)
        .toBe('paused');
      const paused = await snapshot(page);
      await page.waitForTimeout(180);
      const heldPaused = await snapshot(page);
      expect(
        horizontalDistance(heldPaused.player.position, paused.player.position),
      ).toBeLessThan(0.02);
      expect(heldPaused.player.facingYaw).toBeCloseTo(
        paused.player.facingYaw,
        6,
      );
      expect(heldPaused.player.desiredFacingYaw).toBeCloseTo(
        paused.player.desiredFacingYaw,
        6,
      );

      await page.keyboard.press('p');
      await expect
        .poll(async () => (await snapshot(page)).gameState)
        .toBe('playing');
      await expect
        .poll(async () => Math.abs((await snapshot(page)).player.facingError))
        .toBeLessThan(0.08);
      const resumed = await snapshot(page);
      expect(resumed.character.animationState).toBe('run');
      expect(resumed.player.grounded).toBe(true);
      expect(
        Math.abs(resumed.character.bounds!.min.y - resumed.player.position.y),
      ).toBeLessThanOrEqual(0.2);

      await page.keyboard.up('s');
      if ((await snapshot(page)).player.runMode) {
        await page.keyboard.press('r');
      }
      await expect
        .poll(async () => (await snapshot(page)).player.runMode)
        .toBe(false);
    }
    expect(runtimeFailures, formatRuntimeFailures(runtimeFailures)).toEqual([]);
    const final = await snapshot(page);
    expect(final.runtimeErrors.count, final.runtimeErrors.last).toBe(0);
  });

  test('supports keyboard orbit, alternating actions, and accessible help without leaking input', async ({
    page,
  }, testInfo) => {
    const runtimeFailures = monitorRuntimeFailures(page);
    await openReadyApp(page);
    const initial = await snapshot(page);

    await page.keyboard.down('q');
    await expect
      .poll(async () => (await snapshot(page)).camera.yaw)
      .toBeLessThan(initial.camera.yaw - 0.2);
    await page.keyboard.up('q');
    const afterLeft = await snapshot(page);
    expect(
      horizontalDistance(afterLeft.player.position, initial.player.position),
      'keyboard orbit must not move the simulation transform',
    ).toBeLessThan(0.02);

    await page.keyboard.down('e');
    await expect
      .poll(async () => (await snapshot(page)).camera.yaw)
      .toBeGreaterThan(afterLeft.camera.yaw + 0.2);
    await page.keyboard.up('e');

    for (const characterId of ['casual', 'punk']) {
      await executeCommand(page, 'player.select-character', characterId);
      await expect
        .poll(async () => (await snapshot(page)).character.loadedDefinitionId)
        .toBe(characterId);
      for (const [key, expectedAction] of [
        ['j', 'punchLeft'],
        ['j', 'punchRight'],
        ['l', 'kickLeft'],
        ['l', 'kickRight'],
      ] as const) {
        await page.keyboard.press(key);
        await expect
          .poll(
            async () =>
              (await snapshot(page)).character.characterAction.lastRequested,
          )
          .toBe(expectedAction);
        expect(
          (await snapshot(page)).character.characterAction.lastAccepted,
        ).toBe(true);
        await expect
          .poll(
            async () =>
              (await snapshot(page)).character.characterAction.lastCompleted,
          )
          .toBe(expectedAction);
        await expect
          .poll(async () => (await snapshot(page)).player.actionBusy)
          .toBe(false);
      }

      await page.keyboard.press('Space');
      await expect
        .poll(async () => (await snapshot(page)).player.movementState)
        .toBe('airborne');
      expect((await snapshot(page)).character.animationGraph).toMatchObject({
        phase: 'airborne',
        requestedClip: 'airborne',
        resolvedClip: 'idle',
        fallback: 'idle',
      });
      await attachScreenshot(
        page,
        testInfo,
        `${characterId}-airborne-fallback`,
      );
      await expect
        .poll(
          async () => (await snapshot(page)).character.animationGraph.phase,
          { intervals: [10], timeout: 3_000 },
        )
        .toBe('landing');
      expect((await snapshot(page)).character.animationGraph).toMatchObject({
        requestedClip: 'landing',
        resolvedClip: 'idle',
        fallback: 'idle',
      });
      await expect
        .poll(async () => (await snapshot(page)).player.grounded)
        .toBe(true);
    }

    await page.keyboard.down('w');
    await expect
      .poll(async () => (await snapshot(page)).character.animationState)
      .toBe('walk');
    await page.keyboard.press('j');
    await expect
      .poll(async () => (await snapshot(page)).character.animationState)
      .toBe('action:punchLeft');
    await expect
      .poll(async () => (await snapshot(page)).character.animationState)
      .toBe('walk');
    await page.keyboard.up('w');

    const helpButton = page.getByRole('button', { name: 'Help', exact: true });
    await expect(helpButton).toBeVisible();
    await helpButton.click();
    await expect(page.getByRole('dialog', { name: 'Controls' })).toBeVisible();
    await expect(page.getByText('Orbit camera left')).toBeVisible();
    await expect(page.getByText('Interact / talk')).toBeVisible();
    await expect
      .poll(async () => (await snapshot(page)).gameState)
      .toBe('paused');
    expect((await snapshot(page)).controls.help.focusedElement).toBe(
      'Close controls help',
    );
    const helpPlayer = (await snapshot(page)).player.position;
    const actionSequenceBeforeHelp = (await snapshot(page)).character
      .characterAction.sequence;
    await page.keyboard.press('r');
    await page.keyboard.press('j');
    expect((await snapshot(page)).player.runMode).toBe(false);
    expect(
      (await snapshot(page)).character.characterAction.sequence,
      'help ownership must gate character actions',
    ).toBe(actionSequenceBeforeHelp);
    expect(
      horizontalDistance((await snapshot(page)).player.position, helpPlayer),
    ).toBeLessThan(0.02);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Controls' })).toBeHidden();
    await expect
      .poll(async () => (await snapshot(page)).gameState)
      .toBe('playing');
    await expect(helpButton).toBeFocused();

    await page.keyboard.press('h');
    await expect(page.getByRole('dialog', { name: 'Controls' })).toBeVisible();
    await page.getByRole('button', { name: 'Close controls help' }).click();
    await expect(page.getByRole('dialog', { name: 'Controls' })).toBeHidden();

    await executeCommand(page, 'dialogue.start-mack');
    await expect
      .poll(async () => (await snapshot(page)).gameState)
      .toBe('dialogue');
    const actionSequenceBeforeDialogue = (await snapshot(page)).character
      .characterAction.sequence;
    await page.keyboard.press('l');
    expect(
      (await snapshot(page)).character.characterAction.sequence,
      'dialogue ownership must gate character actions',
    ).toBe(actionSequenceBeforeDialogue);
    await executeCommand(page, 'conversation.end');
    await expect
      .poll(async () => (await snapshot(page)).gameState)
      .toBe('playing');
    const final = await snapshot(page);
    expect(final.runtimeErrors.count, final.runtimeErrors.last).toBe(0);
    expect(runtimeFailures, formatRuntimeFailures(runtimeFailures)).toEqual([]);
  });

  test('focuses sparring, validates impact volumes, and plays the native hit reaction', async ({
    page,
  }, testInfo) => {
    test.slow();
    const runtimeFailures = monitorRuntimeFailures(page);
    await openReadyApp(page);
    await executeCommand(page, 'player.teleport', 'spawn.player-sparring');
    await setDebugToggle(page, 'sparring-target.active', true);
    await setDebugToggle(page, 'visual.combatVolumes', true);
    await expect
      .poll(async () => (await snapshot(page)).sparringTarget.enabled)
      .toBe(true);
    const ready = await snapshot(page);
    expect(ready.healthHud).toMatchObject({
      player: { current: 100, maximum: 100, normalized: 1 },
      playerHudVisible: true,
    });
    expect(ready.sparringTarget).toMatchObject({
      loaded: true,
      modelSource: 'asset',
      animation: 'idle',
      modelAssetId: 'character.casual.model',
      reactionClipName: 'CharacterArmature|HitRecieve',
      reactionDuration: 0.5416666865348816,
      eligible: false,
      rejectionReason: 'out-of-range',
      engagement: {
        engaged: true,
        cameraRequested: false,
        distanceLimit: 3,
        cameraDistance: 4.25,
      },
      responseSequence: 0,
    });
    expect(ready.sparringTarget.horizontalContact).toBe(false);
    expect(ready.sparringTarget.verticalContact).toBe(true);
    expect(ready.camera.gameplayFocusOwner).toBeUndefined();
    await attachScreenshot(page, testInfo, 'sparring-focused-far-miss');
    expect(
      Math.abs(ready.sparringTarget.groundedMinY ?? Infinity),
      'sparring target feet should align to the street contact plane',
    ).toBeLessThanOrEqual(0.005);
    const preferredCameraDistance = ready.camera.desiredDistance;

    // The authored sparring spawn is engaged for camera framing but outside
    // the explicit punch sweep. Impact-time validation must reject it.
    await page.keyboard.press('j');
    await expect
      .poll(async () => (await snapshot(page)).character.characterAction.active)
      .toBe('punchLeft');
    const farAction = await snapshot(page);
    const acceptedSequence = farAction.character.characterAction.sequence;
    const rejectionCount =
      farAction.character.characterAction.busyRejectionCount;
    await page.keyboard.press('j');
    await page.keyboard.press('l');
    await expect
      .poll(
        async () =>
          (await snapshot(page)).character.characterAction.busyRejectionCount,
        { intervals: [20] },
      )
      .toBeGreaterThanOrEqual(rejectionCount + 2);
    const spammed = await snapshot(page);
    expect(spammed.character.characterAction).toMatchObject({
      active: 'punchLeft',
      busy: true,
      sequence: acceptedSequence,
      lastAccepted: false,
      lastRejection: 'busy',
    });
    expect(
      spammed.character.characterAction.busyRejectionCount,
    ).toBeGreaterThanOrEqual(rejectionCount + 2);
    expect(spammed.camera.gameplayFocusOwner).toBe('debug-sparring-target');
    await expect
      .poll(async () => (await snapshot(page)).camera.actualDistance)
      .toBeLessThan(4.4);
    await attachScreenshot(page, testInfo, 'sparring-attack-focus-far-miss');
    await expect
      .poll(
        async () =>
          (await snapshot(page)).character.characterAction.impactSequence,
        { intervals: [20] },
      )
      .toBe(ready.character.characterAction.impactSequence + 1);
    const farImpact = await snapshot(page);
    expect(farImpact.character.characterAction).toMatchObject({
      lastImpact: 'punchLeft',
      impactNormalizedTime: 0.55,
      completedSequenceAtImpact:
        ready.character.characterAction.completedSequence,
    });
    expect(farImpact.sparringTarget).toMatchObject({
      responseSequence: 0,
      busy: false,
      feedback: 'ignored-out-of-range',
      lastIgnoredReason: 'out-of-range',
      visualizationVisible: true,
      lastImpactNormalizedTime: 0.55,
      health: { current: 100, changeSequence: 0 },
      latestDecision: { accepted: false, reason: 'out-of-range' },
    });

    await expect
      .poll(
        async () =>
          (await snapshot(page)).character.characterAction.completedSequence,
      )
      .toBe(farAction.character.characterAction.completedSequence + 1);
    expect((await snapshot(page)).character.characterAction).toMatchObject({
      busy: false,
      lastCompleted: 'punchLeft',
      completionRelease: 'mixer-finished',
    });
    await expect
      .poll(async () => (await snapshot(page)).camera.gameplayFocusOwner)
      .toBeUndefined();

    await executeCommand(page, 'player.teleport-position', '3.5,0.15,12.7,0');
    const behindImpact = (await snapshot(page)).sparringTarget.impactSequence;
    await page.keyboard.press('l');
    await expect
      .poll(async () => (await snapshot(page)).sparringTarget.impactSequence)
      .toBe(behindImpact + 1);
    expect((await snapshot(page)).sparringTarget).toMatchObject({
      responseSequence: 0,
      lastIgnoredReason: 'not-facing',
      health: { current: 100 },
      latestDecision: { accepted: false, reason: 'not-facing' },
    });
    await expect
      .poll(async () => (await snapshot(page)).character.characterAction.busy)
      .toBe(false);

    await executeCommand(
      page,
      'player.teleport-position',
      '3.5,0.15,12.7,3.141592653589793',
    );
    await executeCommand(
      page,
      'sparring-target.teleport-position',
      '3.5,4,11.8,0',
    );
    const verticalImpact = (await snapshot(page)).sparringTarget.impactSequence;
    await page.keyboard.press('l');
    await expect
      .poll(async () => (await snapshot(page)).sparringTarget.impactSequence)
      .toBe(verticalImpact + 1);
    expect((await snapshot(page)).sparringTarget).toMatchObject({
      responseSequence: 0,
      lastIgnoredReason: 'vertical-miss',
      health: { current: 100 },
      latestDecision: { accepted: false, reason: 'vertical-miss' },
    });
    await expect
      .poll(async () => (await snapshot(page)).character.characterAction.busy)
      .toBe(false);
    await executeCommand(
      page,
      'sparring-target.teleport-position',
      '3.5,0,11.8,0',
    );

    // Move the authoritative player origin into the real sweep, preserving
    // the target transform and camera ownership.
    await executeCommand(
      page,
      'player.teleport-position',
      '3.5,0.15,12.7,3.141592653589793',
    );
    await expect
      .poll(async () => (await snapshot(page)).sparringTarget.eligible)
      .toBe(true);
    const contactReady = await snapshot(page);
    const authoritativePosition = contactReady.player.position;
    const responseBefore = contactReady.sparringTarget.responseSequence;
    await page.keyboard.press('j');
    await expect
      .poll(async () => (await snapshot(page)).sparringTarget.responseSequence)
      .toBe(responseBefore + 1);
    const impacted = await snapshot(page);
    expect(impacted.sparringTarget).toMatchObject({
      busy: true,
      animation: 'reaction:getHit',
      animationGraph: { phase: 'reaction', resolvedClip: 'getHit' },
      feedback: 'accepted',
      lastAction: 'punchRight',
      reactionClipName: 'CharacterArmature|HitRecieve',
      verticalContact: true,
      health: { current: 92, changeSequence: 1 },
      latestDecision: { accepted: true, horizontalGap: expect.any(Number) },
    });
    expect(impacted.healthHud).toMatchObject({
      targetHudVisible: true,
      playerHudVisible: true,
    });
    await attachScreenshot(
      page,
      testInfo,
      'sparring-native-hitreceive-contact',
    );

    await expect
      .poll(async () => (await snapshot(page)).character.characterAction.busy)
      .toBe(false);
    const reacting = await snapshot(page);
    expect(
      horizontalDistance(reacting.player.position, authoritativePosition),
      'actions and target reactions must not move the simulation transform',
    ).toBeLessThan(0.02);
    await expect
      .poll(async () => (await snapshot(page)).sparringTarget.animation)
      .toBe('idle');
    await expect
      .poll(async () => (await snapshot(page)).character.animationState)
      .toBe('idle');

    // Repeat the valid flow with the other playable rig.
    await executeCommand(page, 'player.select-character', 'punk');
    await expect
      .poll(async () => (await snapshot(page)).character.loadedDefinitionId)
      .toBe('punk');
    await page.keyboard.press('l');
    await expect
      .poll(async () => (await snapshot(page)).sparringTarget.responseSequence)
      .toBe(2);
    expect((await snapshot(page)).sparringTarget.health).toMatchObject({
      current: 80,
      changeSequence: 2,
    });
    await executeCommand(page, 'player.health-damage');
    expect((await snapshot(page)).healthHud.player.current).toBe(90);
    await executeCommand(page, 'player.health-heal');
    expect((await snapshot(page)).healthHud.player.current).toBe(100);
    await expect
      .poll(async () => (await snapshot(page)).sparringTarget.animation)
      .toBe('idle');

    const gated = await snapshot(page);
    const gatedActionSequence = gated.character.characterAction.sequence;
    await page.keyboard.press('p');
    await expect
      .poll(async () => (await snapshot(page)).gameState)
      .toBe('paused');
    await expect
      .poll(
        async () =>
          (await snapshot(page)).sparringTarget.engagement.cameraRequested,
      )
      .toBe(false);
    await page.keyboard.press('j');
    await waitForAnimationFrames(page, 2);
    expect((await snapshot(page)).character.characterAction.sequence).toBe(
      gatedActionSequence,
    );
    await page.keyboard.press('p');
    await expect
      .poll(async () => (await snapshot(page)).gameState)
      .toBe('playing');
    await expect
      .poll(async () => (await snapshot(page)).character.characterAction.busy)
      .toBe(false);
    const postPauseActionSequence = (await snapshot(page)).character
      .characterAction.sequence;
    const postPauseResponseSequence = (await snapshot(page)).sparringTarget
      .responseSequence;
    expect(postPauseActionSequence).toBe(gatedActionSequence);
    expect(postPauseResponseSequence).toBe(2);
    expect(
      (await snapshot(page)).sparringTarget.engagement.cameraRequested,
    ).toBe(false);

    const helpButton = page.getByRole('button', { name: 'Help', exact: true });
    await helpButton.click();
    await expect(page.getByRole('dialog', { name: 'Controls' })).toBeVisible();
    await expect
      .poll(async () => (await snapshot(page)).controls.ownership.owner)
      .toBe('help');
    await expect
      .poll(async () => (await snapshot(page)).gameState)
      .toBe('paused');
    await expect
      .poll(
        async () =>
          (await snapshot(page)).sparringTarget.engagement.cameraRequested,
      )
      .toBe(false);
    await page.keyboard.press('l');
    await waitForAnimationFrames(page, 2);
    expect((await snapshot(page)).character.characterAction.sequence).toBe(
      postPauseActionSequence,
    );
    await page.keyboard.press('Escape');

    await executeCommand(page, 'dialogue.start-mack');
    await expect
      .poll(async () => (await snapshot(page)).gameState)
      .toBe('dialogue');
    await expect
      .poll(
        async () =>
          (await snapshot(page)).sparringTarget.engagement.cameraRequested,
      )
      .toBe(false);
    await page.keyboard.press('j');
    await waitForAnimationFrames(page, 2);
    expect((await snapshot(page)).character.characterAction.sequence).toBe(
      postPauseActionSequence,
    );
    expect((await snapshot(page)).sparringTarget.responseSequence).toBe(
      postPauseResponseSequence,
    );
    await executeCommand(page, 'conversation.end');
    expect(
      (await snapshot(page)).sparringTarget.engagement.cameraRequested,
    ).toBe(false);

    await executeCommand(page, 'player.teleport', 'spawn.player-sparring');
    await setDebugToggle(page, 'sparring-target.active', false);
    await expect
      .poll(async () => (await snapshot(page)).camera.gameplayFocusOwner)
      .toBeUndefined();
    await expect
      .poll(async () => (await snapshot(page)).camera.actualDistance)
      .toBeGreaterThan(4.4);
    expect((await snapshot(page)).camera.desiredDistance).toBe(
      preferredCameraDistance,
    );
    await attachScreenshot(
      page,
      testInfo,
      'sparring-disengaged-camera-restore',
    );
    await page.keyboard.press('j');
    await expect
      .poll(async () => (await snapshot(page)).sparringTarget.feedback)
      .toBe('ignored-disabled');
    expect((await snapshot(page)).sparringTarget).toMatchObject({
      enabled: false,
      responseSequence: 2,
      lastIgnoredReason: 'disabled',
      visualizationVisible: false,
    });
    await expect
      .poll(
        async () =>
          (await snapshot(page)).character.characterAction.lastCompleted,
      )
      .toBe('punchLeft');
    const disabled = await snapshot(page);
    expect(disabled.sparringTarget).toMatchObject({
      enabled: false,
      responseSequence: 2,
      lastIgnoredReason: 'disabled',
      visualizationVisible: false,
    });

    await setDebugToggle(page, 'sparring-target.active', true);
    await executeCommand(page, 'sparring-target.reset');
    expect((await snapshot(page)).sparringTarget).toMatchObject({
      enabled: true,
      responseSequence: 0,
      ignoredSequence: 0,
      animation: 'idle',
      health: { current: 100 },
    });
    await setDebugToggle(page, 'sparring-target.active', false);
    const final = await snapshot(page);
    expect(final.runtimeErrors.count, final.runtimeErrors.last).toBe(0);
    expect(runtimeFailures, formatRuntimeFailures(runtimeFailures)).toEqual([]);
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
    expect(opened.picker.preview.requestedCharacterId).toBe('casual');
    expect(opened.picker.preview.availableAnimations).toEqual([
      'previewIdle',
      'wave',
      'interact',
    ]);
    await expect(page.locator('.character-picker__preview')).toHaveCount(1);
    await expect(page.locator('.character-card')).toHaveCount(0);
    await attachScreenshot(page, testInfo, 'two-character-picker');

    await page.keyboard.press('ArrowRight');
    await expect
      .poll(async () => (await snapshot(page)).picker.focusedCharacterId)
      .toBe('punk');
    await expect
      .poll(async () => (await snapshot(page)).picker.preview.loadedCharacterId)
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
      initial.npcs.snapshots.map(
        ({ definitionId, characterId, modelSource, currentAnimation }) => ({
          definitionId,
          characterId,
          modelSource,
          currentAnimation,
        }),
      ),
    ).toEqual([
      {
        definitionId: 'mack',
        characterId: 'npc-worker',
        modelSource: 'asset',
        currentAnimation: 'idle',
      },
      {
        definitionId: 'nox',
        characterId: 'npc-hoodie',
        modelSource: 'asset',
        currentAnimation: 'idle',
      },
      {
        definitionId: 'raze',
        characterId: 'npc-punk',
        modelSource: 'asset',
        currentAnimation: 'idle',
      },
    ]);
    for (const npc of initial.npcs.snapshots) {
      expect(npc.modelFallback).toBe(false);
      expect(npc.visualBounds).toBeDefined();
      expect(npc.visualBounds!.height).toBeGreaterThanOrEqual(1.7);
      expect(npc.visualBounds!.height).toBeLessThanOrEqual(1.85);
      expect(Math.abs(npc.visualBounds!.groundedMinY)).toBeLessThanOrEqual(
        0.005,
      );
    }

    await executeCommand(page, 'player.teleport', 'spawn.npc-mechanic');
    await expect
      .poll(async () => (await snapshot(page)).interaction.activeTargetId)
      .toBe('interaction.npc.mack');
    await page.keyboard.press('g');
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
      lastGestureSource: 'conversation:conversation.mack.introduction',
      lastGestureAccepted: true,
      gestureSequence: 1,
    });
    expect(talking.interaction.activeTargetId).toBeUndefined();

    await executeCommand(page, 'conversation.end');
    await expect
      .poll(async () => (await snapshot(page)).gameState)
      .toBe('playing');
    expect((await snapshot(page)).conversation.npcId).toBeUndefined();

    for (const [spawnId, npcId, conversationId] of [
      ['spawn.npc-alley', 'nox', 'conversation.nox.check-in'],
      ['spawn.npc-deck', 'raze', 'conversation.raze.check-in'],
    ] as const) {
      await executeCommand(page, 'player.teleport', spawnId);
      await expect
        .poll(async () => (await snapshot(page)).interaction.activeTargetId)
        .toBe(`interaction.npc.${npcId}`);
      await page.keyboard.press('g');
      await expect
        .poll(async () => (await snapshot(page)).gameState)
        .toBe('dialogue');
      const conversation = await snapshot(page);
      expect(conversation.camera.mode).toBe('conversation');
      expect(conversation.conversation).toEqual({ npcId, conversationId });
      expect(
        conversation.npcs.snapshots.find(
          ({ definitionId }) => definitionId === npcId,
        ),
      ).toMatchObject({
        currentAnimation: 'idle',
        gestureActive: false,
        lastGestureSource: undefined,
        lastGestureAccepted: false,
      });
      await executeCommand(page, 'conversation.end');
      await expect
        .poll(async () => (await snapshot(page)).gameState)
        .toBe('playing');
    }
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

async function setDebugToggle(
  page: Page,
  id: string,
  enabled: boolean,
): Promise<void> {
  await page.evaluate(
    ({ toggleId, toggleEnabled }) => {
      const api: BrowserTestApi | undefined = window.__VANTA_TEST__;
      if (!api) throw new Error('Vanta browser test bridge is unavailable');
      api.setDebugToggle(toggleId, toggleEnabled);
    },
    { toggleId: id, toggleEnabled: enabled },
  );
}

function monitorRuntimeFailures(page: Page): string[] {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(message.text());
  });
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

async function waitForAnimationFrames(
  page: Page,
  count: number,
): Promise<void> {
  await page.evaluate(
    (remaining) =>
      new Promise<void>((resolve) => {
        const next = (): void => {
          remaining -= 1;
          if (remaining === 0) resolve();
          else requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      }),
    count,
  );
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
