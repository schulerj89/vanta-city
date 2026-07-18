import { mkdtemp, mkdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createRunId,
  enforceRetention,
  enforceRunSize,
  parsePlaybotOptions,
  renderHumanSummary,
} from '../scripts/playbot/core';

describe('recorded playtest bot bounds', () => {
  it('parses at most two deterministic seeds and rejects unknown options', () => {
    expect(parsePlaybotOptions([])).toMatchObject({
      seeds: [1337, 7331],
      skipBuild: false,
      headed: false,
    });
    expect(
      parsePlaybotOptions(['--seeds=11,29', '--skip-build', '--headed']),
    ).toEqual({ seeds: [11, 29], skipBuild: true, headed: true });
    expect(() => parsePlaybotOptions(['--seeds=1,2,3'])).toThrow(
      'At most 2 exploration seeds',
    );
    expect(() => parsePlaybotOptions(['--output=/tmp'])).toThrow(
      'Unknown playbot option',
    );
  });

  it('creates retention-recognized run ids without filesystem punctuation', () => {
    expect(
      createRunId(new Date('2026-07-18T12:34:56.789Z'), 'abcdef0123456789', 42),
    ).toBe('20260718T123456Z-abcdef012345-42');
  });

  it('removes only bounded run directories by age and count', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'vanta-playbot-retention-'));
    const root = join(parent, 'reports', 'playbot');
    const outside = join(parent, 'outside.txt');
    const now = Date.now();
    await mkdir(root, { recursive: true });
    await writeFile(outside, 'keep');
    await writeFile(join(root, 'latest.json'), '{}');
    const runIds = Array.from(
      { length: 6 },
      (_, index) =>
        `20260718T12000${index}Z-abcdef${index.toString(16)}-${index + 10}`,
    );
    for (const [index, runId] of runIds.entries()) {
      const directory = join(root, runId);
      await mkdir(directory);
      await writeFile(join(directory, 'report.json'), 'x'.repeat(64));
      const modified =
        index === 5 ? now - 8 * 24 * 60 * 60 * 1_000 : now - index * 1_000;
      await utimes(directory, modified / 1_000, modified / 1_000);
    }

    const result = await enforceRetention(root, {
      currentRunId: runIds[0],
      now,
      maximumRetainedRuns: 3,
    });

    expect(result.retainedRunIds).toHaveLength(3);
    expect(result.retainedRunIds).toContain(runIds[0]);
    expect(result.removed.some(({ reason }) => reason === 'age')).toBe(true);
    expect(result.removed.some(({ reason }) => reason === 'count')).toBe(true);
    expect((await stat(outside)).isFile()).toBe(true);
    await rm(parent, { recursive: true, force: true });
  });

  it('prunes oversized media inside one run while retaining reports', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'vanta-playbot-size-'));
    const root = join(parent, 'reports', 'playbot');
    const run = join(root, '20260718T120000Z-abcdef0-10');
    await mkdir(join(run, 'critical-path'), { recursive: true });
    await writeFile(join(run, 'report.json'), '{"status":"passed"}');
    await writeFile(
      join(run, 'critical-path', 'video.webm'),
      Buffer.alloc(4096),
    );

    const result = await enforceRunSize(root, run, 1_024);

    expect(result.bytes).toBeLessThan(1_024);
    expect(result.removed).toEqual(['critical-path/video.webm']);
    expect((await stat(join(run, 'report.json'))).isFile()).toBe(true);
    await rm(parent, { recursive: true, force: true });
  });

  it('removes an older run before the total artifact cap is reached', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'vanta-playbot-total-'));
    const root = join(parent, 'reports', 'playbot');
    const current = '20260718T120001Z-abcdef1-11';
    const older = '20260718T120000Z-abcdef0-10';
    const unmanaged = join(root, 'manual-not-a-run');
    await mkdir(join(root, current), { recursive: true });
    await mkdir(join(root, older));
    await mkdir(unmanaged);
    await writeFile(join(root, current, 'report.json'), 'x'.repeat(600));
    await writeFile(join(root, older, 'report.json'), 'x'.repeat(600));
    await writeFile(join(unmanaged, 'keep.txt'), 'x'.repeat(50));

    const result = await enforceRetention(root, {
      currentRunId: current,
      maximumTotalBytes: 1_024,
    });

    expect(result.retainedRunIds).toEqual([current]);
    expect(result.removed).toEqual([
      expect.objectContaining({ runId: older, reason: 'total-size' }),
    ]);
    expect(result.totalBytes).toBeLessThanOrEqual(1_024);
    expect((await stat(join(unmanaged, 'keep.txt'))).isFile()).toBe(true);
    await rm(parent, { recursive: true, force: true });
  });

  it('renders unavailable capabilities and the evidence boundary', () => {
    const summary = renderHumanSummary({
      runId: 'run',
      status: 'passed',
      gitSha: 'abcdef0',
      startedAt: '2026-07-18T12:00:00.000Z',
      durationMs: 1_000,
      seeds: [1, 2],
      artifactBytes: 128,
      reproductionCommand: 'pnpm playtest:bot -- --seeds=1,2',
      capabilities: [
        {
          id: 'mission',
          status: 'unavailable',
          evidence: ['No production mission state is registered.'],
        },
      ],
      consoleErrors: 0,
      pageErrors: 0,
      failedRequests: 0,
      findings: [],
      artifactDirectory: 'reports/playbot/run',
    });
    expect(summary).toContain('mission:** unavailable');
    expect(summary).toContain('not a regression oracle');
  });
});
