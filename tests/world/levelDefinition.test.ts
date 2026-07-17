import type { LevelDefinition } from '../../src/world/LevelDefinition';
import {
  LevelDefinitionError,
  validateLevelDefinition,
} from '../../src/world/LevelDefinition';
import { testDistrict } from '../../src/world/levels/testDistrict';

describe('validateLevelDefinition', () => {
  it('accepts the test district', () => {
    expect(() =>
      validateLevelDefinition(testDistrict.definition),
    ).not.toThrow();
  });

  it('requires exactly one default player spawn', () => {
    const invalid: LevelDefinition = {
      ...testDistrict.definition,
      spawns: testDistrict.definition.spawns.map((spawn) => ({
        ...spawn,
        default: false,
      })),
    };

    expect(() => validateLevelDefinition(invalid)).toThrow(
      /exactly one default player spawn/,
    );
  });

  it('reports duplicate ids and invalid dimensions together', () => {
    const first = testDistrict.definition.environment[0];
    if (!first || first.kind !== 'box') throw new Error('Missing test visual');
    const invalid: LevelDefinition = {
      ...testDistrict.definition,
      environment: [first, { ...first, size: [1, 0, 1] }],
    };

    try {
      validateLevelDefinition(invalid);
      throw new Error('Expected validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(LevelDefinitionError);
      expect((error as LevelDefinitionError).issues).toEqual(
        expect.arrayContaining([
          expect.stringContaining('duplicate entry id'),
          expect.stringContaining('must contain positive numbers'),
        ]),
      );
    }
  });

  it('rejects unsupported collider rotations at the authored boundary', () => {
    const collider = testDistrict.definition.staticCollision[0];
    const invalid: LevelDefinition = {
      ...testDistrict.definition,
      staticCollision: [
        { ...collider, rotation: [0.2, 0, 0] },
        {
          id: 'c.invalid-ramp',
          position: [0, 0, 0],
          size: [1, 1, 1],
          tags: ['ramp'],
          rotation: [0.2, 0.1, 0],
        },
      ],
    };

    expect(() => validateLevelDefinition(invalid)).toThrow(
      /boxes support yaw only/,
    );
    expect(() => validateLevelDefinition(invalid)).toThrow(
      /ramps support pitch only/,
    );
  });

  it('validates location metadata names, bounds, radius, and priority', () => {
    const invalid: LevelDefinition = {
      ...testDistrict.definition,
      zones: [
        {
          id: 'zone.invalid',
          name: ' ',
          position: [0, 0, 0],
          size: [1, 0, 1],
          priority: Number.NaN,
        },
      ],
      landmarks: [
        {
          id: 'landmark.invalid',
          name: '',
          position: [0, 0, 0],
          radius: 0,
          heightTolerance: -1,
        },
      ],
    };
    expect(() => validateLevelDefinition(invalid)).toThrow(/zone.invalid.name/);
    expect(() => validateLevelDefinition(invalid)).toThrow(/radius must be/);
    expect(() => validateLevelDefinition(invalid)).toThrow(
      /priority must be finite/,
    );
  });
});
