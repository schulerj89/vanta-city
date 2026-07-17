import {
  DefinitionLevelLocations,
  findSpawn,
} from '../../src/world/LevelQueries';
import { testDistrict } from '../../src/world/levels/testDistrict';

describe('level location lookup', () => {
  const level = testDistrict.definition;

  it('finds the default and named spawns', () => {
    expect(findSpawn(level).id).toBe('spawn.player-default');
    expect(findSpawn(level, 'spawn.npc-mechanic').kind).toBe('npc');
  });

  it('fails clearly for an unknown spawn', () => {
    expect(() => findSpawn(level, 'spawn.missing')).toThrow(
      'Unknown spawn "spawn.missing"',
    );
  });

  it('provides semantic locations without scene traversal', () => {
    const locations = new DefinitionLevelLocations(level);
    expect(locations.getLocation('mission.intersection-center').kind).toBe(
      'mission',
    );
    expect(locations.getTrigger('trigger.intersection-center').tags).toContain(
      'future-mission',
    );
    expect(
      locations.getCinematicAnchor('camera.intersection-overhead').fieldOfView,
    ).toBe(50);
    expect(locations.getStaticColliders().length).toBeGreaterThan(15);
  });
});
