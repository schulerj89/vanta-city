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
