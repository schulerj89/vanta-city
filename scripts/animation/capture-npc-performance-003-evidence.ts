import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from '@playwright/test';
import type {
  CharacterAnimationLabBridge,
  CharacterAnimationLabView,
} from '../../src/sandbox/scenarios/characterAnimationLab';

declare global {
  interface Window {
    __VANTA_ANIMATION_LAB__?: CharacterAnimationLabBridge;
  }
}

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const evidenceRoot = resolve(
  projectRoot,
  'docs/screenshots/npc-performance-003',
);
const baseUrl = process.env.VANTA_AUDIT_BASE_URL ?? 'http://127.0.0.1:4174';

type CaptureSpec = readonly [
  string,
  string,
  number,
  CharacterAnimationLabView,
  string,
];

const neutralCaptures: readonly CaptureSpec[] = [
  'npc-worker',
  'npc-hoodie',
  'npc-punk',
].flatMap((id): CaptureSpec[] => [
  [id, 'logical:idle', 0.35, 'front', `${id}-neutral-full-body.png`],
  [
    id,
    'logical:idle',
    0.35,
    'close-up-three-quarter',
    `${id}-neutral-medium-close-up.png`,
  ],
]);

const captures: readonly CaptureSpec[] = [
  ['casual', 'logical:interact', 0.55, 'front', 'rook-interact-full-body.png'],
  [
    'casual',
    'logical:wave',
    0.5,
    'close-up-three-quarter',
    'rook-wave-medium-close-up.png',
  ],
  ...neutralCaptures,
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
  const evidence: object[] = [];
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

    for (const [id, selection, normalizedTime, view, filename] of captures) {
      await page.evaluate(
        (modelId) => window.__VANTA_ANIMATION_LAB__!.selectModel(modelId),
        id,
      );
      await page.waitForFunction(
        (modelId) =>
          window.__VANTA_ANIMATION_LAB__?.snapshot().modelId === modelId &&
          window.__VANTA_ANIMATION_LAB__?.snapshot().ready === true,
        id,
      );
      const accepted = await page.evaluate(
        ({ selection, normalizedTime, view }) => {
          const lab = window.__VANTA_ANIMATION_LAB__!;
          lab.setCrossFade(0);
          const result = lab.selectAnimation(selection);
          lab.setPlaying(false);
          lab.setNormalizedTime(normalizedTime);
          lab.setView(view);
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
        { selection, normalizedTime, view },
      );
      if (!accepted) throw new Error(`Rejected ${id} ${selection}`);
      await page.evaluate(
        () =>
          new Promise<void>((resolveFrame) =>
            requestAnimationFrame(() =>
              requestAnimationFrame(() => resolveFrame()),
            ),
          ),
      );
      const path = resolve(evidenceRoot, filename);
      const body = await page
        .locator('.game-render-canvas')
        .screenshot({ path });
      const snapshot = await page.evaluate(() =>
        window.__VANTA_ANIMATION_LAB__!.snapshot(),
      );
      evidence.push({
        path: relative(projectRoot, path),
        sha256: createHash('sha256').update(body).digest('hex'),
        modelId: snapshot.modelId,
        modelSource: snapshot.modelSource,
        selection: snapshot.selection,
        view: snapshot.view,
        normalizedTime: Number(snapshot.normalizedTime.toFixed(3)),
        performanceProfileId: snapshot.performanceProfileId,
        performanceIntents: snapshot.performanceIntents,
      });
    }
    if (
      diagnostics.consoleErrors.length > 0 ||
      diagnostics.pageErrors.length > 0 ||
      diagnostics.failedRuntimeRequests.length > 0 ||
      diagnostics.externalRequests.length > 0
    ) {
      throw new Error(
        `Browser diagnostics failed: ${JSON.stringify(diagnostics)}`,
      );
    }
    await writeFile(
      resolve(evidenceRoot, 'capture-report.json'),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          taskId: 'NPC-PERFORMANCE-003',
          viewport: { width: 1280, height: 720 },
          renderer: 'Chromium ANGLE SwiftShader',
          evidence,
          diagnostics,
        },
        undefined,
        2,
      )}\n`,
    );
    console.log(`Captured ${evidence.length} NPC-PERFORMANCE-003 images.`);
  } finally {
    await context.close();
    await browser.close();
  }
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

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
