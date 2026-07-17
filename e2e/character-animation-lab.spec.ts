import { expect, test } from '@playwright/test';
import type { CharacterAnimationLabBridge } from '../src/sandbox/scenarios/characterAnimationLab';

type LabBridge = CharacterAnimationLabBridge;
const runtimeErrors = new WeakMap<import('@playwright/test').Page, string[]>();

async function labSnapshot(page: import('@playwright/test').Page) {
  return page.evaluate(() => window.__VANTA_ANIMATION_LAB__!.snapshot());
}

async function waitForModel(page: import('@playwright/test').Page, id: string) {
  await expect.poll(async () => (await labSnapshot(page)).modelId).toBe(id);
  await expect.poll(async () => (await labSnapshot(page)).ready).toBe(true);
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/?sandbox=character-animation-lab');
  await page.waitForFunction(
    () => window.__VANTA_ANIMATION_LAB__?.snapshot().ready === true,
  );
});

test.afterEach(({ page }) => {
  expect(runtimeErrors.get(page) ?? []).toEqual([]);
});

test('switches every registered definition and safely disposes prior instances', async ({
  page,
}) => {
  const ids = [
    'casual',
    'punk',
    'npc-worker',
    'npc-hoodie',
    'npc-punk',
    'debug-sparring-target',
  ];
  for (const id of ids) {
    await page.evaluate(
      async (modelId) =>
        (window.__VANTA_ANIMATION_LAB__ as LabBridge).selectModel(modelId),
      id,
    );
    await waitForModel(page, id);
    const snapshot = await labSnapshot(page);
    expect(snapshot.modelSource).toBe('asset');
    expect(snapshot.logicalAnimations.length).toBeGreaterThan(0);
    expect(snapshot.authoredClips.length).toBeGreaterThan(0);
    expect(snapshot.alignment?.simulationOrigin).toEqual([0, 0, 0]);
    expect(snapshot.alignment?.footPlane).toBe(0);
    const rawSelection = `clip:${snapshot.authoredClips[0]}`;
    expect(
      await page.evaluate(
        (selection) =>
          window.__VANTA_ANIMATION_LAB__!.selectAnimation(selection),
        rawSelection,
      ),
    ).toBe(true);
    expect((await labSnapshot(page)).selectionKind).toBe('clip');
  }
  // The sandbox eagerly loads Casual once, then this loop deliberately reloads
  // all six definitions to prove the previous instance is released each time.
  expect((await labSnapshot(page)).disposalCount).toBe(ids.length);
});

test('supports deterministic action lock, impact, scrub, speed, and mixer release', async ({
  page,
}, testInfo) => {
  await page.evaluate(() => {
    const lab = window.__VANTA_ANIMATION_LAB__!;
    lab.selectAnimation('logical:punchLeft');
    lab.setSpeed(0.5);
    lab.setLoop(false);
  });
  await expect
    .poll(async () => (await labSnapshot(page)).actionBusy)
    .toBe(true);
  const accepted = await page.evaluate(() =>
    window.__VANTA_ANIMATION_LAB__!.selectAnimation('logical:kickRight'),
  );
  expect(accepted).toBe(false);
  expect((await labSnapshot(page)).rejectedTransitions).toBe(1);

  await page.evaluate(() =>
    window.__VANTA_ANIMATION_LAB__!.setNormalizedTime(0.62),
  );
  await expect
    .poll(async () => (await labSnapshot(page)).impactReached)
    .toBe(true);
  expect((await labSnapshot(page)).normalizedTime).toBeCloseTo(0.62, 2);
  await testInfo.attach('casual-punch-impact.png', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  await page.evaluate(() => window.__VANTA_ANIMATION_LAB__!.setPlaying(true));
  await expect
    .poll(async () => (await labSnapshot(page)).actionBusy, { timeout: 8_000 })
    .toBe(false);
  expect((await labSnapshot(page)).completionRelease).toBe('mixer-finished');
  expect((await labSnapshot(page)).alignment?.simulationOrigin).toEqual([
    0, 0, 0,
  ]);
});

test('renders stable playable and NPC grounding diagnostics @visual', async ({
  page,
}, testInfo) => {
  await page.evaluate(() => {
    const lab = window.__VANTA_ANIMATION_LAB__!;
    lab.setPlaying(false);
    lab.setNormalizedTime(0);
    lab.setOverlay('bounds', true);
    lab.setOverlay('alignment', true);
  });
  await page.waitForTimeout(500);
  await expect(page.locator('.animation-lab')).toHaveScreenshot(
    'animation-lab-casual-controls.png',
    {
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
    },
  );
  await testInfo.attach('casual-bounds-grounding.png', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  await page.evaluate(async () => {
    await window.__VANTA_ANIMATION_LAB__!.selectModel('punk');
    window.__VANTA_ANIMATION_LAB__!.setPlaying(false);
    window.__VANTA_ANIMATION_LAB__!.setNormalizedTime(0);
  });
  await waitForModel(page, 'punk');
  await page.waitForTimeout(500);
  await testInfo.attach('punk-bounds-grounding.png', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  await page.evaluate(async () => {
    await window.__VANTA_ANIMATION_LAB__!.selectModel('npc-worker');
    window.__VANTA_ANIMATION_LAB__!.setPlaying(false);
    window.__VANTA_ANIMATION_LAB__!.setNormalizedTime(0);
    window.__VANTA_ANIMATION_LAB__!.setOverlay('skeleton', true);
  });
  await waitForModel(page, 'npc-worker');
  await page.waitForTimeout(500);
  await expect(page.locator('.animation-lab')).toHaveScreenshot(
    'animation-lab-animated-man-controls.png',
    {
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
    },
  );
  await testInfo.attach('animated-man-skeleton.png', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});
