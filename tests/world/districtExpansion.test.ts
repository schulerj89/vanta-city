import { Vector3 } from 'three';
import { StaticCollisionWorld } from '../../src/physics/CollisionWorld';
import { defaultPlayerMovementConfig } from '../../src/player/PlayerMovement';
import { findSpawn } from '../../src/world/LevelQueries';
import {
  ashfallExpansionPlan,
  eastQuayCurvedRoad,
  intersectionLayout,
  sparringTargetArea,
} from '../../src/world/levels/intersectionLayout';
import {
  world002ABuildingPlacements,
  world002APlan,
  world002ASidewalks,
  world002AWestRoad,
  world002BBuildingPlacements,
  world002BContact,
  world002BPlan,
  world002BRimSpawns,
  world002BRoads,
  world002BSidewalks,
} from '../../src/world/levels/junctionGrowth';
import {
  offsetSplineSamples,
  sampleSplineRoad,
  splineRoadColliders,
} from '../../src/world/levels/SplineRoadGeometry';
import {
  ashfallBuildingPlacements,
  testDistrict,
} from '../../src/world/levels/testDistrict';

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

  it('pairs road, sidewalk, and boundary primitives with collision geometry', () => {
    const visuals = new Map(
      testDistrict.definition.environment.map((entry) => [entry.id, entry]),
    );
    const structural = testDistrict.definition.staticCollision.filter(
      ({ id }) =>
        !id.includes('east-quay-curve') &&
        (id.startsWith('c.road-') ||
          id.startsWith('c.sidewalk-') ||
          id.startsWith('c.east-quay-ground') ||
          id.startsWith('c.boundary-')),
    );
    expect(structural).toHaveLength(23);
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
      [[30, 1, 32], [30, 1, 36], 'c.boundary-north'],
      [[30, 1, -32], [30, 1, -36], 'c.boundary-south'],
      [[48, 1, 0], [52, 1, 0], 'c.boundary-east'],
      [[-34, 1, 0], [-38, 1, 0], 'c.boundary-west'],
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
        position: [7, 3, 0],
        size: [world002BPlan.widthMetres, 10, world002BPlan.depthMetres],
      }),
    );
    expect(testDistrict.definition.environment).toContainEqual(
      expect.objectContaining({
        id: 'v.traffic-light',
        position: intersectionLayout.trafficLight,
      }),
    );
  });

  it('records an exact 25 percent playable-area expansion inside the milestone gate', () => {
    const { bounds } = ashfallExpansionPlan;
    const measuredArea =
      (bounds.maxX - bounds.minX) * (bounds.maxZ - bounds.minZ);
    expect(measuredArea).toBe(3920);
    expect(measuredArea).toBe(ashfallExpansionPlan.playableAreaSquareMetres);
    expect(measuredArea).toBeGreaterThanOrEqual(3763);
    expect(measuredArea).toBeLessThanOrEqual(4077);
    expect(
      ((measuredArea - ashfallExpansionPlan.baselineAreaSquareMetres) /
        ashfallExpansionPlan.baselineAreaSquareMetres) *
        100,
    ).toBe(25);
    expect(testDistrict.definition.mapPresentation.bounds).not.toEqual(bounds);
  });

  it('records WORLD-002A as a separately measured exact 25 percent milestone', () => {
    const baselineArea =
      (world002ABaselineBounds.maxX - world002ABaselineBounds.minX) *
      (world002ABaselineBounds.maxZ - world002ABaselineBounds.minZ);
    const { bounds } = world002APlan;
    const measuredArea =
      (bounds.maxX - bounds.minX) * (bounds.maxZ - bounds.minZ);
    expect(baselineArea).toBe(3920);
    expect(measuredArea).toBe(4900);
    expect(((measuredArea - baselineArea) / baselineArea) * 100).toBe(25);
    expect(world002APlan.addedBuildingIds).toHaveLength(6);
    expect(world002APlan.addedSectorIds).toHaveLength(4);
  });

  it('records WORLD-002B as a second exact 25 percent area milestone and final linear growth', () => {
    const areaA =
      (world002APlan.bounds.maxX - world002APlan.bounds.minX) *
      (world002APlan.bounds.maxZ - world002APlan.bounds.minZ);
    const { bounds } = world002BPlan;
    const areaB = (bounds.maxX - bounds.minX) * (bounds.maxZ - bounds.minZ);
    expect(areaA).toBe(4900);
    expect(areaB).toBe(6125);
    expect(((areaB - areaA) / areaA) * 100).toBe(25);
    expect(world002BPlan.widthMetres / 70).toBe(1.25);
    expect(world002BPlan.depthMetres / 56).toBe(1.25);
    expect(testDistrict.definition.mapPresentation.bounds).toEqual(bounds);
    expect(ashfallBuildingPlacements).toHaveLength(22);
    expect(testDistrict.definition.streaming.sectors).toHaveLength(14);
    expect(
      testDistrict.definition.streaming.sectors.map(({ id }) => id),
    ).toEqual(
      expect.arrayContaining([
        ...world002APlan.addedSectorIds,
        ...world002BPlan.addedSectorIds,
      ]),
    );
  });

  it('authors populated, collidable WORLD-002B sidewalks and north/south roads', () => {
    for (const pair of [...world002BRoads, ...world002BSidewalks]) {
      expect(testDistrict.definition.environment).toContainEqual(pair.visual);
      expect(testDistrict.definition.staticCollision).toContainEqual(
        pair.collider,
      );
    }
    expect(world002BBuildingPlacements).toHaveLength(6);
  });

  it('grounds the distant contact-yard approach and exposes its reveal anchor', () => {
    const collision = new StaticCollisionWorld();
    collision.addDefinitions(testDistrict.definition.staticCollision);
    const spawn = findSpawn(testDistrict.definition, world002BContact.spawnId);
    const grounded = collision.moveCharacter(
      new Vector3(...spawn.position),
      new Vector3(0, -1, 0),
      defaultPlayerMovementConfig,
      false,
    );
    expect(grounded.grounded).toBe(true);
    expect(grounded.groundColliderId).toBe('c.sidewalk-north-rim-east');
    expect(
      Math.hypot(spawn.position[0] + 12, spawn.position[2] - 9.5),
    ).toBeGreaterThan(45);
    expect(testDistrict.definition.locations).toContainEqual(
      expect.objectContaining({ id: world002BContact.locationId }),
    );
    expect(testDistrict.definition.cinematicAnchors).toContainEqual(
      expect.objectContaining({ id: world002BContact.cameraAnchorId }),
    );
  });

  it('grounds authored visual-review spawns on every final outer direction', () => {
    const collision = new StaticCollisionWorld();
    collision.addDefinitions(testDistrict.definition.staticCollision);
    for (const { id, position } of world002BRimSpawns) {
      const grounded = collision.moveCharacter(
        new Vector3(...position),
        new Vector3(0, -1, 0),
        defaultPlayerMovementConfig,
        false,
      );
      expect(grounded.grounded, id).toBe(true);
    }
  });

  it('authors populated, collidable WORLD-002A sidewalks and west road', () => {
    for (const pair of [world002AWestRoad, ...world002ASidewalks]) {
      expect(testDistrict.definition.environment).toContainEqual(pair.visual);
      expect(testDistrict.definition.staticCollision).toContainEqual(
        pair.collider,
      );
    }
    expect(world002ABuildingPlacements).toHaveLength(6);
    expect(
      new Set(world002ABuildingPlacements.map(({ visual }) => visual.variantId))
        .size,
    ).toBeGreaterThanOrEqual(3);
  });

  it('derives curved-road collision and sector ownership from the authored spline', () => {
    const derived = splineRoadColliders(eastQuayCurvedRoad);
    expect(derived).toHaveLength(eastQuayCurvedRoad.segments);
    for (const collider of derived)
      expect(testDistrict.definition.staticCollision).toContainEqual(collider);
    const owners = testDistrict.definition.streaming.sectors.filter((sector) =>
      sector.entryIds.includes(eastQuayCurvedRoad.id),
    );
    expect(owners.map(({ id }) => id)).toEqual([
      ashfallExpansionPlan.addedSectorId,
    ]);

    const collision = new StaticCollisionWorld();
    collision.addDefinitions(testDistrict.definition.staticCollision);
    for (const collider of derived) {
      const { position } = collider;
      const grounded = collision.moveCharacter(
        new Vector3(position[0], 0.5, position[2]),
        new Vector3(0, -1, 0),
        defaultPlayerMovementConfig,
        false,
      );
      expect(grounded.grounded).toBe(true);
      expect(grounded.groundColliderId).toMatch(
        /c\.(?:road-east-quay-curve|sidewalk-east-rim)/,
      );
    }
  });

  it('keeps the entire curved road inside playable bounds with tangent joins', () => {
    const center = sampleSplineRoad(eastQuayCurvedRoad);
    const edges = [
      ...offsetSplineSamples(center, eastQuayCurvedRoad.width / 2),
      ...offsetSplineSamples(center, -eastQuayCurvedRoad.width / 2),
    ];
    for (const { position } of edges) {
      expect(position[0]).toBeGreaterThanOrEqual(world002APlan.bounds.minX);
      expect(position[0]).toBeLessThanOrEqual(world002APlan.bounds.maxX);
      expect(position[2]).toBeGreaterThanOrEqual(world002APlan.bounds.minZ);
      expect(position[2]).toBeLessThanOrEqual(world002APlan.bounds.maxZ);
    }
    expect(center[0]!.tangent).toEqual([1, 0]);
    expect(center.at(-1)!.tangent).toEqual([1, 0]);
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

  it('registers imported models as local documented CC0 assets', () => {
    for (const descriptor of Object.values(testDistrict.assets)) {
      if (descriptor.type !== 'model') continue;
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

const world002ABaselineBounds = {
  minX: -28,
  maxX: 42,
  minZ: -28,
  maxZ: 28,
} as const;
