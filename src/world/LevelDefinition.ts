import type { AssetManifest } from '../assets/AssetLoader';
import type { StaticColliderDefinition } from '../physics/StaticCollider';
import type { Vector3Tuple } from './Spatial';

export type { Vector3Tuple } from './Spatial';

export interface TransformDefinition {
  readonly position: Vector3Tuple;
  readonly rotation?: Vector3Tuple;
  readonly scale?: Vector3Tuple;
}

interface WorldEntry extends TransformDefinition {
  readonly id: string;
}

export interface GltfVisualDefinition extends WorldEntry {
  readonly kind: 'gltf';
  /** Logical ID resolved by GameAssetLoader, never a URL. */
  readonly assetId: string;
}

export interface BoxVisualDefinition extends WorldEntry {
  readonly kind: 'box';
  readonly size: Vector3Tuple;
  readonly color: number;
}

export type EnvironmentVisualDefinition =
  GltfVisualDefinition | BoxVisualDefinition;

export type SpawnKind = 'player' | 'npc';

export interface SpawnPointDefinition extends WorldEntry {
  readonly kind: SpawnKind;
  readonly default?: boolean;
  readonly tags?: readonly string[];
}

export type LocationKind = 'interaction' | 'mission';

export interface NamedLocationDefinition extends WorldEntry {
  readonly kind: LocationKind;
  readonly tags?: readonly string[];
}

/** Axis-aligned authored region used for gameplay location naming. */
export interface LevelZoneDefinition extends WorldEntry {
  readonly name: string;
  readonly size: Vector3Tuple;
  /** Higher values win when authored zones overlap. Defaults to zero. */
  readonly priority?: number;
}

/** A named point of interest that takes precedence while inside its radius. */
export interface LevelLandmarkDefinition extends WorldEntry {
  readonly name: string;
  readonly radius: number;
  /** Vertical distance accepted when resolving this landmark. Defaults to 6m. */
  readonly heightTolerance?: number;
  readonly priority?: number;
}

export interface TriggerVolumeDefinition extends WorldEntry {
  readonly shape: 'box';
  readonly size: Vector3Tuple;
  readonly tags?: readonly string[];
}

export interface CinematicAnchorDefinition extends WorldEntry {
  readonly lookAt: Vector3Tuple;
  readonly fieldOfView?: number;
  readonly tags?: readonly string[];
}

export interface LevelDefinition {
  readonly id: string;
  readonly name: string;
  readonly environment: readonly EnvironmentVisualDefinition[];
  readonly staticCollision: readonly StaticColliderDefinition[];
  readonly spawns: readonly SpawnPointDefinition[];
  readonly locations: readonly NamedLocationDefinition[];
  readonly zones: readonly LevelZoneDefinition[];
  readonly landmarks: readonly LevelLandmarkDefinition[];
  readonly triggers: readonly TriggerVolumeDefinition[];
  readonly cinematicAnchors: readonly CinematicAnchorDefinition[];
}

export interface LevelModule {
  readonly definition: LevelDefinition;
  /** Assets referenced by this level. Merge into the application manifest. */
  readonly assets: AssetManifest;
}

export class LevelDefinitionError extends Error {
  public constructor(public readonly issues: readonly string[]) {
    super(`Invalid level definition:\n- ${issues.join('\n- ')}`);
    this.name = 'LevelDefinitionError';
  }
}

const idPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

