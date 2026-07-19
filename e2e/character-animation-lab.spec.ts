import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import type { CharacterAnimationLabBridge } from '../src/sandbox/scenarios/characterAnimationLab';

type LabBridge = CharacterAnimationLabBridge;
interface RuntimeNetworkAudit {
  readonly applicationRequests: string[];
  readonly failedRequests: string[];
  readonly failedApplicationRequests: string[];
  readonly externalRuntimeRequests: string[];
}

const runtimeErrors = new WeakMap<Page, string[]>();
const runtimeNetworkAudits = new WeakMap<Page, RuntimeNetworkAudit>();

async function labSnapshot(page: Page) {
  return page.evaluate(() => window.__VANTA_ANIMATION_LAB__!.snapshot());
}

async function waitForModel(page: Page, id: string) {
  await expect.poll(async () => (await labSnapshot(page)).modelId).toBe(id);
  await expect.poll(async () => (await labSnapshot(page)).ready).toBe(true);
}

async function waitForRenderedFrame(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

test.beforeEach(async ({ page }, testInfo) => {
  const errors: string[] = [];
  const network: RuntimeNetworkAudit = {
    applicationRequests: [],
    failedRequests: [],
    failedApplicationRequests: [],
    externalRuntimeRequests: [],
  };
  const applicationOrigin = new URL(String(testInfo.project.use.baseURL))
    .origin;
  runtimeErrors.set(page, errors);
  runtimeNetworkAudits.set(page, network);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    const summary = `${request.method()} ${request.url()}`;
    if (url.origin === applicationOrigin) {
      network.applicationRequests.push(summary);
    } else if (!['data:', 'blob:'].includes(url.protocol)) {
      network.externalRuntimeRequests.push(summary);
    }
  });
  page.on('requestfailed', (request) => {
    const summary = `${request.method()} ${request.url()} (${request.failure()?.errorText ?? 'unknown failure'})`;
    network.failedRequests.push(summary);
    // AssetLoader deliberately aborts its successful existence-probe HEAD once
    // the real GLB request wins. Runtime GET failures remain hard failures.
    if (request.method() !== 'HEAD') {
      network.failedApplicationRequests.push(summary);
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      const summary = `${response.request().method()} ${response.url()} (${response.status()})`;
      network.failedRequests.push(summary);
      network.failedApplicationRequests.push(summary);
    }
  });
  await page.goto('/?sandbox=character-animation-lab');
  await page.waitForFunction(
    () => window.__VANTA_ANIMATION_LAB__?.snapshot().ready === true,
  );
});

test.afterEach(({ page }) => {
  expect(runtimeErrors.get(page) ?? []).toEqual([]);
  expect(
    (runtimeNetworkAudits.get(page)?.failedRequests ?? []).filter(
      (request) =>
        !request.startsWith('HEAD ') || !request.includes('ERR_ABORTED'),
    ),
  ).toEqual([]);
  expect(
    runtimeNetworkAudits.get(page)?.failedApplicationRequests ?? [],
  ).toEqual([]);
  expect(runtimeNetworkAudits.get(page)?.externalRuntimeRequests ?? []).toEqual(
    [],
  );
});

async function poseForEvidence(
  page: Page,
  logical: string,
  normalizedTime: number,
  view: 'front' | 'right' | 'rear' | 'left' = 'front',
) {
  expect(
    await page.evaluate(
      ({ selection, time, nextView }) => {
        const lab = window.__VANTA_ANIMATION_LAB__!;
        lab.setCrossFade(0);
        const accepted = lab.selectAnimation(`logical:${selection}`);
        lab.setPlaying(false);
        lab.setNormalizedTime(time);
        lab.setView(nextView);
        for (const overlay of [
          'skeleton',
          'bounds',
          'alignment',
          'rootMotion',
          'equipment',
        ] as const) {
          lab.setOverlay(overlay, false);
        }
        return accepted;
      },
      { selection: logical, time: normalizedTime, nextView: view },
    ),
  ).toBe(true);
  await waitForRenderedFrame(page);
  const snapshot = await labSnapshot(page);
  expect(snapshot).toMatchObject({
    modelSource: 'asset',
    selection: logical,
    selectionKind: 'logical',
    playing: false,
    view,
    error: undefined,
  });
  expect(snapshot.normalizedTime).toBeCloseTo(normalizedTime, 2);
  expect(snapshot.alignment?.simulationOrigin).toEqual([0, 0, 0]);
  expect(snapshot.alignment?.footPlane).toBe(0);
}

async function attachCanvas(page: Page, testInfo: TestInfo, name: string) {
  const body = await page.locator('.game-render-canvas').screenshot({
    animations: 'disabled',
  });
  await testInfo.attach(`${name}.png`, {
    body,
    contentType: 'image/png',
  });
  return body;
}

