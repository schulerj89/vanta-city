import type { LevelDefinition } from '../world/LevelDefinition';
import type { Vector3Tuple } from '../world/Spatial';
import {
  getPedestrianRouteDistance,
  getSignedPedestrianBoundaryDistance,
  pedestrianCollisionRadius,
  type PedestrianBoundaryEdge,
} from './PedestrianBoundaryLifecyclePolicy';

export interface PedestrianRouteNodeDefinition {
  readonly id: string;
  /** Authored foot position on the referenced sidewalk collision surface. */
  readonly position: Vector3Tuple;
  readonly surfaceColliderId: string;
  /** An intentional neutral hold when this node is reached. */
  readonly pauseSeconds?: readonly [minimum: number, maximum: number];
}

interface PedestrianRouteBaseDefinition {
  readonly id: string;
  readonly sectorId: string;
  readonly nodes: readonly PedestrianRouteNodeDefinition[];
  readonly population: number;
  readonly speed: readonly [minimum: number, maximum: number];
}

export interface PedestrianLoopRouteDefinition extends PedestrianRouteBaseDefinition {
  readonly loop: true;
  readonly exit?: never;
}

export interface PedestrianBoundaryExitDefinition {
  /** The one authoritative map edge this route intentionally leaves. */
  readonly edge: PedestrianBoundaryEdge;
  /** Distance the foot origin travels beyond the map edge before disposal. */
  readonly clearance: number;
  /** Guards against tiny edge loops being presented as long traversal. */
  readonly minimumTraversalDistance: number;
  /** Exited residents return only after their owning sector unloads and reloads. */
  readonly repopulation: 'sector-reload';
}

export interface PedestrianBoundaryExitRouteDefinition extends PedestrianRouteBaseDefinition {
  readonly loop: false;
  readonly exit: PedestrianBoundaryExitDefinition;
}

export type PedestrianRouteDefinition =
  PedestrianLoopRouteDefinition | PedestrianBoundaryExitRouteDefinition;

export interface PedestrianPopulationDefinition {
  readonly seed: number;
  readonly residentCap: number;
  readonly activationDistance: number;
  readonly visibilityDistance: number;
  readonly routes: readonly PedestrianRouteDefinition[];
}

