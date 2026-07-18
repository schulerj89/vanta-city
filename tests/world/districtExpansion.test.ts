import { Vector3 } from 'three';
import { StaticCollisionWorld } from '../../src/physics/CollisionWorld';
import { defaultPlayerMovementConfig } from '../../src/player/PlayerMovement';
import { findSpawn } from '../../src/world/LevelQueries';
import {
  intersectionLayout,
  sparringTargetArea,
} from '../../src/world/levels/intersectionLayout';
import { testDistrict } from '../../src/world/levels/testDistrict';

const approaches = [
  'spawn.approach-north',
  'spawn.approach-east',
  'spawn.approach-south',
  'spawn.approach-west',
] as const;

describe('Ashfall Junction intersection', () => {
  it('grounds every named approach on authoritative road collision', () => {
    const collision = new StaticCollisionWorld();
    collision.addDefinitions(testDistrict.definition.staticCollision);
    for (const id of approaches) {
      const spawn = findSpawn(testDistrict.definition, id);
      const result = collision.moveCharacter(
        new Vector3(...spawn.position),
        new Vector3(0, -1, 0),
        defaultPlayerMovementConfig,
        false,
      );
      expect(result.grounded, id).toBe(true);
      expect(result.groundColliderId, id).toMatch(/c\.road-/);
    }
  });

  it('pairs structural primitive visuals with equivalent collision geometry', () => {
    const visuals = new Map(
      testDistrict.definition.environment.map((entry) => [entry.id, entry]),
    );
    const structural = testDistrict.definition.staticCollision.filter(
      ({ id }) =>
        id.startsWith('c.road-') ||
        id.startsWith('c.sidewalk-') ||
        id.startsWith('c.ruin-') ||
        id.startsWith('c.boundary-'),
    );
    expect(structural).toHaveLength(14);
    for (const definition of structural) {
      const visual = visuals.get(definition.id.replace(/^c\./, 'v.'));
      expect(visual, definition.id).toBeDefined();
      expect(visual?.position, definition.id).toEqual(definition.position);
      if (visual?.kind === 'box') expect(visual.size).toEqual(definition.size);
    }
  });

  it('closes all four visible outer edges with boundary collision', () => {
    const collision = new StaticCollisionWorld();
    collision.addDefinitions(testDistrict.definition.staticCollision);
    for (const [from, to, expected] of [
      [[0, 1, 25], [0, 1, 30], 'c.boundary-north'],
      [[0, 1, -25], [0, 1, -30], 'c.boundary-south'],
      [[25, 1, 0], [30, 1, 0], 'c.boundary-east'],
      [[-25, 1, 0], [-30, 1, 0], 'c.boundary-west'],
    ] as const) {
      expect(
        collision.castSegment(new Vector3(...from), new Vector3(...to))
          .colliderId,
      ).toBe(expected);
    }
  });

  it('keeps level bounds, zone, and traffic-light transform on shared constants', () => {
    expect(testDistrict.definition.zones).toContainEqual(
      expect.objectContaining({
        id: 'zone.ashfall-junction',
        size: [intersectionLayout.footprint, 10, intersectionLayout.footprint],
      }),
    );
    expect(testDistrict.definition.environment).toContainEqual(
      expect.objectContaining({
        id: 'v.traffic-light',
        position: intersectionLayout.trafficLight,
      }),
    );
  });

  it('authors the sparring pad on clear northeast sidewalk collision', () => {
    const collision = new StaticCollisionWorld();
    collision.addDefinitions(testDistrict.definition.staticCollision);
    for (const position of [
      sparringTargetArea.target,
      sparringTargetArea.player,
    ]) {
      const result = collision.moveCharacter(
        new Vector3(...position),
        new Vector3(0, -0.4, 0),
        defaultPlayerMovementConfig,
        true,
      );
      expect(result.grounded).toBe(true);
      expect(result.groundColliderId).toBe(
        sparringTargetArea.supportColliderId,
      );
      expect(result.blockedColliderIds).toEqual([]);
    }
    expect(
      Math.hypot(
        sparringTargetArea.target[0] - intersectionLayout.signalController[0],
        sparringTargetArea.target[2] - intersectionLayout.signalController[2],
      ),
    ).toBeGreaterThan(5.5);
  });

  it('registers only local, documented CC0 environment assets', () => {
    for (const descriptor of Object.values(testDistrict.assets)) {
      expect(descriptor.attribution?.license).toBe('CC0 1.0');
      expect(descriptor.attribution?.sourceUrl).toMatch(
        /^https:\/\/poly\.pizza\/m\//,
      );
      expect(descriptor.url).toMatch(
        /^\/assets\/environment\/intersection\/[^/]+\.glb$/,
      );
    }
  });
});
