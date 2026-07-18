import { expect, test } from '@playwright/test';
import type { ConsoleMessage, Page } from '@playwright/test';
import type {
  BrowserTestApi,
  BrowserTestSnapshot,
} from '../src/debug/BrowserTestBridge';

const cases = [
  {
    id: 'mack',
    interactionId: 'interaction.npc.mack',
    conversationId: 'conversation.mack.introduction',
    profileId: 'close',
    // Keep this expectation aligned with the authoritative production spawn;
    // the previous -9/10 fixture predated MISSION-001's reviewed Mack move.
    npc: { x: -12, y: 0.22, z: 9.5 },
  },
  {
    id: 'nox',
    interactionId: 'interaction.npc.nox',
    conversationId: 'conversation.nox.check-in',
    profileId: 'default',
    npc: { x: -9, y: 0.22, z: -10 },
  },
  {
    id: 'raze',
    interactionId: 'interaction.npc.raze',
    conversationId: 'conversation.raze.check-in',
    profileId: 'wide',
    npc: { x: 9, y: 0.22, z: -10 },
  },
] as const;

test('live participant framing and exact gameplay camera restoration', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const consoleIssues: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message: ConsoleMessage) => {
    if (['warning', 'error'].includes(message.type())) {
      consoleIssues.push(message.text());
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/?e2e=1&skipPicker=1&dialogueTypewriter=0&npcFixtures=1');
  await page.waitForFunction(() => window.__VANTA_TEST__ !== undefined);
  await setNumber(page, 'camera.set-follow-distance', 7);
  await command(page, 'camera.set-shoulder', 'left');

  for (const npcCase of cases) {
    for (const [rangeIndex, range] of [
      { name: 'minimum', offset: 0.58 },
      { name: 'normal', offset: 1.3 },
    ].entries()) {
      const side = rangeIndex === 0 ? -1 : 1;
      const playerPosition = {
        x: npcCase.npc.x + side * range.offset,
        y: npcCase.npc.y,
        z: npcCase.npc.z + range.offset,
      };
      await command(
        page,
        'player.teleport-position',
        `${playerPosition.x},${playerPosition.y},${playerPosition.z},${Math.atan2(-side * range.offset, -range.offset)}`,
      );
      await expect
        .poll(async () => (await snapshot(page)).interaction.activeTargetId)
        .toBe(npcCase.interactionId);

      const yawBeforeOrbit = (await snapshot(page)).camera.yaw;
      await page.keyboard.down(rangeIndex === 0 ? 'q' : 'e');
      await expect
        .poll(async () =>
          angleDistance((await snapshot(page)).camera.yaw, yawBeforeOrbit),
        )
        .toBeGreaterThan(0.03);
      await page.keyboard.up(rangeIndex === 0 ? 'q' : 'e');
      const gameplay = (await snapshot(page)).camera;
      const simulationYaw = (await snapshot(page)).player.facingYaw;

      await page.keyboard.press('g');
      await expect
        .poll(async () => (await snapshot(page)).gameState)
        .toBe('dialogue');
      await expect
        .poll(async () => (await snapshot(page)).camera.transitionProgress)
        .toBe(1);
      const talking = await snapshot(page);
      expect(talking.conversation).toEqual({
        npcId: npcCase.id,
        conversationId: npcCase.conversationId,
      });
      expect(talking.camera).toMatchObject({
        mode: 'conversation',
        owner: `dialogue:${npcCase.conversationId}`,
        activeConversationProfileId: npcCase.profileId,
      });
      expect(talking.camera.gameplayReturnPosition).toBeDefined();
      expect(talking.camera.gameplayReturnTarget).toBeDefined();
      if (range.name === 'minimum') {
        expect(talking.camera.participantSeparation).toBeLessThan(1.15);
      } else {
        expect(talking.camera.participantSeparation).toBeGreaterThan(1.8);
      }
      expect(talking.camera.conversationChosenSide).toMatch(/left|right/);
      expect(talking.camera.conversationSafeFrameStatus).toMatch(
        /inside|obstruction-constrained/,
      );
      expect(talking.camera.obstructionColliderId).not.toBe(
        `c.npc-${npcCase.id}`,
      );
      expect(talking.player.facingYaw).toBeCloseTo(simulationYaw, 5);
      expectAngleClose(
        talking.player.presentationFacingYaw,
        Math.atan2(
          npcCase.npc.x - talking.player.position.x,
          npcCase.npc.z - talking.player.position.z,
        ),
      );
      const npcSnapshot = talking.npcs.snapshots.find(
        ({ definitionId }) => definitionId === npcCase.id,
      );
      expect(npcSnapshot).toBeDefined();
      expectAngleClose(
        npcSnapshot!.facingYaw,
        Math.atan2(
          talking.player.position.x - npcCase.npc.x,
          talking.player.position.z - npcCase.npc.z,
        ),
        0.12,
      );
      expect(
        Math.abs(npcSnapshot!.visualBounds?.groundedMinY ?? 1),
      ).toBeLessThan(0.08);
      expect(Math.abs(talking.player.footClearance ?? 1)).toBeLessThan(0.12);

      const screenshot = testInfo.outputPath(`${npcCase.id}-${range.name}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      await testInfo.attach(`${npcCase.id}-${range.name}`, {
        path: screenshot,
        contentType: 'image/png',
      });
      if (npcCase.id === 'mack' && range.name === 'minimum') {
        await page.setViewportSize({ width: 390, height: 844 });
        await expect(page.locator('#game')).toHaveJSProperty(
          'clientWidth',
          390,
        );
        await expect(page.getByTestId('dialogue-box')).toBeVisible();
        const narrowScreenshot = testInfo.outputPath('mack-minimum-narrow.png');
        await page.screenshot({ path: narrowScreenshot, fullPage: true });
        await testInfo.attach('mack-minimum-narrow', {
          path: narrowScreenshot,
          contentType: 'image/png',
        });
        await page.setViewportSize({ width: 1280, height: 720 });
        await expect(page.locator('#game')).toHaveJSProperty(
          'clientWidth',
          1280,
        );
      }

      if (rangeIndex === 0) {
        await page.keyboard.press('Escape');
      } else {
        while ((await snapshot(page)).gameState === 'dialogue') {
          await page.getByRole('button', { name: 'Continue dialogue' }).click();
        }
      }
      await expect
        .poll(async () => (await snapshot(page)).gameState)
        .toBe('playing');
      await expect
        .poll(async () => (await snapshot(page)).camera.transitionProgress)
        .toBe(1);
      const restored = await snapshot(page);
      expect(restored.gameState).toBe('playing');
      expect(restored.camera.owner).toBe('gameplay');
      expectVectorClose(
        restored.camera.position,
        talking.camera.gameplayReturnPosition!,
      );
      expectVectorClose(
        restored.camera.target,
        talking.camera.gameplayReturnTarget!,
      );
      expect(restored.camera.yaw).toBeCloseTo(gameplay.yaw, 5);
      expect(restored.camera.pitch).toBeCloseTo(gameplay.pitch, 5);
      expect(restored.camera.desiredDistance).toBeCloseTo(
        gameplay.desiredDistance,
        5,
      );
      expect(restored.camera.shoulderSide).toBe(gameplay.shoulderSide);
      expect(restored.player.presentationFacingYaw).toBeCloseTo(
        restored.player.facingYaw,
        5,
      );
    }
  }

  const beforeMovement = (await snapshot(page)).player.position;
  await page.keyboard.down('w');
  await expect
    .poll(async () => {
      const current = (await snapshot(page)).player.position;
      return Math.hypot(
        current.x - beforeMovement.x,
        current.z - beforeMovement.z,
      );
    })
    .toBeGreaterThan(0.15);
  await page.keyboard.up('w');
  const yawBeforeOrbit = (await snapshot(page)).camera.yaw;
  await page.keyboard.down('e');
  await expect
    .poll(async () => (await snapshot(page)).camera.yaw)
    .not.toBeCloseTo(yawBeforeOrbit, 2);
  await page.keyboard.up('e');

  expect((await snapshot(page)).runtimeErrors.count).toBe(0);
  expect(pageErrors).toEqual([]);
  expect(
    consoleIssues.filter(
      (text) =>
        !/^\[\.WebGL-[^\]]+\]GL Driver Message .*GPU stall due to ReadPixels/.test(
          text,
        ),
    ),
  ).toEqual([]);
});

async function snapshot(page: Page): Promise<BrowserTestSnapshot> {
  return page.evaluate(() => {
    if (!window.__VANTA_TEST__) throw new Error('Browser bridge unavailable');
    return window.__VANTA_TEST__.snapshot();
  });
}

async function command(
  page: Page,
  id: string,
  argument: string,
): Promise<void> {
  await page.evaluate(
    async ({ id, argument }) => {
      const api: BrowserTestApi | undefined = window.__VANTA_TEST__;
      if (!api) throw new Error('Browser bridge unavailable');
      await api.executeDebugCommand(id, argument);
    },
    { id, argument },
  );
}

async function setNumber(page: Page, id: string, value: number): Promise<void> {
  await page.evaluate(
    async ({ id, value }) => {
      const api: BrowserTestApi | undefined = window.__VANTA_TEST__;
      if (!api) throw new Error('Browser bridge unavailable');
      await api.setDebugNumber(id, value);
    },
    { id, value },
  );
}

function expectAngleClose(
  actual: number,
  expected: number,
  tolerance = 0.03,
): void {
  const difference = Math.atan2(
    Math.sin(actual - expected),
    Math.cos(actual - expected),
  );
  expect(Math.abs(difference)).toBeLessThan(tolerance);
}

function angleDistance(left: number, right: number): number {
  return Math.abs(Math.atan2(Math.sin(left - right), Math.cos(left - right)));
}

function expectVectorClose(
  actual: { readonly x: number; readonly y: number; readonly z: number },
  expected: { readonly x: number; readonly y: number; readonly z: number },
): void {
  expect(actual.x).toBeCloseTo(expected.x, 3);
  expect(actual.y).toBeCloseTo(expected.y, 3);
  expect(actual.z).toBeCloseTo(expected.z, 3);
}
