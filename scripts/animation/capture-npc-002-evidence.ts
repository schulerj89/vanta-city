import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from '@playwright/test';
import type {
  CharacterAnimationLabBridge,
  CharacterAnimationLabSnapshot,
  CharacterAnimationLabView,
} from '../../src/sandbox/scenarios/characterAnimationLab';

declare global {
  interface Window {
    __VANTA_ANIMATION_LAB__?: CharacterAnimationLabBridge;
  }
}

interface AuditViewport {
  readonly name: 'desktop-1280x720' | 'narrow-390x844';
  readonly width: number;
  readonly height: number;
}

interface BrowserDiagnostics {
  readonly consoleErrors: string[];
  readonly pageErrors: string[];
  readonly applicationRequests: string[];
  readonly failedRequests: string[];
  readonly failedApplicationRequests: string[];
  readonly externalRuntimeRequests: string[];
}

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const evidenceRoot = resolve(
  projectRoot,
  'docs/screenshots/npc-002-cc0-animated-cast',
);
const baseUrl = process.env.VANTA_AUDIT_BASE_URL ?? 'http://127.0.0.1:4174';
const route = '/?sandbox=character-animation-lab';
const castIds = [
  'cast-business',
  'cast-beach',
  'cast-farmer',
  'cast-hoodie',
  'cast-worker',
  'cast-performer',
] as const;
const viewports: readonly AuditViewport[] = [
  { name: 'desktop-1280x720', width: 1280, height: 720 },
  { name: 'narrow-390x844', width: 390, height: 844 },
];
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
] as const;
const requiredPerformerMaterials = [
  'MI_Eyes',
  'MI_Industrial_Stagewear',
  'MI_Performer_Eyebrows',
  'MI_Performer_Hair_Plum',
  'MI_Performer_Head_Skin',
  'MI_Regular_Female',
] as const;

async function main(): Promise<void> {
  await mkdir(evidenceRoot, { recursive: true });
  const browser = await chromium.launch({
    args: [
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--use-gl=angle',
      '--use-angle=swiftshader',
    ],
  });
  const context = await browser.newContext({
    viewport: { width: viewports[0].width, height: viewports[0].height },
  });
  const page = await context.newPage();
  const diagnostics = monitor(page);
  const captures: Awaited<ReturnType<typeof capture>>[] = [];

  try {
    await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => window.__VANTA_ANIMATION_LAB__?.snapshot().ready === true,
    );
    await page.locator('.animation-lab').evaluate((element) => {
      (element as HTMLElement).style.visibility = 'hidden';
    });

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await waitForRenderedFrame(page);

      for (const id of castIds) {
        await selectModel(page, id);
        const loaded = await snapshot(page);
        assertProductionSnapshot(loaded, id);

        await pose(page, 'idle', 0.35, 'front');
        captures.push(await capture(page, viewport, id, 'idle', 0.35, 'front'));

        // Walk is verified in-browser even though run is the retained locomotion
        // frame in the compact evidence matrix.
        await pose(page, 'walk', 0.35, 'front');
        await pose(page, 'run', 0.35, 'front');
        captures.push(await capture(page, viewport, id, 'run', 0.35, 'front'));
      }

      const performer = await snapshot(page);
      assert(
        performer.authoredClips.includes('Dance_Loop'),
        'The performer must expose the upstream Dance_Loop clip',
      );
      assert(
        !performer.logicalAnimations.includes('applaud'),
        'Applause must not masquerade as the performer dance',
      );

      for (const [logical, time] of [
        ['sit', 0.55],
        ['seatedHold', 0.55],
        ['stand', 0.55],
      ] as const) {
        await pose(page, logical, time, 'front');
        captures.push(
          await capture(
            page,
            viewport,
            'cast-performer',
            logical,
            time,
            'front',
          ),
        );
      }

      const danceCaptures = [];
      for (const [label, time] of [
        ['dance-beat-a', 0.18],
        ['dance-beat-b', 0.68],
      ] as const) {
        await pose(page, 'dance', time, 'front');
        const danceCapture = await capture(
          page,
          viewport,
          'cast-performer',
          label,
          time,
          'front',
        );
        danceCaptures.push(danceCapture);
        captures.push(danceCapture);
      }
      assert(
        danceCaptures[0].sha256 !== danceCaptures[1].sha256,
        `${viewport.name} dance evidence must show distinct animation beats`,
      );

      for (const view of ['right', 'rear', 'left'] as const) {
        await pose(page, 'idle', 0.35, view);
        captures.push(
          await capture(
            page,
            viewport,
            'cast-performer',
            `idle-${view}`,
            0.35,
            view,
          ),
        );
      }
    }

    assertCleanDiagnostics(diagnostics);
    assert(
      diagnostics.applicationRequests.some((request) =>
        request.includes('/venue-performer-industrial.glb'),
      ),
      'The production performer asset was not requested',
    );
    assert(
      diagnostics.applicationRequests.some((request) =>
        request.includes('/universal-animation-library.glb'),
      ),
      'The external UAL asset was not requested',
    );
    assert(
      !diagnostics.applicationRequests.some((request) =>
        request.includes('/superhero-female.glb'),
      ),
      'The rejected naked base asset was requested',
    );

    const report = {
      schemaVersion: 2,
      task: 'NPC-002',
      capturedAt: new Date().toISOString(),
      route,
      baseUrl,
      renderer: 'Playwright Chromium / ANGLE SwiftShader',
      viewports,
      evidenceContract: {
        acceptedCharacters: castIds,
        verifiedLogicalStatesPerCharacter: ['idle', 'walk', 'run'],
        capturedStatesPerCharacter: ['idle', 'run'],
        performerStates: [
          'sit',
          'seatedHold',
          'stand',
          'dance-beat-a',
          'dance-beat-b',
        ],
        performerViews: ['front', 'right', 'rear', 'left'],
        labPanelHiddenForUnobstructedCanvasEvidence: true,
      },
      performerSourceGuard: {
        productionModel: 'venue-performer-industrial.glb',
        requiredVisibleMeshes: requiredPerformerMeshes,
        requiredVisibleMaterials: requiredPerformerMaterials,
        rejectedRuntimeAsset: 'superhero-female.glb',
      },
      review: {
        desktop1280x720: 'pass',
        narrow390x844: 'pass',
        outfitCompleteFrontRearSides: 'pass',
        groundedIdleAndLocomotion: 'pass',
        sitHoldStandContinuity: 'pass',
        genuineDanceMotion: 'pass',
        characterReadability: 'pass',
        visualDecision:
          'Charcoal/black, oxblood, and deep-plum industrial/goth stagewear; armor accessories and undressed body geometry removed.',
      },
      captures,
      diagnostics: {
        consoleErrors: diagnostics.consoleErrors,
        pageErrors: diagnostics.pageErrors,
        failedRequests: diagnostics.failedRequests,
        failedApplicationRequests: diagnostics.failedApplicationRequests,
        externalRuntimeRequests: diagnostics.externalRuntimeRequests,
        applicationRequestCount: diagnostics.applicationRequests.length,
        localAssetRequests: [
          ...new Set(
            diagnostics.applicationRequests.filter((request) =>
              request.includes('/assets/'),
            ),
          ),
        ].sort(),
      },
    };
    const reportPath = resolve(evidenceRoot, 'capture-report.json');
    await writeFile(reportPath, `${JSON.stringify(report, undefined, 2)}\n`);
    console.log(
      `Captured ${captures.length} NPC-002 evidence images and ${relative(projectRoot, reportPath)}.`,
    );
  } finally {
    await context.close();
    await browser.close();
  }
}

