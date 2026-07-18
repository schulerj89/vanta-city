#!/usr/bin/env node

import { spawn } from 'node:child_process';
import {
  access,
  copyFile,
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const stateRoot = path.join(repoRoot, '.git/vanta-orchestration');
const toolingRoot = path.join(stateRoot, 'tooling');
const pinnedPnpm = path.join(toolingRoot, 'node_modules/.bin/pnpm');
const sourcePlist = path.join(
  repoRoot,
  'ops/launchd/com.vantacity.codex-supervisor.plist',
);
const installedPlist =
  '/Users/jschuler/Library/LaunchAgents/com.vantacity.codex-supervisor.plist';
const domain = `gui/${process.getuid()}`;
const service = `${domain}/com.vantacity.codex-supervisor`;
const legacyAutomationIds = [
  'vanta-city-hourly-orchestrator',
  'vanta-city-hourly-integrator',
  'vanta-city-hourly-worktree-cleaner',
];

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function bootstrapLaunchAgent() {
  const retryDelays = [0, 500, 1_500, 3_000];
  let lastResult = null;
  for (const retryDelay of retryDelays) {
    if (retryDelay > 0) await delay(retryDelay);
    lastResult = await run('launchctl', ['bootstrap', domain, installedPlist]);
    if (lastResult.code === 0) return;
    const loaded = await run('launchctl', ['print', service]);
    if (loaded.code === 0) return;
  }
  throw new Error(
    lastResult?.stderr || lastResult?.stdout || 'Bootstrap failed.',
  );
}

async function legacyAutomationStatus() {
  const statuses = [];
  for (const id of legacyAutomationIds) {
    const filePath = `/Users/jschuler/.codex/automations/${id}/automation.toml`;
    const content = await readFile(filePath, 'utf8').catch(() => '');
    statuses.push({
      id,
      filePath,
      status: content.match(/^status\s*=\s*"([^"]+)"/m)?.[1] ?? 'MISSING',
    });
  }
  return statuses;
}

async function provisionPnpm() {
  if (await exists(pinnedPnpm)) {
    const version = await run(pinnedPnpm, ['--version']);
    if (version.code === 0 && version.stdout.trim() === '11.7.0') return;
  }
  await mkdir(toolingRoot, { recursive: true, mode: 0o700 });
  await writeFile(
    path.join(toolingRoot, 'package.json'),
    '{"name":"vanta-supervisor-tooling","private":true}\n',
    { mode: 0o600 },
  );
  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath ? process.execPath : 'pnpm';
  const prefix = npmExecPath ? [npmExecPath] : [];
  const result = await run(command, [
    ...prefix,
    'add',
    '--force',
    '--ignore-workspace',
    '--dir',
    toolingRoot,
    '--store-dir',
    path.join(stateRoot, 'pnpm-store'),
    '--save-exact',
    'pnpm@11.7.0',
  ]);
  if (result.code !== 0)
    throw new Error(
      `Unable to provision pnpm 11.7.0: ${(result.stderr || result.stdout).trim()}`,
    );
  const version = await run(pinnedPnpm, ['--version']);
  if (version.code !== 0 || version.stdout.trim() !== '11.7.0')
    throw new Error('Pinned pnpm verification failed.');
}

async function doctor({ requirePaused = false } = {}) {
  const legacy = await legacyAutomationStatus();
  const activeLegacy = legacy.filter((item) => item.status === 'ACTIVE');
  const checks = [];

  for (const [id, command, args] of [
    ['node', '/opt/homebrew/bin/node', ['--version']],
    [
      'codex',
      '/Applications/ChatGPT.app/Contents/Resources/codex',
      ['login', 'status'],
    ],
    ['plist', 'plutil', ['-lint', sourcePlist]],
  ]) {
    const result = await run(command, args);
    checks.push({
      id,
      passed: result.code === 0,
      detail: (result.stdout || result.stderr).trim().slice(-500),
    });
  }
  if (await exists(pinnedPnpm)) {
    const result = await run(pinnedPnpm, ['--version']);
    checks.push({
      id: 'pinned-pnpm',
      passed: result.code === 0 && result.stdout.trim() === '11.7.0',
      detail: result.stdout.trim(),
    });
  } else {
    checks.push({
      id: 'pinned-pnpm',
      passed: false,
      detail: 'not provisioned',
    });
  }
  const serviceResult = await run('launchctl', ['print', service]);
  const [sourcePlistContent, installedPlistContent] = await Promise.all([
    readFile(sourcePlist, 'utf8'),
    readFile(installedPlist, 'utf8').catch(() => null),
  ]);
  const report = {
    observedAt: new Date().toISOString(),
    controlPlane: {
      authoritative: 'launchd-codex-exec',
      launchAgentLabel: 'com.vantacity.codex-supervisor',
      desktopHourlySchedulesSuperseded: true,
      historicalDesktopPendingReviewRunsCountAsWorkers: false,
    },
    repository: repoRoot,
    stateRoot,
    sourcePlist,
    installedPlist,
    legacyAutomations: legacy,
    launchAgentLoaded: serviceResult.code === 0,
    launchAgentPid:
      Number.parseInt(serviceResult.stdout.match(/\bpid = (\d+)/)?.[1], 10) ||
      null,
    installedPlistMatchesSource: installedPlistContent === sourcePlistContent,
    checks,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (checks.some((check) => !check.passed && check.id !== 'pinned-pnpm'))
    throw new Error('Supervisor doctor found a required host failure.');
  if (requirePaused && activeLegacy.length > 0)
    throw new Error(
      `Pause superseded Desktop schedules before install: ${activeLegacy.map((item) => item.id).join(', ')}`,
    );
  return report;
}

async function install() {
  await doctor({ requirePaused: true });
  await provisionPnpm();
  await mkdir(path.dirname(installedPlist), { recursive: true });
  await mkdir(stateRoot, { recursive: true, mode: 0o700 });
  await copyFile(sourcePlist, installedPlist);
  const lint = await run('plutil', ['-lint', installedPlist]);
  if (lint.code !== 0) throw new Error(lint.stderr || lint.stdout);
  await run('launchctl', ['bootout', service]);
  await bootstrapLaunchAgent();
  const loaded = await run('launchctl', ['print', service]);
  if (loaded.code !== 0)
    throw new Error('LaunchAgent bootstrap returned without a loaded service.');
  process.stdout.write(
    `${JSON.stringify(
      {
        installed: true,
        service,
        installedPlist,
        pid:
          Number.parseInt(loaded.stdout.match(/\bpid = (\d+)/)?.[1], 10) ||
          null,
      },
      null,
      2,
    )}\n`,
  );
}

async function uninstall() {
  await run('launchctl', ['bootout', service]);
  await rm(installedPlist, { force: true });
  process.stdout.write(
    `${JSON.stringify({ installed: false, service, statePreserved: stateRoot }, null, 2)}\n`,
  );
}

const mode = process.argv[2] ?? 'doctor';
if (!['doctor', 'install', 'uninstall'].includes(mode))
  throw new Error('Use doctor, install, or uninstall.');

const action =
  mode === 'install' ? install : mode === 'uninstall' ? uninstall : doctor;
action().catch((error) => {
  process.stderr.write(`[vanta-launch-agent] ${error.message}\n`);
  process.exitCode = 1;
});
