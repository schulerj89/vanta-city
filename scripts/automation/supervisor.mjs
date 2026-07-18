#!/usr/bin/env node

import { spawn } from 'node:child_process';
import {
  access,
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  acquireDirectoryLock,
  appendBoundedRun,
  assertStateShape,
  atomicWriteJson,
  canCleanTask,
  createEmptyState,
  isPidAlive,
  patchEquivalentFromCherryOutput,
  readJson,
  readyRoadmapTasks,
  taskBranchName,
  taskWorktreeName,
  validateAssignments,
} from './supervisor-lib.mjs';

const REPO_ROOT = path.resolve(
  fileURLToPath(new URL('../..', import.meta.url)),
);
const ROADMAP_PATH = path.join(
  REPO_ROOT,
  'coordination/game-orchestrator.json',
);
const SCHEMA_ROOT = path.join(REPO_ROOT, 'coordination/schemas');
const DEFAULT_CODEX = '/Applications/ChatGPT.app/Contents/Resources/codex';
const ACTIVE_STATUSES = new Set([
  'preparing',
  'running',
  'complete',
  'integrating',
  'integrated-local',
  'integrated',
  'blocked',
  'failed',
  'interrupted',
]);
const children = new Set();
let stopping = false;
let wakeDaemon = null;

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function isoForPath() {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function durationSeconds(startedAt) {
  return Math.round((Date.now() - startedAt) / 100) / 10;
}

function supervisorSettings(config) {
  const local = config.automation.localSupervisor ?? {};
  return {
    codexPath: local.codexPath ?? DEFAULT_CODEX,
    pnpmPath: local.pnpmPath ?? process.env.VANTA_PNPM_PATH ?? 'pnpm',
    nodeModulesStrategy: local.nodeModulesStrategy ?? 'apfs-clone-main',
    maxConcurrentWorkers: Math.min(
      4,
      Math.max(1, local.maxConcurrentWorkers ?? 4),
    ),
    plannerTimeoutMs: (local.plannerTimeoutMinutes ?? 5) * 60_000,
    workerTimeoutMs: (local.workerTimeoutMinutes ?? 40) * 60_000,
    integratorTimeoutMs: (local.integratorTimeoutMinutes ?? 40) * 60_000,
    staleLockMs: (local.staleLockMinutes ?? 60) * 60_000,
    retainedRuns: local.retainedRuns ?? 40,
    plannerModel:
      local.plannerModel ??
      config.automation.orchestrator.model ??
      'gpt-5.6-sol',
    plannerEffort:
      local.plannerReasoningEffort ??
      config.automation.orchestrator.reasoningEffort ??
      'xhigh',
    workerModel:
      local.workerModel ??
      config.automation.orchestrator.workerModel ??
      'gpt-5.6-sol',
    workerEffort:
      local.workerReasoningEffort ??
      config.automation.orchestrator.workerReasoningEffort ??
      'medium',
    integratorModel:
      local.integratorModel ??
      config.automation.integrator.model ??
      'gpt-5.6-sol',
    integratorEffort:
      local.integratorReasoningEffort ??
      config.automation.integrator.reasoningEffort ??
      'xhigh',
  };
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function spawnCapture(command, args, options = {}) {
  const startedAt = Date.now();
  const child = spawn(command, args, {
    cwd: options.cwd ?? REPO_ROOT,
    env: options.env ?? process.env,
    stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    detached: options.processGroup === true,
  });
  child.vantaProcessGroup = options.processGroup === true;
  children.add(child);
  options.onSpawn?.(child.pid);
  if (options.input !== undefined) child.stdin.end(options.input);

  const stdoutLimit = options.stdoutLimitBytes ?? 4 * 1024 * 1024;
  const stderrLimit = options.stderrLimitBytes ?? 1024 * 1024;
  let stdout = '';
  let stderr = '';
  let stdoutTruncated = false;
  let stderrTruncated = false;
  const appendBounded = (current, chunk, limit) => {
    const next = current + chunk;
    if (Buffer.byteLength(next) <= limit)
      return { value: next, truncated: false };
    return {
      value: Buffer.from(next).subarray(-limit).toString('utf8'),
      truncated: true,
    };
  };
  child.stdout.on('data', (chunk) => {
    const next = appendBounded(stdout, chunk, stdoutLimit);
    stdout = next.value;
    stdoutTruncated ||= next.truncated;
  });
  child.stderr.on('data', (chunk) => {
    const next = appendBounded(stderr, chunk, stderrLimit);
    stderr = next.value;
    stderrTruncated ||= next.truncated;
  });

  let timedOut = false;
  const timeout = options.timeoutMs
    ? setTimeout(() => {
        timedOut = true;
        terminateChild(child, 'SIGTERM');
        setTimeout(() => terminateChild(child, 'SIGKILL'), 5_000).unref();
      }, options.timeoutMs)
    : null;
  timeout?.unref();

  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (timeout) clearTimeout(timeout);
      children.delete(child);
      resolve({
        code,
        signal,
        timedOut,
        stdout,
        stderr,
        stdoutTruncated,
        stderrTruncated,
        durationSeconds: durationSeconds(startedAt),
      });
    });
  });
}

function terminateChild(child, signal) {
  if (!child?.pid) return;
  if (child.vantaProcessGroup) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Fall back to the direct child when the process group has already ended.
    }
  }
  child.kill(signal);
}

async function run(command, args, options = {}) {
  const result = await spawnCapture(command, args, options);
  if (result.code !== 0 && !options.allowFailure) {
    const detail = (result.stderr || result.stdout).trim().slice(-4_000);
    throw new Error(
      `${path.basename(command)} ${args.join(' ')} failed (${result.code}): ${detail}`,
    );
  }
  return result;
}

async function git(args, options = {}) {
  return run('git', args, { cwd: REPO_ROOT, ...options });
}

async function gitText(args, options = {}) {
  return (await git(args, options)).stdout.trim();
}

async function gitCommonDir() {
  const common = await gitText(['rev-parse', '--git-common-dir']);
  return path.resolve(REPO_ROOT, common);
}

async function runtimePaths(mode) {
  const stateRoot = path.join(await gitCommonDir(), 'vanta-orchestration');
  const runId = `${isoForPath()}-${mode}-${process.pid}`;
  return {
    stateRoot,
    statePath: path.join(stateRoot, 'state.json'),
    lockPath: path.join(stateRoot, 'supervisor.lock'),
    runRoot: path.join(stateRoot, 'runs', runId),
    runId,
  };
}

async function loadConfig() {
  return JSON.parse(await readFile(ROADMAP_PATH, 'utf8'));
}

async function loadState(statePath) {
  return assertStateShape(
    await readJson(statePath, createEmptyState(new Date().toISOString())),
  );
}

async function saveState(statePath, state) {
  state.updatedAt = new Date().toISOString();
  await atomicWriteJson(statePath, state);
}

function parseWorktreePorcelain(output) {
  const entries = [];
  let current = null;
  for (const line of output.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current) entries.push(current);
      current = { path: line.slice('worktree '.length) };
    } else if (current && line.startsWith('HEAD ')) {
      current.head = line.slice('HEAD '.length);
    } else if (current && line.startsWith('branch ')) {
      current.branch = line.slice('branch refs/heads/'.length);
    } else if (current && line === 'bare') {
      current.bare = true;
    } else if (current && line === 'detached') {
      current.detached = true;
    }
  }
  if (current) entries.push(current);
  return entries;
}

async function listWorktrees() {
  return parseWorktreePorcelain(
    (await git(['worktree', 'list', '--porcelain'])).stdout,
  );
}

async function assertCleanMain({ fetch = true, fastForward = false } = {}) {
  const root = await gitText(['rev-parse', '--show-toplevel']);
  if (path.resolve(root) !== REPO_ROOT)
    throw new Error(`Expected Git root ${REPO_ROOT}, received ${root}.`);
  const branch = await gitText(['branch', '--show-current']);
  if (branch !== 'main') throw new Error(`Expected main, received ${branch}.`);
  const status = await gitText(['status', '--porcelain']);
  if (status)
    throw new Error('Main has uncommitted changes; automation stopped.');
  if (fetch) await git(['fetch', '--quiet', 'origin', 'main']);

  let local = await gitText(['rev-parse', 'main']);
  const remote = await gitText(['rev-parse', 'origin/main']);
  if (local !== remote) {
    const localBehind =
      (
        await git(['merge-base', '--is-ancestor', 'main', 'origin/main'], {
          allowFailure: true,
        })
      ).code === 0;
    const localAhead =
      (
        await git(['merge-base', '--is-ancestor', 'origin/main', 'main'], {
          allowFailure: true,
        })
      ).code === 0;
    if (localBehind && fastForward) {
      await git(['merge', '--ff-only', 'origin/main']);
      local = await gitText(['rev-parse', 'main']);
    } else if (!localAhead) {
      throw new Error('Local main and origin/main have diverged.');
    } else if (!fastForward) {
      throw new Error('Local main is not synchronized with origin/main.');
    }
  }
  return { local, remote: await gitText(['rev-parse', 'origin/main']) };
}

