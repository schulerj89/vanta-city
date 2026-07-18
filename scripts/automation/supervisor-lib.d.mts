export interface RoadmapTask {
  id: string;
  title: string;
  status: string;
  dependencies?: string[];
  owner?: string;
  duplicateKey?: string;
}

export function slugify(value: string): string;
export function taskBranchName(task: RoadmapTask): string;
export function patchEquivalentFromCherryOutput(output: string): boolean;
export function readyRoadmapTasks(
  roadmap: RoadmapTask[],
  stateTasks?: Record<string, { status: string }>,
): RoadmapTask[];
export function validateAssignments(options: {
  assignments: Array<{
    taskId: string;
    rationale: string;
    scope: string;
    validationFocus?: string[];
    overlapRisks?: string[];
  }>;
  candidates: RoadmapTask[];
  maxAssignments: number;
  occupiedTaskIds?: string[];
  occupiedOwners?: string[];
  occupiedDuplicateKeys?: string[];
}): {
  accepted: Array<{ task: RoadmapTask }>;
  rejected: Array<{ reason: string }>;
};
export function canCleanTask(
  taskState: { status: string },
  audit: {
    registered: boolean;
    isMain: boolean;
    processAlive: boolean;
    clean: boolean;
    patchEquivalent: boolean;
  },
): { eligible: boolean; reason: string };
export function acquireDirectoryLock(
  lockPath: string,
  metadata: { pid: number; mode: string; startedAt: string },
  staleAfterMs: number,
): Promise<() => Promise<void>>;
export function atomicWriteJson(
  filePath: string,
  value: unknown,
): Promise<void>;
