import { describe, expect, it } from 'vitest';
import {
  PedestrianBoundaryLifecyclePolicy,
  getPedestrianRouteDistance,
  type PedestrianBoundaryEdge,
} from '../src/pedestrians/PedestrianBoundaryLifecyclePolicy';
import type { PedestrianBoundaryExitRouteDefinition } from '../src/pedestrians/PedestrianRouteDefinition';
import { validatePedestrianPopulation } from '../src/pedestrians/PedestrianRouteDefinition';
import type { LevelMapBoundsDefinition } from '../src/world/LevelDefinition';
import type { Vector3Tuple } from '../src/world/Spatial';

const bounds: LevelMapBoundsDefinition = {
  minX: -10,
  maxX: 10,
  minZ: -10,
  maxZ: 10,
};

describe('PedestrianBoundaryLifecyclePolicy', () => {
  it('tracks a long route from resident traversal through approach and full edge clearance', () => {
    const route = exitRoute('east', [
      [-8, 0.2, 0],
      [0, 0.2, 0],
      [10.4, 0.2, 0],
    ]);
    const policy = new PedestrianBoundaryLifecyclePolicy(bounds);

    expect(getPedestrianRouteDistance(route)).toBeCloseTo(18.4, 6);
    expect(policy.evaluate(route, { x: 0, y: 0.2, z: 0 }, 1)).toEqual({
      state: 'resident',
      edge: 'east',
      signedBoundaryDistance: -10,
      shouldDespawn: false,
      reason: null,
    });
    expect(policy.evaluate(route, { x: 9, y: 0.2, z: 0 }, 2)).toEqual({
      state: 'approaching-boundary',
      edge: 'east',
      signedBoundaryDistance: -1,
      shouldDespawn: false,
      reason: null,
    });
    const outside = policy.evaluate(route, { x: 10.1, y: 0.2, z: 0 }, 2);
    expect(outside).toMatchObject({
      state: 'exiting-boundary',
      edge: 'east',
      shouldDespawn: false,
      reason: null,
    });
    expect(outside.signedBoundaryDistance).toBeCloseTo(0.1, 6);
    const cleared = policy.evaluate(route, { x: 10.35, y: 0.2, z: 0 }, 2);
    expect(cleared).toMatchObject({
      state: 'exiting-boundary',
      edge: 'east',
      shouldDespawn: true,
      reason: 'authored-boundary-exit',
    });
    expect(cleared.signedBoundaryDistance).toBeCloseTo(0.35, 6);
  });

  it('despawns a correct-edge teleport but ignores an opposing-edge teleport', () => {
    const route = exitRoute('east', [
      [-8, 0.2, 0],
      [0, 0.2, 0],
      [10.4, 0.2, 0],
    ]);
    const policy = new PedestrianBoundaryLifecyclePolicy(bounds);

    expect(
      policy.evaluate(route, { x: 40, y: 0.2, z: 0 }, 1).shouldDespawn,
    ).toBe(true);
    expect(policy.evaluate(route, { x: -40, y: 0.2, z: 0 }, 2)).toMatchObject({
      state: 'approaching-boundary',
      edge: 'east',
      shouldDespawn: false,
      reason: null,
    });
  });

  it.each([
    ['north', [0, 0.2, 10.35]],
    ['east', [10.35, 0.2, 0]],
    ['south', [0, 0.2, -10.35]],
    ['west', [-10.35, 0.2, 0]],
  ] as const)(
    'resolves an authored %s edge independently',
    (edge, position) => {
      const route = exitRoute(edge, routePositions(edge));
      const decision = new PedestrianBoundaryLifecyclePolicy(bounds).evaluate(
        route,
        { x: position[0], y: position[1], z: position[2] },
        2,
      );
      expect(decision).toMatchObject({
        edge,
        state: 'exiting-boundary',
        shouldDespawn: true,
        reason: 'authored-boundary-exit',
      });
    },
  );

  it('rejects short, inward, overlapping, or collider-incomplete exit authoring', () => {
    const route: PedestrianBoundaryExitRouteDefinition = {
      ...exitRoute('east', [
        [9.8, 0.2, 0],
        [9.5, 0.2, 0],
        [9.2, 0.2, 0],
      ]),
      population: 2,
      exit: {
        edge: 'east',
        clearance: 0.1,
        minimumTraversalDistance: 12,
        repopulation: 'sector-reload',
      },
    };
    const issues: string[] = [];
    validatePedestrianPopulation(
      {
        mapPresentation: {
          orientation: 'north-up',
          bounds,
          geometry: [],
          markers: [],
        },
        staticCollision: [
          {
            id: 'c.sidewalk-edge',
            position: [0, 0, 0],
            size: [20, 0.4, 4],
            tags: ['walkable', 'sidewalk'],
          },
        ],
        streaming: {
          sectors: [
            {
              id: 'sector.edge',
              center: [0, 0],
              loadDistance: 20,
              unloadDistance: 30,
              entryIds: ['c.sidewalk-edge'],
            },
          ],
        },
      },
      {
        seed: 1,
        residentCap: 2,
        activationDistance: 20,
        visibilityDistance: 30,
        routes: [route],
      },
      issues,
    );

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('population must be 1'),
        expect.stringContaining('clearance must be at least'),
        expect.stringContaining('traversal'),
        expect.stringContaining('must extend at least'),
        expect.stringContaining('must move outward'),
      ]),
    );
  });
});

function exitRoute(
  edge: PedestrianBoundaryEdge,
  positions: readonly Vector3Tuple[],
): PedestrianBoundaryExitRouteDefinition {
  return {
    id: `route.fixture-${edge}`,
    sectorId: 'sector.edge',
    loop: false,
    exit: {
      edge,
      clearance: 0.35,
      minimumTraversalDistance: 12,
      repopulation: 'sector-reload',
    },
    population: 1,
    speed: [2, 2],
    nodes: positions.map((position, index) => ({
      id: `route.fixture-${edge}.node-${index + 1}`,
      position,
      surfaceColliderId: 'c.sidewalk-edge',
    })),
  };
}

function routePositions(edge: PedestrianBoundaryEdge): readonly Vector3Tuple[] {
  switch (edge) {
    case 'north':
      return [
        [0, 0.2, -8],
        [0, 0.2, 0],
        [0, 0.2, 10.4],
      ];
    case 'east':
      return [
        [-8, 0.2, 0],
        [0, 0.2, 0],
        [10.4, 0.2, 0],
      ];
    case 'south':
      return [
        [0, 0.2, 8],
        [0, 0.2, 0],
        [0, 0.2, -10.4],
      ];
    case 'west':
      return [
        [8, 0.2, 0],
        [0, 0.2, 0],
        [-10.4, 0.2, 0],
      ];
  }
}
