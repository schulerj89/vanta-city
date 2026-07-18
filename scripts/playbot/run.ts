import { chromium } from '@playwright/test';
import type {
  Browser,
  ConsoleMessage,
  Page,
  Request,
  Response,
} from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { cpus, freemem, platform, release, totalmem } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { performance as nodePerformance } from 'node:perf_hooks';
import {
  createRunId,
  directorySize,
  enforceRetention,
  enforceRunSize,
  formatBytes,
  parsePlaybotOptions,
  playbotLimits,
  renderHumanSummary,
  writeJsonFile,
} from './core';
import type {
  CapabilityResult,
  CapabilityStatus,
  RetentionResult,
  SummarySource,
} from './core';

interface PublicGameState {
  readonly capturedAt: string;
  readonly testBridgePresent: boolean;
  readonly canvas: {
    readonly connected: boolean;
    readonly width: number;
    readonly height: number;
  };
  readonly location: string | undefined;
  readonly health: {
    readonly current: number | undefined;
    readonly maximum: number | undefined;
  };
  readonly money: string | undefined;
  readonly quickbar: readonly {
    readonly label: string | undefined;
    readonly selected: boolean;
    readonly owned: boolean;
  }[];
  readonly vehicle: string | undefined;
  readonly interactionPrompt: string | undefined;
  readonly dialogs: readonly string[];
  readonly minimap: string | undefined;
  readonly helpControls: readonly string[];
  readonly domNodes: number;
  readonly resources: number;
}

interface PerformanceCapture {
  readonly durationMs: number;
  readonly renderedFrames: number;
  readonly averageFps: number;
  readonly frameTimeP95Ms: number;
  readonly frameTimeMaxMs: number;
  readonly usedJsHeapSize: number | undefined;
  readonly totalJsHeapSize: number | undefined;
  readonly jsHeapSizeLimit: number | undefined;
  readonly resourceTransferBytes: number;
  readonly resourceDecodedBytes: number;
  readonly domNodes: number;
  readonly webgl: {
    readonly renderer: string | undefined;
    readonly vendor: string | undefined;
  };
}

interface TimelineEntry {
  readonly elapsedMs: number;
  readonly action: string;
  readonly detail: string;
  readonly state: PublicGameState;
}

interface BrowserFaults {
  readonly consoleErrors: string[];
  readonly pageErrors: string[];
  readonly failedRequests: string[];
  readonly expectedHeadAborts: string[];
  readonly httpErrors: string[];
  readonly externalRequests: string[];
}

interface SessionReport {
  readonly id: string;
  readonly kind: 'critical-path' | 'seeded-exploration';
  readonly seed: number | undefined;
  readonly status: 'passed' | 'failed';
  readonly durationMs: number;
  readonly timelinePath: string;
  readonly diagnosticsPath: string;
  readonly videoPath: string | undefined;
  readonly screenshots: readonly string[];
  readonly initialState: PublicGameState | undefined;
  readonly finalState: PublicGameState | undefined;
  readonly performance: PerformanceCapture | undefined;
  readonly faults: BrowserFaults;
  readonly failure: string | undefined;
}

interface RunReport {
  readonly schemaVersion: 1;
  readonly runId: string;
  status: 'passed' | 'issues' | 'failed';
  readonly gitSha: string;
  readonly startedAt: string;
  completedAt: string;
  durationMs: number;
  artifactBytes: number;
  readonly artifactDirectory: string;
  readonly options: {
    readonly seeds: readonly number[];
    readonly headed: boolean;
    readonly skipBuild: boolean;
    readonly maximumRunMs: number;
  };
  readonly environment: {
    readonly platform: string;
    readonly release: string;
    readonly node: string;
    readonly cpu: string;
    readonly logicalCpus: number;
    readonly totalMemoryBytes: number;
    readonly freeMemoryBytesAtStart: number;
    readonly production: true;
    readonly renderer: 'ANGLE SwiftShader';
  };
  readonly commands: {
    readonly run: string;
    readonly build: string;
    readonly preview: string;
    readonly reproduce: string;
  };
  readonly sessions: SessionReport[];
  capabilities: CapabilityResult[];
  findings: string[];
  readonly botErrors: string[];
  retentionBefore: RetentionResult;
  retentionAfter: RetentionResult | undefined;
  prunedArtifacts: readonly string[];
}

interface SessionEvidence {
  moved: boolean;
  pickerOpened: boolean;
  helpOpened: boolean;
  equipmentInputs: boolean;
  combatInputs: boolean;
  paused: boolean;
  restored: boolean;
  vehicleEntered: boolean;
  vehicleExited: boolean;
  prompts: Set<string>;
  dialogs: Set<string>;
  helpControls: Set<string>;
}

interface RuntimeHandles {
  browser?: Browser;
  server?: ChildProcess;
  build?: ChildProcess;
}

const reportRoot = resolve(process.cwd(), 'reports/playbot');
const actionSet = [
  'move-forward',
  'move-backward',
  'move-left',
  'move-right',
  'orbit-left',
  'orbit-right',
  'mouse-orbit',
  'interact',
  'knife',
  'use-equipment',
  'punch',
  'kick',
  'roll',
  'pause-cycle',
  'picker-cycle',
] as const;

