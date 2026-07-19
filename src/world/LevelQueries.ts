import { Vector3 } from 'three';
import { StaticCollisionWorld } from '../physics/CollisionWorld';
import type {
  CinematicAnchorDefinition,
  LevelDefinition,
  NamedLocationDefinition,
  SpawnPointDefinition,
  TriggerVolumeDefinition,
} from './LevelDefinition';
import type { WorldPosition } from './Spatial';
import { resolveLevelLocation } from './LocationResolver';
import type { ResolvedLevelLocation } from './LocationResolver';
import type { StaticColliderDefinition } from '../physics/StaticCollider';

export function findSpawn(
  level: LevelDefinition,
  id?: string,
): SpawnPointDefinition {
  const spawn = id
    ? level.spawns.find((candidate) => candidate.id === id)
    : level.spawns.find(
        (candidate) => candidate.kind === 'player' && candidate.default,
      );
  if (!spawn) {
    throw new Error(
      id
        ? `Unknown spawn "${id}" in level "${level.id}"`
        : `Level "${level.id}" has no default player spawn`,
    );
  }
  return spawn;
}

/** Resolves the first authored spawn whose player capsule does not overlap a wall. */
export function findSafePlayerSpawn(
  level: LevelDefinition,
  candidateIds: readonly string[],
): SpawnPointDefinition {
  const candidates = [
    ...candidateIds.flatMap((id) =>
      level.spawns.filter(
        (spawn) => spawn.id === id && spawn.kind === 'player',
      ),
    ),
    ...level.spawns.filter((spawn) => spawn.kind === 'player' && spawn.default),
  ];
  const visited = new Set<string>();
  for (const spawn of candidates) {
    if (visited.has(spawn.id)) continue;
    visited.add(spawn.id);
    if (isSafePlayerSpawn(spawn, level.staticCollision)) return spawn;
  }
  throw new Error(`Level "${level.id}" has no collision-safe player spawn`);
}

/** Proves a saved foot pose has authored walkable support and capsule clearance. */
export function isPlayablePlayerPosition(
  level: LevelDefinition,
  position: WorldPosition,
): boolean {
  if (![position.x, position.y, position.z].every(Number.isFinite))
    return false;
  const supportIds = new Set(
    level.staticCollision
      .filter(({ tags = [] }) =>
        tags.some(
          (tag) => tag === 'walkable' || tag === 'ground' || tag === 'ramp',
        ),
      )
      .map(({ id }) => id),
  );
  const world = new StaticCollisionWorld(-1_000_000);
  world.addDefinitions(level.staticCollision);
  const start = new Vector3(position.x, position.y, position.z);
  const resolved = world.moveCharacter(
    start,
    new Vector3(0, -2, 0),
    {
      radius: 0.38,
      height: 1.8,
      stepHeight: 0.38,
      maxSlopeAngle: Math.PI * (48 / 180),
      groundSnapDistance: 0.18,
    },
    true,
  );
  return (
    resolved.grounded &&
    supportIds.has(resolved.groundColliderId) &&
    Math.hypot(
      resolved.position.x - position.x,
      resolved.position.z - position.z,
    ) < 0.01
  );
}

function isSafePlayerSpawn(
  spawn: SpawnPointDefinition,
  colliders: readonly StaticColliderDefinition[],
): boolean {
  const [x, y, z] = spawn.position;
  const radius = 0.38;
  const height = 1.75;
  return colliders.every((collider) => {
    const [cx, cy, cz] = collider.position;
    const [width, colliderHeight, depth] = collider.size;
    const horizontalOverlap =
      Math.abs(x - cx) < width / 2 + radius &&
      Math.abs(z - cz) < depth / 2 + radius;
    if (!horizontalOverlap) return true;
    const colliderBottom = cy - colliderHeight / 2;
    const colliderTop = cy + colliderHeight / 2;
    return colliderTop <= y + 0.05 || colliderBottom >= y + height;
  });
}

export interface LevelLocations {
  getSpawn(id?: string): SpawnPointDefinition;
  getLocation(id: string): NamedLocationDefinition;
  getTrigger(id: string): TriggerVolumeDefinition;
  getCinematicAnchor(id: string): CinematicAnchorDefinition;
  getStaticColliders(): readonly StaticColliderDefinition[];
  resolveLocation(position: WorldPosition): ResolvedLevelLocation;
}

export class DefinitionLevelLocations implements LevelLocations {
  private readonly locations: ReadonlyMap<string, NamedLocationDefinition>;
  private readonly triggers: ReadonlyMap<string, TriggerVolumeDefinition>;
  private readonly anchors: ReadonlyMap<string, CinematicAnchorDefinition>;

  public constructor(private readonly definition: LevelDefinition) {
    this.locations = indexById(definition.locations);
    this.triggers = indexById(definition.triggers);
    this.anchors = indexById(definition.cinematicAnchors);
  }

  public getSpawn(id?: string): SpawnPointDefinition {
    return findSpawn(this.definition, id);
  }

  public getLocation(id: string): NamedLocationDefinition {
    return required(this.locations, id, 'location', this.definition.id);
  }

  public getTrigger(id: string): TriggerVolumeDefinition {
    return required(this.triggers, id, 'trigger', this.definition.id);
  }

  public getCinematicAnchor(id: string): CinematicAnchorDefinition {
    return required(this.anchors, id, 'cinematic anchor', this.definition.id);
  }

  public getStaticColliders(): readonly StaticColliderDefinition[] {
    return this.definition.staticCollision;
  }

  public resolveLocation(position: WorldPosition): ResolvedLevelLocation {
    return resolveLevelLocation(this.definition, position);
  }
}

function indexById<T extends { readonly id: string }>(
  entries: readonly T[],
): ReadonlyMap<string, T> {
  return new Map(entries.map((entry) => [entry.id, entry]));
}

function required<T>(
  values: ReadonlyMap<string, T>,
  id: string,
  kind: string,
  levelId: string,
): T {
  const value = values.get(id);
  if (!value) throw new Error(`Unknown ${kind} "${id}" in level "${levelId}"`);
  return value;
}
