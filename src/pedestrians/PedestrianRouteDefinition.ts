import type { LevelDefinition } from '../world/LevelDefinition';
import type { Vector3Tuple } from '../world/Spatial';

export interface PedestrianRouteNodeDefinition {
  readonly id: string;
  /** Authored foot position on the referenced sidewalk collision surface. */
  readonly position: Vector3Tuple;
  readonly surfaceColliderId: string;
  /** An intentional neutral hold when this node is reached. */
  readonly pauseSeconds?: readonly [minimum: number, maximum: number];
}

export interface PedestrianRouteDefinition {
  readonly id: string;
  readonly sectorId: string;
  readonly nodes: readonly PedestrianRouteNodeDefinition[];
  readonly loop: true;
  readonly population: number;
  readonly speed: readonly [minimum: number, maximum: number];
}

export interface PedestrianPopulationDefinition {
  readonly seed: number;
  readonly residentCap: number;
  readonly activationDistance: number;
  readonly visibilityDistance: number;
  readonly routes: readonly PedestrianRouteDefinition[];
}

export function validatePedestrianPopulation(
  level: Pick<LevelDefinition, 'staticCollision' | 'streaming'>,
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
  }
  if (population > definition.residentCap)
    issues.push(
      `pedestrians authored population ${population} exceeds residentCap ${definition.residentCap}`,
    );
}

function pointInsideColliderXZ(
  point: Vector3Tuple,
  collider: LevelDefinition['staticCollision'][number],
): boolean {
  const yaw = -(collider.rotation?.[1] ?? 0);
  const dx = point[0] - collider.position[0];
  const dz = point[2] - collider.position[2];
  const localX = dx * Math.cos(yaw) - dz * Math.sin(yaw);
  const localZ = dx * Math.sin(yaw) + dz * Math.cos(yaw);
  return (
    Math.abs(localX) <= collider.size[0] / 2 + 1e-6 &&
    Math.abs(localZ) <= collider.size[2] / 2 + 1e-6
  );
}