async function main(): Promise<void> {
  const options = parsePlaybotOptions(process.argv.slice(2));
  const gitSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  }).trim();
  const startedAt = new Date();
  const runId = createRunId(startedAt, gitSha, process.pid);
  const runDirectory = join(reportRoot, runId);
  await mkdir(runDirectory, { recursive: true });
  const retentionBefore = await enforceRetention(reportRoot, {
    currentRunId: runId,
  });
  const seedArgument = options.seeds.join(',');
  const reproduce = `pnpm playtest:bot -- --seeds=${seedArgument}`;
  const report: RunReport = {
    schemaVersion: 1,
    runId,
    status: 'passed',
    gitSha,
    startedAt: startedAt.toISOString(),
    completedAt: startedAt.toISOString(),
    durationMs: 0,
    artifactBytes: 0,
    artifactDirectory: relative(process.cwd(), runDirectory),
    options: {
      seeds: options.seeds,
      headed: options.headed,
      skipBuild: options.skipBuild,
      maximumRunMs: playbotLimits.maximumRunMs,
    },
    environment: {
      platform: platform(),
      release: release(),
      node: process.version,
      cpu: cpus()[0]?.model ?? 'unknown',
      logicalCpus: cpus().length,
      totalMemoryBytes: totalmem(),
      freeMemoryBytesAtStart: freemem(),
      production: true,
      renderer: 'ANGLE SwiftShader',
    },
    commands: {
      run: 'pnpm playtest:bot',
      build: 'pnpm build',
      preview: 'pnpm preview --host 127.0.0.1 --port <ephemeral> --strictPort',
      reproduce,
    },
    sessions: [],
    capabilities: [],
    findings: [],
    botErrors: [],
    retentionBefore,
    retentionAfter: undefined,
    prunedArtifacts: [],
  };
  const handles: RuntimeHandles = {};
  const controller = new AbortController();
  const started = nodePerformance.now();
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const interrupt = (signal: NodeJS.Signals) => {
    controller.abort(new Error(`Playbot interrupted by ${signal}`));
  };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);

  try {
    deadline = setTimeout(
      () => controller.abort(new Error('Playbot exceeded five-minute limit')),
      playbotLimits.maximumRunMs,
    );
    if (!options.skipBuild) {
      await runCommand(
        ['build'],
        join(runDirectory, 'build.log'),
        controller.signal,
        (child) => {
          handles.build = child;
        },
      );
      handles.build = undefined;
    }
    const port = await findFreePort();
    handles.server = await startPreview(
      port,
      join(runDirectory, 'preview.log'),
      controller.signal,
    );
    const baseUrl = `http://127.0.0.1:${port}`;
    handles.browser = await chromium.launch({
      headless: !options.headed,
      args: [
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-precise-memory-info',
        '--disable-background-timer-throttling',
      ],
    });
    const evidence = emptyEvidence();
    report.sessions.push(
      await runSession({
        browser: handles.browser,
        baseUrl,
        runDirectory,
        id: 'critical-path',
        kind: 'critical-path',
        evidence,
        signal: controller.signal,
      }),
    );
    for (const seed of options.seeds) {
      report.sessions.push(
        await runSession({
          browser: handles.browser,
          baseUrl,
          runDirectory,
          id: `exploration-${seed}`,
          kind: 'seeded-exploration',
          seed,
          evidence,
          signal: controller.signal,
        }),
      );
    }
    report.capabilities = buildCapabilities(evidence);
  } catch (error) {
    report.botErrors.push(formatError(error));
    report.status = 'failed';
  } finally {
    if (deadline) clearTimeout(deadline);
    controller.abort();
    await handles.browser?.close().catch(() => undefined);
    await stopChild(handles.server);
    await stopChild(handles.build);
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }

  report.completedAt = new Date().toISOString();
  report.durationMs = nodePerformance.now() - started;
  report.findings = buildFindings(report);
  if (
    report.status !== 'failed' &&
    report.sessions.some(({ status }) => status === 'failed')
  ) {
    report.status = 'failed';
  } else if (
    (report.status !== 'failed' &&
      report.sessions.some(
        ({ faults }) =>
          faults.consoleErrors.length > 0 ||
          faults.pageErrors.length > 0 ||
          faults.failedRequests.length > 0 ||
          faults.httpErrors.length > 0 ||
          faults.externalRequests.length > 0,
      )) ||
    report.sessions.some(
      ({ performance }) =>
        performance !== undefined && performance.averageFps < 50,
    )
  ) {
    report.status = 'issues';
  }
  await writeJsonFile(join(runDirectory, 'report.json'), report);
  const initialSize = await enforceRunSize(reportRoot, runDirectory);
  report.prunedArtifacts = initialSize.removed;
  report.artifactBytes = await directorySize(runDirectory);
  await writeReportAndSummary(report, runDirectory, reproduce);
  const finalSize = await enforceRunSize(reportRoot, runDirectory);
  report.prunedArtifacts = [
    ...new Set([...report.prunedArtifacts, ...finalSize.removed]),
  ];
  report.artifactBytes = await directorySize(runDirectory);
  report.retentionAfter = await enforceRetention(reportRoot, {
    currentRunId: runId,
  });
  await writeStableOutputs(report, runDirectory, reproduce);

  console.log(
    `Playbot ${report.status}: ${runId} in ${(report.durationMs / 1_000).toFixed(2)}s, ${formatBytes(report.artifactBytes)}`,
  );
  console.log(
    `Report: ${relative(process.cwd(), join(runDirectory, 'report.json'))}`,
  );
  console.log(
    `Latest: ${relative(process.cwd(), join(reportRoot, 'latest.json'))}`,
  );
  if (report.status === 'failed') process.exitCode = 1;
}