function codexArgs({
  model,
  effort,
  sandbox,
  cwd,
  schema,
  finalPath,
  ephemeral = false,
  networkAccess = false,
}) {
  return [
    'exec',
    ...(ephemeral ? ['--ephemeral'] : []),
    '--strict-config',
    '--ignore-user-config',
    '--disable',
    'multi_agent',
    '--json',
    '--color',
    'never',
    '--output-schema',
    schema,
    '--output-last-message',
    finalPath,
    '--model',
    model,
    '--config',
    `model_reasoning_effort="${effort}"`,
    '--config',
    'approval_policy="never"',
    ...(networkAccess
      ? ['--config', 'sandbox_workspace_write.network_access=true']
      : []),
    '--sandbox',
    sandbox,
    '--cd',
    cwd,
    '-',
  ];
}

async function runCodex({
  settings,
  model,
  effort,
  sandbox,
  cwd,
  schema,
  prompt,
  runRoot,
  name,
  timeoutMs,
  ephemeral,
  onSpawn,
  environment = {},
  networkAccess = false,
}) {
  await mkdir(runRoot, { recursive: true });
  const finalPath = path.join(runRoot, `${name}.final.json`);
  const eventsPath = path.join(runRoot, `${name}.events.jsonl`);
  const stderrPath = path.join(runRoot, `${name}.stderr.log`);
  const result = await spawnCapture(
    settings.codexPath,
    codexArgs({
      model,
      effort,
      sandbox,
      cwd,
      schema,
      finalPath,
      ephemeral,
      networkAccess,
    }),
    {
      cwd,
      env: {
        ...process.env,
        PATH: `${path.dirname(settings.pnpmPath)}:${process.env.PATH ?? '/usr/bin:/bin'}`,
        ...environment,
      },
      timeoutMs,
      onSpawn,
      input: prompt,
      processGroup: true,
      stdoutLimitBytes: 20 * 1024 * 1024,
      stderrLimitBytes: 4 * 1024 * 1024,
    },
  );
  await Promise.all([
    atomicWriteText(eventsPath, result.stdout),
    atomicWriteText(stderrPath, result.stderr),
  ]);
  const final = await readJson(finalPath, null);
  return { ...result, final, finalPath, eventsPath, stderrPath };
}

async function atomicWriteText(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, content);
  await rename(temporaryPath, filePath);
}

function activeTaskStates(state) {
  return Object.values(state.tasks).filter((task) =>
    ACTIVE_STATUSES.has(task.status),
  );
}

async function recoverInterruptedTasks(state) {
  for (const task of Object.values(state.tasks)) {
    if (!['preparing', 'running'].includes(task.status)) continue;
    if (isPidAlive(task.workerPid)) continue;
    const final = task.finalPath ? await readJson(task.finalPath, null) : null;
    const registered = (await listWorktrees()).some(
      (entry) => path.resolve(entry.path) === path.resolve(task.worktree),
    );
    const clean = registered
      ? !(await gitText(['-C', task.worktree, 'status', '--porcelain']))
      : false;
    const head = registered
      ? await gitText(['-C', task.worktree, 'rev-parse', 'HEAD'])
      : null;
    if (
      final?.status === 'complete' &&
      final.taskId === task.taskId &&
      clean &&
      head &&
      head !== task.baseSha
    ) {
      task.status = 'complete';
      task.commit = head;
      task.result = final;
      task.finishedAt = new Date().toISOString();
    } else {
      task.status = 'interrupted';
      task.finishedAt = new Date().toISOString();
      task.lastError =
        'Worker process ended before a verified clean completion.';
    }
    delete task.workerPid;
  }
}

function plannerPrompt({ config, candidates, active, capacity }) {
  return `You are the xhigh planning lead for Vanta City. This is a read-only planning pass.

Repository: ${REPO_ROOT}
Authoritative roadmap: ${ROADMAP_PATH}
Capacity available now: ${capacity}

Read AGENTS.md and the complete roadmap. Inspect current public architecture only as needed. Select at most ${capacity} tasks from the candidate list below. Do not edit files, create branches or worktrees, run paid provider calls, or implement anything.

Selection rules:
- Select only candidate IDs supplied below; dependency readiness is already filtered.
- Prefer four independent ownership areas when possible.
- Avoid tasks with overlapping files, public contracts, UI zones, camera/input ownership, world geometry, or test infrastructure in the same wave.
- For a task with a named skill, read that complete SKILL.md during this xhigh pass and make the scope carry its design or creative decisions into the medium implementation handoff. UI work must receive the required xhigh design brief before implementation.
- Be explicit about validation and overlap risks.
- It is valid to return no assignments when a safe parallel wave does not exist.

Active or awaiting-integration work:
${JSON.stringify(active, null, 2)}

Dependency-ready candidates:
${JSON.stringify(candidates, null, 2)}

Project vision and constraints:
${JSON.stringify({
  vision: config.project.vision,
  creativeBoundary: config.project.creativeBoundary,
  productRules: config.productRules,
  performanceBudgets: config.performanceBudgets,
})}

Return only the structured response required by the output schema.`;
}

function workerPrompt({ task, assignment, branch, worktree, baseSha }) {
  const skillRequirement = task.skill
    ? `This task explicitly requires the ${task.skill} skill. Read its complete SKILL.md and follow it before task actions.`
    : task.requiresUiDesign
      ? 'This task changes player-facing UI. Use the vanta-ui-art-director skill and complete its design-review contract.'
      : 'Use any repository-required skill triggered by the task scope.';
  return `You are the bounded implementation worker for ${task.id}: ${task.title}.

FIRST, run these guards before reading or editing anything:
1. cd ${worktree}
2. Verify git rev-parse --show-toplevel equals exactly ${worktree}.
3. Verify git branch --show-current equals exactly ${branch}.
4. Verify git rev-parse HEAD equals exactly ${baseSha} at the start.
5. Verify git status --short --branch is clean.
Stop without editing and report blocked if any guard fails.

Read AGENTS.md and coordination/game-orchestrator.json completely. ${skillRequirement}

Task definition:
${JSON.stringify(task, null, 2)}

Planning decision:
${JSON.stringify(assignment, null, 2)}

Operating contract:
- Work only in ${worktree}; never edit, merge, or push main.
- Preserve authoritative lifecycle, input, game-state, camera, transform, collision, asset, debug, HUD, and test contracts. Do not add duplicate listeners or compatibility layers for unshipped abstractions.
- Keep scope bounded to the task acceptance criteria. Do not add unrelated gameplay.
- Runtime assets must be production-intended, local, CC0/public-domain/original, and documented with provenance. Do not use network-loaded runtime assets or placeholders as acceptance evidence.
- The worktree node_modules directory is an isolated APFS clone. Do not run pnpm install or change dependencies. If a new dependency is genuinely required, document it and report blocked.
- Read secrets only from ${REPO_ROOT}/.env when this task explicitly requires an approved provider. Never print, copy, stage, log, screenshot, serialize, or expose secret values.
- Use apply_patch for edits. Inspect existing APIs and tests before implementing.
- For visual work, inspect the live browser and console and retain meaningful screenshots in the documented repo location.
- Validate proportionally while iterating, then run the repository-required completion tier. Do not delete regression coverage to make checks faster.
- Do not stage or commit. The deterministic supervisor owns Git metadata because the worker sandbox owns only this worktree. Finish with a focused, reviewable working-tree diff and report commit as null.

Return only the structured response required by the output schema. A complete result is accepted only when the process exits successfully, HEAD remains ${baseSha}, a non-empty reviewable diff exists, checks are reported, and commit is null. The supervisor will then validate and create the focused commit.`;
}

