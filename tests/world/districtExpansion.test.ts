import { Vector3 } from 'three';
import { StaticCollisionWorld } from '../../src/physics/CollisionWorld';
import { defaultPlayerMovementConfig } from '../../src/player/PlayerMovement';
import { findSpawn } from '../../src/world/LevelQueries';
import { testDistrict } from '../../src/world/levels/testDistrict';

const outerSpawns = [
  'spawn.outer-north-gate',
  'spawn.outer-south-gate',
  'spawn.outer-east-plaza',
  'spawn.outer-west-yard',
  'spawn.outer-overlook',
] as const;

describe('expanded test district', () => {
  it('keeps named outer spawns on authored collision near ±40m', () => {
    const collision = new StaticCollisionWorld();
    collision.addDefinitions(testDistrict.definition.staticCollision);
    for (const id of outerSpawns) {
      const spawn = findSpawn(testDistrict.definition, id);
      expect(
        Math.max(Math.abs(spawn.position[0]), Math.abs(spawn.position[2])),
      ).toBeGreaterThanOrEqual(30);
      const result = collision.moveCharacter(
        new Vector3(...spawn.position),
        new Vector3(0, -1, 0),
        defaultPlayerMovementConfig,
        false,
      );
      expect(result.grounded, id).toBe(true);
      expect(result.groundColliderId, id).not.toBe('world-floor');
    }
  });

  it('pairs every expansion visual with equivalent collision geometry', () => {
    const visuals = new Map(
      testDistrict.definition.environment.map((entry) => [entry.id, entry]),
    );
    const expanded = testDistrict.definition.staticCollision.filter(
      ({ id }) =>
        id.includes('north') ||
        id.includes('south') ||
        id.includes('east-plaza') ||
        id.includes('west-yard') ||
        id.includes('overlook'),
    );
    expect(expanded.length).toBeGreaterThan(15);
    for (const collider of expanded) {
      const visual = visuals.get(collider.id.replace(/^c\./, 'v.'));
      expect(visual, collider.id).toBeDefined();
      expect(visual?.position, collider.id).toEqual(collider.position);
      if (visual?.kind === 'box') {
        expect(visual.size, collider.id).toEqual(collider.size);
        expect(visual.rotation, collider.id).toEqual(collider.rotation);
      }
    }
  });

  it('closes representative route edges with visible boundary collision', () => {
    const collision = new StaticCollisionWorld();
    collision.addDefinitions(testDistrict.definition.staticCollision);
    const probes = [
      [[0, 1, 38], [0, 1, 46], 'c.boundary-north'],
      [[27.5, 1, 4], [27.5, 1, 14], 'c.boundary-east-link-north'],
      [[-27.5, 1, -30], [-27.5, 1, -20], 'c.boundary-west-link-north'],
      [[38, 1, -10], [45, 1, -10], 'c.boundary-overlook-approach-east'],
    ] as const;
    for (const [from, to, expected] of probes) {
      expect(
        collision.castSegment(new Vector3(...from), new Vector3(...to))
          .colliderId,
      ).toBe(expected);
    }
  });
});