async function runSession(options: {
  readonly browser: Browser;
  readonly baseUrl: string;
  readonly runDirectory: string;
  readonly id: string;
  readonly kind: SessionReport['kind'];
  readonly seed?: number;
  readonly evidence: SessionEvidence;
  readonly signal: AbortSignal;
}): Promise<SessionReport> {
  const sessionStarted = nodePerformance.now();
  const sessionDirectory = join(options.runDirectory, options.id);
  const videoDirectory = join(sessionDirectory, 'video');
  await mkdir(videoDirectory, { recursive: true });
  const context = await options.browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: videoDirectory, size: { width: 1280, height: 720 } },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12_000);
  const faults = observeFaults(page, options.baseUrl);
  const timeline: TimelineEntry[] = [];
  const screenshots: string[] = [];
  let initialState: PublicGameState | undefined;
  let finalState: PublicGameState | undefined;
  let performanceCapture: PerformanceCapture | undefined;
  let failure: string | undefined;
  let videoPath: string | undefined;
  const video = page.video();
  const record = async (action: string, detail: string) => {
    throwIfAborted(options.signal);
    const state = await capturePublicState(page);
    timeline.push({
      elapsedMs: nodePerformance.now() - sessionStarted,
      action,
      detail,
      state,
    });
    if (state.interactionPrompt)
      options.evidence.prompts.add(state.interactionPrompt);
    for (const dialog of state.dialogs) options.evidence.dialogs.add(dialog);
    for (const control of state.helpControls)
      options.evidence.helpControls.add(control);
    return state;
  };
  const screenshot = async (name: string) => {
    if (screenshots.length >= 16) return;
    const path = join(
      sessionDirectory,
      `${String(screenshots.length + 1).padStart(2, '0')}-${name}.png`,
    );
    await page.screenshot({ path });
    screenshots.push(relative(options.runDirectory, path));
  };

  try {
    throwIfAborted(options.signal);
    await page.goto(options.baseUrl, { waitUntil: 'domcontentloaded' });
    await page
      .locator('canvas.game-render-canvas')
      .waitFor({ state: 'visible' });
    await page.locator('.location-hud__coordinates').waitFor({
      state: 'visible',
    });
    initialState = await record(
      'boot-ready',
      'Production canvas and public HUD visible',
    );
    if (initialState.testBridgePresent) {
      throw new Error(
        'Development browser bridge appeared in production playtest',
      );
    }
    await screenshot('boot-ready');
    if (options.kind === 'critical-path') {
      await runCriticalPath(page, options.evidence, record, screenshot);
    } else {
      await runSeededExploration(
        page,
        options.seed!,
        record,
        screenshot,
        faults,
      );
    }
    finalState = await record(
      'session-complete',
      'Final public state captured',
    );
    performanceCapture = await capturePerformance(page, 1_500);
    if (performanceCapture.averageFps < 50) {
      await screenshot('anomaly-low-fps');
    }
  } catch (error) {
    failure = formatError(error);
    await screenshot('anomaly').catch(() => undefined);
    finalState = await capturePublicState(page).catch(() => undefined);
  } finally {
    await writeJsonFile(join(sessionDirectory, 'timeline.json'), timeline);
    await writeJsonFile(join(sessionDirectory, 'diagnostics.json'), {
      initialState,
      finalState,
      performance: performanceCapture,
      faults,
      failure,
    });
    await context.close();
    if (video) {
      const absoluteVideo = await video.path().catch(() => undefined);
      if (absoluteVideo)
        videoPath = relative(options.runDirectory, absoluteVideo);
    }
  }
  return {
    id: options.id,
    kind: options.kind,
    seed: options.seed,
    status: failure ? 'failed' : 'passed',
    durationMs: nodePerformance.now() - sessionStarted,
    timelinePath: relative(
      options.runDirectory,
      join(sessionDirectory, 'timeline.json'),
    ),
    diagnosticsPath: relative(
      options.runDirectory,
      join(sessionDirectory, 'diagnostics.json'),
    ),
    videoPath,
    screenshots,
    initialState,
    finalState,
    performance: performanceCapture,
    faults,
    failure,
  };
}

