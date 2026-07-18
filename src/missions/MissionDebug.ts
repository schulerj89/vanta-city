import { debugSections, type DebugRegistry } from '../debug/DebugRegistry';
import type { MissionSystem } from './MissionSystem';

export function registerMissionDebug(
  debug: DebugRegistry,
  missions: MissionSystem,
): readonly (() => void)[] {
  const group = debugSections.missions;
  return [
    debug.registerValue({
      id: 'mission.active',
      label: 'Active mission',
      group,
      read: () => missions.getSnapshot().activeMissionId,
    }),
    debug.registerValue({
      id: 'mission.objective',
      label: 'Current objective',
      group,
      read: () =>
        missions
          .getSnapshot()
          .missions.find(({ status }) => status === 'active')
          ?.currentObjectiveId,
    }),
    debug.registerValue({
      id: 'mission.revision',
      label: 'Revision',
      group,
      read: () => missions.getSnapshot().revision,
    }),
    debug.registerCommand({
      id: 'mission.start',
      label: 'Start mission',
      group,
      argumentLabel: 'mission id',
      run: (argument) => {
        const id = argument?.trim() || missions.definitions[0]?.id;
        if (!id || !missions.start(id)) {
          throw new Error(`Mission "${id ?? ''}" could not start`);
        }
      },
    }),
    debug.registerCommand({
      id: 'mission.complete-objective',
      label: 'Complete current objective',
      group,
      run: () => {
        if (!missions.completeCurrentObjective()) {
          throw new Error('No active mission objective');
        }
      },
    }),
    debug.registerCommand({
      id: 'mission.cancel',
      label: 'Cancel active mission',
      group,
      run: () => {
        if (!missions.cancel()) throw new Error('Mission cannot be cancelled');
      },
    }),
    debug.registerCommand({
      id: 'mission.fail',
      label: 'Fail active mission',
      group,
      run: () => {
        const id = missions.getSnapshot().activeMissionId;
        if (!id || !missions.fail(id, 'debug-request')) {
          throw new Error('No active mission to fail');
        }
      },
    }),
    debug.registerCommand({
      id: 'mission.retry',
      label: 'Retry failed mission',
      group,
      argumentLabel: 'mission id',
      run: (argument) => {
        const snapshot = missions.getSnapshot();
        const id =
          argument?.trim() ||
          snapshot.missions.find(({ retryReady }) => retryReady)?.id;
        if (!id || !missions.retry(id)) {
          throw new Error(`Mission "${id ?? ''}" is not retry-ready`);
        }
      },
    }),
  ];
}