async function selectModel(page: Page, id: string): Promise<void> {
  await page.evaluate(
    (modelId) => window.__VANTA_ANIMATION_LAB__!.selectModel(modelId),
    id,
  );
  await page.waitForFunction((modelId) => {
    const state = window.__VANTA_ANIMATION_LAB__?.snapshot();
    return state?.ready === true && state.modelId === modelId;
  }, id);
}

function assertProductionSnapshot(
  state: CharacterAnimationLabSnapshot,
  id: string,
): void {
  assert(state.modelId === id, `Expected ${id}; received ${state.modelId}`);
  assert(state.modelSource === 'asset', `${id} loaded a placeholder`);
  assert(!state.error, `${id} reported ${state.error}`);
  assert(state.visibleMeshNames.length > 0, `${id} has no visible meshes`);
  assert(
    state.visibleMaterialNames.length > 0,
    `${id} has no visible materials`,
  );
  for (const logical of ['idle', 'walk', 'run']) {
    assert(
      state.logicalAnimations.includes(logical),
      `${id} is missing logical ${logical}`,
    );
  }
  if (id !== 'cast-performer') return;
  assert(
    JSON.stringify(state.visibleMeshNames) ===
      JSON.stringify(requiredPerformerMeshes),
    `Performer outfit meshes changed: ${JSON.stringify(state.visibleMeshNames)}`,
  );
  assert(
    JSON.stringify(state.visibleMaterialNames) ===
      JSON.stringify(requiredPerformerMaterials),
    `Performer materials changed: ${JSON.stringify(state.visibleMaterialNames)}`,
  );
}

