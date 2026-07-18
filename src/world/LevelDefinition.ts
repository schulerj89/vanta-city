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
  /** Optional logical texture ID resolved by the authoritative asset loader. */
  readonly textureAssetId?: string;
  /** World metres represented by one texture repeat. */
  readonly uvMetersPerRepeat?: number;
}

export interface BuildingVisualDefinition extends WorldEntry {
  readonly kind: 'building';
  /** ID from the reusable Ashfall building catalog. */
  readonly variantId: string;
}

/** Authored cubic road corridor rendered and mapped from one centerline. */
export interface SplineRoadVisualDefinition extends WorldEntry {
  readonly kind: 'spline-road';
  /** World-space start, two controls, and end point for a cubic Bezier. */
  readonly controlPoints: readonly [
    Vector3Tuple,
    Vector3Tuple,
    Vector3Tuple,
    Vector3Tuple,
  ];
  readonly width: number;
  readonly thickness: number;
  readonly color: number;
  readonly segments: number;
}

export type EnvironmentVisualDefinition =
  | GltfVisualDefinition
  | BoxVisualDefinition
  | BuildingVisualDefinition
  | SplineRoadVisualDefinition;

export type SpawnKind = 'player' | 'npc';

export interface SpawnPointDefinition extends WorldEntry {
  readonly kind: SpawnKind;
  readonly default?: boolean;
  readonly tags?: readonly string[];
}

export type LocationKind = 'interaction' | 'mission';