async function runCriticalPath(
  page: Page,
  evidence: SessionEvidence,
  record: (action: string, detail: string) => Promise<PublicGameState>,
  screenshot: (name: string) => Promise<void>,
): Promise<void> {
  await page.getByRole('button', { name: 'Help' }).click();
  await page.getByRole('dialog', { name: 'Controls' }).waitFor();
  const controls = await page.locator('#controls-help dd').allTextContents();
  controls.forEach((control) => evidence.helpControls.add(control));
  evidence.helpOpened = true;
  await record(
    'help-open',
    `${controls.length} public control labels discovered`,
  );
  await screenshot('help-open');
  await page.getByRole('button', { name: 'Close controls help' }).click();
  await page
    .getByRole('dialog', { name: 'Controls' })
    .waitFor({ state: 'hidden' });

  await page.keyboard.press('KeyK');
  await page.getByRole('dialog', { name: 'Choose your character' }).waitFor();
  evidence.pickerOpened = true;
  await record(
    'picker-open',
    'Character picker opened through public keyboard input',
  );
  await screenshot('picker-open');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog', { name: 'Choose your character' }).waitFor({
    state: 'hidden',
  });

  const beforeVehicle = await capturePublicState(page);
  const beforePosition = parsePosition(beforeVehicle.location);
  await holdKey(page, 'KeyD', 350);
  const afterCalibration = await record(
    'movement-calibration',
    'Held D for 350ms using public keyboard input',
  );
  const calibratedPosition = parsePosition(afterCalibration.location);
  const towardVehicle =
    beforePosition &&
    calibratedPosition &&
    calibratedPosition.x < beforePosition.x
      ? 'KeyA'
      : 'KeyD';
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const prompt = await visibleText(page, '.interaction-prompt');
    if (prompt?.includes('Enter')) break;
    await holdKey(page, towardVehicle, 350);
    await record(
      'approach-vehicle',
      `Held ${towardVehicle} for 350ms (step ${attempt + 1})`,
    );
  }
  const prompt = await visibleText(page, '.interaction-prompt');
  if (prompt?.includes('Enter')) {
    evidence.prompts.add(prompt);
    await page.keyboard.press('KeyG');
    const vehicleHud = page.locator('.vehicle-hud');
    await vehicleHud.waitFor({ state: 'visible' });
    evidence.vehicleEntered = true;
    evidence.moved = true;
    await record('vehicle-enter', `Activated public prompt: ${prompt}`);
    await screenshot('vehicle-enter');
    await holdKey(page, 'KeyW', 750);
    await record('vehicle-drive', 'Held W for 750ms while driving');
    await screenshot('vehicle-drive');
    await page.keyboard.press('KeyP');
    await nextFrames(page, 2);
    evidence.paused = true;
    await record('pause', 'Pressed P while driving');
    await screenshot('vehicle-paused');
    await page.keyboard.press('KeyP');
    await nextFrames(page, 2);
    await page.keyboard.press('KeyX');
    await nextFrames(page, 2);
    await record(
      'vehicle-recover',
      'Pressed X through the public recovery binding',
    );
    await page.keyboard.press('KeyG');
    await vehicleHud.waitFor({ state: 'hidden' });
    evidence.vehicleExited = true;
    evidence.restored = true;
    await record('vehicle-exit', 'Pressed G and restored on-foot HUD');
    await screenshot('vehicle-exit');
  } else {
    const before = parsePosition(beforeVehicle.location);
    const after = parsePosition((await capturePublicState(page)).location);
    evidence.moved = !!before && !!after && distance(before, after) > 0.1;
    await record(
      'vehicle-not-reached',
      'No Enter vehicle prompt in bounded route',
    );
  }

  await page.keyboard.press('Digit2');
  await nextFrames(page, 2);
  await page.keyboard.press('KeyU');
  await nextFrames(page, 2);
  evidence.equipmentInputs = true;
  await record(
    'equipment',
    'Selected knife and invoked the public use binding',
  );
  await screenshot('equipment');
  for (const key of ['KeyJ', 'KeyL', 'KeyB']) {
    await page.keyboard.press(key);
    await nextFrames(page, 2);
  }
  evidence.combatInputs = true;
  await record('combat-inputs', 'Exercised punch, kick, and roll bindings');

  const canvas = page.locator('canvas.game-render-canvas');
  const box = await canvas.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 120,
      box.y + box.height / 2 - 30,
      {
        steps: 6,
      },
    );
    await page.mouse.up();
    await nextFrames(page, 2);
    await record(
      'mouse-camera',
      'Dragged the production canvas with public mouse input',
    );
  }
}

