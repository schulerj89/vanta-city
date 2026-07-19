import type { LevelMapBoundsDefinition } from '../world/LevelDefinition';
import type { WorldPosition } from '../world/Spatial';
import type { PedestrianRouteDefinition } from './PedestrianRouteDefinition';

export type PedestrianBoundaryEdge = 'north' | 'east' | 'south' | 'west';

/** Shared horizontal body radius used by collision and full-edge clearance. */
export const pedestrianCollisionRadius = 0.3;

export type PedestrianRouteLifecycleState =
  'resident' | 'approaching-boundary' | 'exiting-boundary';

export type PedestrianLifecycleReason =
  | 'authored-boundary-exit'
  | 'sector-unloaded'
  | 'level-unloaded'
  | 'system-disposed'
  | 'load-cancelled'
  | 'load-failed';

export interface PedestrianBoundaryLifecycleDecision {
  readonly state: PedestrianRouteLifecycleState;
  readonly edge: PedestrianBoundaryEdge | null;
  /** Positive values are beyond the selected map edge. */
  readonly signedBoundaryDistance: number | null;
  readonly shouldDespawn: boolean;
  readonly reason: Extract<
    PedestrianLifecycleReason,
    'authored-boundary-exit'
  > | null;
}

/**
 * Owns map-edge interpretation for both pedestrian movement and population
 * lifecycle. Bounds are borrowed from the active LevelDefinition; the policy
 * never invents a second world extent.
 */
export class PedestrianBoundaryLifecyclePolicy {
  public constructor(
    private readonly bounds: LevelMapBoundsDefinition | undefined,
  ) {}

  public evaluate(
    route: PedestrianRouteDefinition,
    position: WorldPosition,
    targetNodeIndex: number,
  ): PedestrianBoundaryLifecycleDecision {
    if (route.loop) return residentDecision;
    if (!this.bounds) {
      throw new Error(
        `Pedestrian boundary route "${route.id}" requires active map bounds`,
      );
    }
    const signedBoundaryDistance = getSignedPedestrianBoundaryDistance(
      position,
      this.bounds,
      route.exit.edge,
    );
    if (signedBoundaryDistance + 1e-6 >= route.exit.clearance) {
      return {
        state: 'exiting-boundary',
        edge: route.exit.edge,
        signedBoundaryDistance,
        shouldDespawn: true,
        reason: 'authored-boundary-exit',
      };
    }
    return {
      state:
        signedBoundaryDistance >= 0
          ? 'exiting-boundary'
          : targetNodeIndex === route.nodes.length - 1
            ? 'approaching-boundary'
            : 'resident',
      edge: route.exit.edge,
      signedBoundaryDistance,
      shouldDespawn: false,
      reason: null,
    };
  }
}

const residentDecision: PedestrianBoundaryLifecycleDecision = {
  state: 'resident',
  edge: null,
  signedBoundaryDistance: null,
  shouldDespawn: false,
  reason: null,
};

export function getSignedPedestrianBoundaryDistance(
  position: WorldPosition | readonly [number, number, number],
  bounds: LevelMapBoundsDefinition,
  edge: PedestrianBoundaryEdge,
): number {
  const x = isPositionTuple(position) ? position[0] : position.x;
  const z = isPositionTuple(position) ? position[2] : position.z;
  switch (edge) {
    case 'north':
      return z - bounds.maxZ;
    case 'east':
      return x - bounds.maxX;
    case 'south':
      return bounds.minZ - z;
    case 'west':
      return bounds.minX - x;
  }
}

function isPositionTuple(
  position: WorldPosition | readonly [number, number, number],
): position is readonly [number, number, number] {
  return Array.isArray(position);
}

export function getPedestrianRouteDistance(
  route: Pick<PedestrianRouteDefinition, 'nodes'>,
): number {
  let distance = 0;
  for (let index = 1; index < route.nodes.length; index += 1) {
    const previous = route.nodes[index - 1]!.position;
    const current = route.nodes[index]!.position;
    distance += Math.hypot(
      current[0] - previous[0],
      current[1] - previous[1],
      current[2] - previous[2],
    );
  }
  return distance;
}