export interface NamedLocationDefinition extends WorldEntry {
  readonly kind: LocationKind;
  /** Player-facing authored label for map and objective presentation. */
  readonly name?: string;
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

export type LevelMapLayer =
  'roads' | 'structures' | 'landmarks' | 'interactions' | 'spawns';

export interface LevelMapBoundsDefinition {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** References authoritative level entries; it does not duplicate world transforms. */
export interface LevelMapGeometryReference {
  readonly entryId: string;
  readonly layer: Extract<LevelMapLayer, 'roads' | 'structures'>;
}

export interface LevelMapMarkerReference {
  readonly entryId: string;
  readonly layer: Extract<
    LevelMapLayer,
    'landmarks' | 'interactions' | 'spawns'
  >;
}

/** Small, level-owned contract describing which authored facts belong on a minimap. */
export interface LevelMapPresentationDefinition {
  readonly orientation: 'north-up';
  readonly bounds: LevelMapBoundsDefinition;
  readonly geometry: readonly LevelMapGeometryReference[];
  readonly markers: readonly LevelMapMarkerReference[];
}

/** Authored fixture facts consumed by the shared environment lighting system. */
export interface LampFixtureDefinition {
  readonly id: string;
  readonly visualId: string;
  /** World-space center of the fixture's emitting bulb. */
  readonly position: Vector3Tuple;
  /** Imported material to make emissive while the local light is active. */
  readonly emissiveMaterialName: string;
}

export interface LevelLightingDefinition {
  /** Kept deliberately small: each entry receives one shadow-free point light. */
  readonly lamps: readonly LampFixtureDefinition[];
}

export interface WorldSectorDefinition {
  readonly id: string;
  /** Authored streaming focus in world X/Z metres. */
  readonly center: readonly [x: number, z: number];
  /** Entries become requested at or inside this distance. */
  readonly loadDistance: number;
  /** Active entries remain loaded until this larger distance is exceeded. */
  readonly unloadDistance: number;
  /** Infrastructure which must be ready before the level-loaded event. */
  readonly alwaysLoaded?: boolean;
  /** References authoritative environment or static-collision entry IDs. */
  readonly entryIds: readonly string[];
}

export interface LevelStreamingDefinition {
  readonly sectors: readonly WorldSectorDefinition[];
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
  readonly lighting?: LevelLightingDefinition;
  readonly mapPresentation?: LevelMapPresentationDefinition;
  readonly streaming?: LevelStreamingDefinition;
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
    if (visual.kind === 'building' && visual.variantId.trim().length === 0) {
      issues.push(`${visual.id}.variantId is empty`);
    }
    if (visual.kind === 'box' && visual.textureAssetId !== undefined) {
      if (visual.textureAssetId.trim().length === 0) {
        issues.push(`${visual.id}.textureAssetId is empty`);
      }
      if (
        visual.uvMetersPerRepeat === undefined ||
        !Number.isFinite(visual.uvMetersPerRepeat) ||
        visual.uvMetersPerRepeat <= 0
      ) {
        issues.push(
          `${visual.id}.uvMetersPerRepeat must be positive for a textured box`,
        );
      }
    }
    if (visual.kind === 'spline-road') {
      visual.controlPoints.forEach((point, index) =>
        validateVector(point, `${visual.id}.controlPoints[${index}]`, issues),
      );
      if (!Number.isFinite(visual.width) || visual.width <= 0)
        issues.push(`${visual.id}.width must be positive`);
      if (!Number.isFinite(visual.thickness) || visual.thickness <= 0)
        issues.push(`${visual.id}.thickness must be positive`);
      if (!Number.isInteger(visual.segments) || visual.segments < 2)
        issues.push(`${visual.id}.segments must be an integer of at least 2`);
    }
  }
  for (const zone of definition.zones) {
    if (zone.name.trim().length === 0) issues.push(`${zone.id}.name is empty`);
    validateOptionalPriority(zone.priority, `${zone.id}.priority`, issues);
  }
  for (const location of definition.locations) {
    if (location.name !== undefined && location.name.trim().length === 0) {
      issues.push(`${location.id}.name is empty`);
    }
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

  const environmentIds = new Set(definition.environment.map(({ id }) => id));
  const lamps = definition.lighting?.lamps ?? [];
  if (lamps.length > 4) {
    issues.push(
      `lighting supports at most 4 local lamp fixtures, found ${lamps.length}`,
    );
  }
  const lampIds = new Set<string>();
  for (const lamp of lamps) {
    validateId(lamp.id, 'lamp', issues);
    if (lampIds.has(lamp.id)) issues.push(`duplicate lamp id "${lamp.id}"`);
    lampIds.add(lamp.id);
    validateVector(lamp.position, `${lamp.id}.position`, issues);
    if (!environmentIds.has(lamp.visualId)) {
      issues.push(
        `${lamp.id}.visualId references missing environment entry "${lamp.visualId}"`,
      );
    }
    if (lamp.emissiveMaterialName.trim().length === 0) {
      issues.push(`${lamp.id}.emissiveMaterialName is empty`);
    }
  }

  validateMapPresentation(definition, issues);
  validateStreaming(definition, issues);

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

function validateStreaming(
  definition: LevelDefinition,
  issues: string[],
): void {
  const streaming = definition.streaming;
  if (!streaming) return;
  if (streaming.sectors.length === 0) {
    issues.push('streaming must define at least one sector');
    return;
  }
  const streamableIds = new Set([
    ...definition.environment.map(({ id }) => id),
    ...definition.staticCollision.map(({ id }) => id),
  ]);
  const owners = new Map<string, string>();
  const sectorIds = new Set<string>();
  for (const sector of streaming.sectors) {
    validateId(sector.id, 'sector', issues);
    if (sectorIds.has(sector.id))
      issues.push(`duplicate sector id "${sector.id}"`);
    sectorIds.add(sector.id);
    if (sector.center.some((component) => !Number.isFinite(component))) {
      issues.push(`${sector.id}.center must contain finite numbers`);
    }
    if (!Number.isFinite(sector.loadDistance) || sector.loadDistance <= 0) {
      issues.push(`${sector.id}.loadDistance must be positive`);
    }
    if (
      !Number.isFinite(sector.unloadDistance) ||
      sector.unloadDistance <= sector.loadDistance
    ) {
      issues.push(`${sector.id}.unloadDistance must exceed loadDistance`);
    }
    if (sector.entryIds.length === 0) {
      issues.push(`${sector.id}.entryIds must not be empty`);
    }
    for (const entryId of sector.entryIds) {
      if (!streamableIds.has(entryId)) {
        issues.push(
          `${sector.id} references missing streamable entry "${entryId}"`,
        );
      }
      const owner = owners.get(entryId);
      if (owner)
        issues.push(
          `streaming entry "${entryId}" is owned by both "${owner}" and "${sector.id}"`,
        );
      else owners.set(entryId, sector.id);
    }
  }
  for (const entryId of streamableIds) {
    if (!owners.has(entryId))
      issues.push(`streaming entry "${entryId}" has no sector owner`);
  }
}

function validateMapPresentation(
  definition: LevelDefinition,
  issues: string[],
): void {
  const map = definition.mapPresentation;
  if (!map) return;
  const { minX, maxX, minZ, maxZ } = map.bounds;
  if (![minX, maxX, minZ, maxZ].every(Number.isFinite)) {
    issues.push('mapPresentation.bounds must contain finite numbers');
  } else if (minX >= maxX || minZ >= maxZ) {
    issues.push('mapPresentation.bounds minimums must be less than maximums');
  }
  const geometryEntries = new Set(
    definition.environment
      .filter(
        (entry) =>
          entry.kind === 'box' ||
          entry.kind === 'building' ||
          entry.kind === 'spline-road',
      )
      .map(({ id }) => id),
  );
  const landmarks = new Set(definition.landmarks.map(({ id }) => id));
  const interactions = new Set(
    definition.locations
      .filter(({ kind }) => kind === 'interaction')
      .map(({ id }) => id),
  );
  const spawns = new Set(definition.spawns.map(({ id }) => id));
  const referenced = new Set<string>();
  for (const reference of [...map.geometry, ...map.markers]) {
    if (referenced.has(reference.entryId)) {
      issues.push(`mapPresentation duplicates entry "${reference.entryId}"`);
    }
    referenced.add(reference.entryId);
  }
  for (const reference of map.geometry) {
    if (!geometryEntries.has(reference.entryId)) {
      issues.push(
        `mapPresentation geometry "${reference.entryId}" must reference a box, building, or spline-road environment entry`,
      );
    }
  }
  for (const reference of map.markers) {
    const valid =
      reference.layer === 'landmarks'
        ? landmarks.has(reference.entryId)
        : reference.layer === 'interactions'
          ? interactions.has(reference.entryId)
          : spawns.has(reference.entryId);
    if (!valid) {
      issues.push(
        `mapPresentation ${reference.layer} marker "${reference.entryId}" is missing`,
      );
    }
  }
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