test('switches every registered definition and safely disposes prior instances', async ({
  page,
}) => {
  const ids = [
    'casual',
    'punk',
    'npc-worker',
    'npc-hoodie',
    'npc-punk',
    'pedestrian-casual',
    'pedestrian-street',
    'pedestrian-tank-top',
    'pedestrian-dress',
    'cast-business',
    'cast-beach',
    'cast-farmer',
    'cast-hoodie',
    'cast-worker',
    'cast-performer',
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
    if (id !== 'debug-sparring-target') {
      expect(snapshot.performanceProfileId).toBe(`performance.${id}`);
      expect(snapshot.performanceIntents).toContain('neutral-hold');
    }
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
  // every definition to prove the previous instance is released each time.
  expect((await labSnapshot(page)).disposalCount).toBe(ids.length);
});

test('previews every production pedestrian locomotion and explicit applause @visual', async ({
  page,
}, testInfo) => {
  const ids = [
    'pedestrian-casual',
    'pedestrian-street',
    'pedestrian-tank-top',
    'pedestrian-dress',
  ];
  for (const id of ids) {
    await page.evaluate(
      async (modelId) =>
        (window.__VANTA_ANIMATION_LAB__ as LabBridge).selectModel(modelId),
      id,
    );
    await waitForModel(page, id);
    for (const logical of ['idle', 'walk', 'applaud']) {
      expect(
        await page.evaluate(
          (selection) =>
            window.__VANTA_ANIMATION_LAB__!.selectAnimation(selection),
          `logical:${logical}`,
        ),
      ).toBe(true);
      await page.evaluate(() => {
        const lab = window.__VANTA_ANIMATION_LAB__!;
        lab.setPlaying(false);
        lab.setNormalizedTime(0.35);
        lab.setView('front');
        lab.setOverlay('bounds', true);
        lab.setOverlay('alignment', true);
      });
      await waitForRenderedFrame(page);
      const snapshot = await labSnapshot(page);
      expect(snapshot.modelSource).toBe('asset');
      expect(snapshot.selection).toBe(logical);
      expect(snapshot.selectionKind).toBe('logical');
      expect(snapshot.alignment?.simulationOrigin).toEqual([0, 0, 0]);
      expect(snapshot.alignment?.footPlane).toBe(0);
      await testInfo.attach(`${id}-${logical}.png`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
    }
  }
});

test('audits the complete CC0 cast matrix and genuine venue performance @visual', async ({
  page,
}, testInfo) => {
  test.slow();
  const castIds = [
    'cast-business',
    'cast-beach',
    'cast-farmer',
    'cast-hoodie',
    'cast-worker',
    'cast-performer',
  ] as const;
  const viewports = [
    { name: 'desktop-1280x720', width: 1280, height: 720 },
    { name: 'narrow-390x844', width: 390, height: 844 },
  ] as const;
  const requiredPerformerMeshes = [
    'Female_Performer_Eyebrows',
    'Female_Performer_Eyes',
    'Female_Performer_Hair',
    'Female_Performer_Head',
    'Female_Ranger_Arms_1',
    'Female_Ranger_Arms_2',
    'Female_Ranger_Body',
    'Female_Ranger_Feet',
    'Female_Ranger_Head_Hood',
    'Female_Ranger_Legs',
  ];

  await page.locator('.animation-lab').evaluate((element) => {
    (element as HTMLElement).style.visibility = 'hidden';
  });

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    expect(page.viewportSize()).toEqual({
      width: viewport.width,
      height: viewport.height,
    });
    await waitForRenderedFrame(page);

    for (const id of castIds) {
      await page.evaluate(
        (modelId) => window.__VANTA_ANIMATION_LAB__!.selectModel(modelId),
        id,
      );
      await waitForModel(page, id);
      const loaded = await labSnapshot(page);
      expect(loaded.error).toBeUndefined();
      expect(loaded.visibleMeshNames.length).toBeGreaterThan(0);
      expect(loaded.visibleMaterialNames.length).toBeGreaterThan(0);
      expect(loaded.logicalAnimations).toEqual(
        expect.arrayContaining(['idle', 'walk', 'run']),
      );
      if (id === 'cast-performer') {
        // This exact runtime outfit contract prevents a naked/base-body asset,
        // hidden head, or omitted clothing piece from producing passing evidence.
        expect(loaded.visibleMeshNames).toEqual(requiredPerformerMeshes);
        expect(loaded.visibleMaterialNames).toEqual([
          'MI_Eyes',
          'MI_Industrial_Stagewear',
          'MI_Performer_Eyebrows',
          'MI_Performer_Hair_Plum',
          'MI_Performer_Head_Skin',
          'MI_Regular_Female',
        ]);
        expect(loaded.visibleMeshNames.join(' ')).not.toMatch(/superhero/i);
      }

      for (const logical of ['idle', 'walk', 'run']) {
        await poseForEvidence(page, logical, 0.35);
        if (logical !== 'walk') {
          await attachCanvas(
            page,
            testInfo,
            `${viewport.name}-${id}-${logical}`,
          );
        }
      }
    }

    const performer = await labSnapshot(page);
    expect(performer.performanceIntents).toEqual(
      expect.arrayContaining(['sit', 'seated-hold', 'stand', 'dance']),
    );
    expect(performer.logicalAnimations).not.toContain('applaud');
    for (const [logical, time] of [
      ['sit', 0.55],
      ['seatedHold', 0.55],
      ['stand', 0.55],
    ] as const) {
      await poseForEvidence(page, logical, time);
      await attachCanvas(
        page,
        testInfo,
        `${viewport.name}-cast-performer-${logical}`,
      );
    }

    const danceFrames = [];
    for (const [label, time] of [
      ['dance-beat-a', 0.18],
      ['dance-beat-b', 0.68],
    ] as const) {
      await poseForEvidence(page, 'dance', time);
      danceFrames.push(
        await attachCanvas(
          page,
          testInfo,
          `${viewport.name}-cast-performer-${label}`,
        ),
      );
    }
    expect(danceFrames[0].equals(danceFrames[1])).toBe(false);

    for (const view of ['right', 'rear', 'left'] as const) {
      await poseForEvidence(page, 'idle', 0.35, view);
      await attachCanvas(
        page,
        testInfo,
        `${viewport.name}-cast-performer-idle-${view}`,
      );
    }
  }

  const network = runtimeNetworkAudits.get(page)!;
  expect(network.applicationRequests).toEqual(
    expect.arrayContaining([
      expect.stringContaining('/venue-performer-industrial.glb'),
      expect.stringContaining('/universal-animation-library.glb'),
    ]),
  );
  expect(network.applicationRequests.join('\n')).not.toContain(
    'superhero-female.glb',
  );
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
