import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';

export const STATE_VERSION = 1;

export function createEmptyState(now = new Date().toISOString()) {
  return {
    version: STATE_VERSION,
    updatedAt: now,
    tasks: {},
    runs: [],
  };
}

export function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function taskBranchName(task) {
  assertTaskId(task.id);
  if (!slugify(task.title))
    throw new Error(`Task ${task.id} has an empty title slug.`);
  return `worker/${task.id.toLowerCase()}-${slugify(task.title)}`;
}

export function taskWorktreeName(task) {
  assertTaskId(task.id);
  if (!slugify(task.title))
    throw new Error(`Task ${task.id} has an empty title slug.`);
  return `${task.id.toLowerCase()}-${slugify(task.title)}`;
}

export function assertTaskId(taskId) {
  if (!/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/.test(taskId))
    throw new Error(`Unsafe task ID: ${taskId}`);
  return taskId;
}

export function completedTaskIds(roadmap) {
  return new Set(
    roadmap
      .filter((task) => task.status === 'completed')
      .map((task) => task.id),
  );
}

export function readyRoadmapTasks(roadmap, stateTasks = {}) {
  const completed = completedTaskIds(roadmap);
  return roadmap.filter((task) => {
    if (task.status !== 'ready') return false;
    if ((task.dependencies ?? []).some((id) => !completed.has(id)))
      return false;
    return !stateTasks[task.id] || stateTasks[task.id].status === 'retryable';
  });
}

export function validateAssignments({
  assignments,
  candidates,
  maxAssignments,
  occupiedTaskIds = [],
  occupiedOwners = [],
  occupiedDuplicateKeys = [],
}) {
  const candidateMap = new Map(candidates.map((task) => [task.id, task]));
  const occupiedIds = new Set(occupiedTaskIds);
  const owners = new Set(occupiedOwners.filter(Boolean));
  const duplicateKeys = new Set(occupiedDuplicateKeys.filter(Boolean));
  const accepted = [];
  const rejected = [];

  for (const assignment of assignments ?? []) {
    const task = candidateMap.get(assignment.taskId);
    let reason = null;

    if (!task) reason = 'task is not dependency-ready';
    else if (occupiedIds.has(task.id)) reason = 'task already has active state';
    else if (accepted.some((item) => item.task.id === task.id))
      reason = 'task was selected more than once';
    else if (accepted.length >= maxAssignments)
      reason = `assignment limit is ${maxAssignments}`;
    else if (task.owner && owners.has(task.owner))
      reason = `owner area ${task.owner} is already active`;
    else if (task.duplicateKey && duplicateKeys.has(task.duplicateKey))
      reason = `duplicate key ${task.duplicateKey} is already active`;
    else if (!assignment.rationale?.trim()) reason = 'rationale is empty';
    else if (!assignment.scope?.trim()) reason = 'scope is empty';

    if (reason) {
      rejected.push({ assignment, reason });
      continue;
    }

    accepted.push({
      task,
      rationale: assignment.rationale.trim(),
      scope: assignment.scope.trim(),
      validationFocus: (assignment.validationFocus ?? []).filter(Boolean),
      overlapRisks: (assignment.overlapRisks ?? []).filter(Boolean),
    });
    occupiedIds.add(task.id);
    if (task.owner) owners.add(task.owner);
    if (task.duplicateKey) duplicateKeys.add(task.duplicateKey);
  }

  return { accepted, rejected };
}

export function patchEquivalentFromCherryOutput(output) {
  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length > 0 && lines.every((line) => line.startsWith('-'));
}

export function canCleanTask(taskState, audit) {
  if (taskState.status !== 'integrated')
    return { eligible: false, reason: `state is ${taskState.status}` };
  if (!audit.registered)
    return { eligible: false, reason: 'worktree is not registered' };
  if (audit.isMain)
    return { eligible: false, reason: 'main worktree is never removable' };
  if (audit.processAlive)
    return { eligible: false, reason: 'worker process is still alive' };
  if (!audit.clean) return { eligible: false, reason: 'worktree is dirty' };
  if (!audit.patchEquivalent)
    return { eligible: false, reason: 'branch has changes absent from main' };
  return { eligible: true, reason: 'clean, inactive, and integrated' };
}

export function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

export async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

export async function atomicWriteJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporaryPath, 'wx', 0o600);
  await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`);
  await handle.sync();
  await handle.close();
  await rename(temporaryPath, filePath);
  const directory = await open(path.dirname(filePath), 'r');
  await directory.sync();
  await directory.close();
}

export async function acquireDirectoryLock(lockPath, metadata, staleAfterMs) {
  await mkdir(path.dirname(lockPath), { recursive: true });
  const token = randomUUID();
  const owner = { ...metadata, token };

  const create = async () => {
    const handle = await open(lockPath, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify(owner, null, 2)}\n`);
    await handle.sync();
    await handle.close();
  };

  try {
    await create();
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const existing = await readJson(lockPath, null);
    if (
      !existing?.token ||
      !existing?.startedAt ||
      !Number.isInteger(existing?.pid)
    )
      throw new Error(
        'Supervisor lock metadata is missing or malformed; refusing to reap it.',
        { cause: error },
      );
    const ageMs = Date.now() - Date.parse(existing.startedAt);
    if (!Number.isFinite(ageMs) || ageMs < 0)
      throw new Error('Supervisor lock time is invalid; refusing to reap it.', {
        cause: error,
      });
    if (isPidAlive(existing.pid))
      throw new Error(
        `Supervisor lock is held by live pid ${existing.pid} (${existing.mode ?? 'unknown'}).`,
        { cause: error },
      );
    if (ageMs < staleAfterMs)
      throw new Error(
        `Supervisor lock owner is gone but the lock is only ${Math.round(ageMs / 1000)}s old.`,
        { cause: error },
      );
    const stalePath = `${lockPath}.stale-${existing.token}`;
    await rename(lockPath, stalePath);
    await create();
    await rm(stalePath);
  }

  let released = false;
  return async () => {
    if (released) return;
    released = true;
    const current = await readJson(lockPath, null);
    if (current?.token === token) await rm(lockPath);
  };
}

export function appendBoundedRun(state, run, maxRuns = 100) {
  state.runs.push(run);
  state.runs = state.runs.slice(-maxRuns);
  state.updatedAt = new Date().toISOString();
}

export function assertStateShape(state) {
  if (state.version !== STATE_VERSION)
    throw new Error(`Unsupported supervisor state version: ${state.version}`);
  if (!state.tasks || typeof state.tasks !== 'object')
    throw new Error('Supervisor state is missing tasks.');
  if (!Array.isArray(state.runs))
    throw new Error('Supervisor state is missing runs.');
  return state;
}
