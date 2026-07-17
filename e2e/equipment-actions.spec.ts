import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import type {
  BrowserTestApi,
  BrowserTestSnapshot,
} from '../src/debug/BrowserTestBridge';

const appUrl = '/?e2e=1&debug=1&skipPicker=1';

test.describe('reusable equipment and character actions', () => {
  test('equips, uses, rolls, dies, and revives both playable characters', async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    const failures = monitorRuntimeFailures(page);
    await openReadyApp(page);
    await attach(page, testInfo, 'quickbar-empty');

    for (const characterId of ['casual', 'punk']) {
      await executeCommand(page, 'player.select-character', characterId);
      await expect
        .poll(async () => (await snapshot(page)).character.loadedDefinitionId)
        .toBe(characterId);

      await page.keyboard.press('Digit1');
      await expect
        .poll(async () => (await snapshot(page)).character.animationState)
        .toBe('gunIdle');
      let state = await snapshot(page);
      expect(state.quickbar).toMatchObject({
        slotCount: 2,
        equippedId: 'handgun',
        selectedSlot: 1,
      });
      expect(state.character.equipmentPresentation).toMatchObject({
        itemId: 'handgun',
        rigId: 'ultimate-men',
        socketName: 'WristR',
        attached: true,
        compatible: true,
      });
      await attach(page, testInfo, `${characterId}-handgun-equipped`);

      await page.keyboard.press('KeyU');
      await expect
        .poll(async () => (await snapshot(page)).character.animationState)
        .toBe('action:gunFire');
      state = await snapshot(page);
      expect(state.character.equipment.useSequence).toBeGreaterThan(0);
      expect(state.character.characterAction).toMatchObject({
        active: 'gunFire',
        lastAccepted: true,
      });
      await attach(page, testInfo, `${characterId}-gun-action`);
      await expect
        .poll(async () => (await snapshot(page)).player.actionBusy)
        .toBe(false);

      const beforeHold = (await snapshot(page)).player.fire.acceptedShotCount;
      await page.keyboard.down('KeyU');
      await expect
        .poll(async () => (await snapshot(page)).player.fire.holding)
        .toBe(true);
      await expect
        .poll(
          async () => (await snapshot(page)).player.fire.acceptedShotCount,
          { timeout: 3_000 },
        )
        .toBeGreaterThanOrEqual(beforeHold + 2);
      await attach(page, testInfo, `${characterId}-held-fire-ammo`);
      await page.keyboard.up('KeyU');
      await expect
        .poll(async () => (await snapshot(page)).player.fire.holding)
        .toBe(false);
      await expect
        .poll(async () => (await snapshot(page)).player.actionBusy)
        .toBe(false);
      const shotsAfterRelease = (await snapshot(page)).player.fire
        .acceptedShotCount;
      await page.waitForTimeout(900);
      expect((await snapshot(page)).player.fire.acceptedShotCount).toBe(
        shotsAfterRelease,
      );
      await page.keyboard.press('KeyT');
      await expect
        .poll(
          async () =>
            (await snapshot(page)).player.equipment.ammunition.handgun?.current,
        )
        .toBe(8);
      await attach(page, testInfo, `${characterId}-reloaded`);

      await page.keyboard.press('KeyR');
      await page.keyboard.down('KeyW');
      await expect
        .poll(async () => (await snapshot(page)).character.animationState)
        .toBe('gunRun');
      state = await snapshot(page);
      expect(state.player.grounded).toBe(true);
      expect(
        Math.abs(state.character.bounds!.min.y - state.player.position.y),
      ).toBeLessThanOrEqual(0.2);
      await page.keyboard.up('KeyW');
      await page.keyboard.press('KeyR');

      await page.keyboard.press('Digit1');
      await expect
        .poll(async () => (await snapshot(page)).quickbar.selectedSlot)
        .toBeUndefined();
      await page.keyboard.press('Digit2');
      await expect
        .poll(async () => (await snapshot(page)).character.animationState)
        .toBe('knifeIdle');
      state = await snapshot(page);
      expect(state.character.equipmentPresentation).toMatchObject({
        itemId: 'knife',
        socketName: 'WristR',
        attached: true,
      });
      await attach(page, testInfo, `${characterId}-knife-equipped`);
      await page.keyboard.press('KeyU');
      await expect
        .poll(async () => (await snapshot(page)).character.animationState)
        .toBe('action:knifeSlash');
      await attach(page, testInfo, `${characterId}-knife-action`);
      await expect
        .poll(async () => (await snapshot(page)).player.actionBusy)
        .toBe(false);

      const beforeRoll = (await snapshot(page)).player.position;
      await page.keyboard.down('KeyW');
      await page.keyboard.press('KeyB');
      await expect
        .poll(async () => (await snapshot(page)).character.animationState)
        .toBe('action:roll');
      await attach(page, testInfo, `${characterId}-roll`);
      await page.waitForTimeout(250);
      await attach(page, testInfo, `${characterId}-roll-mid`);
      await page.keyboard.up('KeyW');
      await expect
        .poll(async () => (await snapshot(page)).player.actionBusy)
        .toBe(false);
      state = await snapshot(page);
      expect(state.player.roll.source).toBe('movement-intent');
      expect(state.player.roll.blocked).toBe(true);
      expect(state.player.roll.blockedBy).toBeTruthy();
      expect(state.player.roll.actualDistance).toBeGreaterThanOrEqual(0);
      expect(state.player.roll.actualDistance).toBeLessThan(3);
      // W may contribute one browser frame before B is admitted; the roll's
      // own requested/actual counters exclude that pre-admission locomotion.
      expect(
        Math.abs(
          horizontalDistance(state.player.position, beforeRoll) -
            state.player.roll.actualDistance,
        ),
      ).toBeLessThan(0.12);
      expect(state.player.grounded).toBe(true);
      await attach(page, testInfo, `${characterId}-roll-wall-stop`);
      await expect
        .poll(async () => (await snapshot(page)).character.animationState)
        .toBe('knifeIdle');

      await executeCommand(page, 'player.health-deplete');
      await expect
        .poll(async () => (await snapshot(page)).character.animationState)
        .toBe('death:death');
      state = await snapshot(page);
      expect(state.player.depleted).toBe(true);
      expect(state.character.death).toMatchObject({
        nativeClip: true,
        fadeFallback: false,
      });
      const depletedAt = state.player.position;
      await page.keyboard.down('KeyW');
      await page.keyboard.press('KeyB');
      await page.keyboard.press('KeyU');
      await page.waitForTimeout(180);
      await page.keyboard.up('KeyW');
      state = await snapshot(page);
      expect(
        horizontalDistance(state.player.position, depletedAt),
      ).toBeLessThan(0.02);
      expect(state.character.animationState).toBe('death:death');
      await attach(page, testInfo, `${characterId}-native-death`);
      await executeCommand(page, 'player.health-reset');
      await expect
        .poll(async () => (await snapshot(page)).player.depleted)
        .toBe(false);
      await expect
        .poll(async () => (await snapshot(page)).character.animationState)
        .toBe('knifeIdle');

      await page.keyboard.press('Digit2');
    }

    await page.setViewportSize({ width: 390, height: 700 });
    await page.keyboard.press('Digit1');
    await expect(page.locator('.quickbar')).toBeVisible();
    const slotBoxes = await page
      .locator('.quickbar__slot')
      .evaluateAll((slots) =>
        slots.map((slot) => {
          const { width, height } = slot.getBoundingClientRect();
          return { width, height };
        }),
      );
    expect(slotBoxes).toHaveLength(2);
    expect(slotBoxes.every((box) => Math.abs(box.width - box.height) < 1)).toBe(
      true,
    );
    const hudLayout = await page.evaluate(() => {
      const quickbar = document
        .querySelector('.quickbar')!
        .getBoundingClientRect();
      const health = document
        .querySelector('.health-hud__player')!
        .getBoundingClientRect();
      return {
        quickbarTop: quickbar.top,
        healthBottom: health.bottom,
      };
    });
    expect(hudLayout.healthBottom).toBeLessThan(hudLayout.quickbarTop);
    await attach(page, testInfo, 'quickbar-narrow-selected');

    const beforeHelp = (await snapshot(page)).quickbar.equippedId;
    await page.keyboard.press('KeyH');
    await expect
      .poll(async () => (await snapshot(page)).controls.help.open)
      .toBe(true);
    await page.keyboard.press('Digit2');
    expect((await snapshot(page)).quickbar.equippedId).toBe(beforeHelp);
    await page.keyboard.press('Escape');
    expect(failures).toEqual([]);
    expect((await snapshot(page)).runtimeErrors.count).toBe(0);
  });

  test('bounds dry fire at empty and restores handgun capacity through reload', async ({
    page,
  }, testInfo) => {
    test.setTimeout(45_000);
    const failures = monitorRuntimeFailures(page);
    await openReadyApp(page);
    await page.keyboard.press('Digit1');
    await page.keyboard.down('KeyU');
    await expect
      .poll(
        async () =>
          (await snapshot(page)).player.equipment.ammunition.handgun?.current,
        { timeout: 16_000 },
      )
      .toBe(0);
    await page.keyboard.up('KeyU');
    await expect
      .poll(async () => (await snapshot(page)).player.actionBusy)
      .toBe(false);
    let state = await snapshot(page);
    const useSequence = state.player.equipment.useSequence;
    const dryFireSequence = state.player.equipment.dryFireSequence;
    const actionSequence = state.character.characterAction.sequence;
    await attach(page, testInfo, 'handgun-empty');

    await page.keyboard.press('KeyU');
    await expect
      .poll(async () => (await snapshot(page)).player.equipment.dryFireSequence)
      .toBe(dryFireSequence + 1);
    state = await snapshot(page);
    expect(state.player.equipment.useSequence).toBe(useSequence);
    expect(state.character.characterAction.sequence).toBe(actionSequence);
    expect(state.player.equipment.ammunition.handgun?.current).toBe(0);
    expect(state.player.fire.latestRejection).toBe('empty');

    await page.keyboard.press('KeyT');
    await expect
      .poll(
        async () =>
          (await snapshot(page)).player.equipment.ammunition.handgun?.current,
      )
      .toBe(8);
    expect((await snapshot(page)).player.fire.reloadCount).toBe(1);
    await attach(page, testInfo, 'handgun-reloaded-after-empty');
    expect(failures).toEqual([]);
    expect((await snapshot(page)).runtimeErrors.count).toBe(0);
  });

  test('rolls both playable rigs in four locked camera-relative directions', async ({
    page,
  }) => {
    const failures = monitorRuntimeFailures(page);
    await openReadyApp(page);
    const directions = [
      ['KeyW', { x: 0, z: -1 }],
      ['KeyS', { x: 0, z: 1 }],
      ['KeyA', { x: -1, z: 0 }],
      ['KeyD', { x: 1, z: 0 }],
    ] as const;

    for (const characterId of ['casual', 'punk']) {
      await executeCommand(page, 'player.select-character', characterId);
      await expect
        .poll(async () => (await snapshot(page)).character.loadedDefinitionId)
        .toBe(characterId);
      for (const [key, expectedDirection] of directions) {
        await executeCommand(page, 'player.teleport-position', '0,0.2,7,0');
        const start = (await snapshot(page)).player.position;
        await page.keyboard.down(key);
        await page.keyboard.press('KeyB');
        await expect
          .poll(async () => (await snapshot(page)).player.roll.active)
          .toBe(true);
        await page.keyboard.up(key);
        await expect
          .poll(async () => (await snapshot(page)).player.actionBusy)
          .toBe(false);
        const state = await snapshot(page);
        expect(state.player.roll).toMatchObject({
          source: 'movement-intent',
          blocked: false,
        });
        expect(state.player.roll.direction?.x).toBeCloseTo(
          expectedDirection.x,
          2,
        );
        expect(state.player.roll.direction?.z).toBeCloseTo(
          expectedDirection.z,
          2,
        );
        expect(state.player.roll.actualDistance).toBeGreaterThan(2.8);
        expect(
          horizontalDistance(state.player.position, start),
        ).toBeGreaterThan(2.8);
        expect(state.player.grounded).toBe(true);
      }
    }
    expect(failures).toEqual([]);
    expect((await snapshot(page)).runtimeErrors.count).toBe(0);
  });

  test('uses fallback death materials and equips a deterministic NPC owner', async ({
    page,
  }, testInfo) => {
    const failures = monitorRuntimeFailures(page);
    await openReadyApp(page);

    await executeCommand(page, 'npc.equip-item', 'mack,knife');
    await expect
      .poll(
        async () =>
          (await snapshot(page)).npcs.snapshots.find(
            ({ definitionId }) => definitionId === 'mack',
          )?.equipmentPresentation.attached,
      )
      .toBe(true);
    const beforeNpc = (await snapshot(page)).npcs.snapshots.find(
      ({ definitionId }) => definitionId === 'mack',
    )!;
    expect(beforeNpc.equipmentPresentation).toMatchObject({
      itemId: 'knife',
      rigId: 'animated-men',
      socketName: 'PalmR',
      compatible: true,
    });
    await executeCommand(page, 'npc.use-equipment', 'mack');
    await expect
      .poll(
        async () =>
          (await snapshot(page)).npcs.snapshots.find(
            ({ definitionId }) => definitionId === 'mack',
          )?.currentAnimation,
      )
      .toBe('knifeSlash');
    const afterNpc = (await snapshot(page)).npcs.snapshots.find(
      ({ definitionId }) => definitionId === 'mack',
    )!;
    expect(afterNpc.equipment.useSequence).toBe(1);
    expect(afterNpc.facingYaw).toBe(beforeNpc.facingYaw);
    await attach(page, testInfo, 'mack-knife-action');

    await executeCommand(page, 'player.select-character', 'test-invalid-asset');
    await expect
      .poll(async () => (await snapshot(page)).character.source)
      .toBe('placeholder');
    await executeCommand(page, 'player.health-deplete');
    await expect
      .poll(async () => (await snapshot(page)).character.death.opacity)
      .toBeLessThan(0.9);
    let state = await snapshot(page);
    expect(state.character.death).toMatchObject({
      depleted: true,
      nativeClip: false,
      fadeFallback: true,
    });
    expect(state.character.death.clonedMaterialCount).toBeGreaterThan(0);
    await attach(page, testInfo, 'fallback-death-fade');
    const cloneCount = state.character.death.clonedMaterialCount;
    await executeCommand(page, 'player.health-reset');
    state = await snapshot(page);
    expect(state.character.death).toMatchObject({
      depleted: false,
      clonedMaterialCount: 0,
    });
    expect(state.character.death.disposedMaterialCount).toBeGreaterThanOrEqual(
      cloneCount,
    );

    expect(failures).toEqual([]);
    expect(state.runtimeErrors.count).toBe(0);
  });
});

async function openReadyApp(page: Page): Promise<void> {
  await page.goto(appUrl);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__VANTA_TEST__?.snapshot().gameState ??
          'test bridge not installed',
      ),
    )
    .toBe('playing');
  await expect
    .poll(async () => (await snapshot(page)).player.grounded)
    .toBe(true);
  await expect
    .poll(async () => (await snapshot(page)).character.source)
    .not.toBe('loading');
}

async function snapshot(page: Page): Promise<BrowserTestSnapshot> {
  return page.evaluate(() => window.__VANTA_TEST__!.snapshot());
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

async function attach(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  await testInfo.attach(`${name}.png`, {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
}

function monitorRuntimeFailures(page: Page): string[] {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(message.text());
  });
  return failures;
}

function horizontalDistance(
  a: { readonly x: number; readonly z: number },
  b: { readonly x: number; readonly z: number },
): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