export function validatePedestrianPopulation(
  level: Pick<
    LevelDefinition,
    'mapPresentation' | 'staticCollision' | 'streaming'
  >,
  definition: PedestrianPopulationDefinition | undefined,
  issues: string[],
): void {
  if (!definition) return;
  if (!Number.isInteger(definition.seed))
    issues.push('pedestrians.seed must be an integer');
  if (!Number.isInteger(definition.residentCap) || definition.residentCap < 1)
    issues.push('pedestrians.residentCap must be a positive integer');
  if (
    !Number.isFinite(definition.activationDistance) ||
    definition.activationDistance <= 0
  )
    issues.push('pedestrians.activationDistance must be positive');
  if (
    !Number.isFinite(definition.visibilityDistance) ||
    definition.visibilityDistance < definition.activationDistance
  )
    issues.push('pedestrians.visibilityDistance must meet activationDistance');

  const sectors = new Map(
    (level.streaming?.sectors ?? []).map((sector) => [sector.id, sector]),
  );
  const colliders = new Map(
    level.staticCollision.map((collider) => [collider.id, collider]),
  );
  const routeIds = new Set<string>();
  let population = 0;
  for (const route of definition.routes) {
    if (routeIds.has(route.id))
      issues.push(`pedestrians duplicate route id "${route.id}"`);
    routeIds.add(route.id);
    const sector = sectors.get(route.sectorId);
    if (!sector)
      issues.push(
        `${route.id}.sectorId references missing "${route.sectorId}"`,
      );
    if (route.nodes.length < 3)
      issues.push(`${route.id}.nodes must contain at least three nodes`);
    if (!Number.isInteger(route.population) || route.population < 1)
      issues.push(`${route.id}.population must be a positive integer`);
    population += Math.max(0, route.population);
    const [minSpeed, maxSpeed] = route.speed;
    if (
      !Number.isFinite(minSpeed) ||
      !Number.isFinite(maxSpeed) ||
      minSpeed <= 0 ||
      maxSpeed < minSpeed
    )
      issues.push(`${route.id}.speed must be a positive ordered range`);
    const nodeIds = new Set<string>();
    const surfaceIds = new Set<string>();
    for (const node of route.nodes) {
      if (nodeIds.has(node.id))
        issues.push(`${route.id} duplicates node id "${node.id}"`);
      nodeIds.add(node.id);
      surfaceIds.add(node.surfaceColliderId);
      if (node.position.some((value) => !Number.isFinite(value)))
        issues.push(`${route.id}.${node.id}.position must be finite`);
      const collider = colliders.get(node.surfaceColliderId);
      if (!collider) {
        issues.push(
          `${route.id}.${node.id} references missing surface "${node.surfaceColliderId}"`,
        );
      } else {
        if (!collider.tags?.includes('sidewalk'))
          issues.push(
            `${route.id}.${node.id} surface "${collider.id}" is not tagged sidewalk`,
          );
        if (!pointInsideColliderXZ(node.position, collider))
          issues.push(
            `${route.id}.${node.id} is outside surface "${collider.id}"`,
          );
        const surfaceY = collider.position[1] + collider.size[1] / 2;
        if (Math.abs(node.position[1] - surfaceY) > 0.05)
          issues.push(
            `${route.id}.${node.id} must meet surface "${collider.id}" at y=${surfaceY}`,
          );
        if (sector && !sector.entryIds.includes(collider.id))
          issues.push(
            `${route.id}.${node.id} surface "${collider.id}" is not resident in "${sector.id}"`,
          );
      }
      if (node.pauseSeconds) {
        const [minimum, maximum] = node.pauseSeconds;
        if (
          !Number.isFinite(minimum) ||
          !Number.isFinite(maximum) ||
          minimum < 0 ||
          maximum < minimum
        )
          issues.push(`${route.id}.${node.id}.pauseSeconds is not ordered`);
      }
    }
    if (surfaceIds.size > 1)
      issues.push(
        `${route.id} crosses sidewalk surfaces; split it into curb-safe routes`,
      );
    validateRouteLifecycle(level, colliders, route, issues);
  }
  if (population > definition.residentCap)
    issues.push(
      `pedestrians authored population ${population} exceeds residentCap ${definition.residentCap}`,
    );
}