async function runSeededExploration(
  page: Page,
  seed: number,
  record: (action: string, detail: string) => Promise<PublicGameState>,
  screenshot: (name: string) => Promise<void>,
  faults: BrowserFaults,
): Promise<void> {
  const random = seededRandom(seed);
  let priorSignature = signature(await capturePublicState(page));
  let priorFaultCount = faultCount(faults);
  for (let step = 0; step < 18; step += 1) {
    const action = actionSet[Math.floor(random() * actionSet.length)];
    await performExplorationAction(page, action, random);
    const state = await record(
      `seeded:${action}`,
      `Seed ${seed}, step ${step + 1} of 18`,
    );
    const nextSignature = signature(state);
    if (nextSignature !== priorSignature) {
      await screenshot(`transition-${step + 1}-${action}`);
      priorSignature = nextSignature;
    }
    if (faultCount(faults) > priorFaultCount) {
      await screenshot(`anomaly-${step + 1}`);
      priorFaultCount = faultCount(faults);
    }
  }
}

async function performExplorationAction(
  page: Page,
  action: (typeof actionSet)[number],
  random: () => number,
): Promise<void> {
  const duration = 240 + Math.floor(random() * 360);
  switch (action) {
    case 'move-forward':
      return holdKey(page, 'KeyW', duration);
    case 'move-backward':
      return holdKey(page, 'KeyS', duration);
    case 'move-left':
      return holdKey(page, 'KeyA', duration);
    case 'move-right':
      return holdKey(page, 'KeyD', duration);
    case 'orbit-left':
      return holdKey(page, 'KeyQ', duration);
    case 'orbit-right':
      return holdKey(page, 'KeyE', duration);
    case 'interact':
      await page.keyboard.press('KeyG');
      return nextFrames(page, 2);
    case 'knife':
      await page.keyboard.press('Digit2');
      return nextFrames(page, 2);
    case 'use-equipment':
      await page.keyboard.press('KeyU');
      return nextFrames(page, 2);
    case 'punch':
      await page.keyboard.press('KeyJ');
      return nextFrames(page, 2);
    case 'kick':
      await page.keyboard.press('KeyL');
      return nextFrames(page, 2);
    case 'roll':
      await page.keyboard.press('KeyB');
      return nextFrames(page, 2);
    case 'pause-cycle':
      await page.keyboard.press('KeyP');
      await nextFrames(page, 2);
      await page.keyboard.press('KeyP');
      return nextFrames(page, 2);
    case 'picker-cycle': {
      await page.keyboard.press('KeyK');
      await nextFrames(page, 2);
      await page.keyboard.press('Escape');
      return nextFrames(page, 2);
    }
    case 'mouse-orbit': {
      const box = await page.locator('canvas.game-render-canvas').boundingBox();
      if (!box) return;
      const x = box.x + box.width * (0.35 + random() * 0.3);
      const y = box.y + box.height * (0.35 + random() * 0.3);
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + random() * 140 - 70, y + random() * 80 - 40, {
        steps: 4,
      });
      await page.mouse.up();
      return nextFrames(page, 2);
    }
  }
}

async function capturePublicState(page: Page): Promise<PublicGameState> {
  return page.evaluate<PublicGameState>(`(() => {
    const visibleText = (selector) => {
      const element = document.querySelector(selector);
      return element && !element.hidden
        ? element.textContent?.trim() || undefined
        : undefined;
    };
    const numberAttribute = (element, name) => {
      const raw = element?.getAttribute(name);
      if (raw === null || raw === undefined) return undefined;
      const value = Number(raw);
      return Number.isFinite(value) ? value : undefined;
    };
    const canvas = document.querySelector('canvas.game-render-canvas');
    const health = document.querySelector('[aria-label="Player health"]');
    return {
      capturedAt: new Date().toISOString(),
      testBridgePresent: '__VANTA_TEST__' in window,
      canvas: {
        connected: canvas?.isConnected ?? false,
        width: canvas?.width ?? 0,
        height: canvas?.height ?? 0,
      },
      location: visibleText('.location-hud__coordinates'),
      health: {
        current: numberAttribute(health, 'aria-valuenow'),
        maximum: numberAttribute(health, 'aria-valuemax'),
      },
      money: visibleText('[aria-label="Player money"]'),
      quickbar: [...document.querySelectorAll('.quickbar__slot')].map((slot) => ({
        label: slot.getAttribute('aria-label') ?? undefined,
        selected: slot.getAttribute('aria-current') === 'true',
        owned: slot.dataset.owned === 'true',
      })),
      vehicle: document
        .querySelector('.vehicle-hud:not([hidden])')
        ?.getAttribute('aria-label') ?? undefined,
      interactionPrompt: visibleText('.interaction-prompt'),
      dialogs: [...document.querySelectorAll('[role="dialog"]')]
        .filter((element) => !element.hidden)
        .map((element) =>
          element.getAttribute('aria-label') ??
          element.getAttribute('aria-labelledby') ??
          element.textContent?.trim().slice(0, 120) ??
          'dialog'
        ),
      minimap: document
        .querySelector('.minimap-hud__map')
        ?.getAttribute('aria-label') ?? undefined,
      helpControls: [...document.querySelectorAll('#controls-help dd')]
        .map((element) => element.textContent?.trim() ?? ''),
      domNodes: document.getElementsByTagName('*').length,
      resources: performance.getEntriesByType('resource').length,
    };
  })()`);
}

