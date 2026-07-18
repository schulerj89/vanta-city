import {
  CinematicCatalog,
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
});