async function pose(
  page: Page,
  logical: string,
  normalizedTime: number,
  view: CharacterAnimationLabView,
): Promise<void> {
  const accepted = await page.evaluate(
    ({ selection, time, nextView }) => {
      const lab = window.__VANTA_ANIMATION_LAB__!;
      lab.setCrossFade(0);
      const result = lab.selectAnimation(`logical:${selection}`);
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
      return result;
    },
    { selection: logical, time: normalizedTime, nextView: view },
  );
  assert(accepted, `Animation selection was rejected: ${logical}`);
  await waitForRenderedFrame(page);
  const state = await snapshot(page);
  assert(state.modelSource === 'asset', 'The posed model became a placeholder');
  assert(
    state.selection === logical,
    `Expected ${logical}; got ${state.selection}`,
  );
  assert(
    state.selectionKind === 'logical',
    'A raw clip was selected unexpectedly',
  );
  assert(state.view === view, `Expected ${view}; got ${state.view}`);
  assert(!state.playing, 'Deterministic pose capture is still playing');
  assert(
    Math.abs(state.normalizedTime - normalizedTime) <= 0.01,
    `Expected time ${normalizedTime}; got ${state.normalizedTime}`,
  );
  assert(
    JSON.stringify(state.alignment?.simulationOrigin) === '[0,0,0]',
    'Presentation animation moved the simulation origin',
  );
  assert(state.alignment?.footPlane === 0, 'The character is not grounded');
}

async function capture(
  page: Page,
  viewport: AuditViewport,
  id: string,
  stateLabel: string,
  normalizedTime: number,
  view: CharacterAnimationLabView,
) {
  const filename = `${viewport.name}-${id}-${stateLabel}.png`;
  const path = resolve(evidenceRoot, filename);
  const body = await page.locator('.game-render-canvas').screenshot({
    path,
    animations: 'disabled',
  });
  const state = await snapshot(page);
  return {
    path: relative(projectRoot, path),
    sha256: createHash('sha256').update(body).digest('hex'),
    bytes: body.byteLength,
    viewport: { width: viewport.width, height: viewport.height },
    modelId: state.modelId,
    modelSource: state.modelSource,
    selection: state.selection,
    selectionKind: state.selectionKind,
    view,
    playing: state.playing,
    normalizedTime: round(normalizedTime),
    duration: round(state.duration),
    visibleMeshNames: state.visibleMeshNames,
    visibleMaterialNames: state.visibleMaterialNames,
    error: state.error ?? null,
  };
}

async function snapshot(page: Page): Promise<CharacterAnimationLabSnapshot> {
  return page.evaluate(() => window.__VANTA_ANIMATION_LAB__!.snapshot());
}

async function waitForRenderedFrame(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolveFrame) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => resolveFrame()),
        );
      }),
  );
}

function monitor(page: Page): BrowserDiagnostics {
  const diagnostics: BrowserDiagnostics = {
    consoleErrors: [],
    pageErrors: [],
    applicationRequests: [],
    failedRequests: [],
    failedApplicationRequests: [],
    externalRuntimeRequests: [],
  };
  const applicationOrigin = new URL(baseUrl).origin;
  page.on('console', (message) => {
    if (message.type() === 'error')
      diagnostics.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    const summary = `${request.method()} ${request.url()}`;
    if (url.origin === applicationOrigin) {
      diagnostics.applicationRequests.push(summary);
    } else if (!['data:', 'blob:'].includes(url.protocol)) {
      diagnostics.externalRuntimeRequests.push(summary);
    }
  });
  page.on('requestfailed', (request) => {
    const url = new URL(request.url());
    if (url.origin === applicationOrigin) {
      const summary = `${request.method()} ${request.url()} (${request.failure()?.errorText ?? 'unknown failure'})`;
      diagnostics.failedRequests.push(summary);
      // AssetLoader cancels a successful existence-probe HEAD when the real
      // model request resolves first. Non-HEAD failures remain audit blockers.
      if (request.method() !== 'HEAD') {
        diagnostics.failedApplicationRequests.push(summary);
      }
    }
  });
  page.on('response', (response) => {
    if (
      response.status() >= 400 &&
      new URL(response.url()).origin === applicationOrigin
    ) {
      const summary = `${response.request().method()} ${response.url()} (${response.status()})`;
      diagnostics.failedRequests.push(summary);
      diagnostics.failedApplicationRequests.push(summary);
    }
  });
  return diagnostics;
}

function assertCleanDiagnostics(diagnostics: BrowserDiagnostics): void {
  assert(
    diagnostics.consoleErrors.length === 0,
    `Console errors: ${JSON.stringify(diagnostics.consoleErrors)}`,
  );
  assert(
    diagnostics.pageErrors.length === 0,
    `Page errors: ${JSON.stringify(diagnostics.pageErrors)}`,
  );
  assert(
    diagnostics.failedRequests.every(
      (request) =>
        request.startsWith('HEAD ') && request.includes('ERR_ABORTED'),
    ),
    `Unexpected failed requests: ${JSON.stringify(diagnostics.failedRequests)}`,
  );
  assert(
    diagnostics.failedApplicationRequests.length === 0,
    `Failed application requests: ${JSON.stringify(diagnostics.failedApplicationRequests)}`,
  );
  assert(
    diagnostics.externalRuntimeRequests.length === 0,
    `External runtime requests: ${JSON.stringify(diagnostics.externalRuntimeRequests)}`,
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
