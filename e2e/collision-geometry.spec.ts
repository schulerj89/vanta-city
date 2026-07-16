import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import type {
  BrowserTestApi,
  BrowserTestSnapshot,
} from '../src/debug/BrowserTestBridge';

const appUrl = '/?e2e=1&debug=1&skipPicker=1';
const localXAxis = { x: Math.SQRT1_2, z: -Math.SQRT1_2 };
const passageAxis = { x: Math.SQRT1_2, z: Math.SQRT1_2 };

test.describe('authoritative collision geometry', () => {
  test('repeats doorway and tight-alley traversal without foot drift or penetration', async ({
    page,
  }, testInfo) => {
    await openReadyApp(page);
    await command(page, 'helpers.toggle', 'collision');

    for (let run = 0; run < 3; run += 1) {
      await command(page, 'player.teleport', 'spawn.geometry-service-entry');
      const start = await snapshot(page);
      expect(start.player.grounded).toBe(true);
      expect(
        Math.abs(start.player.footClearance ?? Infinity),
      ).toBeLessThanOrEqual(0.2);

      await page.keyboard.down('s');
      await page.keyboard.down('d');
      await expect
        .poll(
          async () => {
            const current = await snapshot(page);
            return projection(
              current.player.position,
              start.player.position,
              passageAxis,
            );
          },
          {
            message: `doorway traversal ${run + 1} should clear the 4m passage`,
          },
        )
        .toBeGreaterThan(4);
      await page.keyboard.up('d');
      await page.keyboard.up('s');

      const traversed = await snapshot(page);
      expect(traversed.player.grounded).toBe(true);
      expect(
        Math.abs(traversed.player.footClearance ?? Infinity),
        `run ${run + 1} feet should remain aligned with the authoritative floor`,
      ).toBeLessThanOrEqual(0.2);
      expect(traversed.player.position.y).toBeCloseTo(0, 2);
      expect(
        Math.abs(localCoordinate(traversed.player.position)),
        `run ${run + 1} should stay inside the 1.7m clear alley width`,
      ).toBeLessThanOrEqual(0.48);

      if (run === 0) {
        await attachScreenshot(page, testInfo, 'rotated-doorway-traversal');
      }
    }

    await command(page, 'player.teleport-position', '12,0,12,0.785398');
    await page.keyboard.down('a');
    await page.keyboard.down('s');
    await expect
      .poll(
        async () =>
          (await snapshot(page)).world.collision.lastCharacterBlockIds,
      )
      .toContain('c.service-wall-north');
    const contact = await snapshot(page);
    await page.keyboard.up('s');
    await page.keyboard.up('a');
    expect(
      localCoordinate(contact.player.position),
      'capsule center must retain radius clearance from the rotated wall',
    ).toBeGreaterThanOrEqual(-0.48);
    expect(contact.player.grounded).toBe(true);
    expect(contact.runtimeErrors.count, contact.runtimeErrors.last).toBe(0);
  });

  test('repeats camera clipping and delayed recovery against the same rotated shapes', async ({
    page,
  }, testInfo) => {
    await openReadyApp(page);
    await command(page, 'helpers.toggle', 'collision');

    for (let run = 0; run < 3; run += 1) {
      await command(page, 'player.teleport', 'spawn.geometry-service-entry');
      await expect
        .poll(async () => (await snapshot(page)).camera.obstructed, {
          message: `camera obstruction pass ${run + 1} should detect rotated geometry`,
        })
        .toBe(true);
      const obstructed = await snapshot(page);
      expect(obstructed.world.collision.lastCameraHitId).toMatch(
        /^c\.service-/,
      );
      expect(obstructed.camera.actualDistance).toBeLessThan(
        obstructed.camera.desiredDistance - 0.2,
      );
      if (run === 0) {
        await attachScreenshot(page, testInfo, 'rotated-camera-obstruction');
      }

      await command(page, 'player.teleport-position', '17,0,17,0.785398');
      await expect
        .poll(async () => (await snapshot(page)).camera.obstructed, {
          message: `camera recovery pass ${run + 1} should clear after teleport`,
        })
        .toBe(false);
      await expect
        .poll(async () => {
          const camera = (await snapshot(page)).camera;
          return camera.desiredDistance - camera.actualDistance;
        })
        .toBeLessThan(0.08);
    }

    const recovered = await snapshot(page);
    expect(recovered.world.collision.lastCameraHitId).toBeUndefined();
    expect(recovered.runtimeErrors.count, recovered.runtimeErrors.last).toBe(0);
  });
});

async function openReadyApp(page: Page): Promise<void> {
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

function projection(
  position: BrowserTestSnapshot['player']['position'],
  origin: BrowserTestSnapshot['player']['position'],
  axis: { readonly x: number; readonly z: number },
): number {
  return (position.x - origin.x) * axis.x + (position.z - origin.z) * axis.z;
}

function localCoordinate(
  position: BrowserTestSnapshot['player']['position'],
): number {
  return (position.x - 12) * localXAxis.x + (position.z - 12) * localXAxis.z;
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

declare global {
  interface Window {
    __VANTA_TEST__?: BrowserTestApi;
  }
}