function integrationReviewPrompt({ candidates, remoteSha }) {
  return `You are the xhigh integration reviewer for Vanta City. This pass is read-only.

Main repository: ${REPO_ROOT}
Expected starting main/origin SHA: ${remoteSha}

FIRST verify the exact Git root, branch main, HEAD, and clean status. Read AGENTS.md and coordination/game-orchestrator.json completely.

Completed worker candidates:
${JSON.stringify(candidates, null, 2)}

Review each candidate before integration: commit history, changed files, public APIs, tests, validation evidence, architecture notes, asset/physics/transform/debug assumptions, and overlap with main and other candidates. Do not merge merely because a worker compiled.

Approve only clean, committed, validated candidates that form a coherent wave. Prefer one authoritative concept and identify every conceptual or mechanical overlap. Defer anything incomplete, failing, incompatible, or too risky for the remaining window.

Do not edit files, create worktrees, stage, commit, merge, run paid providers, or push. The deterministic supervisor will create a dedicated integration worktree and cherry-pick only approved task IDs.

Return only the structured response required by the output schema.`;
}

function integrationApplyPrompt({ candidates, baseSha, branch, worktree }) {
  return `You are the xhigh integration lead for Vanta City. Approved worker commits have already been cherry-picked by the deterministic supervisor into a dedicated integration worktree.

Integration worktree: ${worktree}
Integration branch: ${branch}
Base main SHA: ${baseSha}

FIRST verify the exact Git root is ${worktree}, the branch is ${branch}, HEAD descends from ${baseSha}, and Git history remains unchanged during your work. Read AGENTS.md and coordination/game-orchestrator.json completely.

Cherry-picked candidates:
${JSON.stringify(candidates, null, 2)}

Inspect the combined diff and resolve conceptual overlap deliberately. Prefer one authoritative system; do not hide incompatible unshipped abstractions behind adapters. You may edit files in this integration worktree, but do not stage, commit, merge, alter Git history, push, or edit main. The deterministic supervisor owns Git metadata and publication.

For each integrated task:
- Run formatting, linting, type-checking, unit tests, relevant asset validators, production build and bundle size, changed-feature browser tests, and smoke coverage. Skip the complete E2E suite in this hourly pass.
- Update that roadmap task to completed and update executionState in coordination/game-orchestrator.json.
- Leave a reviewable working-tree diff for integration corrections and metadata. Report commit as out of scope; the supervisor will commit.

All supplied candidates were approved in the read-only review. If the combined result cannot integrate all of them safely, report blocked and explain why instead of partially claiming success.

Return only the structured response required by the output schema.`;
}

async function runDeterministicIntegrationChecks({
  settings,
  worktree,
  baseSha,
  taskIds,
  runRoot,
}) {
  const validationMap = JSON.parse(
    await readFile(
      path.join(REPO_ROOT, 'coordination/validation-map.json'),
      'utf8',
    ),
  );
  const committedPaths = splitNull(
    (
      await git([
        '-C',
        worktree,
        'diff',
        '--name-only',
        '-z',
        `${baseSha}..HEAD`,
      ])
    ).stdout,
  );
  const workingPaths = await changedWorktreePaths(worktree);
  const changedPaths = [...new Set([...committedPaths, ...workingPaths])];
  const commands = [...validationMap.always];

  for (const validator of validationMap.assetValidators) {
    if (
      changedPaths.some((filePath) =>
        validator.pathPatterns.some((pattern) => filePath.includes(pattern)),
      )
    )
      commands.splice(-1, 0, {
        id: `asset-${validator.id}`,
        args: validator.args,
        timeoutMinutes: 3,
      });
  }
  const targetedFiles = [
    ...new Set(taskIds.flatMap((taskId) => validationMap.tasks[taskId] ?? [])),
  ];
  if (targetedFiles.length > 0)
    commands.splice(-1, 0, {
      id: 'targeted-browser',
      executable: 'playwright',
      args: targetedFiles,
      timeoutMinutes: 8,
      browser: true,
    });

  const results = [];
  for (const command of commands) {
    const args =
      command.executable === 'playwright'
        ? ['exec', 'playwright', 'test', ...command.args]
        : ['run', ...command.args];
    const result = await run(settings.pnpmPath, args, {
      cwd: worktree,
      env: {
        ...process.env,
        PATH: `${path.dirname(settings.pnpmPath)}:${process.env.PATH ?? '/usr/bin:/bin'}`,
        ...(command.browser ? { VANTA_E2E_PORT: '4295' } : {}),
      },
      timeoutMs: command.timeoutMinutes * 60_000,
      allowFailure: true,
      processGroup: command.browser === true,
      stdoutLimitBytes: 8 * 1024 * 1024,
      stderrLimitBytes: 2 * 1024 * 1024,
    });
    const logPath = path.join(runRoot, `validation-${command.id}.log`);
    await atomicWriteText(
      logPath,
      `${result.stdout}\n${result.stderr}`.trimStart(),
    );
    results.push({
      id: command.id,
      command: `${settings.pnpmPath} ${args.join(' ')}`,
      exitCode: result.code,
      timedOut: result.timedOut,
      durationSeconds: result.durationSeconds,
      logPath,
    });
    if (result.code !== 0)
      return {
        passed: false,
        results,
        error: `${command.id} failed${result.timedOut ? ' by timeout' : ''}; see ${logPath}`,
      };
  }
  return { passed: true, results };
}

async function prepareWorktree(config, task, baseSha) {
  const branch = taskBranchName(task);
  const worktree = path.join(
    config.project.worktreeRoot,
    taskWorktreeName(task),
  );
  const worktrees = await listWorktrees();
  if (
    worktrees.some(
      (entry) => path.resolve(entry.path) === path.resolve(worktree),
    )
  )
    throw new Error(`Worktree already registered: ${worktree}`);
  if (await exists(worktree))
    throw new Error(`Unregistered path already exists: ${worktree}`);
  if (
    (
      await git(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], {
        allowFailure: true,
      })
    ).code === 0
  )
    throw new Error(`Branch already exists: ${branch}`);

  await mkdir(config.project.worktreeRoot, { recursive: true });
  await git(['worktree', 'add', '-b', branch, worktree, baseSha]);
  await provisionNodeModules(worktree);
  return { branch, worktree };
}

async function provisionNodeModules(worktree) {
  const sourceModules = path.join(REPO_ROOT, 'node_modules');
  const targetModules = path.join(worktree, 'node_modules');
  if (!(await exists(sourceModules)))
    throw new Error(
      'Main node_modules is missing; run pnpm install before automation.',
    );
  const clone = await run('cp', ['-cR', sourceModules, targetModules], {
    allowFailure: true,
  });
  if (clone.code !== 0)
    throw new Error(
      `Could not create an APFS clone of node_modules: ${(clone.stderr || clone.stdout).trim()}`,
    );
}

async function filterDispatchableCandidates(config, candidates) {
  const worktrees = await listWorktrees();
  const registeredBranches = new Set(
    worktrees.map((entry) => entry.branch).filter(Boolean),
  );
  const registeredPaths = new Set(
    worktrees.map((entry) => path.resolve(entry.path)),
  );
  const accepted = [];
  const blocked = [];

  for (const task of candidates) {
    const branch = taskBranchName(task);
    const worktree = path.join(
      config.project.worktreeRoot,
      taskWorktreeName(task),
    );
    const branchExists =
      registeredBranches.has(branch) ||
      (
        await git(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], {
          allowFailure: true,
        })
      ).code === 0;
    const pathExists =
      registeredPaths.has(path.resolve(worktree)) || (await exists(worktree));
    const taskCommit = await gitText(
      [
        'log',
        '--all',
        '--fixed-strings',
        `--grep=${task.id}`,
        '--format=%H',
        '-n',
        '1',
      ],
      { allowFailure: true },
    );
    if (branchExists || pathExists || taskCommit) {
      blocked.push({
        taskId: task.id,
        reasons: [
          ...(branchExists ? [`branch exists: ${branch}`] : []),
          ...(pathExists ? [`worktree path exists: ${worktree}`] : []),
          ...(taskCommit ? [`matching commit exists: ${taskCommit}`] : []),
        ],
      });
    } else {
      accepted.push(task);
    }
  }
  return { accepted, blocked };
}

