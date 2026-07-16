import { expect, test } from '@playwright/test';
import type { ConsoleMessage, Page } from '@playwright/test';
import type {
  CameraCompositionLabApi,
  CameraCompositionLabSnapshot,
} from '../src/sandbox/scenarios/cameraCompositionLab';

test('camera lab exercises composition, obstruction, viewport, and restoration', async ({
  page,
}) => {
  const consoleIssues: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      consoleIssues.push(message.text());
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?sandbox=camera-composition&e2e=1');
  await page.waitForFunction(() => window.__VANTA_CAMERA_LAB__ !== undefined);

  await waitForCamera(page, 'sandbox:camera-composition');
  const defaultState = await snapshot(page);
  expect(defaultState.state).toMatchObject({
    preset: 'default',
    npcId: 'mack',
    profileId: 'close',
    cameraRequested: true,
  });
  expect(defaultState.camera.obstructionColliderId).toBeUndefined();
  expect(defaultState.savedGameplayCamera).toBeDefined();
  await expect(page).toHaveScreenshot('camera-lab-default.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.015,
  });

  await applyPreset(page, 'nox-alley');
  await waitForCamera(page, 'sandbox:camera-composition');
  await expect
    .poll(async () => (await snapshot(page)).camera.obstructionColliderId)
    .toBe('camera-lab.obstruction');
  const obstructed = await snapshot(page);
  expect(obstructed.state).toMatchObject({
    npcId: 'nox',
    profileId: 'default',
    obstruction: { enabled: true },
  });
  expect(obstructed.camera.adjustedPosition).not.toEqual(
    obstructed.camera.unobstructedPosition,
  );
  expect(obstructed.collision.lastCameraHitId).toBe('camera-lab.obstruction');
  await expect(page).toHaveScreenshot('camera-lab-nox-alley.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.015,
  });

  await applyPreset(page, 'narrow-mobile');
  await waitForCamera(page, 'sandbox:camera-composition');
  await expect
    .poll(() =>
      page
        .locator('#game')
        .evaluate((node) => node.getBoundingClientRect().width),
    )
    .toBe(390);
  const narrow = await snapshot(page);
  expect(narrow.state).toMatchObject({
    viewport: 'mobile',
    npcId: 'raze',
    profileId: 'wide',
  });
  await expect(page).toHaveScreenshot('camera-lab-narrow-mobile.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.015,
  });

  await execute(page, 'shoulder', 'left');
  await execute(page, 'approach', 'right');
  await execute(page, 'anchor', 'true');
  await execute(page, 'obstruction-pose', '0,2.4,0.35');
  await execute(page, 'viewport', 'short');
  await waitForCamera(page, 'sandbox:camera-composition');
  const authored = await snapshot(page);
  expect(authored.camera).toMatchObject({
    shoulderSide: 'left',
    activeAnchorId: 'camera-lab.authored-anchor',
  });
  expect(authored.state.approachSide).toBe('right');
  expect(authored.state.obstruction).toMatchObject({
    enabled: true,
    yaw: 0.35,
  });
  expect(authored.collision.orientedBoxCount).toBe(2);
  await expect
    .poll(() =>
      page.locator('#game').evaluate((node) => ({
        width: node.getBoundingClientRect().width,
        height: node.getBoundingClientRect().height,
      })),
    )
    .toEqual({ width: 780, height: 360 });

  await applyPreset(page, 'default');
  await waitForCamera(page, 'sandbox:camera-composition');
  const beforeRestore = await snapshot(page);
  expect(beforeRestore.savedGameplayCamera).toBeDefined();
  await execute(page, 'restore');
  await waitForCamera(page, 'gameplay');
  await expect
    .poll(async () => (await snapshot(page)).restorationError)
    .toBeLessThan(0.02);
  const restored = await snapshot(page);
  expect(restored.state.cameraRequested).toBe(false);
  expect(restored.camera.owner).toBe('gameplay');
  expect(restored.restorationError).toBeLessThan(0.02);
  await expect(page).toHaveScreenshot('camera-lab-restoration.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.015,
  });

  expect(
    consoleIssues.filter(
      (text) =>
        !/^\[\.WebGL-[^\]]+\]GL Driver Message .*GPU stall due to ReadPixels/.test(
          text,
        ),
    ),
  ).toEqual([]);
  expect(pageErrors).toEqual([]);
});

async function snapshot(page: Page): Promise<CameraCompositionLabSnapshot> {
  return page.evaluate(() =>
    (window.__VANTA_CAMERA_LAB__ as CameraCompositionLabApi).snapshot(),
  );
}

async function applyPreset(
  page: Page,
  id: 'default' | 'nox-alley' | 'narrow-mobile',
) {
  await page.evaluate((preset) => {
    (window.__VANTA_CAMERA_LAB__ as CameraCompositionLabApi).applyPreset(
      preset,
    );
  }, id);
}

async function execute(page: Page, command: string, value?: string) {
  await page.evaluate(
    ({ command: name, value: argument }) => {
      (window.__VANTA_CAMERA_LAB__ as CameraCompositionLabApi).execute(
        name,
        argument,
      );
    },
    { command, value },
  );
}

async function waitForCamera(page: Page, owner: string): Promise<void> {
  await expect
    .poll(async () => (await snapshot(page)).camera.owner)
    .toBe(owner);
  await expect
    .poll(async () => (await snapshot(page)).camera.transitionProgress)
    .toBe(1);
}
