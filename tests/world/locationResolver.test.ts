import type { LevelDefinition } from '../../src/world/LevelDefinition';
import { resolveLevelLocation } from '../../src/world/LocationResolver';
import { testDistrict } from '../../src/world/levels/testDistrict';

describe('resolveLevelLocation', () => {
  it('resolves outer landmarks and inclusive zone boundaries', () => {
    expect(
      resolveLevelLocation(testDistrict.definition, { x: 38, y: 0, z: 4 }),
    ).toMatchObject({
      id: 'landmark.exchange-beacon',
      kind: 'landmark',
    });
    expect(
      resolveLevelLocation(testDistrict.definition, { x: 21, y: 0, z: 32 }),
    ).toMatchObject({ id: 'zone.north-market', kind: 'zone' });
  });

  it('uses priority, then smaller volume, then id for overlaps', () => {
    const level: LevelDefinition = {
      ...testDistrict.definition,
      zones: [
        {
          id: 'zone.large',
          name: 'Large',
          position: [0, 0, 0],
          size: [20, 20, 20],
          priority: 2,
        },
        {
          id: 'zone.small',
          name: 'Small',
          position: [0, 0, 0],
          size: [5, 5, 5],
          priority: 2,
        },
        {
          id: 'zone.priority',
          name: 'Priority',
          position: [0, 0, 0],
          size: [30, 30, 30],
          priority: 3,
        },
      ],
      landmarks: [],
    };
    expect(resolveLevelLocation(level, { x: 0, y: 0, z: 0 }).id).toBe(
      'zone.priority',
    );
    expect(
      resolveLevelLocation(
        { ...level, zones: level.zones.slice(0, 2) },
        { x: 0, y: 0, z: 0 },
      ).id,
    ).toBe('zone.small');
  });

  it('uses a nearby landmark before falling back to the level name', () => {
    const landmarkOnly: LevelDefinition = {
      ...testDistrict.definition,
      zones: [],
      landmarks: [
        {
          id: 'landmark.nearby',
          name: 'Nearby',
          position: [0, 0, 0],
          radius: 1,
        },
      ],
    };
    expect(
      resolveLevelLocation(landmarkOnly, { x: 5, y: 0, z: 0 }),
    ).toMatchObject({ id: 'landmark.nearby', kind: 'landmark', distance: 5 });
    expect(
      resolveLevelLocation(testDistrict.definition, { x: 100, y: 0, z: 100 }),
    ).toMatchObject({
      id: 'test-district',
      name: 'Foundry Test Block',
      kind: 'level',
    });
  });
});
