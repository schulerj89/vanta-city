import { Vector3 } from 'three';
import { StaticCollisionWorld } from '../../src/physics/CollisionWorld';
import { defaultPlayerMovementConfig } from '../../src/player/PlayerMovement';
import { pedestrianCollisionRadius } from '../../src/pedestrians/PedestrianBoundaryLifecyclePolicy';
import { findSpawn } from '../../src/world/LevelQueries';
import {
  ashfallExpansionPlan,
  eastQuayCurvedRoad,
  intersectionLayout,
  intersectionTrafficControls,
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
  world003BuildingPlacements,
  world003ContactYardApron,
  world003EastQuayRimSeam,
  world003EastQuayGroundFill,
  world003JunctionPlan,
  world003StreetEdgeVisuals,
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
    expect(structural).toHaveLength(26);
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
      [[0, 1, 32], [0, 1, 36], 'c.boundary-north-east'],
      [[7, 1, -32], [7, 1, -36], 'c.boundary-south'],
      [[48, 1, 0], [52, 1, 0], 'c.boundary-east'],
      [[-34, 1, 0], [-38, 1, 0], 'c.boundary-west'],
    ] as const) {
      expect(
        collision.castSegment(new Vector3(...from), new Vector3(...to))
          .colliderId,
      ).toBe(expected);
    }
    expect(
      collision.castSegment(new Vector3(-15, 1, 34), new Vector3(-15, 1, 36)),
    ).toMatchObject({ obstructed: false, colliderId: undefined });
  });

  it('keeps level bounds, zone, stop lines, and signal poles on shared constants', () => {
    expect(testDistrict.definition.zones).toContainEqual(
      expect.objectContaining({
        id: 'zone.ashfall-junction',
        position: [7, 3, 0],
        size: [world002BPlan.widthMetres, 10, world002BPlan.depthMetres],
      }),
    );
    for (const control of intersectionTrafficControls.approaches) {
      expect(testDistrict.definition.environment).toContainEqual(
        expect.objectContaining({
          id: `v.marking-stop-line-${control.approach}`,
          position: control.stopLine,
          size: control.stopLineSize,
        }),
      );
      expect(testDistrict.definition.staticCollision).toContainEqual(
        expect.objectContaining({
          id: `c.traffic-signal-${control.approach}`,
          position: [control.pole[0], 2.25, control.pole[2]],
        }),
      );
    }
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
    expect(ashfallBuildingPlacements).toHaveLength(25);
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
    expect(grounded.groundColliderId).toBe(
      world003ContactYardApron.collider.id,
    );
    expect(
      Math.hypot(spawn.position[0] + 12, spawn.position[2] - 9.5),
    ).toBeGreaterThan(45);
    expect(testDistrict.definition.locations).toContainEqual(
      expect.objectContaining({ id: world002BContact.locationId }),
    );
    expect(testDistrict.definition.cinematicAnchors).toContainEqual(
      expect.objectContaining({ id: world002BContact.cameraAnchorId }),
    );
    const revealCast = collision.castCamera(
      new Vector3(...world002BContact.cameraLookAt),
      new Vector3(...world002BContact.cameraPosition),
      0.22,
    );
    expect(revealCast).toMatchObject({ obstructed: false, fraction: 1 });
    const contactOffice = world003BuildingPlacements.find(
      ({ purpose }) => purpose === 'contact-yard',
    )!;
    const frontageZ =
      contactOffice.collider.position[2] - contactOffice.collider.size[2] / 2;
    expect(frontageZ - spawn.position[2]).toBeGreaterThanOrEqual(
      world002BPlan.minimumEntranceClearanceMetres,
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

  it('makes the final footprint legible without applying another area milestone', () => {
    expect(world003JunctionPlan.bounds).toBe(world002BPlan.bounds);
    expect(world003JunctionPlan.playableAreaSquareMetres).toBe(6125);
    expect(world003JunctionPlan.growthPercent).toBe(0);
    expect(ashfallBuildingPlacements).toHaveLength(
      world003JunctionPlan.buildingCountAfter,
    );
    expect(world003BuildingPlacements).toHaveLength(3);
    expect(world003StreetEdgeVisuals).toHaveLength(9);

    const owners = new Map<string, string[]>();
    for (const sector of testDistrict.definition.streaming.sectors) {
      for (const entryId of sector.entryIds) {
        const list = owners.get(entryId) ?? [];
        list.push(sector.id);
        owners.set(entryId, list);
      }
    }
    for (const entryId of [
      ...world003JunctionPlan.addedBuildingIds,
      ...world003JunctionPlan.streetEdgeVisualIds,
      ...world003JunctionPlan.seamSurfaceIds,
      world003ContactYardApron.visual.id,
      world003ContactYardApron.collider.id,
    ]) {
      expect(owners.get(entryId), entryId).toHaveLength(1);
    }
  });

  it('authors longer expanded-rim routes, including a grounded north-edge exit', () => {
    const routes = testDistrict.definition.pedestrians.routes.filter(({ id }) =>
      world003JunctionPlan.pedestrianRouteIds.includes(
        id as (typeof world003JunctionPlan.pedestrianRouteIds)[number],
      ),
    );
    expect(routes).toHaveLength(4);
    for (const route of routes) {
      const closed = [...route.nodes, route.nodes[0]!];
      const length = closed.slice(1).reduce((total, node, index) => {
        const prior = closed[index]!;
        return (
          total +
          Math.hypot(
            node.position[0] - prior.position[0],
            node.position[2] - prior.position[2],
          )
        );
      }, 0);
      expect(length, route.id).toBeGreaterThan(20);
      expect(
        new Set(route.nodes.map(({ surfaceColliderId }) => surfaceColliderId))
          .size,
      ).toBe(1);
      expect(route.nodes[0]!.surfaceColliderId).toMatch(/rim/);
      for (const node of route.nodes) {
        for (const { collider: building } of ashfallBuildingPlacements) {
          const clear =
            Math.abs(node.position[0] - building.position[0]) >=
              building.size[0] / 2 + 0.8 ||
            Math.abs(node.position[2] - building.position[2]) >=
              building.size[2] / 2 + 0.8;
          expect(clear, `${route.id} blocked by ${building.id}`).toBe(true);
        }
      }
    }
    const northExit = routes.find(({ id }) => id === 'route.north-rim-west')!;
    expect(northExit).toMatchObject({
      loop: false,
      population: 1,
      exit: {
        edge: 'north',
        clearance: 0.4,
        minimumTraversalDistance: 30,
        repopulation: 'sector-reload',
      },
    });
    expect(northExit.nodes.at(-2)!.position[2]).toBeLessThan(
      world002BPlan.bounds.maxZ,
    );
    expect(northExit.nodes.at(-1)!.position[2]).toBe(
      world002BPlan.bounds.maxZ + 0.4,
    );
    expect(
      new Set(
        northExit.nodes.map(({ surfaceColliderId }) => surfaceColliderId),
      ),
    ).toEqual(new Set(['c.sidewalk-north-rim-west']));
    const exitSurface = testDistrict.definition.staticCollision.find(
      ({ id }) => id === 'c.sidewalk-north-rim-west',
    )!;
    const terminal = northExit.nodes.at(-1)!.position;
    expect(
      exitSurface.position[2] + exitSurface.size[2] / 2 - terminal[2],
    ).toBeGreaterThanOrEqual(pedestrianCollisionRadius);
    const northWalls = testDistrict.definition.staticCollision
      .filter(({ id }) => id.startsWith('c.boundary-north-'))
      .sort((a, b) => a.position[0] - b.position[0]);
    const openingWidth =
      northWalls[1]!.position[0] -
      northWalls[1]!.size[0] / 2 -
      (northWalls[0]!.position[0] + northWalls[0]!.size[0] / 2);
    expect(openingWidth).toBeGreaterThan(pedestrianCollisionRadius * 2);
    const collision = new StaticCollisionWorld();
    collision.addDefinitions(testDistrict.definition.staticCollision);
    const groundedTerminal = collision.moveCharacter(
      new Vector3(...terminal),
      new Vector3(0, -1, 0),
      defaultPlayerMovementConfig,
      false,
    );
    expect(groundedTerminal).toMatchObject({
      grounded: true,
      groundColliderId: 'c.sidewalk-north-rim-west',
    });
    expect(
      routes.some((route) =>
        route.nodes.some(
          ({ position }) =>
            Math.abs(position[0] - world002BPlan.bounds.minX) < 2.5 ||
            Math.abs(position[0] - world002BPlan.bounds.maxX) < 2.5 ||
            Math.abs(position[2] - world002BPlan.bounds.minZ) < 2.5 ||
            Math.abs(position[2] - world002BPlan.bounds.maxZ) < 2.5,
        ),
      ),
    ).toBe(true);
  });

  it('closes the East Quay/east-rim visual and collision seam under the curve', () => {
    expect(testDistrict.definition.environment).toContainEqual(
      world003EastQuayRimSeam.visual,
    );
    expect(testDistrict.definition.staticCollision).toContainEqual(
      world003EastQuayRimSeam.collider,
    );
    expect(testDistrict.definition.environment).toContainEqual(
      world003EastQuayGroundFill.visual,
    );
    expect(testDistrict.definition.staticCollision).toContainEqual(
      world003EastQuayGroundFill.collider,
    );
    const collision = new StaticCollisionWorld();
    collision.addDefinitions(testDistrict.definition.staticCollision);
    for (const position of [
      [41, 0.5, 20],
      [42, 0.5, 20],
      [43, 0.5, 20],
      [43, 0.5, 5],
      [46, 0.5, 3],
      [50, 0.5, 5],
    ] as const) {
      const grounded = collision.moveCharacter(
        new Vector3(...position),
        new Vector3(0, -1, 0),
        defaultPlayerMovementConfig,
        false,
      );
      expect(grounded.grounded, position.join(',')).toBe(true);
      expect(grounded.groundColliderId, position.join(',')).toMatch(
        /c\.(?:sidewalk-east-quay-rim-seam|east-quay-rim-ground-fill|sidewalk-east-rim-north|east-quay-ground-north|road-east-quay-curve)/,
      );
    }
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
        /c\.(?:road-east-quay-curve|sidewalk-east-rim|sidewalk-east-quay-rim-seam)/,
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