async function capturePerformance(
  page: Page,
  durationMs: number,
): Promise<PerformanceCapture> {
  return page.evaluate<PerformanceCapture>(`new Promise((resolveCapture) => {
    const duration = ${JSON.stringify(durationMs)};
    const started = performance.now();
    const frames = [];
    const sample = (now) => {
      frames.push(now);
      if (now - started < duration) {
        requestAnimationFrame(sample);
        return;
      }
      const intervals = frames.slice(1).map((value, index) => value - frames[index]);
      const sorted = [...intervals].sort((left, right) => left - right);
      const elapsed = Math.max(1, (frames.at(-1) ?? started) - frames[0]);
      const memory = performance.memory;
      const resources = performance.getEntriesByType('resource');
      const canvas = document.querySelector('canvas.game-render-canvas');
      const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
      const debug = gl?.getExtension('WEBGL_debug_renderer_info');
      resolveCapture({
        durationMs: elapsed,
        renderedFrames: frames.length,
        averageFps: ((frames.length - 1) / elapsed) * 1000,
        frameTimeP95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
        frameTimeMaxMs: sorted.at(-1) ?? 0,
        usedJsHeapSize: memory?.usedJSHeapSize,
        totalJsHeapSize: memory?.totalJSHeapSize,
        jsHeapSizeLimit: memory?.jsHeapSizeLimit,
        resourceTransferBytes: resources.reduce(
          (total, resource) => total + (resource.transferSize ?? 0), 0
        ),
        resourceDecodedBytes: resources.reduce(
          (total, resource) => total + (resource.decodedBodySize ?? 0), 0
        ),
        domNodes: document.getElementsByTagName('*').length,
        webgl: {
          renderer: gl && debug
            ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL))
            : undefined,
          vendor: gl && debug
            ? String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL))
            : undefined,
        },
      });
    };
    requestAnimationFrame(sample);
  })`);
}

function observeFaults(page: Page, baseUrl: string): BrowserFaults {
  const faults: BrowserFaults = {
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    expectedHeadAborts: [],
    httpErrors: [],
    externalRequests: [],
  };
  const origin = new URL(baseUrl).origin;
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') faults.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error: Error) => faults.pageErrors.push(error.message));
  page.on('request', (request: Request) => {
    if (new URL(request.url()).origin !== origin)
      faults.externalRequests.push(`${request.method()} ${request.url()}`);
  });
  page.on('requestfailed', (request: Request) => {
    const failure = `${request.method()} ${request.url()} — ${request.failure()?.errorText ?? 'unknown failure'}`;
    if (
      request.method() === 'HEAD' &&
      request.failure()?.errorText.includes('ERR_ABORTED')
    ) {
      faults.expectedHeadAborts.push(failure);
    } else {
      faults.failedRequests.push(failure);
    }
  });
  page.on('response', (response: Response) => {
    if (response.status() >= 400)
      faults.httpErrors.push(`${response.status()} ${response.url()}`);
  });
  return faults;
}

function buildCapabilities(evidence: SessionEvidence): CapabilityResult[] {
  const controls = evidence.helpControls;
  const capability = (
    id: string,
    status: CapabilityStatus,
    ...items: string[]
  ): CapabilityResult => ({ id, status, evidence: items });
  return [
    capability(
      'boot',
      'exercised',
      'Production canvas and public HUD reached.',
    ),
    capability(
      'movement',
      evidence.moved ? 'exercised' : 'available',
      evidence.moved
        ? 'Public location coordinates changed after keyboard movement.'
        : 'Movement bindings were listed in Help but bounded route evidence was inconclusive.',
    ),
    capability(
      'interaction',
      evidence.prompts.size > 0 ? 'exercised' : 'available',
      evidence.prompts.size > 0
        ? `Observed prompts: ${[...evidence.prompts].join(', ')}`
        : 'Interact / talk is registered in Help; no prompt was reached.',
    ),
    capability(
      'dialogue',
      [...evidence.dialogs].some((dialog) => /dialogue/i.test(dialog))
        ? 'exercised'
        : 'unavailable',
      'No production dialogue target or Dialogue surface was observed on this base.',
    ),
    capability(
      'combat',
      evidence.combatInputs ? 'partial' : 'available',
      evidence.combatInputs
        ? 'Public punch, kick, roll, and equipment inputs were sent; no production hostile target is registered.'
        : 'Combat inputs are listed in Help; no target evidence was produced.',
    ),
    capability(
      'equipment',
      evidence.equipmentInputs ? 'exercised' : 'available',
      evidence.equipmentInputs
        ? 'Knife selection/use was exercised and quickbar state was recorded.'
        : 'Production quickbar was visible.',
    ),
    capability(
      'pickup',
      'unavailable',
      'No production pickup prompt or pickup control surface is registered; the cash pickup remains development-only.',
    ),
    capability(
      'mission',
      'unavailable',
      controls.has('Open mission')
        ? 'A mission control label appeared but no mission state was observed.'
        : 'No mission action, objective panel, or production mission state is registered.',
    ),
    capability(
      'vehicle',
      evidence.vehicleEntered ? 'exercised' : 'available',
      evidence.vehicleEntered
        ? `Vehicle entered${evidence.vehicleExited ? ', driven, recovered, and exited with on-foot restoration.' : ' but not exited.'}`
        : 'Vehicle recovery and interaction bindings are registered; bounded route did not enter it.',
    ),
    capability(
      'map',
      'unavailable',
      'The north-up minimap is visible, but no full-map action or modal is registered.',
    ),
    capability(
      'pause',
      evidence.paused ? 'exercised' : 'available',
      evidence.paused
        ? 'Pause/resume input was exercised during the critical path.'
        : 'Pause / resume is registered in Help.',
    ),
    capability(
      'restoration',
      evidence.restored ? 'exercised' : 'partial',
      evidence.restored
        ? 'Picker/help and vehicle transitions restored the production HUD and on-foot state.'
        : 'Picker/help closure was exercised; vehicle restoration was not reached.',
    ),
  ];
}