function validateRouteLifecycle(
  level: Pick<LevelDefinition, 'mapPresentation'>,
  colliders: ReadonlyMap<string, LevelDefinition['staticCollision'][number]>,
  route: PedestrianRouteDefinition,
  issues: string[],
): void {
  if (route.loop) return;
  const bounds = level.mapPresentation?.bounds;
  if (!bounds) {
    issues.push(`${route.id} boundary exit requires mapPresentation.bounds`);
    return;
  }
  if (route.population !== 1) {
    issues.push(
      `${route.id} boundary exit population must be 1 to prevent overlapping edge-route spawns`,
    );
  }
  if (
    !Number.isFinite(route.exit.clearance) ||
    route.exit.clearance < pedestrianCollisionRadius
  ) {
    issues.push(
      `${route.id}.exit.clearance must be at least the ${pedestrianCollisionRadius}m pedestrian radius`,
    );
  }
  if (
    !Number.isFinite(route.exit.minimumTraversalDistance) ||
    route.exit.minimumTraversalDistance <= 0
  ) {
    issues.push(`${route.id}.exit.minimumTraversalDistance must be positive`);
  } else {
    const distance = getPedestrianRouteDistance(route);
    if (distance + 1e-6 < route.exit.minimumTraversalDistance) {
      issues.push(
        `${route.id} traversal ${distance.toFixed(3)}m is shorter than required ${route.exit.minimumTraversalDistance.toFixed(3)}m`,
      );
    }
  }

  if (route.nodes.length < 2) return;

  const lastIndex = route.nodes.length - 1;
  const terminal = route.nodes[lastIndex]!;
  const beforeTerminal = route.nodes[lastIndex - 1]!;
  for (const node of route.nodes.slice(0, -1)) {
    if (!pointInsideMapBounds(node.position, bounds)) {
      issues.push(
        `${route.id}.${node.id} must remain inside map bounds before the terminal edge node`,
      );
    }
  }
  if (
    !pointInsideOrthogonalEdgeBounds(terminal.position, bounds, route.exit.edge)
  ) {
    issues.push(
      `${route.id}.${terminal.id} must leave only the authored ${route.exit.edge} map edge`,
    );
  }
  const beforeDistance = getSignedPedestrianBoundaryDistance(
    beforeTerminal.position,
    bounds,
    route.exit.edge,
  );
  const terminalDistance = getSignedPedestrianBoundaryDistance(
    terminal.position,
    bounds,
    route.exit.edge,
  );
  if (beforeDistance >= 0) {
    issues.push(
      `${route.id}.${beforeTerminal.id} must approach the ${route.exit.edge} edge from inside map bounds`,
    );
  }
  if (terminalDistance + 1e-6 < route.exit.clearance) {
    issues.push(
      `${route.id}.${terminal.id} must extend at least ${route.exit.clearance.toFixed(3)}m beyond the ${route.exit.edge} map edge`,
    );
  }
  if (terminalDistance <= beforeDistance) {
    issues.push(
      `${route.id} terminal segment must move outward through the ${route.exit.edge} map edge`,
    );
  }
  const exitSurface = colliders.get(terminal.surfaceColliderId);
  if (
    exitSurface &&
    Number.isFinite(route.exit.clearance) &&
    terminalDistance > beforeDistance
  ) {
    const requiredSupportDistance =
      route.exit.clearance + pedestrianCollisionRadius;
    const supportProgress =
      (requiredSupportDistance - beforeDistance) /
      (terminalDistance - beforeDistance);
    const supportPoint: Vector3Tuple = [
      beforeTerminal.position[0] +
        (terminal.position[0] - beforeTerminal.position[0]) * supportProgress,
      beforeTerminal.position[1] +
        (terminal.position[1] - beforeTerminal.position[1]) * supportProgress,
      beforeTerminal.position[2] +
        (terminal.position[2] - beforeTerminal.position[2]) * supportProgress,
    ];
    if (!pointInsideColliderXZ(supportPoint, exitSurface)) {
      issues.push(
        `${route.id} exit surface "${exitSurface.id}" must support the ${route.exit.edge} terminal trajectory to ${requiredSupportDistance.toFixed(3)}m beyond the map edge (${route.exit.clearance.toFixed(3)}m clearance + ${pedestrianCollisionRadius.toFixed(3)}m pedestrian radius)`,
      );
    }
  }
}

function pointInsideMapBounds(
  point: Vector3Tuple,
  bounds: NonNullable<LevelDefinition['mapPresentation']>['bounds'],
): boolean {
  return (
    point[0] >= bounds.minX - 1e-6 &&
    point[0] <= bounds.maxX + 1e-6 &&
    point[2] >= bounds.minZ - 1e-6 &&
    point[2] <= bounds.maxZ + 1e-6
  );
}

function pointInsideOrthogonalEdgeBounds(
  point: Vector3Tuple,
  bounds: NonNullable<LevelDefinition['mapPresentation']>['bounds'],
  edge: PedestrianBoundaryEdge,
): boolean {
  return edge === 'east' || edge === 'west'
    ? point[2] >= bounds.minZ - 1e-6 && point[2] <= bounds.maxZ + 1e-6
    : point[0] >= bounds.minX - 1e-6 && point[0] <= bounds.maxX + 1e-6;
}

function pointInsideColliderXZ(
  point: Vector3Tuple,
  collider: LevelDefinition['staticCollision'][number],
): boolean {
  // Match StaticCollisionWorld's world-to-local yaw transform exactly.
  const yaw = collider.rotation?.[1] ?? 0;
  const dx = point[0] - collider.position[0];
  const dz = point[2] - collider.position[2];
  const localX = dx * Math.cos(yaw) - dz * Math.sin(yaw);
  const localZ = dx * Math.sin(yaw) + dz * Math.cos(yaw);
  return (
    Math.abs(localX) <= collider.size[0] / 2 + 1e-6 &&
    Math.abs(localZ) <= collider.size[2] / 2 + 1e-6
  );
}
