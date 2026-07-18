import { readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, relative, resolve, sep } from 'node:path';

export const playbotLimits = {
  maximumRunMs: 5 * 60 * 1_000,
  maximumSeeds: 2,
  maximumRunBytes: 500 * 1024 * 1024,
  maximumTotalBytes: 1_024 * 1024 * 1024,
  maximumRetainedRuns: 5,
  maximumAgeMs: 7 * 24 * 60 * 60 * 1_000,
} as const;

export const defaultPlaybotSeeds = [1_337, 7_331] as const;

export interface PlaybotOptions {
  readonly seeds: readonly number[];
  readonly skipBuild: boolean;
  readonly headed: boolean;
}

export interface RetentionRemoval {
  readonly runId: string;
  readonly reason: 'age' | 'count' | 'total-size';
  readonly bytes: number;
}

export interface RetentionResult {
  readonly removed: readonly RetentionRemoval[];
  readonly retainedRunIds: readonly string[];
  readonly totalBytes: number;
}

export interface ArtifactPruneResult {
  readonly bytes: number;
  readonly removed: readonly string[];
}

export type CapabilityStatus =
  'exercised' | 'partial' | 'available' | 'unavailable';

export interface CapabilityResult {
  readonly id: string;
  readonly status: CapabilityStatus;
  readonly evidence: readonly string[];
}

export interface SummarySource {
  readonly runId: string;
  readonly status: 'passed' | 'issues' | 'failed';
  readonly gitSha: string;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly seeds: readonly number[];
  readonly artifactBytes: number;
  readonly reproductionCommand: string;
  readonly capabilities: readonly CapabilityResult[];
  readonly consoleErrors: number;
  readonly pageErrors: number;
  readonly failedRequests: number;
  readonly findings: readonly string[];
  readonly artifactDirectory: string;
}

const runDirectoryPattern = /^\d{8}T\d{6}Z-[a-f0-9]{7,40}-\d+$/;
const pruneFirstExtensions = new Set(['.webm', '.png', '.zip']);

export function parsePlaybotOptions(args: readonly string[]): PlaybotOptions {
  let seeds: number[] | undefined;
  let skipBuild = false;
  let headed = false;
  for (const argument of args.filter((value) => value !== '--')) {
    if (argument === '--skip-build') {
      skipBuild = true;
      continue;
    }
    if (argument === '--headed') {
      headed = true;
      continue;
    }
    if (argument.startsWith('--seed=')) {
      seeds = [parseSeed(argument.slice('--seed='.length))];
      continue;
    }
    if (argument.startsWith('--seeds=')) {
      seeds = argument
        .slice('--seeds='.length)
        .split(',')
        .filter(Boolean)
        .map(parseSeed);
      continue;
    }
    throw new Error(`Unknown playbot option: ${argument}`);
  }
  const selected = seeds ?? [...defaultPlaybotSeeds];
  if (selected.length === 0)
    throw new Error('At least one exploration seed is required');
  if (selected.length > playbotLimits.maximumSeeds) {
    throw new Error(
      `At most ${playbotLimits.maximumSeeds} exploration seeds are allowed`,
    );
  }
  if (new Set(selected).size !== selected.length)
    throw new Error('Exploration seeds must be unique');
  return { seeds: selected, skipBuild, headed };
}

export function createRunId(
  now: Date,
  gitSha: string,
  processId: number,
): string {
  const timestamp = `${now.toISOString().split('.')[0]}Z`
    .replaceAll('-', '')
    .replaceAll(':', '');
  return `${timestamp}-${gitSha.slice(0, 12)}-${processId}`;
}

export async function enforceRetention(
  root: string,
  options: {
    readonly currentRunId?: string;
    readonly now?: number;
    readonly maximumAgeMs?: number;
    readonly maximumRetainedRuns?: number;
    readonly maximumTotalBytes?: number;
  } = {},
): Promise<RetentionResult> {
  const rootPath = resolve(root);
  const now = options.now ?? Date.now();
  const maximumAgeMs = options.maximumAgeMs ?? playbotLimits.maximumAgeMs;
  const maximumRetainedRuns =
    options.maximumRetainedRuns ?? playbotLimits.maximumRetainedRuns;
  const maximumTotalBytes =
    options.maximumTotalBytes ?? playbotLimits.maximumTotalBytes;
  const totalReserveBytes = Math.min(
    1024 * 1024,
    Math.floor(maximumTotalBytes / 10),
  );
  const targetTotalBytes = maximumTotalBytes - totalReserveBytes;
  const removed: RetentionRemoval[] = [];
  let runs = await readRuns(rootPath);

  for (const run of runs) {
    if (
      run.runId !== options.currentRunId &&
      now - run.modifiedAt > maximumAgeMs
    ) {
      await removeRun(rootPath, run.path);
      removed.push({ runId: run.runId, reason: 'age', bytes: run.bytes });
    }
  }

  runs = await readRuns(rootPath);
  while (runs.length > maximumRetainedRuns) {
    const candidate = [...runs]
      .reverse()
      .find(({ runId }) => runId !== options.currentRunId);
    if (!candidate) break;
    await removeRun(rootPath, candidate.path);
    removed.push({
      runId: candidate.runId,
      reason: 'count',
      bytes: candidate.bytes,
    });
    runs = runs.filter(({ runId }) => runId !== candidate.runId);
  }

  const rootFileBytes = await unmanagedBytes(rootPath);
  let totalBytes =
    rootFileBytes + runs.reduce((total, run) => total + run.bytes, 0);
  while (totalBytes > targetTotalBytes) {
    const candidate = [...runs]
      .reverse()
      .find(({ runId }) => runId !== options.currentRunId);
    if (!candidate) break;
    await removeRun(rootPath, candidate.path);
    removed.push({
      runId: candidate.runId,
      reason: 'total-size',
      bytes: candidate.bytes,
    });
    runs = runs.filter(({ runId }) => runId !== candidate.runId);
    totalBytes =
      rootFileBytes + runs.reduce((total, run) => total + run.bytes, 0);
  }

  if (totalBytes > maximumTotalBytes) {
    throw new Error(
      `Playbot artifacts exceed ${formatBytes(maximumTotalBytes)} with no removable retained run`,
    );
  }
  return {
    removed,
    retainedRunIds: runs.map(({ runId }) => runId),
    totalBytes,
  };
}