function buildFindings(report: RunReport): string[] {
  const findings: string[] = [];
  for (const session of report.sessions) {
    if (session.failure) findings.push(`${session.id}: ${session.failure}`);
    if (session.faults.consoleErrors.length > 0)
      findings.push(
        `${session.id}: ${session.faults.consoleErrors.length} browser console error(s).`,
      );
    if (session.faults.pageErrors.length > 0)
      findings.push(
        `${session.id}: ${session.faults.pageErrors.length} uncaught page error(s).`,
      );
    if (session.faults.failedRequests.length > 0)
      findings.push(
        `${session.id}: ${session.faults.failedRequests.length} failed request(s).`,
      );
    if (session.faults.httpErrors.length > 0)
      findings.push(
        `${session.id}: ${session.faults.httpErrors.length} HTTP error response(s).`,
      );
    if (session.faults.externalRequests.length > 0)
      findings.push(
        `${session.id}: ${session.faults.externalRequests.length} unexpected external request(s).`,
      );
    if (session.performance && session.performance.averageFps < 50) {
      findings.push(
        `${session.id}: sampled ${session.performance.averageFps.toFixed(1)} FPS, below the 50 FPS sustained reference.`,
      );
    }
  }
  if (report.botErrors.length > 0) findings.push(...report.botErrors);
  if (findings.length === 0)
    findings.push(
      'No uncaught browser, request, or bot failures were recorded.',
    );
  return findings;
}

function emptyEvidence(): SessionEvidence {
  return {
    moved: false,
    pickerOpened: false,
    helpOpened: false,
    equipmentInputs: false,
    combatInputs: false,
    paused: false,
    restored: false,
    vehicleEntered: false,
    vehicleExited: false,
    prompts: new Set(),
    dialogs: new Set(),
    helpControls: new Set(),
  };
}

function summarySource(
  report: RunReport,
  reproductionCommand: string,
): SummarySource {
  const consoleErrors = report.sessions.reduce(
    (total, session) => total + session.faults.consoleErrors.length,
    0,
  );
  const pageErrors = report.sessions.reduce(
    (total, session) => total + session.faults.pageErrors.length,
    0,
  );
  const failedRequests = report.sessions.reduce(
    (total, session) => total + session.faults.failedRequests.length,
    0,
  );
  return {
    runId: report.runId,
    status: report.status,
    gitSha: report.gitSha,
    startedAt: report.startedAt,
    durationMs: report.durationMs,
    seeds: report.options.seeds,
    artifactBytes: report.artifactBytes,
    reproductionCommand,
    capabilities: report.capabilities,
    consoleErrors,
    pageErrors,
    failedRequests,
    findings: report.findings,
    artifactDirectory: report.artifactDirectory,
  };
}

async function writeReportAndSummary(
  report: RunReport,
  runDirectory: string,
  reproductionCommand: string,
): Promise<void> {
  await writeJsonFile(join(runDirectory, 'report.json'), report);
  await writeFile(
    join(runDirectory, 'summary.md'),
    renderHumanSummary(summarySource(report, reproductionCommand)),
  );
}

async function writeStableOutputs(
  report: RunReport,
  runDirectory: string,
  reproductionCommand: string,
): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await writeReportAndSummary(report, runDirectory, reproductionCommand);
    await writeJsonFile(join(reportRoot, 'latest.json'), report);
    await writeFile(
      join(reportRoot, 'latest.md'),
      renderHumanSummary(summarySource(report, reproductionCommand)),
    );
    const runBytes = await directorySize(runDirectory);
    const totalBytes = await directorySize(reportRoot);
    if (
      report.artifactBytes === runBytes &&
      report.retentionAfter?.totalBytes === totalBytes
    ) {
      return;
    }
    report.artifactBytes = runBytes;
    if (!report.retentionAfter) {
      throw new Error('Retention metadata was unavailable during finalization');
    }
    report.retentionAfter = { ...report.retentionAfter, totalBytes };
  }
  throw new Error('Playbot artifact metadata did not stabilize');
}

