import {
  CinematicCatalog,
  type CinematicDefinition,
  validateCinematicDefinition,
} from '../src/cinematics/CinematicDefinition';
import { cinematicDefinitions } from '../src/cinematics/cinematics';

describe('CinematicDefinition', () => {
  it('keeps the Ashfall opening data-only, stable, and dependency explicit', () => {
    const catalog = new CinematicCatalog(cinematicDefinitions);
    const opening = catalog.get('cinematic.ash-001.opening');
    expect(opening).toMatchObject({
      missionId: 'ash-001-walk-the-block',
      participantIds: ['casual', 'mack'],
      speakerIds: ['rook', 'mack'],
      skipPolicy: 'confirm',
      restorationPolicy: 'exact-prior-gameplay',
    });
    expect(opening?.shots.map(({ id }) => id)).toEqual([
      'shot.ash-001.north-arrival',
      'shot.ash-001.junction-watch',
      'shot.ash-001.mack-position',
    ]);
    expect(JSON.parse(JSON.stringify(opening))).toEqual(opening);
  });

  it('rejects subtitle windows outside their shot', () => {
    const opening = cinematicDefinitions[0];
    expect(() =>
      validateCinematicDefinition({
        ...opening,
        shots: [
          {
            ...opening.shots[0],
            subtitle: { ...opening.shots[0].subtitle, endSeconds: 99 },
          },
        ],
      }),
    ).toThrow('invalid subtitle timing');
  });

  it('accepts ordered multi-cue shots and rejects overlapping subtitle authority', () => {
    const opening = cinematicDefinitions[0];
    const first = opening.shots[0];
    const cueOne = {
      id: 'cue.one',
      speakerId: 'mack',
      text: 'First.',
      startSeconds: 0.1,
      endSeconds: 1,
    };
    const cueTwo = {
      id: 'cue.two',
      speakerId: 'rook',
      text: 'Second.',
      startSeconds: 1.2,
      endSeconds: 2.2,
    };
    const multiCue: CinematicDefinition = {
      ...opening,
      shots: [
        {
          ...first,
          subtitle: undefined,
          subtitleCues: [cueOne, cueTwo],
        },
      ],
    };
    expect(() => validateCinematicDefinition(multiCue)).not.toThrow();
    expect(() =>
      validateCinematicDefinition({
        ...multiCue,
        shots: [
          {
            ...multiCue.shots[0]!,
            subtitleCues: [
              cueOne,
              {
                ...cueTwo,
                startSeconds: 0.9,
              },
            ],
          },
        ],
      }),
    ).toThrow('invalid subtitle timing');
  });

  it('requires destination and landing data as one authoritative policy', () => {
    const opening = cinematicDefinitions[0];
    expect(() =>
      validateCinematicDefinition({
        ...opening,
        restorationPolicy: 'authoritative-destination',
      }),
    ).toThrow('incomplete destination transaction');
  });

  it('does not admit applause as a generic performance intent', () => {
    const opening = cinematicDefinitions[0];
    expect(() =>
      validateCinematicDefinition({
        ...opening,
        shots: [
          {
            ...opening.shots[0],
            participantIds: ['casual', 'mack'],
            performanceRequests: [
              {
                cueId: 'performance.invalid.clap',
                shotId: opening.shots[0].id,
                atSeconds: 0,
                participantId: 'mack',
                intent: 'clapping',
                phase: 'start',
                missingPerformancePolicy: 'block',
              },
            ],
          },
        ],
      } as unknown as CinematicDefinition),
    ).toThrow('invalid performance request');
  });
});
