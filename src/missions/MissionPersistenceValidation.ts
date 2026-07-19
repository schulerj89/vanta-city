import type { MissionDefinition } from './MissionDefinition';
import type {
  MissionObjectiveStatus,
  MissionPersistenceSnapshot,
} from './MissionSystem';

/** Validates semantic mission-state invariants after structural decoding. */
export function missionPersistenceInvariantError(
  snapshot: MissionPersistenceSnapshot,
  definitions: readonly MissionDefinition[],
): string | undefined {
  if (
    snapshot.schemaVersion !== 1 ||
    !Number.isSafeInteger(snapshot.revision) ||
    snapshot.revision < 0 ||
    (snapshot.activeMissionId !== undefined &&
      typeof snapshot.activeMissionId !== 'string')
  ) {
    return 'invalid-mission-header';
  }
  const definitionsById = new Map(
    definitions.map((definition) => [definition.id, definition]),
  );
  const savedIds = new Set<string>();
  let activeId: string | undefined;
  for (const progress of snapshot.missions) {
    if (
      typeof progress.id !== 'string' ||
      !missionStatuses.has(progress.status) ||
      !Number.isSafeInteger(progress.attempt) ||
      progress.attempt < 0 ||
      !Array.isArray(progress.objectiveStatuses) ||
      progress.objectiveStatuses.some(
        (status: unknown) =>
          typeof status !== 'string' || !objectiveStatuses.has(status),
      ) ||
      typeof progress.rewardGranted !== 'boolean' ||
      (progress.failureReason !== undefined &&
        typeof progress.failureReason !== 'string')
    ) {
      return 'invalid-progress-shape';
    }
    if (savedIds.has(progress.id)) return 'duplicate-mission-id';
    savedIds.add(progress.id);
    const definition = definitionsById.get(progress.id);
    if (!definition) return 'unknown-mission-id';
    if (progress.objectiveStatuses.length !== definition.objectives.length) {
      return 'incompatible-objective-topology';
    }
    if (!validProgressTopology(progress)) return 'invalid-progress-topology';
    if (progress.status === 'active') {
      if (activeId) return 'multiple-active-missions';
      activeId = progress.id;
    }
  }
  if (activeId !== snapshot.activeMissionId) return 'invalid-active-mission';
  return undefined;
}

const missionStatuses = new Set([
  'locked',
  'available',
  'active',
  'completed',
  'cancelled',
  'failed',
]);
const objectiveStatuses = new Set(['locked', 'active', 'completed']);

function validProgressTopology(
  progress: MissionPersistenceSnapshot['missions'][number],
): boolean {
  const allLocked = progress.objectiveStatuses.every(
    (status) => status === 'locked',
  );
  const allCompleted = progress.objectiveStatuses.every(
    (status) => status === 'completed',
  );
  const activeChain = isActiveObjectiveChain(progress.objectiveStatuses);
  const hasFailure =
    typeof progress.failureReason === 'string' &&
    progress.failureReason.trim().length > 0;
  switch (progress.status) {
    case 'locked':
    case 'available':
      return (
        progress.attempt === 0 &&
        allLocked &&
        !progress.rewardGranted &&
        !hasFailure &&
        progress.failureReason === undefined
      );
    case 'active':
      return (
        progress.attempt > 0 &&
        activeChain &&
        !progress.rewardGranted &&
        progress.failureReason === undefined
      );
    case 'completed':
      return (
        progress.attempt > 0 &&
        allCompleted &&
        progress.rewardGranted &&
        progress.failureReason === undefined
      );
    case 'cancelled':
      return (
        progress.attempt > 0 &&
        allLocked &&
        !progress.rewardGranted &&
        progress.failureReason === undefined
      );
    case 'failed':
      return (
        progress.attempt > 0 &&
        activeChain &&
        !progress.rewardGranted &&
        hasFailure
      );
  }
}

function isActiveObjectiveChain(
  statuses: readonly MissionObjectiveStatus[],
): boolean {
  const activeIndex = statuses.indexOf('active');
  return (
    activeIndex >= 0 &&
    statuses.lastIndexOf('active') === activeIndex &&
    statuses.slice(0, activeIndex).every((status) => status === 'completed') &&
    statuses.slice(activeIndex + 1).every((status) => status === 'locked')
  );
}
