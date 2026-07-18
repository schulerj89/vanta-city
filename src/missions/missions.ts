import { validateMissionDefinitions } from './MissionDefinition';
import type { MissionDefinition, MissionFactValue } from './MissionDefinition';

export const ashfallInitialMissionFacts: Readonly<
  Record<string, MissionFactValue>
> = Object.freeze({
  'orin-status': 'missing',
  'mack-trust': 'guarded',
  'pager-code-compromised': true,
});

export const missionDefinitions = validateMissionDefinitions([
  {
    id: 'ash-001-walk-the-block',
    title: 'Walk the Block',
    narrativePurpose:
      'Introduce Rook through behavior, preserve Mack’s existing conversation, establish Orin’s absence, and teach that observing a route is more valuable than rushing to a marker.',
    prerequisiteMissionIds: [],
    prerequisiteFacts: [],
    startCondition: {
      type: 'world-trigger-entered',
      triggerId: 'trigger.intersection-center',
    },
    startLocationId: 'mission.intersection-center',
    objectives: [
      {
        id: 'ash-001-enter-junction',
        summary:
          'Enter Ashfall Junction and let the district/location state resolve.',
        condition: {
          type: 'world-trigger-entered',
          triggerId: 'trigger.intersection-center',
        },
      },
      {
        id: 'ash-001-talk-to-mack',
        summary: 'Speak with Mack and complete his existing introduction.',
        condition: {
          type: 'event-hook',
          hookId: 'conversation.mack-introduction.completed',
        },
        highlights: [
          {
            id: 'highlight.ash-001.mack-introduction',
            channels: ['world'],
            target: { kind: 'spawn', referenceId: 'spawn.npc-mechanic' },
            label: 'Speak with Mack',
            priority: 'primary',
          },
        ],
      },
      {
        id: 'ash-001-check-signal-corner',
        summary: 'Inspect Signal Corner for a watcher and the first Orin clue.',
        condition: {
          type: 'interaction-completed',
          interactionId: 'interaction.signal-controller',
        },
        highlights: [
          {
            id: 'highlight.ash-001.signal-corner',
            channels: ['world', 'map'],
            target: {
              kind: 'interaction',
              referenceId: 'interaction.signal-controller',
            },
            label: 'Inspect Signal Corner',
            priority: 'primary',
          },
        ],
      },
      {
        id: 'ash-001-walk-south-approach',
        summary:
          'Cross the south approach to test whether the same vehicle circles back.',
        condition: {
          type: 'world-location-entered',
          locationId: 'landmark.south-approach',
        },
        highlights: [
          {
            id: 'highlight.ash-001.south-approach',
            channels: ['map'],
            target: {
              kind: 'landmark',
              referenceId: 'landmark.south-approach',
            },
            label: 'Cross the south approach',
            priority: 'primary',
          },
        ],
      },
      {
        id: 'ash-001-return-to-mack',
        summary:
          'Return to Mack and report the observed plate color and route.',
        condition: {
          type: 'entity-interaction-completed',
          entityId: 'mack',
        },
        highlights: [
          {
            id: 'highlight.ash-001.mack-return',
            channels: ['world'],
            target: { kind: 'spawn', referenceId: 'spawn.npc-mechanic' },
            label: 'Return to Mack',
            priority: 'primary',
          },
        ],
      },
    ],
    contentRequests: [
      {
        kind: 'cinematic',
        referenceId: 'cinematic.ash-001.opening',
        optional: true,
        phase: 'started',
      },
      {
        kind: 'cinematic',
        referenceId: 'cinematic.ash-001.mack-return',
        optional: true,
        phase: 'completed',
      },
    ],
    cancellationUntilObjectiveId: 'ash-001-talk-to-mack',
    reward: {
      id: 'reward.ash-001-walk-the-block',
      moneyAmount: 75,
      equipmentIds: [],
      factChanges: {
        'rook-arrived-in-ashfall': true,
        'junction-surveillance-checked': true,
        'mack-trust': 'conditional',
      },
    },
    persistentFactIds: [
      'rook-arrived-in-ashfall',
      'junction-surveillance-checked',
      'mack-trust',
    ],
  },
] satisfies readonly MissionDefinition[]);