async function evaluateWorker(taskState, result) {
  const report = result.final;
  const registered = (await listWorktrees()).some(
    (entry) => path.resolve(entry.path) === path.resolve(taskState.worktree),
  );
  if (!registered) {
    return {
      status: 'failed',
      error: 'Worker worktree is no longer registered.',
    };
  }
  const status = await gitText([
    '-C',
    taskState.worktree,
    'status',
    '--porcelain',
  ]);
  const head = await gitText(['-C', taskState.worktree, 'rev-parse', 'HEAD']);

  if (result.timedOut)
    return {
      status: 'interrupted',
      error: 'Worker exceeded its timeout.',
      head,
    };
  if (result.code !== 0)
    return {
      status: 'failed',
      error: `Codex exited with code ${result.code}.`,
      head,
    };
  if (!report || report.taskId !== taskState.taskId)
    return {
      status: 'failed',
      error: 'Worker final report is missing or mismatched.',
      head,
    };
  if (report.status !== 'complete')
    return { status: report.status, error: report.summary, head, report };
  if (head !== taskState.baseSha)
    return {
      status: 'failed',
      error: 'Worker changed Git history; supervisor commit required.',
      head,
      report,
    };
  if (report.commit !== null)
    return {
      status: 'failed',
      error: 'Worker report must leave commit null.',
      head,
      report,
    };
  if (!status)
    return {
      status: 'failed',
      error: 'Worker reported complete without a diff.',
      head,
      report,
    };

  const changedPaths = await changedWorktreePaths(taskState.worktree);
  const packagingError = await validateWorkerPaths(taskState, changedPaths);
  if (packagingError)
    return { status: 'failed', error: packagingError, head, report };

  const diffCheck = await git(['-C', taskState.worktree, 'diff', '--check'], {
    allowFailure: true,
  });
  if (diffCheck.code !== 0)
    return {
      status: 'failed',
      error: 'Worker diff failed git diff --check.',
      head,
      report,
    };

  try {
    for (let index = 0; index < changedPaths.length; index += 100)
      await git([
        '-C',
        taskState.worktree,
        'add',
        '-A',
        '--',
        ...changedPaths.slice(index, index + 100),
      ]);
    const staged = await gitText([
      '-C',
      taskState.worktree,
      'diff',
      '--cached',
      '--name-only',
    ]);
    if (!staged)
      throw new Error('No staged changes remained after validation.');
    await git([
      '-C',
      taskState.worktree,
      'commit',
      '-m',
      `${taskState.taskId}: ${taskState.title}`,
    ]);
  } catch (error) {
    return {
      status: 'failed',
      error: `Supervisor could not create the worker commit: ${error.message}`,
      head,
      report,
    };
  }

  const committedHead = await gitText([
    '-C',
    taskState.worktree,
    'rev-parse',
    'HEAD',
  ]);
  const clean = !(await gitText([
    '-C',
    taskState.worktree,
    'status',
    '--porcelain',
  ]));
  if (!clean)
    return {
      status: 'failed',
      error: 'Supervisor commit left the worktree dirty.',
      head: committedHead,
      report,
    };
  return { status: 'complete', head: committedHead, report };
}

function splitNull(output) {
  return output.split('\0').filter(Boolean);
}

async function changedWorktreePaths(worktree) {
  const output = (
    await git([
      '-C',
      worktree,
      'status',
      '--porcelain=v1',
      '-z',
      '--untracked-files=all',
    ])
  ).stdout;
  const tokens = splitNull(output);
  const paths = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const record = tokens[index];
    if (record.length < 4 || record[2] !== ' ')
      throw new Error(
        `Malformed porcelain status record: ${record.slice(0, 80)}`,
      );
    paths.push(record.slice(3));
    if (/[RC]/.test(record.slice(0, 2))) {
      index += 1;
      if (tokens[index]) paths.push(tokens[index]);
    }
  }
  return [...new Set(paths)];
}

