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
    expect(locations.getLocation('mission.loading-deck').kind).toBe('mission');
    expect(locations.getTrigger('trigger.deck-zone').tags).toContain('mission');
    expect(locations.getCinematicAnchor('camera.deck-reveal').fieldOfView).toBe(
      42,
    );
    expect(locations.getStaticColliders().length).toBeGreaterThan(20);
  });
});
