import { validateMissionDefinitions } from './MissionDefinition';
import type { MissionDefinition, MissionFactValue } from './MissionDefinition';

export const ashfallInitialMissionFacts: Readonly<
  Record<string, MissionFactValue>
> = Object.freeze({
  'orin-status': 'missing',
  'mack-trust': 'guarded',
  'pager-code-compromised': true,
  'rook-arrived-in-ashfall': false,
  'rook-accepted-orin-search': false,
  'marrow-has-rook-arrival-time': false,
});

export const missionDefinitions = validateMissionDefinitions([
  {
    id: 'ash-001-walk-the-block',
    title: 'Walk the Block',
    narrativePurpose:
      'Turn Rook’s arrival into a chosen search for Orin, establish Marrow’s paper trail, and send Rook across Ashfall for one consequential meeting instead of a chain of errands.',
    prerequisiteMissionIds: [],
    prerequisiteFacts: [],
    startCondition: {
      type: 'world-trigger-entered',
      triggerId: 'trigger.intersection-center',
    },
    startLocationId: 'mission.intersection-center',
    objectives: [
      {
        id: 'ash-001-hear-mack-out',
        summary: 'Speak with Mack about Orin’s missed pickup.',
        condition: {
          type: 'dialogue-completed',
          conversationId: 'conversation.mack.introduction',
        },
        highlights: [
          {
            id: 'highlight.ash-001.mack-introduction',
            channels: ['world'],
            target: { kind: 'spawn', referenceId: 'spawn.npc-mechanic' },
            label: 'Hear Mack out',
            priority: 'primary',
          },
        ],
      },
      {
        id: 'ash-001-meet-yard-contact',
        summary: 'Take the long road east and meet Nox at the contact yard.',
        condition: {
          type: 'world-location-entered',
          locationId: 'location.ash-001.contact-yard',
        },
        highlights: [
          {
            id: 'highlight.ash-001.contact-yard',
            channels: ['world', 'map'],
            target: {
              kind: 'location',
              referenceId: 'location.ash-001.contact-yard',
            },
            label: 'Meet Nox at the contact yard',
            priority: 'primary',
          },
        ],
      },
    ],
    contentRequests: [
      {
        kind: 'cinematic',
        referenceId: 'cinematic.ash-001.destination-reveal',
        optional: true,
        phase: 'objective-completed',
        objectiveId: 'ash-001-hear-mack-out',
      },
    ],
    cancellationUntilObjectiveId: 'ash-001-hear-mack-out',
    reward: {
      id: 'reward.ash-001-walk-the-block',
      moneyAmount: 75,
      equipmentIds: [],
      factChanges: {
        'rook-arrived-in-ashfall': true,
        'rook-accepted-orin-search': true,
        'marrow-has-rook-arrival-time': true,
        'contact-yard-meeting-completed': true,
        'mack-trust': 'conditional',
      },
    },
    persistentFactIds: [
      'rook-arrived-in-ashfall',
      'rook-accepted-orin-search',
      'marrow-has-rook-arrival-time',
      'contact-yard-meeting-completed',
      'mack-trust',
    ],
  },
] satisfies readonly MissionDefinition[]);
