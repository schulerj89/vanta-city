import type { CinematicDefinition } from './CinematicDefinition';

export const cinematicDefinitions = [
  {
    id: 'cinematic.ash-001.opening',
    storyBeatId: 'ash-001-walk-the-block',
    missionId: 'ash-001-walk-the-block',
    participantIds: ['casual', 'mack'],
    speakerIds: ['rook', 'mack'],
    entryEventId: 'cinematic.ash-001.opening.entered',
    completionEventId: 'cinematic.ash-001.opening.completed',
    skipPolicy: 'confirm',
    dependencies: {
      levelId: 'test-district',
      locationId: 'landmark.north-approach',
      cameraAnchorIds: [
        'camera.ash-001.north-arrival',
        'camera.ash-001.junction-watch',
        'camera.ash-001.mack-position',
      ],
      assetIds: [],
      animationIds: [],
      worldFactIds: [],
    },
    restorationPolicy: 'exact-prior-gameplay',
    shots: [
      {
        id: 'shot.ash-001.north-arrival',
        purpose:
          'Place Rook on the salt-bright north approach and make the late arrival feel observed.',
        cameraAnchorId: 'camera.ash-001.north-arrival',
        durationSeconds: 3.4,
        transition: 'ease',
        transitionSeconds: 0.45,
        obstructionPolicy: 'shared-camera-collision',
        participantIds: ['casual'],
        subtitle: {
          speakerId: 'mack',
          text: 'You picked a fine morning to be late.',
          startSeconds: 0.35,
          endSeconds: 3.1,
        },
        safeFrame: { minSubjectMarginPercent: 9, narrowFieldOfView: 48 },
      },
      {
        id: 'shot.ash-001.junction-watch',
        purpose:
          'Reveal the open crossing as a watched space instead of a welcoming destination.',
        cameraAnchorId: 'camera.ash-001.junction-watch',
        durationSeconds: 3.2,
        transition: 'ease',
        transitionSeconds: 0.4,
        obstructionPolicy: 'shared-camera-collision',
        participantIds: ['casual'],
        subtitle: {
          speakerId: 'rook',
          text: 'Junction is watching the north road.',
          startSeconds: 0.3,
          endSeconds: 2.9,
        },
        safeFrame: { minSubjectMarginPercent: 8, narrowFieldOfView: 50 },
      },
      {
        id: 'shot.ash-001.mack-position',
        purpose:
          'Point the player west toward Mack without replacing the mission objective.',
        cameraAnchorId: 'camera.ash-001.mack-position',
        durationSeconds: 3.5,
        transition: 'ease',
        transitionSeconds: 0.45,
        obstructionPolicy: 'shared-camera-collision',
        participantIds: ['mack'],
        subtitle: {
          speakerId: 'mack',
          text: 'Garage. West side. Get here without bringing the audience.',
          startSeconds: 0.3,
          endSeconds: 3.25,
        },
        safeFrame: { minSubjectMarginPercent: 10, narrowFieldOfView: 46 },
      },
    ],
  },
] as const satisfies readonly CinematicDefinition[];
