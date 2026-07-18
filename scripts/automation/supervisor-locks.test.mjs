import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { acquireDirectoryLock, atomicWriteJson } from './supervisor-lib.mjs';

test('serializes live lock owners and releases its lock', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'vanta-supervisor-lock-'));
  const lockPath = path.join(root, 'supervisor.lock');
  const metadata = {
    pid: process.pid,
    mode: 'test',
    startedAt: new Date().toISOString(),
  };
  const release = await acquireDirectoryLock(lockPath, metadata, 60_000);
  await assert.rejects(
    acquireDirectoryLock(lockPath, metadata, 60_000),
    /live pid/,
  );
  await release();
  const releaseAgain = await acquireDirectoryLock(lockPath, metadata, 60_000);
  await releaseAgain();
  await rm(root, { recursive: true });
});

test('fails closed on malformed lock metadata and atomically writes state', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'vanta-supervisor-state-'));
  const lockPath = path.join(root, 'supervisor.lock');
  await writeFile(lockPath, '{}\n');
  await assert.rejects(
    acquireDirectoryLock(
      lockPath,
      { pid: process.pid, mode: 'test', startedAt: new Date().toISOString() },
      0,
    ),
    /missing or malformed/,
  );

  const statePath = path.join(root, 'state.json');
  await atomicWriteJson(statePath, { version: 1, ok: true });
  assert.deepEqual(JSON.parse(await readFile(statePath, 'utf8')), {
    version: 1,
    ok: true,
  });
  await rm(root, { recursive: true });
});
