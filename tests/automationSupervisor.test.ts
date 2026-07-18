import { describe, expect, it } from 'vitest';

import {
  canCleanTask,
  patchEquivalentFromCherryOutput,
  readyRoadmapTasks,
  slugify,
  taskBranchName,
  validateAssignments,
  type RoadmapTask,
} from '../scripts/automation/supervisor-lib.mjs';

const roadmap: RoadmapTask[] = [
  { id: 'DONE-001', title: 'Done', status: 'completed', dependencies: [] },
  {
    id: 'READY-001',
    title: 'Ready Task',
    status: 'ready',
    dependencies: ['DONE-001'],
    owner: 'world',
  },
  {
    id: 'BLOCKED-001',
    title: 'Blocked Task',
    status: 'ready',
    dependencies: ['MISSING-001'],
    owner: 'world',
  },
];

describe('local Codex supervisor policy', () => {
  it('selects only dependency-ready tasks without active state', () => {
    expect(readyRoadmapTasks(roadmap)).toEqual([roadmap[1]]);
    expect(
      readyRoadmapTasks(roadmap, {
        'READY-001': { status: 'complete' },
      }),
    ).toEqual([]);
  });

  it('rejects duplicate and conflicting assignments deterministically', () => {
    const result = validateAssignments({
      assignments: [
        { taskId: 'READY-001', rationale: 'Ready now', scope: 'World only' },
        { taskId: 'READY-001', rationale: 'Again', scope: 'Duplicate' },
        { taskId: 'BLOCKED-001', rationale: 'Too early', scope: 'Blocked' },
      ],
      candidates: [roadmap[1]!],
      maxAssignments: 4,
    });

    expect(result.accepted).toHaveLength(1);
    expect(result.rejected.map((item) => item.reason)).toEqual([
      'task already has active state',
      'task is not dependency-ready',
    ]);
  });

  it('creates bounded stable branch names', () => {
    expect(slugify('A Big / Strange Task!')).toBe('a-big-strange-task');
    expect(taskBranchName(roadmap[1]!)).toBe('worker/ready-001-ready-task');
  });

  it('accepts only non-empty patch-equivalent cherry output', () => {
    expect(patchEquivalentFromCherryOutput('')).toBe(false);
    expect(patchEquivalentFromCherryOutput('- abc\n- def\n')).toBe(true);
    expect(patchEquivalentFromCherryOutput('+ abc\n')).toBe(false);
  });

  it('cleans only integrated, inactive, clean, equivalent worktrees', () => {
    expect(
      canCleanTask(
        { status: 'integrated' },
        {
          registered: true,
          isMain: false,
          processAlive: false,
          clean: true,
          patchEquivalent: true,
        },
      ).eligible,
    ).toBe(true);

    expect(
      canCleanTask(
        { status: 'integrated' },
        {
          registered: true,
          isMain: false,
          processAlive: false,
          clean: false,
          patchEquivalent: true,
        },
      ),
    ).toEqual({ eligible: false, reason: 'worktree is dirty' });
  });
});