export function validateLevelDefinition(definition: LevelDefinition): void {
  const issues: string[] = [];
  validateId(definition.id, 'level', issues);
  if (definition.name.trim().length === 0) issues.push('level name is empty');

  const entries: readonly (WorldEntry & { readonly size?: Vector3Tuple })[] = [
    ...definition.environment,
    ...definition.staticCollision,
    ...definition.spawns,
    ...definition.locations,
    ...definition.zones,
    ...definition.landmarks,
    ...definition.triggers,
    ...definition.cinematicAnchors,
  ];
  const seen = new Set<string>();
  for (const entry of entries) {
    validateId(entry.id, 'entry', issues);
    if (seen.has(entry.id)) issues.push(`duplicate entry id "${entry.id}"`);
    seen.add(entry.id);
    validateVector(entry.position, `${entry.id}.position`, issues);
    if (entry.rotation)
      validateVector(entry.rotation, `${entry.id}.rotation`, issues);
    if (entry.scale) {
      validatePositiveVector(entry.scale, `${entry.id}.scale`, issues);
    }
    if (entry.size)
      validatePositiveVector(entry.size, `${entry.id}.size`, issues);
  }

  for (const visual of definition.environment) {
    if (visual.kind === 'gltf' && visual.assetId.trim().length === 0) {
      issues.push(`${visual.id}.assetId is empty`);
    }
  }
  for (const zone of definition.zones) {
    if (zone.name.trim().length === 0) issues.push(`${zone.id}.name is empty`);
    validateOptionalPriority(zone.priority, `${zone.id}.priority`, issues);
  }
  for (const landmark of definition.landmarks) {
    if (landmark.name.trim().length === 0)
      issues.push(`${landmark.id}.name is empty`);
    if (!Number.isFinite(landmark.radius) || landmark.radius <= 0)
      issues.push(`${landmark.id}.radius must be a positive number`);
    if (
      landmark.heightTolerance !== undefined &&
      (!Number.isFinite(landmark.heightTolerance) ||
        landmark.heightTolerance <= 0)
    ) {
      issues.push(`${landmark.id}.heightTolerance must be a positive number`);
    }
    validateOptionalPriority(
      landmark.priority,
      `${landmark.id}.priority`,
      issues,
    );
  }
  for (const collider of definition.staticCollision) {
    const [pitch = 0, yaw = 0, roll = 0] = collider.rotation ?? [0, 0, 0];
    const isRamp = collider.tags?.includes('ramp') === true;
    if (isRamp && (Math.abs(yaw) > 1e-6 || Math.abs(roll) > 1e-6)) {
      issues.push(`${collider.id}.rotation ramps support pitch only`);
    }
    if (!isRamp && (Math.abs(pitch) > 1e-6 || Math.abs(roll) > 1e-6)) {
      issues.push(`${collider.id}.rotation boxes support yaw only`);
    }
  }
  for (const anchor of definition.cinematicAnchors) {
    validateVector(anchor.lookAt, `${anchor.id}.lookAt`, issues);
    if (
      anchor.fieldOfView !== undefined &&
      (!Number.isFinite(anchor.fieldOfView) ||
        anchor.fieldOfView <= 0 ||
        anchor.fieldOfView >= 180)
    ) {
      issues.push(`${anchor.id}.fieldOfView must be between 0 and 180`);
    }
  }

  const defaultPlayers = definition.spawns.filter(
    (spawn) => spawn.kind === 'player' && spawn.default,
  );
  if (defaultPlayers.length !== 1) {
    issues.push(
      `expected exactly one default player spawn, found ${defaultPlayers.length}`,
    );
  }

  if (issues.length > 0) throw new LevelDefinitionError(issues);
}

function validateOptionalPriority(
  value: number | undefined,
  label: string,
  issues: string[],
): void {
  if (value !== undefined && !Number.isFinite(value))
    issues.push(`${label} must be finite`);
}

function validateId(value: string, label: string, issues: string[]): void {
  if (!idPattern.test(value))
    issues.push(`${label} id "${value}" must use lowercase logical-id syntax`);
}

function validateVector(
  value: Vector3Tuple,
  label: string,
  issues: string[],
): void {
  if (value.some((component) => !Number.isFinite(component))) {
    issues.push(`${label} must contain finite numbers`);
  }
}

function validatePositiveVector(
  value: Vector3Tuple,
  label: string,
  issues: string[],
): void {
  validateVector(value, label, issues);
  if (value.some((component) => component <= 0)) {
    issues.push(`${label} must contain positive numbers`);
  }
}