async function validateWorkerPaths(taskState, changedPaths) {
  const packageJsonAllowed = ['QA-PLAYBOT-001', 'TEST-001'].includes(
    taskState.taskId,
  );
  const denied = changedPaths.find((filePath) => {
    if (filePath === '.git' || filePath.includes('/.git/')) return true;
    if (/(^|\/)(\.env(?:\..*)?)$/.test(filePath) && filePath !== '.env.example')
      return true;
    if (filePath === 'AGENTS.md' || filePath === '.gitmodules') return true;
    if (filePath === 'coordination/game-orchestrator.json') return true;
    if (filePath.startsWith('coordination/schemas/local-')) return true;
    if (filePath.startsWith('scripts/automation/')) return true;
    if (filePath.startsWith('ops/launchd/')) return true;
    if (filePath.startsWith('.github/workflows/')) return true;
    if (filePath === 'pnpm-lock.yaml') return true;
    if (filePath === 'package.json' && !packageJsonAllowed) return true;
    return false;
  });
  if (denied) return `Worker modified protected control-plane path ${denied}.`;

  if (changedPaths.includes('package.json')) {
    const baseline = JSON.parse(
      (
        await git([
          '-C',
          taskState.worktree,
          'show',
          `${taskState.baseSha}:package.json`,
        ])
      ).stdout,
    );
    const current = JSON.parse(
      await readFile(path.join(taskState.worktree, 'package.json'), 'utf8'),
    );
    for (const key of ['dependencies', 'devDependencies', 'packageManager']) {
      if (JSON.stringify(current[key]) !== JSON.stringify(baseline[key]))
        return `Worker changed package.json ${key}; dependency changes require operator review.`;
    }
  }

  const secretPatterns = [
    /sk-[A-Za-z0-9_-]{20,}/,
    /OPENAI_API_KEY\s*=\s*[^$\s"']+/,
    /ELEVENLABS_API_KEY\s*=\s*[^$\s"']+/,
  ];
  for (const filePath of changedPaths) {
    const absolutePath = path.join(taskState.worktree, filePath);
    let info;
    try {
      info = await lstat(absolutePath);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    if (info.isSymbolicLink())
      return `Worker added or changed symlink ${filePath}.`;
    if (info.isFile() && info.size > 95 * 1024 * 1024)
      return `Worker file exceeds the 95 MB safety limit: ${filePath}.`;
    if (info.isFile() && info.size <= 1024 * 1024) {
      const content = await readFile(absolutePath, 'utf8').catch(() => '');
      if (secretPatterns.some((pattern) => pattern.test(content)))
        return `Potential credential material detected in ${filePath}.`;
    }
  }
  return null;
}

async function orchestrate(context) {
  const { config, settings, paths, state } = context;
  const startedAt = Date.now();
  await recoverInterruptedTasks(state);
  const { remote } = await assertCleanMain({ fetch: true, fastForward: false });
  const active = activeTaskStates(state);
  const capacity = Math.max(0, settings.maxConcurrentWorkers - active.length);
  const readiness = readyRoadmapTasks(config.roadmap, state.tasks);
  const dispatchability = await filterDispatchableCandidates(config, readiness);
  const candidates = dispatchability.accepted;

  if (capacity === 0 || candidates.length === 0) {
    const run = {
      id: paths.runId,
      mode: 'orchestrate',
      status: 'no-op',
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date().toISOString(),
      reason:
        capacity === 0
          ? 'worker capacity is full'
          : 'no dependency-ready tasks',
      blockedCandidates: dispatchability.blocked,
    };
    appendBoundedRun(state, run, settings.retainedRuns);
    await saveState(paths.statePath, state);
    print(run);
    return;
  }

  const planning = await runCodex({
    settings,
    model: settings.plannerModel,
    effort: settings.plannerEffort,
    sandbox: 'read-only',
    cwd: REPO_ROOT,
    schema: path.join(SCHEMA_ROOT, 'local-planner-output.schema.json'),
    prompt: plannerPrompt({ config, candidates, active, capacity }),
    runRoot: paths.runRoot,
    name: 'planner',
    timeoutMs: settings.plannerTimeoutMs,
    ephemeral: true,
  });
  if (planning.code !== 0 || !planning.final)
    throw new Error(
      `Planner failed${planning.timedOut ? ' by timeout' : ''}; see ${planning.stderrPath}.`,
    );

  const occupiedOwners = active.map((task) => task.owner).filter(Boolean);
  const validation = validateAssignments({
    assignments: planning.final.assignments,
    candidates,
    maxAssignments: capacity,
    occupiedTaskIds: active.map((task) => task.taskId),
    occupiedOwners,
    occupiedDuplicateKeys: active
      .map((task) => task.duplicateKey)
      .filter(Boolean),
  });

  const prepared = [];
  for (const assignment of validation.accepted) {
    const { branch, worktree } = await prepareWorktree(
      config,
      assignment.task,
      remote,
    );
    const taskState = {
      taskId: assignment.task.id,
      title: assignment.task.title,
      owner: assignment.task.owner ?? null,
      duplicateKey: assignment.task.duplicateKey ?? null,
      status: 'preparing',
      branch,
      worktree,
      baseSha: remote,
      assignment: {
        rationale: assignment.rationale,
        scope: assignment.scope,
        validationFocus: assignment.validationFocus,
        overlapRisks: assignment.overlapRisks,
      },
      startedAt: new Date().toISOString(),
      runId: paths.runId,
    };
    state.tasks[assignment.task.id] = taskState;
    prepared.push({ task: assignment.task, state: taskState });
  }
  await saveState(paths.statePath, state);

  const workerPromises = prepared.map(({ task, state: taskState }, index) => {
    const name = task.id.toLowerCase();
    const finalPath = path.join(paths.runRoot, `${name}.final.json`);
    taskState.status = 'running';
    taskState.finalPath = finalPath;
    return runCodex({
      settings,
      model: settings.workerModel,
      effort: settings.workerEffort,
      sandbox: 'workspace-write',
      cwd: taskState.worktree,
      schema: path.join(SCHEMA_ROOT, 'local-worker-output.schema.json'),
      prompt: workerPrompt({
        task,
        assignment: taskState.assignment,
        branch: taskState.branch,
        worktree: taskState.worktree,
        baseSha: taskState.baseSha,
      }),
      runRoot: paths.runRoot,
      name,
      timeoutMs: settings.workerTimeoutMs,
      ephemeral: false,
      networkAccess: [
        'asset-worker',
        'audio-worker',
        'visual-worker',
        'world-worker',
      ].includes(task.owner),
      environment: { VANTA_E2E_PORT: String(4210 + index) },
      onSpawn: (pid) => {
        taskState.workerPid = pid;
      },
    });
  });
  await saveState(paths.statePath, state);
  const results = await Promise.all(workerPromises);

  const outcomes = [];
  for (let index = 0; index < prepared.length; index += 1) {
    const taskState = prepared[index].state;
    const result = results[index];
    const outcome = await evaluateWorker(taskState, result);
    taskState.status = outcome.status;
    taskState.finishedAt = new Date().toISOString();
    taskState.durationSeconds = result.durationSeconds;
    taskState.commit = outcome.head ?? null;
    taskState.result = outcome.report ?? result.final ?? null;
    taskState.lastError = outcome.error ?? null;
    taskState.logPaths = {
      events: result.eventsPath,
      stderr: result.stderrPath,
      final: result.finalPath,
    };
    delete taskState.workerPid;
    outcomes.push({ taskId: taskState.taskId, ...outcome });
  }

  const run = {
    id: paths.runId,
    mode: 'orchestrate',
    status: outcomes.some((outcome) => outcome.status === 'complete')
      ? 'completed-workers'
      : 'no-complete-workers',
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    durationSeconds: durationSeconds(startedAt),
    plannerSummary: planning.final.summary,
    selectedTaskIds: prepared.map((item) => item.task.id),
    rejectedAssignments: validation.rejected,
    blockedCandidates: dispatchability.blocked,
    outcomes: outcomes.map((outcome) => ({
      taskId: outcome.taskId,
      status: outcome.status,
      head: outcome.head ?? null,
      error: outcome.error ?? null,
    })),
  };
  appendBoundedRun(state, run, settings.retainedRuns);
  await saveState(paths.statePath, state);
  print(run);
}

async function auditIntegrationCandidate(taskState) {
  const worktrees = await listWorktrees();
  const registered = worktrees.some(
    (entry) => path.resolve(entry.path) === path.resolve(taskState.worktree),
  );
  if (!registered)
    return { eligible: false, reason: 'worktree is not registered' };
  if (isPidAlive(taskState.workerPid))
    return { eligible: false, reason: 'worker process is alive' };
  const status = await gitText([
    '-C',
    taskState.worktree,
    'status',
    '--porcelain',
  ]);
  if (status) return { eligible: false, reason: 'worktree is dirty' };
  const head = await gitText(['-C', taskState.worktree, 'rev-parse', 'HEAD']);
  if (!head || head === taskState.baseSha)
    return { eligible: false, reason: 'worktree has no completed commit' };
  return {
    eligible: true,
    taskId: taskState.taskId,
    title: taskState.title,
    branch: taskState.branch,
    worktree: taskState.worktree,
    baseSha: taskState.baseSha,
    commit: head,
    workerReport: taskState.result,
  };
}

async function branchPatchEquivalent(branch, target = 'main') {
  const ancestor = await git(['merge-base', '--is-ancestor', branch, target], {
    allowFailure: true,
  });
  if (ancestor.code === 0) return true;
  const cherry = await gitText(['cherry', target, branch]);
  return patchEquivalentFromCherryOutput(cherry);
}

async function prepareIntegrationWorktree(config, baseSha, runId) {
  const suffix = runId.replace(/[^a-zA-Z0-9-]+/g, '-').slice(0, 72);
  const branch = `integration/auto-${suffix}`;
  const worktree = path.join(
    config.project.worktreeRoot,
    `_integration-${suffix}`,
  );
  if (await exists(worktree))
    throw new Error(`Integration worktree path already exists: ${worktree}`);
  if (
    (
      await git(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], {
        allowFailure: true,
      })
    ).code === 0
  )
    throw new Error(`Integration branch already exists: ${branch}`);
  await mkdir(config.project.worktreeRoot, { recursive: true });
  await git(['worktree', 'add', '-b', branch, worktree, baseSha]);
  await provisionNodeModules(worktree);
  return { branch, worktree };
}

async function reconcilePendingIntegration(state) {
  const pending = state.integration;
  if (pending?.status !== 'pending-push') return null;
  if (await gitText(['status', '--porcelain']))
    throw new Error('Cannot recover pending integration while main is dirty.');
  const local = await gitText(['rev-parse', 'main']);
  if (local !== pending.pendingPushSha)
    throw new Error('Pending integration SHA does not match local main.');
  await git(['fetch', '--quiet', 'origin', 'main']);
  let remote = await gitText(['rev-parse', 'origin/main']);
  if (remote !== pending.pendingPushSha) {
    if (remote !== pending.expectedRemoteSha)
      throw new Error('origin/main moved during pending integration recovery.');
    await git(['push', 'origin', 'main']);
    await git(['fetch', '--quiet', 'origin', 'main']);
    remote = await gitText(['rev-parse', 'origin/main']);
    if (remote !== pending.pendingPushSha)
      throw new Error('Push completed without the expected origin/main SHA.');
  }

  const worktrees = await listWorktrees();
  const registered = worktrees.find(
    (entry) => path.resolve(entry.path) === path.resolve(pending.worktree),
  );
  if (registered) {
    if (registered.branch !== pending.branch)
      throw new Error('Pending integration worktree branch changed.');
    if (registered.head !== pending.pendingPushSha)
      throw new Error('Pending integration worktree HEAD changed.');
    if (await gitText(['-C', pending.worktree, 'status', '--porcelain']))
      throw new Error('Pending integration worktree is dirty.');
    await git(['worktree', 'remove', pending.worktree]);
  }
  const finishedAt = new Date().toISOString();
  for (const taskId of pending.taskIds) {
    state.tasks[taskId].status = 'integrated';
    state.tasks[taskId].pushedAt = finishedAt;
  }
  state.lastIntegration = {
    ...pending,
    status: 'integrated',
    integrationCommit: pending.pendingPushSha,
    finishedAt,
  };
  state.integration = null;
  return pending.taskIds;
}

async function integrate(context) {
  const { config, settings, paths, state } = context;
  const startedAt = Date.now();
  if (state.integration?.status === 'blocked') {
    throw new Error(
      `A preserved integration attempt is blocked at ${state.integration.worktree}: ${state.integration.reason}`,
    );
  }
  await recoverInterruptedTasks(state);
  const recoveredPush = await reconcilePendingIntegration(state);
  if (recoveredPush) {
    const run = {
      id: paths.runId,
      mode: 'integrate',
      status: 'recovered-push',
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date().toISOString(),
      integratedTaskIds: recoveredPush,
    };
    appendBoundedRun(state, run, settings.retainedRuns);
    await saveState(paths.statePath, state);
    print(run);
    return;
  }
  const sync = await assertCleanMain({ fetch: true, fastForward: true });

  const completed = Object.values(state.tasks).filter(
    (task) => task.status === 'complete',
  );
  const audits = await Promise.all(completed.map(auditIntegrationCandidate));
  const candidates = audits.filter((audit) => audit.eligible);
  if (candidates.length === 0) {
    const run = {
      id: paths.runId,
      mode: 'integrate',
      status: 'no-op',
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date().toISOString(),
      pushedTaskIds: [],
      skipped: audits.filter((audit) => !audit.eligible),
    };
    appendBoundedRun(state, run, settings.retainedRuns);
    await saveState(paths.statePath, state);
    print(run);
    return;
  }

  const review = await runCodex({
    settings,
    model: settings.integratorModel,
    effort: settings.integratorEffort,
    sandbox: 'read-only',
    cwd: REPO_ROOT,
    schema: path.join(
      SCHEMA_ROOT,
      'local-integration-review-output.schema.json',
    ),
    prompt: integrationReviewPrompt({ candidates, remoteSha: sync.remote }),
    runRoot: paths.runRoot,
    name: 'integration-review',
    timeoutMs: settings.plannerTimeoutMs,
    ephemeral: true,
  });
  if (review.code !== 0 || !review.final)
    throw new Error(
      `Integration review failed${review.timedOut ? ' by timeout' : ''}; see ${review.stderrPath}.`,
    );

  const candidateIds = new Set(candidates.map((candidate) => candidate.taskId));
  const approvedIds = new Set(review.final.approvedTaskIds);
  for (const taskId of approvedIds) {
    if (!candidateIds.has(taskId))
      throw new Error(`Integration review approved unknown task ${taskId}.`);
  }
  const approved = candidates.filter((candidate) =>
    approvedIds.has(candidate.taskId),
  );
  if (approved.length === 0) {
    const run = {
      id: paths.runId,
      mode: 'integrate',
      status: 'review-deferred-all',
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date().toISOString(),
      summary: review.final.summary,
      deferred: review.final.deferred,
      conflicts: review.final.conflicts,
    };
    appendBoundedRun(state, run, settings.retainedRuns);
    await saveState(paths.statePath, state);
    print(run);
    return;
  }

  const integrationWorktree = await prepareIntegrationWorktree(
    config,
    sync.remote,
    paths.runId,
  );
  state.integration = {
    status: 'preparing',
    ...integrationWorktree,
    baseSha: sync.remote,
    taskIds: approved.map((candidate) => candidate.taskId),
    startedAt: new Date().toISOString(),
    runId: paths.runId,
  };
  for (const candidate of approved)
    state.tasks[candidate.taskId].status = 'integrating';
  await saveState(paths.statePath, state);

  const cherryPicked = [];
  const cherryPickConflicts = [];
  for (const candidate of approved) {
    const pick = await git(
      ['-C', integrationWorktree.worktree, 'cherry-pick', candidate.commit],
      { allowFailure: true },
    );
    if (pick.code !== 0) {
      await git(
        ['-C', integrationWorktree.worktree, 'cherry-pick', '--abort'],
        {
          allowFailure: true,
        },
      );
      cherryPickConflicts.push({
        taskId: candidate.taskId,
        reason: (pick.stderr || pick.stdout).trim().slice(-2_000),
      });
      state.tasks[candidate.taskId].status = 'complete';
      continue;
    }
    cherryPicked.push(candidate);
  }

  if (cherryPicked.length === 0) {
    await git(['worktree', 'remove', integrationWorktree.worktree]);
    state.integration = null;
    const run = {
      id: paths.runId,
      mode: 'integrate',
      status: 'mechanical-conflicts',
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date().toISOString(),
      conflicts: cherryPickConflicts,
    };
    appendBoundedRun(state, run, settings.retainedRuns);
    await saveState(paths.statePath, state);
    print(run);
    return;
  }
  state.integration.status = 'validating';
  state.integration.taskIds = cherryPicked.map((candidate) => candidate.taskId);
  await saveState(paths.statePath, state);

  const cherryHead = await gitText([
    '-C',
    integrationWorktree.worktree,
    'rev-parse',
    'HEAD',
  ]);
  const result = await runCodex({
    settings,
    model: settings.integratorModel,
    effort: settings.integratorEffort,
    sandbox: 'workspace-write',
    cwd: integrationWorktree.worktree,
    schema: path.join(SCHEMA_ROOT, 'local-integrator-output.schema.json'),
    prompt: integrationApplyPrompt({
      candidates: cherryPicked,
      baseSha: sync.remote,
      branch: integrationWorktree.branch,
      worktree: integrationWorktree.worktree,
    }),
    runRoot: paths.runRoot,
    name: 'integration-apply',
    timeoutMs: settings.integratorTimeoutMs,
    ephemeral: true,
  });

  const blockIntegration = async (reason) => {
    state.integration.status = 'blocked';
    state.integration.reason = reason;
    state.integration.finishedAt = new Date().toISOString();
    for (const candidate of cherryPicked)
      state.tasks[candidate.taskId].status = 'integration-blocked';
    await saveState(paths.statePath, state);
    throw new Error(reason);
  };

  if (result.code !== 0 || !result.final)
    await blockIntegration(
      `Integration apply failed${result.timedOut ? ' by timeout' : ''}; see ${result.stderrPath}.`,
    );
  const expectedIds = cherryPicked.map((candidate) => candidate.taskId).sort();
  const reportedIds = [...result.final.integratedTaskIds].sort();
  if (
    result.final.status !== 'integrated' ||
    JSON.stringify(expectedIds) !== JSON.stringify(reportedIds)
  )
    await blockIntegration(
      `Integration apply did not accept the full reviewed set: ${result.final.summary}`,
    );
  const postAgentHead = await gitText([
    '-C',
    integrationWorktree.worktree,
    'rev-parse',
    'HEAD',
  ]);
  if (postAgentHead !== cherryHead)
    await blockIntegration(
      'Integration agent changed Git history; supervisor ownership required.',
    );
  if (
    (
      await git(['-C', integrationWorktree.worktree, 'diff', '--check'], {
        allowFailure: true,
      })
    ).code !== 0
  )
    await blockIntegration('Integration corrections failed git diff --check.');

  const deterministicChecks = await runDeterministicIntegrationChecks({
    settings,
    worktree: integrationWorktree.worktree,
    baseSha: sync.remote,
    taskIds: expectedIds,
    runRoot: paths.runRoot,
  });
  if (!deterministicChecks.passed)
    await blockIntegration(deterministicChecks.error);

  const integratedConfig = JSON.parse(
    await readFile(
      path.join(
        integrationWorktree.worktree,
        'coordination/game-orchestrator.json',
      ),
      'utf8',
    ),
  );
  const roadmapById = new Map(
    integratedConfig.roadmap.map((task) => [task.id, task]),
  );
  for (const taskId of expectedIds) {
    if (roadmapById.get(taskId)?.status !== 'completed')
      await blockIntegration(
        `Roadmap task ${taskId} was not marked completed.`,
      );
  }

  const integrationStatus = await gitText([
    '-C',
    integrationWorktree.worktree,
    'status',
    '--porcelain',
  ]);
  if (integrationStatus) {
    try {
      await git(['-C', integrationWorktree.worktree, 'add', '--all']);
      await git([
        '-C',
        integrationWorktree.worktree,
        'commit',
        '-m',
        `integration: reconcile ${expectedIds.join(', ')}`,
      ]);
    } catch (error) {
      await blockIntegration(
        `Could not commit integration corrections: ${error.message}`,
      );
    }
  }

  if (await gitText(['status', '--porcelain']))
    await blockIntegration(
      'Main changed during integration; refusing to publish.',
    );
  if ((await gitText(['rev-parse', 'main'])) !== sync.remote)
    await blockIntegration(
      'Main moved during integration; refusing to publish.',
    );
  if (
    await gitText(['-C', integrationWorktree.worktree, 'status', '--porcelain'])
  )
    await blockIntegration(
      'Integration worktree is dirty after supervisor commit.',
    );

  await git(['merge', '--ff-only', integrationWorktree.branch]);
  const integrationCommit = await gitText(['rev-parse', 'main']);
  for (const taskId of expectedIds) {
    state.tasks[taskId].status = 'integrated-local';
    state.tasks[taskId].integrationCommit = integrationCommit;
    state.tasks[taskId].integratedAt = new Date().toISOString();
  }
  state.integration.status = 'pending-push';
  state.integration.pendingPushSha = integrationCommit;
  state.integration.expectedRemoteSha = sync.remote;
  await saveState(paths.statePath, state);
  await reconcilePendingIntegration(state);

  const run = {
    id: paths.runId,
    mode: 'integrate',
    status: 'integrated',
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    durationSeconds: durationSeconds(startedAt),
    integratedTaskIds: expectedIds,
    deferredTaskIds: result.final.deferredTaskIds,
    pushed: true,
    summary: result.final.summary,
    conflicts: [
      ...review.final.conflicts,
      ...cherryPickConflicts,
      ...result.final.conflicts,
    ],
    checks: result.final.checks,
    deterministicChecks: deterministicChecks.results,
  };
  appendBoundedRun(state, run, settings.retainedRuns);
  await saveState(paths.statePath, state);
  print(run);
}

async function clean(context) {
  const { config, settings, paths, state } = context;
  const startedAt = Date.now();
  await assertCleanMain({ fetch: true, fastForward: false });
  const worktrees = await listWorktrees();
  const worktreeKibBefore = await sumWorktreeKib(worktrees);
  const registeredPaths = new Set(
    worktrees.map((entry) => path.resolve(entry.path)),
  );
  const removed = [];
  const skipped = [];

  for (const taskState of Object.values(state.tasks)) {
    if (!taskState.worktree) continue;
    const registered = registeredPaths.has(path.resolve(taskState.worktree));
    const entry = worktrees.find(
      (item) => path.resolve(item.path) === path.resolve(taskState.worktree),
    );
    const relativeToRoot = path.relative(
      path.resolve(config.project.worktreeRoot),
      path.resolve(taskState.worktree),
    );
    const underRoot =
      relativeToRoot !== '' &&
      !relativeToRoot.startsWith('..') &&
      !path.isAbsolute(relativeToRoot);
    const cleanStatus = registered
      ? await gitText(['-C', taskState.worktree, 'status', '--porcelain'])
      : 'not-registered';
    const commonDir = registered
      ? path.resolve(
          taskState.worktree,
          await gitText([
            '-C',
            taskState.worktree,
            'rev-parse',
            '--git-common-dir',
          ]),
        )
      : null;
    const integrationPublished = taskState.integrationCommit
      ? (
          await git(
            [
              'merge-base',
              '--is-ancestor',
              taskState.integrationCommit,
              'origin/main',
            ],
            { allowFailure: true },
          )
        ).code === 0
      : false;
    const patchEquivalent =
      registered &&
      underRoot &&
      entry?.branch === taskState.branch &&
      entry?.head === taskState.commit &&
      commonDir === (await gitCommonDir()) &&
      integrationPublished
        ? await branchPatchEquivalent(taskState.branch, 'origin/main')
        : false;
    const processAudit = registered
      ? await processesUsingWorktree(taskState.worktree)
      : { safe: true, references: [], detail: 'worktree is not registered' };
    const decision = canCleanTask(taskState, {
      registered,
      isMain: path.resolve(taskState.worktree) === REPO_ROOT,
      processAlive:
        isPidAlive(taskState.workerPid) ||
        !processAudit.safe ||
        processAudit.references.length > 0,
      clean: cleanStatus === '',
      patchEquivalent,
    });
    if (
      decision.eligible &&
      (!underRoot ||
        entry?.branch !== taskState.branch ||
        entry?.head !== taskState.commit ||
        commonDir !== (await gitCommonDir()) ||
        !integrationPublished)
    )
      decision.eligible = false;
    if (!decision.eligible) {
      skipped.push({
        taskId: taskState.taskId,
        status: taskState.status,
        worktree: taskState.worktree,
        reason: decision.reason,
        processAudit,
      });
      continue;
    }

    await assertCleanMain({ fetch: true, fastForward: false });
    await git(['worktree', 'remove', taskState.worktree]);
    taskState.status = 'cleaned';
    taskState.cleanedAt = new Date().toISOString();
    removed.push({ taskId: taskState.taskId, worktree: taskState.worktree });
    await saveState(paths.statePath, state);
  }
  const finalSync = await assertCleanMain({ fetch: true, fastForward: false });
  const prunePreview = await gitText([
    'worktree',
    'prune',
    '--dry-run',
    '--verbose',
  ]);
  let pruneRan = false;
  if (prunePreview) {
    await git(['worktree', 'prune']);
    pruneRan = true;
  }
  const finalWorktrees = await listWorktrees();
  const worktreeKibAfter = await sumWorktreeKib(finalWorktrees);
  const orphanDirectories = await findOrphanDirectories(
    config.project.worktreeRoot,
    finalWorktrees,
  );
  await pruneRunLogs(paths.stateRoot, settings.retainedRuns);
  const localBranchCount = (
    await gitText(['branch', '--format=%(refname:short)'])
  )
    .split('\n')
    .filter(Boolean).length;
  const runningWorkers = Object.values(state.tasks).filter(
    (task) => task.status === 'running' && isPidAlive(task.workerPid),
  );
  const occupiedTasks = activeTaskStates(state);
  const run = {
    id: paths.runId,
    mode: 'clean',
    observedAt: new Date().toISOString(),
    controlPlane: {
      authoritative: 'launchd-codex-exec',
      historicalDesktopPendingReviewRunsCountAsWorkers: false,
    },
    status: removed.length > 0 ? 'cleaned' : 'no-op',
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    main: {
      branch: 'main',
      clean: true,
      head: finalSync.local,
      originMain: finalSync.remote,
      synchronized: finalSync.local === finalSync.remote,
    },
    removed,
    skipped,
    prune: {
      staleMetadataFound: Boolean(prunePreview),
      preview: prunePreview ? prunePreview.split('\n') : [],
      ran: pruneRan,
      reason: pruneRan
        ? 'stale metadata was verified by dry-run'
        : 'dry-run found no stale metadata',
    },
    branches: {
      preserved: localBranchCount,
      deleted: 0,
    },
    workers: {
      live: runningWorkers.map((task) => task.taskId),
      liveCount: runningWorkers.length,
      occupied: occupiedTasks.map((task) => ({
        taskId: task.taskId,
        status: task.status,
      })),
      occupiedCount: occupiedTasks.length,
      historicalDesktopRunsExcluded: true,
    },
    roadmapCompletedTaskIds: config.roadmap
      .filter((task) => task.status === 'completed')
      .map((task) => task.id),
    registeredWorktrees: {
      before: worktrees.length,
      after: finalWorktrees.length,
    },
    disk: {
      worktreeKibBefore,
      worktreeKibAfter,
      reclaimedKib: Math.max(0, worktreeKibBefore - worktreeKibAfter),
    },
    orphanDirectories,
  };
  appendBoundedRun(state, run, settings.retainedRuns);
  await saveState(paths.statePath, state);
  print(run);
}

async function sumWorktreeKib(worktrees) {
  let total = 0;
  for (const entry of worktrees) {
    const result = await run('du', ['-sk', entry.path], { allowFailure: true });
    total += Number.parseInt(result.stdout, 10) || 0;
  }
  return total;
}

async function processesUsingWorktree(worktree) {
  const result = await run(
    '/usr/sbin/lsof',
    ['-a', '-d', 'cwd', '-Fpcn', '--', worktree],
    { allowFailure: true },
  ).catch((error) => ({ code: null, stdout: '', stderr: error.message }));
  if (result.code === 1)
    return { safe: true, references: [], detail: 'no process cwd references' };
  if (result.code !== 0)
    return {
      safe: false,
      references: [],
      detail: `process audit failed: ${(result.stderr || 'unknown error').trim().slice(-500)}`,
    };

  const references = [];
  let current = null;
  for (const line of result.stdout.split('\n')) {
    if (line.startsWith('p')) {
      if (current) references.push(current);
      current = { pid: Number.parseInt(line.slice(1), 10) || null };
    } else if (current && line.startsWith('c')) {
      current.command = line.slice(1);
    } else if (current && line.startsWith('n')) {
      current.cwd = line.slice(1);
    }
  }
  if (current) references.push(current);
  return {
    safe: true,
    references,
    detail: references.length
      ? 'one or more processes use the worktree as cwd'
      : 'no process cwd references',
  };
}

async function findOrphanDirectories(root, worktrees) {
  if (!(await exists(root))) return [];
  const registered = new Set(
    worktrees.map((entry) => path.resolve(entry.path)),
  );
  const orphans = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name))
    .filter((entryPath) => !registered.has(path.resolve(entryPath)));
  return Promise.all(
    orphans.map(async (entryPath) => {
      const [metadata, disk, entries] = await Promise.all([
        stat(entryPath),
        run('du', ['-sk', entryPath], { allowFailure: true }),
        readdir(entryPath).catch(() => []),
      ]);
      return {
        path: entryPath,
        kib: Number.parseInt(disk.stdout, 10) || null,
        modifiedAt: metadata.mtime.toISOString(),
        topLevelEntries: entries.slice(0, 20),
        topLevelEntriesTruncated: entries.length > 20,
      };
    }),
  );
}

