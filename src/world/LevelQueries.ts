import type {
  CinematicAnchorDefinition,
  LevelDefinition,
  NamedLocationDefinition,
  SpawnPointDefinition,
  StaticBoxColliderDefinition,
  TriggerVolumeDefinition,
} from './LevelDefinition';

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

export interface LevelLocations {
  getSpawn(id?: string): SpawnPointDefinition;
  getLocation(id: string): NamedLocationDefinition;
  getTrigger(id: string): TriggerVolumeDefinition;
  getCinematicAnchor(id: string): CinematicAnchorDefinition;
  getStaticColliders(): readonly StaticBoxColliderDefinition[];
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

  public getStaticColliders(): readonly StaticBoxColliderDefinition[] {
    return this.definition.staticCollision;
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
