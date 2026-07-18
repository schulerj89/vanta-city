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

interface CaptureTarget {
  readonly id: string;
  readonly idleSelection: string;
  readonly fullBodyView: CharacterAnimationLabView;
  readonly closeUpView: CharacterAnimationLabView;
}

interface PerformanceCapture {
  readonly id: string;
  readonly selection: string;
  readonly normalizedTime: number;
  readonly view: CharacterAnimationLabView;
}

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const evidenceRoot = resolve(
  projectRoot,
  'docs/screenshots/npc-performance-002',
);
const baseUrl = process.env.VANTA_AUDIT_BASE_URL ?? 'http://127.0.0.1:4174';
const targets: readonly CaptureTarget[] = [
  {
    id: 'casual',
    idleSelection: 'logical:idle',
    fullBodyView: 'front',
    closeUpView: 'close-up-three-quarter',
  },
  ...[
    'npc-worker',
    'npc-hoodie',
    'npc-punk',
    'pedestrian-casual',
    'pedestrian-street',
    'pedestrian-tank-top',
    'pedestrian-dress',
  ].map((id) => ({
    id,
    idleSelection: 'logical:idle',
    fullBodyView: 'rear' as const,
    closeUpView: 'close-up-rear-three-quarter' as const,
  })),
];
const performanceCaptures: readonly PerformanceCapture[] = [
  {
    id: 'casual',
    selection: 'logical:interact',
    normalizedTime: 0.55,
    view: 'front',
  },
  {
    id: 'casual',
    selection: 'logical:wave',
    normalizedTime: 0.5,
    view: 'front',
  },
  {
    id: 'npc-worker',
    selection: 'clip:HumanArmature|Man_Clapping',
    normalizedTime: 0.1,
    view: 'rear',
  },
  {
    id: 'npc-worker',
    selection: 'clip:HumanArmature|Man_Clapping',
    normalizedTime: 0.25,
    view: 'rear',
  },
  {
    id: 'npc-worker',
    selection: 'clip:HumanArmature|Man_Clapping',
    normalizedTime: 0.4,
    view: 'rear',
  },
  {
    id: 'npc-worker',
    selection: 'clip:HumanArmature|Man_Clapping',
    normalizedTime: 0.55,
    view: 'rear',
  },
  {
    id: 'npc-worker',
    selection: 'clip:HumanArmature|Man_Clapping',
    normalizedTime: 0.7,
    view: 'rear',
  },
  {
    id: 'npc-worker',
    selection: 'clip:HumanArmature|Man_Clapping',
    normalizedTime: 0.85,
    view: 'rear',
  },
  {
    id: 'npc-worker',
    selection: 'clip:HumanArmature|Man_Walk',
    normalizedTime: 0.4,
    view: 'rear',
  },
  {
    id: 'npc-worker',
    selection: 'clip:HumanArmature|Man_Sitting',
    normalizedTime: 0.1,
    view: 'rear',
  },
  {
    id: 'npc-worker',
    selection: 'clip:HumanArmature|Man_Sitting',
    normalizedTime: 0.25,
    view: 'rear',
  },
  {
    id: 'npc-worker',
    selection: 'clip:HumanArmature|Man_Sitting',
    normalizedTime: 0.4,
    view: 'rear',
  },
  {
    id: 'npc-worker',
    selection: 'clip:HumanArmature|Man_Sitting',
    normalizedTime: 0.55,
    view: 'rear',
  },
  {
    id: 'npc-worker',
    selection: 'clip:HumanArmature|Man_Sitting',
    normalizedTime: 0.7,
    view: 'rear',
  },
  {
    id: 'npc-worker',
    selection: 'clip:HumanArmature|Man_Sitting',
    normalizedTime: 0.85,
    view: 'rear',
  },
  {
    id: 'npc-worker',
    selection: 'clip:HumanArmature|Man_Standing',
    normalizedTime: 0.5,
    view: 'rear',
  },
  {
    id: 'pedestrian-casual',
    selection: 'clip:HumanArmature|Female_Clapping',
    normalizedTime: 0.4,
    view: 'rear',
  },
];

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
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();
  const diagnostics = monitor(page);
  const captures: {
    path: string;
    sha256: string;
    snapshot: ReturnType<typeof evidenceSnapshot>;
  }[] = [];

  try {
    await page.goto(`${baseUrl}/?sandbox=character-animation-lab`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForFunction(
      () => window.__VANTA_ANIMATION_LAB__?.snapshot().ready === true,
    );
    await page.locator('.animation-lab').evaluate((element) => {
      (element as HTMLElement).style.visibility = 'hidden';
    });

    for (const target of targets) {
      await selectModel(page, target.id);
      await pose(page, target.idleSelection, 0.35, target.fullBodyView);
      captures.push(await capture(page, `${target.id}-idle-full-body.png`));
      await pose(page, target.idleSelection, 0.35, target.closeUpView);
      captures.push(await capture(page, `${target.id}-idle-close-up.png`));
    }

    await selectModel(page, 'npc-worker');
    await pose(page, 'logical:idle', 0.35, 'front');
    captures.push(
      await capture(page, 'npc-worker-positive-z-authored-view.png'),
    );

    for (const performance of performanceCaptures) {
      await selectModel(page, performance.id);
      await pose(
        page,
        performance.selection,
        performance.normalizedTime,
        performance.view,
      );
      captures.push(
        await capture(
          page,
          `${performance.id}-${slug(performance.selection)}-${performance.normalizedTime.toFixed(2)}.png`,
        ),
      );
    }

    const disposalBeforeReentry = (await snapshot(page)).disposalCount;
    for (const id of ['casual', 'npc-worker', 'casual'])
      await selectModel(page, id);
    const final = await snapshot(page);
    const expectedDisposals = disposalBeforeReentry + 3;
    if (final.disposalCount !== expectedDisposals) {
      throw new Error(
        `Expected ${expectedDisposals} disposed lab instances after re-entry, received ${final.disposalCount}`,
      );
    }
    if (final.modelSource !== 'asset' || final.error) {
      throw new Error(`Final re-entry failed: ${JSON.stringify(final)}`);
    }
    if (
      diagnostics.consoleErrors.length > 0 ||
      diagnostics.pageErrors.length > 0 ||
      diagnostics.failedRuntimeRequests.length > 0 ||
      diagnostics.externalRequests.length > 0
    ) {
      throw new Error(
        `Browser diagnostics were not clean: ${JSON.stringify(diagnostics)}`,
      );
    }

    const report = {
      schemaVersion: 1,
      auditId: 'npc-performance-002',
      viewport: { width: 1280, height: 720 },
      renderer: 'Chromium ANGLE SwiftShader',
      baseUrl,
      captures,
      reentry: {
        disposalBeforeReentry,
        disposalAfterReentry: final.disposalCount,
        finalModelId: final.modelId,
        finalModelSource: final.modelSource,
        finalError: final.error ?? null,
      },
      diagnostics,
    };
    const reportPath = resolve(evidenceRoot, 'capture-report.json');
    await writeFile(reportPath, `${JSON.stringify(report, undefined, 2)}\n`);
    console.log(
      `Captured ${captures.length} evidence images and ${relative(projectRoot, reportPath)}.`,
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
  const state = await snapshot(page);
  if (state.modelSource !== 'asset' || state.error) {
    throw new Error(
      `Model ${id} did not load cleanly: ${JSON.stringify(state)}`,
    );
  }
}

async function pose(
  page: Page,
  selection: string,
  normalizedTime: number,
  view: CharacterAnimationLabView,
): Promise<void> {
  const accepted = await page.evaluate(
    ({ nextSelection, nextTime, nextView }) => {
      const lab = window.__VANTA_ANIMATION_LAB__!;
      lab.setCrossFade(0);
      const result = lab.selectAnimation(nextSelection);
      lab.setPlaying(false);
      lab.setNormalizedTime(nextTime);
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
    { nextSelection: selection, nextTime: normalizedTime, nextView: view },
  );
  if (!accepted)
    throw new Error(`Animation selection was rejected: ${selection}`);
  await waitForRenderedFrame(page);
  const state = await snapshot(page);
  if (
    state.selection !== selection.slice(selection.indexOf(':') + 1) ||
    state.view !== view ||
    Math.abs(state.normalizedTime - normalizedTime) > 0.01
  ) {
    throw new Error(`Pose did not settle: ${JSON.stringify(state)}`);
  }
}

async function capture(page: Page, filename: string) {
  const path = resolve(evidenceRoot, filename);
  const body = await page.locator('.game-render-canvas').screenshot({
    path,
    animations: 'disabled',
  });
  return {
    path: relative(projectRoot, path),
    sha256: createHash('sha256').update(body).digest('hex'),
    snapshot: evidenceSnapshot(await snapshot(page)),
  };
}

function evidenceSnapshot(state: CharacterAnimationLabSnapshot) {
  return {
    modelId: state.modelId ?? null,
    modelSource: state.modelSource,
    selection: state.selection,
    selectionKind: state.selectionKind,
    view: state.view,
    playing: state.playing,
    loop: state.loop,
    normalizedTime: round(state.normalizedTime),
    duration: round(state.duration),
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

function monitor(page: Page) {
  const result = {
    consoleErrors: [] as string[],
    pageErrors: [] as string[],
    failedRequests: [] as string[],
    failedRuntimeRequests: [] as string[],
    externalRequests: [] as string[],
  };
  page.on('console', (message) => {
    if (message.type() === 'error') result.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => result.pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    const summary = `${request.method()} ${request.url()}`;
    result.failedRequests.push(summary);
    if (request.method() !== 'HEAD') result.failedRuntimeRequests.push(summary);
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      url.origin !== new URL(baseUrl).origin &&
      !['data:', 'blob:'].includes(url.protocol)
    ) {
      result.externalRequests.push(`${request.method()} ${request.url()}`);
    }
  });
  return result;
}

function slug(selection: string): string {
  return selection
    .slice(selection.indexOf(':') + 1)
    .replace(/^HumanArmature\|/, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