async function pruneRunLogs(stateRoot, retainedRuns) {
  const root = path.join(stateRoot, 'runs');
  if (!(await exists(root))) return;
  const entries = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const entry of entries.slice(
    0,
    Math.max(0, entries.length - retainedRuns),
  ))
    await rm(path.join(root, entry), { recursive: true });
}

async function status(context) {
  const { config, settings, paths, state } = context;
  const worktrees = await listWorktrees();
  const candidates = readyRoadmapTasks(config.roadmap, state.tasks);
  const occupied = activeTaskStates(state);
  const running = Object.values(state.tasks).filter(
    (task) => task.status === 'running' && isPidAlive(task.workerPid),
  );
  const mainHead = await gitText(['rev-parse', 'main']);
  const originMain = await gitText(['rev-parse', 'origin/main']);
  const mainStatus = await gitText(['status', '--porcelain']);
  const schedule = await readJson(path.join(paths.stateRoot, 'schedule.json'), {
    version: 1,
    attempted: {},
  });
  const scheduleAttempts = Object.entries(schedule.attempted ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-12)
    .map(([key, value]) => ({ key, ...value }));
  const sizes = await Promise.all(
    worktrees.map(async (entry) => {
      const result = await run('du', ['-sk', entry.path], {
        allowFailure: true,
      });
      return {
        path: entry.path,
        branch: entry.branch ?? null,
        kib: Number.parseInt(result.stdout, 10) || null,
      };
    }),
  );
  print({
    mode: 'status',
    observedAt: new Date().toISOString(),
    controlPlane: {
      authoritative: 'launchd-codex-exec',
      historicalDesktopPendingReviewRunsCountAsWorkers: false,
    },
    repository: REPO_ROOT,
    statePath: paths.statePath,
    maxConcurrentWorkers: settings.maxConcurrentWorkers,
    main: {
      head: mainHead,
      originMain,
      synchronized: mainHead === originMain,
      clean: mainStatus === '',
      dirtyPaths: mainStatus ? mainStatus.split('\n') : [],
    },
    workers: {
      live: running,
      liveCount: running.length,
      occupied,
      occupiedCount: occupied.length,
      historicalDesktopRunsExcluded: true,
    },
    roadmap: {
      completedTaskIds: config.roadmap
        .filter((task) => task.status === 'completed')
        .map((task) => task.id),
      readyTaskIds: config.roadmap
        .filter((task) => task.status === 'ready')
        .map((task) => task.id),
    },
    dependencyReadyTaskIds: candidates.map((task) => task.id),
    worktreeCount: worktrees.length,
    worktrees: sizes,
    scheduleAttempts,
    recentRuns: state.runs.slice(-10),
  });
}