async function runCommand(
  args: readonly string[],
  logPath: string,
  signal: AbortSignal,
  register: (child: ChildProcess) => void,
): Promise<void> {
  const child = spawn(pnpmCommand(), args, {
    cwd: process.cwd(),
    detached: process.platform !== 'win32',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  register(child);
  const log = createWriteStream(logPath);
  child.stdout?.pipe(log, { end: false });
  child.stderr?.pipe(log, { end: false });
  const abort = () => void stopChild(child);
  signal.addEventListener('abort', abort, { once: true });
  const exitCode = await new Promise<number>((resolveExit, rejectExit) => {
    child.once('error', rejectExit);
    child.once('exit', (code) => resolveExit(code ?? 1));
  });
  signal.removeEventListener('abort', abort);
  log.end();
  if (exitCode !== 0)
    throw new Error(`pnpm ${args.join(' ')} exited ${exitCode}`);
}

async function startPreview(
  port: number,
  logPath: string,
  signal: AbortSignal,
): Promise<ChildProcess> {
  const child = spawn(
    pnpmCommand(),
    ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    {
      cwd: process.cwd(),
      detached: process.platform !== 'win32',
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const log = createWriteStream(logPath);
  child.stdout?.pipe(log, { end: false });
  child.stderr?.pipe(log, { end: false });
  const abort = () => void stopChild(child);
  signal.addEventListener('abort', abort, { once: true });
  child.once('exit', () => {
    signal.removeEventListener('abort', abort);
    log.end();
  });
  await waitForHttp(`http://127.0.0.1:${port}`, child, signal);
  return child;
}

async function waitForHttp(
  url: string,
  child: ChildProcess,
  signal: AbortSignal,
): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    throwIfAborted(signal);
    if (child.exitCode !== null)
      throw new Error(
        `Production preview exited ${child.exitCode} before ready`,
      );
    try {
      const response = await fetch(url, { signal });
      if (response.ok) return;
    } catch (error) {
      if (signal.aborted) throw error;
    }
    await delay(200);
  }
  throw new Error('Production preview did not become ready within 30 seconds');
}

async function stopChild(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null || !child.pid) return;
  const signalGroup = (signal: NodeJS.Signals) => {
    try {
      if (process.platform === 'win32') child.kill(signal);
      else process.kill(-child.pid!, signal);
    } catch {
      // Process already exited.
    }
  };
  signalGroup('SIGTERM');
  const exited = await Promise.race([
    new Promise<boolean>((resolveExit) =>
      child.once('exit', () => resolveExit(true)),
    ),
    delay(1_500).then(() => false),
  ]);
  if (!exited) signalGroup('SIGKILL');
}

async function findFreePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', () => resolveListen());
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Unable to allocate preview port');
  await new Promise<void>((resolveClose, rejectClose) =>
    server.close((error) => (error ? rejectClose(error) : resolveClose())),
  );
  return address.port;
}

async function holdKey(
  page: Page,
  key: string,
  durationMs: number,
): Promise<void> {
  await page.keyboard.down(key);
  await delay(durationMs);
  await page.keyboard.up(key);
  await nextFrames(page, 2);
}

async function nextFrames(page: Page, count: number): Promise<void> {
  await page.evaluate<void>(`new Promise((resolveFrames) => {
    let remaining = ${JSON.stringify(count)};
    const next = () => {
      remaining -= 1;
      if (remaining <= 0) resolveFrames();
      else requestAnimationFrame(next);
    };
    requestAnimationFrame(next);
  })`);
}

async function visibleText(
  page: Page,
  selector: string,
): Promise<string | undefined> {
  return page
    .locator(`${selector}:not([hidden])`)
    .textContent()
    .then(
      (value) => value?.trim() || undefined,
      () => undefined,
    );
}

function parsePosition(
  value: string | undefined,
): { x: number; z: number } | undefined {
  if (!value) return undefined;
  const match = /X ([+-]?\d+(?:\.\d+)?).*Z ([+-]?\d+(?:\.\d+)?)/.exec(value);
  if (!match) return undefined;
  const x = Number(match[1]);
  const z = Number(match[2]);
  return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : undefined;
}

function distance(
  left: { x: number; z: number },
  right: { x: number; z: number },
): number {
  return Math.hypot(left.x - right.x, left.z - right.z);
}

function signature(state: PublicGameState): string {
  return JSON.stringify({
    prompt: state.interactionPrompt,
    dialogs: state.dialogs,
    vehicle: state.vehicle,
    quickbar: state.quickbar.map(({ selected }) => selected),
    health: state.health.current,
  });
}

function faultCount(faults: BrowserFaults): number {
  return (
    faults.consoleErrors.length +
    faults.pageErrors.length +
    faults.failedRequests.length +
    faults.httpErrors.length +
    faults.externalRequests.length
  );
}

function seededRandom(seed: number): () => number {
  let state = seed || 0x9e37_79b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason ?? new Error('Playbot aborted');
}

function pnpmCommand(): string {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

function formatError(error: unknown): string {
  return error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error);
}

void main().catch((error: unknown) => {
  console.error(formatError(error));
  process.exitCode = 1;
});
