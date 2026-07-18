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

  it('validates minimap bounds and authoritative entry references', () => {
    const invalid: LevelDefinition = {
      ...testDistrict.definition,
      mapPresentation: {
        orientation: 'north-up',
        bounds: { minX: 10, maxX: -10, minZ: -10, maxZ: 10 },
        geometry: [{ entryId: 'v.missing-road', layer: 'roads' }],
        markers: [
          { entryId: 'landmark.missing', layer: 'landmarks' },
          { entryId: 'landmark.missing', layer: 'spawns' },
        ],
      },
    };

    expect(() => validateLevelDefinition(invalid)).toThrow(/bounds minimums/);
    expect(() => validateLevelDefinition(invalid)).toThrow(/missing-road/);
    expect(() => validateLevelDefinition(invalid)).toThrow(/duplicates entry/);
    expect(() => validateLevelDefinition(invalid)).toThrow(/spawns marker/);
  });

  it('bounds lamp lights and validates their visual references', () => {
    const invalid: LevelDefinition = {
      ...testDistrict.definition,
      lighting: {
        lamps: Array.from({ length: 5 }, (_, index) => ({
          id: `lamp.invalid-${index}`,
          visualId: 'v.missing-lamp',
          position: [0, 6, index],
          emissiveMaterialName: ' ',
        })),
      },
    };

    expect(() => validateLevelDefinition(invalid)).toThrow(/at most 4/);
    expect(() => validateLevelDefinition(invalid)).toThrow(
      /missing environment/,
    );
    expect(() => validateLevelDefinition(invalid)).toThrow(
      /emissiveMaterialName is empty/,
    );
  });
});