async function dryRun(context) {
  const { config, settings, paths, state } = context;
  const worktrees = await listWorktrees();
  const active = activeTaskStates(state);
  const candidates = readyRoadmapTasks(config.roadmap, state.tasks);
  print({
    mode: 'dry-run',
    mutatesGit: false,
    invokesCodex: false,
    repository: REPO_ROOT,
    statePath: paths.statePath,
    modelPlan: {
      planner: `${settings.plannerModel}/${settings.plannerEffort}`,
      workers: `${settings.workerModel}/${settings.workerEffort}`,
      integrator: `${settings.integratorModel}/${settings.integratorEffort}`,
    },
    capacity: Math.max(0, settings.maxConcurrentWorkers - active.length),
    activeTaskIds: active.map((task) => task.taskId),
    candidates: candidates.map((task) => ({
      id: task.id,
      title: task.title,
      owner: task.owner,
      branch: taskBranchName(task),
      worktree: path.join(config.project.worktreeRoot, taskWorktreeName(task)),
    })),
    registeredWorktrees: worktrees,
  });
}

async function taskControlPreflight(settings) {
  await access(settings.codexPath);
  const auth = await run(settings.codexPath, ['login', 'status'], {
    cwd: REPO_ROOT,
    timeoutMs: 20_000,
    allowFailure: true,
  });
  if (
    auth.code !== 0 ||
    !`${auth.stdout}\n${auth.stderr}`.includes('Logged in')
  )
    throw new Error(
      'Codex CLI is not logged in; no Git automation was started.',
    );
  await access(settings.pnpmPath);
  const pnpmVersion = await run(settings.pnpmPath, ['--version'], {
    cwd: REPO_ROOT,
    timeoutMs: 20_000,
    allowFailure: true,
  });
  const expectedPnpm = JSON.parse(
    await readFile(path.join(REPO_ROOT, 'package.json'), 'utf8'),
  ).packageManager?.split('@')[1];
  if (pnpmVersion.code !== 0 || pnpmVersion.stdout.trim() !== expectedPnpm)
    throw new Error(
      `Expected pnpm ${expectedPnpm}, received ${pnpmVersion.stdout.trim() || 'unavailable'}.`,
    );
  const root = await gitText(['rev-parse', '--show-toplevel']);
  if (path.resolve(root) !== REPO_ROOT)
    throw new Error(`Expected Git root ${REPO_ROOT}, received ${root}.`);
}

