import type {
  LevelDefinition,
  LevelLandmarkDefinition,
  LevelZoneDefinition,
} from './LevelDefinition';
import type { WorldPosition } from './Spatial';

export type ResolvedLevelLocationKind = 'landmark' | 'zone' | 'level';

export interface ResolvedLevelLocation {
  readonly id: string;
  readonly name: string;
  readonly kind: ResolvedLevelLocationKind;
  readonly distance: number;
}

/**
 * Resolves authored location metadata without inspecting rendered geometry.
 * Rules: containing landmark, containing zone, nearby landmark, level fallback.
 * Priority, distance/area, then logical id provide deterministic tie breaking.
 */
export function resolveLevelLocation(
  level: LevelDefinition,
  position: WorldPosition,
  nearbyLandmarkDistance = 10,
): ResolvedLevelLocation {
  const landmarks = level.landmarks
    .map((landmark) => ({
      definition: landmark,
      distance: horizontalDistance(position, landmark.position),
    }))
    .filter(
      ({ definition, distance }) =>
        distance <= definition.radius &&
        Math.abs(position.y - definition.position[1]) <=
          (definition.heightTolerance ?? 6),
    )
    .sort(compareLandmarks);
  const landmark = landmarks[0];
  if (landmark) return resolvedLandmark(landmark.definition, landmark.distance);

  const zone = level.zones
    .filter((candidate) => contains(candidate, position))
    .sort(compareZones)[0];
  if (zone) {
    return {
      id: zone.id,
      name: zone.name,
      kind: 'zone',
      distance: 0,
    };
  }

  const nearby = level.landmarks
    .map((definition) => ({
      definition,
      distance: horizontalDistance(position, definition.position),
    }))
    .filter(({ distance }) => distance <= nearbyLandmarkDistance)
    .sort(compareLandmarks)[0];
  if (nearby) return resolvedLandmark(nearby.definition, nearby.distance);

  return { id: level.id, name: level.name, kind: 'level', distance: 0 };
}

function contains(zone: LevelZoneDefinition, point: WorldPosition): boolean {
  return (
    Math.abs(point.x - zone.position[0]) <= zone.size[0] / 2 &&
    Math.abs(point.y - zone.position[1]) <= zone.size[1] / 2 &&
    Math.abs(point.z - zone.position[2]) <= zone.size[2] / 2
  );
}

function compareZones(a: LevelZoneDefinition, b: LevelZoneDefinition): number {
  return (
    (b.priority ?? 0) - (a.priority ?? 0) ||
    a.size[0] * a.size[1] * a.size[2] - b.size[0] * b.size[1] * b.size[2] ||
    a.id.localeCompare(b.id)
  );
}

function compareLandmarks(
  a: { definition: LevelLandmarkDefinition; distance: number },
  b: { definition: LevelLandmarkDefinition; distance: number },
): number {
  return (
    (b.definition.priority ?? 0) - (a.definition.priority ?? 0) ||
    a.distance - b.distance ||
    a.definition.id.localeCompare(b.definition.id)
  );
}

function horizontalDistance(
  point: WorldPosition,
  target: readonly [number, number, number],
): number {
  return Math.hypot(point.x - target[0], point.z - target[2]);
}

function resolvedLandmark(
  landmark: LevelLandmarkDefinition,
  distance: number,
): ResolvedLevelLocation {
  return {
    id: landmark.id,
    name: landmark.name,
    kind: 'landmark',
    distance,
  };
}