export async function enforceRunSize(
  root: string,
  runDirectory: string,
  maximumBytes = playbotLimits.maximumRunBytes,
): Promise<ArtifactPruneResult> {
  const rootPath = resolve(root);
  const runPath = resolve(runDirectory);
  assertInside(rootPath, runPath);
  const removed: string[] = [];
  const reserveBytes = Math.min(1024 * 1024, Math.floor(maximumBytes / 10));
  const targetBytes = maximumBytes - reserveBytes;
  let bytes = await directorySize(runPath);
  if (bytes <= targetBytes) return { bytes, removed };
  const files = (await listFiles(runPath))
    .filter(({ extension }) => pruneFirstExtensions.has(extension))
    .sort((left, right) => right.bytes - left.bytes);
  for (const file of files) {
    if (bytes <= targetBytes) break;
    await rm(file.path, { force: true });
    bytes -= file.bytes;
    removed.push(relative(runPath, file.path));
  }
  bytes = await directorySize(runPath);
  if (bytes > maximumBytes) {
    throw new Error(
      `Playbot run ${basename(runPath)} exceeds ${formatBytes(maximumBytes)} after media pruning`,
    );
  }
  return { bytes, removed };
}

export function renderHumanSummary(source: SummarySource): string {
  const capabilityLines = source.capabilities.map(
    ({ id, status, evidence }) =>
      `- **${id}:** ${status} — ${evidence.join('; ') || 'No evidence recorded.'}`,
  );
  const findingLines =
    source.findings.length > 0
      ? source.findings.map((finding) => `- ${finding}`)
      : ['- No playbot findings.'];
  return `# Vanta City recorded playtest

- Run: \`${source.runId}\`
- Status: **${source.status}**
- Git SHA: \`${source.gitSha}\`
- Started: ${source.startedAt}
- Duration: ${(source.durationMs / 1_000).toFixed(2)} seconds
- Exploration seeds: ${source.seeds.join(', ')}
- Artifacts: ${source.artifactDirectory} (${formatBytes(source.artifactBytes)})
- Reproduce: \`${source.reproductionCommand}\`
- Browser evidence: ${source.consoleErrors} console errors, ${source.pageErrors} page errors, ${source.failedRequests} failed requests

## Capabilities

${capabilityLines.join('\n')}

## Findings

${findingLines.join('\n')}

## Evidence boundary

This recorded exploration supplements deterministic unit, feature, smoke, visual, performance, and release tests. It is discovery evidence, not a regression oracle, and it does not promote roadmap work automatically.
`;
}

export async function directorySize(path: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const entryPath = resolve(path, entry.name);
    if (entry.isDirectory()) total += await directorySize(entryPath);
    else if (entry.isFile()) total += (await stat(entryPath)).size;
  }
  return total;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

export async function writeJsonFile(
  path: string,
  value: unknown,
): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function parseSeed(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 0xffff_ffff) {
    throw new Error(`Invalid exploration seed: ${value}`);
  }
  return parsed;
}

interface RetainedRun {
  readonly runId: string;
  readonly path: string;
  readonly modifiedAt: number;
  readonly bytes: number;
}

async function readRuns(root: string): Promise<RetainedRun[]> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  const runs: RetainedRun[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !runDirectoryPattern.test(entry.name)) continue;
    const path = resolve(root, entry.name);
    assertInside(root, path);
    const metadata = await stat(path);
    runs.push({
      runId: entry.name,
      path,
      modifiedAt: metadata.mtimeMs,
      bytes: await directorySize(path),
    });
  }
  return runs.sort((left, right) => right.modifiedAt - left.modifiedAt);
}

async function unmanagedBytes(root: string): Promise<number> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) return 0;
    throw error;
  }
  let bytes = 0;
  for (const entry of entries) {
    const entryPath = resolve(root, entry.name);
    if (entry.isFile()) bytes += (await stat(entryPath)).size;
    else if (entry.isDirectory() && !runDirectoryPattern.test(entry.name)) {
      bytes += await directorySize(entryPath);
    }
  }
  return bytes;
}

async function removeRun(root: string, path: string): Promise<void> {
  assertInside(root, path);
  await rm(path, { recursive: true, force: true });
}

function assertInside(root: string, target: string): void {
  const rootPrefix = resolve(root) + sep;
  const targetPath = resolve(target);
  if (
    !targetPath.startsWith(rootPrefix) ||
    dirname(targetPath) === targetPath
  ) {
    throw new Error(`Refusing to modify path outside playbot root: ${target}`);
  }
}

async function listFiles(path: string): Promise<
  {
    readonly path: string;
    readonly bytes: number;
    readonly extension: string;
  }[]
> {
  const files = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const entryPath = resolve(path, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(entryPath)));
    else if (entry.isFile()) {
      const extension = entry.name.includes('.')
        ? `.${entry.name.split('.').at(-1)!.toLowerCase()}`
        : '';
      files.push({
        path: entryPath,
        bytes: (await stat(entryPath)).size,
        extension,
      });
    }
  }
  return files;
}

function isMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}