function localHourSlot(now) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}`;
}

function dueModes(now, schedule) {
  const slot = localHourSlot(now);
  const minute = now.getMinutes();
  const order =
    minute >= 58
      ? ['integrate', 'clean', 'orchestrate']
      : minute >= 50
        ? ['integrate', 'orchestrate']
        : minute >= 5
          ? ['orchestrate']
          : [];
  return order.filter((mode) => !schedule.attempted?.[`${slot}:${mode}`]);
}

async function daemon() {
  const paths = await runtimePaths('daemon');
  const schedulePath = path.join(paths.stateRoot, 'schedule.json');
  await mkdir(paths.stateRoot, { recursive: true });
  print({
    mode: 'daemon',
    status: 'started',
    pid: process.pid,
    repository: REPO_ROOT,
    schedulePath,
  });

  while (!stopping) {
    const schedule = await readJson(schedulePath, {
      version: 1,
      attempted: {},
    });
    const now = new Date();
    const due = dueModes(now, schedule);
    if (due.length > 0) {
      const mode = due[0];
      const key = `${localHourSlot(now)}:${mode}`;
      schedule.attempted[key] = {
        attemptedAt: now.toISOString(),
        daemonPid: process.pid,
      };
      const cutoff = Date.now() - 48 * 60 * 60_000;
      schedule.attempted = Object.fromEntries(
        Object.entries(schedule.attempted).filter(([, value]) =>
          value?.attemptedAt ? Date.parse(value.attemptedAt) >= cutoff : false,
        ),
      );
      await atomicWriteJson(schedulePath, schedule);
      const result = await run(
        process.execPath,
        [fileURLToPath(import.meta.url), mode],
        { cwd: REPO_ROOT, allowFailure: true },
      );
      const outcome = {
        ...schedule.attempted[key],
        finishedAt: new Date().toISOString(),
        exitCode: result.code,
        durationSeconds: result.durationSeconds,
        stderrTail: result.stderr.trim().slice(-2_000),
      };
      schedule.attempted[key] = outcome;
      await atomicWriteJson(schedulePath, schedule);
      print({
        mode: 'daemon',
        action: mode,
        key,
        ...outcome,
      });
      continue;
    }
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        wakeDaemon = null;
        resolve();
      }, 30_000);
      wakeDaemon = () => {
        clearTimeout(timeout);
        wakeDaemon = null;
        resolve();
      };
    });
  }
}

async function main() {
  const mode = process.argv[2] ?? 'status';
  if (
    ![
      'daemon',
      'orchestrate',
      'integrate',
      'clean',
      'status',
      'dry-run',
    ].includes(mode)
  ) {
    throw new Error(
      `Unknown mode ${mode}. Use orchestrate, integrate, clean, status, or dry-run.`,
    );
  }
  if (mode === 'daemon') return daemon();
  const config = await loadConfig();
  const settings = supervisorSettings(config);
  const paths = await runtimePaths(mode);
  const state = await loadState(paths.statePath);
  const context = { config, settings, paths, state };

  if (mode === 'status') return status(context);
  if (mode === 'dry-run') return dryRun(context);

  if (mode !== 'clean') await taskControlPreflight(settings);

  const release = await acquireDirectoryLock(
    paths.lockPath,
    {
      pid: process.pid,
      mode,
      runId: paths.runId,
      startedAt: new Date().toISOString(),
      repository: REPO_ROOT,
    },
    settings.staleLockMs,
  );
  try {
    if (mode === 'orchestrate') await orchestrate(context);
    else if (mode === 'integrate') await integrate(context);
    else await clean(context);
  } finally {
    await release();
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true;
    wakeDaemon?.();
    for (const child of children) terminateChild(child, 'SIGTERM');
    process.exitCode = 128;
  });
}

main().catch((error) => {
  process.stderr.write(`[vanta-supervisor] ${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
