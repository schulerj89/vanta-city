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

async function waitForRenderedFrame(page: import('@playwright/test').Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
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

test('inspects both real weapons through every playable weapon state', async ({
  page,
}, testInfo) => {
  test.slow();
  const cases = [
    { item: 'handgun' as const, states: ['gunIdle', 'gunFire', 'gunRun'] },
    { item: 'knife' as const, states: ['knifeIdle', 'knifeSlash'] },
  ];
  for (const model of ['casual', 'punk']) {
    await page.evaluate(
      (id) => window.__VANTA_ANIMATION_LAB__!.selectModel(id),
      model,
    );
    await waitForModel(page, model);
    for (const { item, states } of cases) {
      await page.evaluate((equipment) => {
        const lab = window.__VANTA_ANIMATION_LAB__!;
        lab.setLoop(true);
        lab.selectEquipment(equipment);
      }, item);
      await expect
        .poll(async () => (await labSnapshot(page)).equipment.source)
        .toBe('asset');
      for (const state of states) {
        expect(
          await page.evaluate(
            (selection) =>
              window.__VANTA_ANIMATION_LAB__!.selectAnimation(
                `logical:${selection}`,
              ),
            state,
          ),
        ).toBe(true);
        await page.evaluate(() => {
          window.__VANTA_ANIMATION_LAB__!.setNormalizedTime(0.5);
          window.__VANTA_ANIMATION_LAB__!.setView('right');
        });
        const snapshot = await labSnapshot(page);
        expect(snapshot.equipment).toMatchObject({
          itemId: item,
          attached: true,
          compatible: true,
          socketName: 'WristR',
          source: 'asset',
          loadError: undefined,
        });
        expect(snapshot.alignment?.simulationOrigin).toEqual([0, 0, 0]);
        expect(snapshot.socketPosition).toHaveLength(3);
        const dimensions = snapshot.equipmentBounds!.max.map(
          (value, index) => value - snapshot.equipmentBounds!.min[index],
        );
        expect(Math.max(...dimensions)).toBeGreaterThan(0.18);
        expect(Math.max(...dimensions)).toBeLessThan(0.65);
        await testInfo.attach(`${model}-${item}-${state}-right.png`, {
          body: await page.screenshot(),
          contentType: 'image/png',
        });
      }
      await page.evaluate(() =>
        window.__VANTA_ANIMATION_LAB__!.setView('left'),
      );
      await testInfo.attach(`${model}-${item}-left.png`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
      await page.evaluate(() =>
        window.__VANTA_ANIMATION_LAB__!.setView('front'),
      );
      await testInfo.attach(`${model}-${item}-front.png`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
      await page.evaluate(() =>
        window.__VANTA_ANIMATION_LAB__!.setView('rear'),
      );
      await testInfo.attach(`${model}-${item}-rear.png`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
    }
  }
});

test('edits and resets asset-local equipment transforms without moving simulation', async ({
  page,
}) => {
  await page.evaluate(() => {
    const lab = window.__VANTA_ANIMATION_LAB__!;
    lab.selectEquipment('handgun');
    lab.setEquipmentTransform({
      position: [0.015, -0.025, -0.12],
      rotation: [0.1, -0.2, 0.3],
      scale: 5.75,
    });
  });
  await expect
    .poll(async () => (await labSnapshot(page)).equipment.source)
    .toBe('asset');

  const edited = await labSnapshot(page);
  expect(edited.equipmentTransform).toEqual({
    position: [0.015, -0.025, -0.12],
    rotation: [0.1, -0.2, 0.3],
    scale: 5.75,
  });
  expect(edited.alignment?.simulationOrigin).toEqual([0, 0, 0]);
  await expect(page.getByLabel('Transform values to send back')).toHaveValue(
    /"scale": 5\.75/,
  );

  await page
    .getByRole('button', {
      name: 'Reset selected asset transform',
    })
    .click();
  expect((await labSnapshot(page)).equipmentTransform).toEqual({
    position: [0.04, -0.04, -0.215],
    rotation: [0, 3.15, 1.5],
    scale: 5,
  });
  expect((await labSnapshot(page)).muzzleTransform).toEqual({
    position: [0, 0.014, 0.0231],
    rotation: [Math.PI / 2, 0, 0],
    scale: 0.08,
  });
  await page.evaluate(() =>
    window.__VANTA_ANIMATION_LAB__!.setMuzzleTransform({
      position: [0.001, 0.015, 0.024],
      rotation: [1.6, 0.1, 0],
      scale: 0.25,
    }),
  );
  expect((await labSnapshot(page)).muzzleTransform).toEqual({
    position: [0.001, 0.015, 0.024],
    rotation: [1.6, 0.1, 0],
    scale: 0.25,
  });
  await expect(page.getByLabel('Muzzle values to send back')).toHaveValue(
    /"scale": 0\.25/,
  );
  expect((await labSnapshot(page)).alignment?.simulationOrigin).toEqual([
    0, 0, 0,
  ]);

  await page.evaluate(() =>
    window.__VANTA_ANIMATION_LAB__!.selectEquipment('knife'),
  );
  expect((await labSnapshot(page)).equipmentTransform).toEqual({
    position: [0.1, 0.105, 0.105],
    rotation: [0.25, -0.05, 0],
    scale: 6,
  });
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
  await waitForRenderedFrame(page);
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
  await waitForRenderedFrame(page);
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
  await waitForRenderedFrame(page);
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
