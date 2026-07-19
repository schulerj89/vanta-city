import {
  BufferGeometry,
  Box3,
  BoxGeometry,
  ConeGeometry,
  EdgesGeometry,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  RepeatWrapping,
  SRGBColorSpace,
  SphereGeometry,
  Vector3,
  Float32BufferAttribute,
} from 'three';
import type { Material, Scene, Texture } from 'three';
import type { GameAssetLoader, ModelInstance } from '../assets/AssetLoader';
import type { EventBus } from '../core/events';
import type { GameSystem } from '../core/lifecycle';
import type { InputReader } from '../input/InputSystem';
import type { StaticColliderDefinition } from '../physics/StaticCollider';
import type {
  CinematicAnchorDefinition,
  EnvironmentVisualDefinition,
  BoxVisualDefinition,
  SplineRoadVisualDefinition,
  LevelDefinition,
  NamedLocationDefinition,
  SpawnPointDefinition,
  TransformDefinition,
  TriggerVolumeDefinition,
  Vector3Tuple,
  WorldSectorDefinition,
} from './LevelDefinition';
import { validateLevelDefinition } from './LevelDefinition';
import { DefinitionLevelLocations, type LevelLocations } from './LevelQueries';
import type { LevelRegistry } from './LevelRegistry';
import type { WorldEvents } from './WorldEvents';
import type { WorldPosition } from './Spatial';
import type { ResolvedLevelLocation } from './LocationResolver';
import { AshfallBuildingRenderer } from './buildings/AshfallBuildingKit';
import {
  offsetSplineSamples,
  sampleSplineRoad,
} from './levels/SplineRoadGeometry';

interface LoadedLevel {
  readonly definition: LevelDefinition;
  readonly root: Group;
  readonly locations: DefinitionLevelLocations;
  readonly sectors: Map<string, LoadedSector>;
  readonly states: Map<string, SectorLifecycleState>;
}

interface LoadedSector {
  readonly definition: WorldSectorDefinition;
  readonly root: Group;
  readonly debug: Group;
  readonly ownedResources: Set<BufferGeometry | Material>;
  readonly modelInstances: Set<ModelInstance>;
}

export type SectorLifecycleState =
  'inactive' | 'requested' | 'loading' | 'active' | 'unloading' | 'failed';

export interface SectorStreamingSnapshot {
  readonly levelId: string | undefined;
  readonly authored: number;
  readonly active: readonly string[];
  readonly pending: readonly string[];
  readonly states: Readonly<Record<string, SectorLifecycleState>>;
  readonly loadCount: number;
  readonly unloadCount: number;
  readonly sceneObjects: number;
  readonly ownedResources: number;
  readonly modelInstances: number;
  readonly colliders: number;
  readonly lodHiddenObjects: number;
  readonly transitionsPending: boolean;
  readonly pinnedSectors?: readonly string[];
  readonly visualPathPinCount?: number;
  readonly lastError: string | undefined;
}

export type LevelPreparationState =
  'idle' | 'preparing' | 'ready' | 'committing' | 'failed';

export interface LevelPreparationSnapshot {
  readonly generation: number;
  readonly state: LevelPreparationState;
  readonly sourceLevelId: string | undefined;
  readonly destinationLevelId: string | undefined;
  readonly spawnId: string | undefined;
  readonly initialSectorIds: readonly string[];
  readonly error: string | undefined;
}

export interface LevelCommitContext {
  readonly level: LevelDefinition;
  readonly spawn: SpawnPointDefinition;
  /** Register external-owner restoration before mutating that owner. */
  onRollback(operation: LevelRestorationOperation): void;
}

export type LevelRestorationOperation = () => void | Promise<void>;

export type LevelLandingOperation = (
  context: LevelCommitContext,
) => void | Promise<void>;

export interface PreparedLevelTransition {
  readonly generation: number;
  readonly levelId: string;
  readonly spawn: SpawnPointDefinition;
  commit(landing?: LevelLandingOperation): Promise<void>;
  cancel(): void;
}

export interface LevelVisualPathRequest {
  readonly owner: string;
  readonly visualIds: readonly string[];
  readonly points: readonly Vector3Tuple[];
  readonly startSeconds: number;
  readonly durationSeconds: number;
}

export interface LevelVisualPathHandle {
  update(deltaSeconds: number): void;
  pause(): void;
  resume(): void;
  release(
    reason: 'shot-completed' | 'landing' | 'cancelled' | 'failed' | 'disposed',
  ): void;
}

export class StaleLevelPreparationError extends Error {
  public constructor(levelId: string) {
    super(`Prepared level "${levelId}" was superseded by a newer request`);
    this.name = 'StaleLevelPreparationError';
  }
}

interface PreparedLevelOwnership {
  readonly generation: number;
  readonly level: LoadedLevel;
  readonly spawn: SpawnPointDefinition;
}

export type LevelDebugGroup =
  'collision' | 'spawns' | 'triggers' | 'locations' | 'anchors';

const debugGroupNames: Readonly<Record<LevelDebugGroup, string>> = {
  collision: 'collision-geometry',
  spawns: 'spawn-points',
  triggers: 'trigger-volumes',
  locations: 'location-markers',
  anchors: 'cinematic-anchors',
};

/** Owns exactly one loaded level and all scene objects created for it. */
export class LevelSystem implements GameSystem, LevelLocations {
  public readonly id = 'levels';
  private loaded: LoadedLevel | undefined;
  private debugVisible: boolean;
  private readonly debugGroups = new Map<LevelDebugGroup, boolean>();
  private positionSource: (() => WorldPosition) | undefined;
  private transition: Promise<void> | undefined;
  private prepared: PreparedLevelOwnership | undefined;
  private preparationGeneration = 0;
  private preparationState: LevelPreparationState = 'idle';
  private preparationSourceLevelId: string | undefined;
  private preparationDestinationLevelId: string | undefined;
  private preparationSpawnId: string | undefined;
  private preparationSectorIds: readonly string[] = [];
  private preparationError: string | undefined;
  private loadCount = 0;
  private unloadCount = 0;
  private lastError: string | undefined;
  private activeLevelGeneration = 0;
  private readonly visualPathPins = new Map<string, number>();
  private readonly visualPositionOverrides = new Map<
    string,
    Map<string, Vector3Tuple>
  >();

  public constructor(
    private readonly scene: Scene,
    private readonly assets: GameAssetLoader,
    private readonly registry: LevelRegistry,
    private readonly initialLevelId: string,
    private readonly events: EventBus<WorldEvents>,
    private readonly input?: InputReader,
    initiallyDebugVisible = false,
    private readonly streamingEnabled = true,
  ) {
    this.debugVisible = initiallyDebugVisible;
    for (const group of Object.keys(debugGroupNames) as LevelDebugGroup[]) {
      this.debugGroups.set(group, initiallyDebugVisible);
    }
  }

  public async init(): Promise<void> {
    await this.load(this.initialLevelId);
  }

  public update(): void {
    if (this.input?.wasPressed('toggleDebug')) {
      this.setDebugVisible(!this.debugVisible);
    }
    if (this.loaded && this.positionSource)
      this.applyDistanceLod(this.positionSource());
    if (!this.transition && this.loaded && this.positionSource) {
      void this.refreshStreaming().catch((error: unknown) => {
        this.lastError = error instanceof Error ? error.message : String(error);
      });
    }
  }

  public setStreamingPositionSource(source?: () => WorldPosition): void {
    this.positionSource = source;
  }

  public async refreshStreaming(position?: WorldPosition): Promise<void> {
    if (this.transition) await this.transition;
    const focus = position ?? this.positionSource?.();
    if (!focus || !this.loaded) return;
    const pending = this.reconcile(focus);
    this.transition = pending;
    try {
      await pending;
    } finally {
      if (this.transition === pending) this.transition = undefined;
    }
  }

  public async load(levelId: string): Promise<void> {
    const prepared = await this.prepare(levelId);
    await prepared.commit();
  }

  /** Builds a destination completely off-scene and publishes no lifecycle events. */
  public async prepare(
    levelId: string,
    spawnId?: string,
  ): Promise<PreparedLevelTransition> {
    const generation = ++this.preparationGeneration;
    this.disposePrepared();
    this.preparationState = 'preparing';
    this.preparationSourceLevelId = this.loaded?.definition.id;
    this.preparationDestinationLevelId = levelId;
    this.preparationSpawnId = spawnId;
    this.preparationSectorIds = [];
    this.preparationError = undefined;
    this.lastError = undefined;
    let next: LoadedLevel | undefined;

    try {
      const definition = this.registry.get(levelId);
      validateLevelDefinition(definition);
      const locations = new DefinitionLevelLocations(definition);
      const spawn = locations.getSpawn(spawnId);
      next = this.createLevel(definition);
      const focus = toWorldPosition(spawn.position);
      const desired = desiredSectors(definition, focus, this.streamingEnabled);
      this.preparationSpawnId = spawn.id;
      this.preparationSectorIds = desired.map(({ id }) => id);
      for (const sector of desired) {
        const built = await this.buildSector(definition, sector);
        if (generation !== this.preparationGeneration) {
          disposeSector(built);
          throw new StaleLevelPreparationError(definition.id);
        }
        next.sectors.set(sector.id, built);
        next.states.set(sector.id, 'active');
        next.root.add(built.root);
      }
      if (generation !== this.preparationGeneration) {
        throw new StaleLevelPreparationError(definition.id);
      }
      this.prepared = { generation, level: next, spawn };
      this.preparationState = 'ready';
      return this.createPreparedHandle(this.prepared);
    } catch (error) {
      if (next) disposeLevel(next);
      if (generation === this.preparationGeneration) {
        const message = error instanceof Error ? error.message : String(error);
        this.preparationState = 'failed';
        this.preparationError = message;
        this.lastError = message;
      }
      throw error;
    }
  }

  public getPreparationSnapshot(): LevelPreparationSnapshot {
    return {
      generation: this.preparationGeneration,
      state: this.preparationState,
      sourceLevelId: this.preparationSourceLevelId,
      destinationLevelId: this.preparationDestinationLevelId,
      spawnId: this.preparationSpawnId,
      initialSectorIds: [...this.preparationSectorIds],
      error: this.preparationError,
    };
  }

  public unload(): void {
    ++this.preparationGeneration;
    this.disposePrepared();
    const current = this.loaded;
    if (!current) return;
    this.activeLevelGeneration += 1;
    this.visualPathPins.clear();
    for (const sectorId of [...current.sectors.keys()].sort()) {
      this.unloadSector(current, sectorId);
    }
    this.scene.remove(current.root);
    current.root.clear();
    this.loaded = undefined;
    this.events.emit('level:unloaded', { levelId: current.definition.id });
  }

  public dispose(): void {
    this.unload();
  }

  public setDebugVisible(visible: boolean): void {
    this.debugVisible = visible;
    for (const group of this.debugGroups.keys()) {
      this.debugGroups.set(group, visible);
    }
    this.applyDebugVisibility();
  }

  public setDebugGroupVisible(group: LevelDebugGroup, visible: boolean): void {
    this.debugGroups.set(group, visible);
    this.debugVisible = [...this.debugGroups.values()].some(Boolean);
    this.applyDebugVisibility();
  }

  public get activeLevel(): LevelDefinition | undefined {
    return this.loaded?.definition;
  }

  public getStreamingSnapshot(): SectorStreamingSnapshot {
    const loaded = this.loaded;
    const sectors = loaded ? [...loaded.sectors.values()] : [];
    return {
      levelId: loaded?.definition.id,
      authored: loaded?.states.size ?? 0,
      active: sectors.map(({ definition }) => definition.id).sort(),
      pending: loaded
        ? [...loaded.states]
            .filter(([, state]) => state !== 'inactive' && state !== 'active')
            .map(([id]) => id)
            .sort()
        : [],
      states: loaded ? Object.fromEntries([...loaded.states].sort()) : {},
      loadCount: this.loadCount,
      unloadCount: this.unloadCount,
      sceneObjects: sectors.reduce(
        (sum, sector) => sum + countObjects(sector.root),
        0,
      ),
      ownedResources: sectors.reduce(
        (sum, sector) => sum + sector.ownedResources.size,
        0,
      ),
      modelInstances: sectors.reduce(
        (sum, sector) => sum + sector.modelInstances.size,
        0,
      ),
      colliders: loaded
        ? sectors.reduce((sum, sector) => {
            const entryIds = new Set(sector.definition.entryIds);
            return (
              sum +
              loaded.definition.staticCollision.filter(({ id }) =>
                entryIds.has(id),
              ).length
            );
          }, 0)
        : 0,
      lodHiddenObjects: sectors.reduce(
        (sum, sector) => sum + countHiddenLodObjects(sector.root),
        0,
      ),
      transitionsPending: this.transition !== undefined,
      pinnedSectors: [...this.visualPathPins.keys()].sort(),
      visualPathPinCount: [...this.visualPathPins.values()].reduce(
        (sum, count) => sum + count,
        0,
      ),
      lastError: this.lastError,
    };
  }

  public getSpawn(id?: string): SpawnPointDefinition {
    return this.requireLocations().getSpawn(id);
  }

  public getLocation(id: string): NamedLocationDefinition {
    return this.requireLocations().getLocation(id);
  }

  public getTrigger(id: string): TriggerVolumeDefinition {
    return this.requireLocations().getTrigger(id);
  }

  public getCinematicAnchor(id: string): CinematicAnchorDefinition {
    return this.requireLocations().getCinematicAnchor(id);
  }

  public getStaticColliders(): readonly StaticColliderDefinition[] {
    return this.requireLocations().getStaticColliders();
  }

  public hasVisual(id: string): boolean {
    return this.loaded?.root.getObjectByName(`visual:${id}`) !== undefined;
  }

  public getVisualPosition(id: string): WorldPosition {
    const object = this.loaded?.root.getObjectByName(`visual:${id}`);
    if (!object) throw new Error(`Unknown level visual "${id}"`);
    return { x: object.position.x, y: object.position.y, z: object.position.z };
  }

  public getVisualBounds(id: string): {
    readonly center: WorldPosition;
    readonly size: WorldPosition;
  } {
    const object = this.loaded?.root.getObjectByName(`visual:${id}`);
    if (!object) throw new Error(`Unknown level visual "${id}"`);
    const bounds = new Box3().setFromObject(object);
    const center = bounds.getCenter(new Vector3());
    const size = bounds.getSize(new Vector3());
    return {
      center: { x: center.x, y: center.y, z: center.z },
      size: { x: size.x, y: size.y, z: size.z },
    };
  }

  /** Level-owned movement for code-native cinematic exterior visuals. */
  public requestVisualPath(
    request: LevelVisualPathRequest,
  ): LevelVisualPathHandle {
    if (!request.owner.trim() || request.visualIds.length === 0) {
      throw new Error('Visual path requests require an owner and visuals');
    }
    if (request.points.length < 2 || request.durationSeconds <= 0) {
      throw new Error('Visual path requests require two points and a duration');
    }
    const loaded = this.loaded;
    if (!loaded) throw new Error('No level is loaded');
    const root = loaded.root;
    const generation = this.activeLevelGeneration;
    const sectorDefinitions = sectorsFor(
      loaded.definition,
      this.streamingEnabled,
    );
    const pinnedSectorIds = new Set<string>();
    for (const visualId of request.visualIds) {
      const owners = sectorDefinitions.filter(({ entryIds }) =>
        entryIds.includes(visualId),
      );
      if (owners.length !== 1) {
        throw new Error(
          `Cinematic visual "${visualId}" requires unique sector ownership`,
        );
      }
      pinnedSectorIds.add(owners[0]!.id);
    }
    for (const sectorId of pinnedSectorIds) {
      this.visualPathPins.set(
        sectorId,
        (this.visualPathPins.get(sectorId) ?? 0) + 1,
      );
    }
    const objects = request.visualIds.map((id) => {
      const object = root.getObjectByName(`visual:${id}`);
      if (!object) throw new Error(`Unknown level visual "${id}"`);
      return { object, initial: object.position.clone() };
    });
    const origin = new Vector3(...request.points[0]!);
    const offsets = objects.map(({ initial }) => initial.clone().sub(origin));
    let elapsed = 0;
    let completed = false;
    let paused = false;
    let released = false;
    let pinsReleased = false;
    const isCurrent = () =>
      this.loaded === loaded && this.activeLevelGeneration === generation;
    const releasePins = (): void => {
      if (pinsReleased) return;
      pinsReleased = true;
      if (!isCurrent()) return;
      for (const sectorId of pinnedSectorIds) {
        const count = this.visualPathPins.get(sectorId) ?? 0;
        if (count <= 1) this.visualPathPins.delete(sectorId);
        else this.visualPathPins.set(sectorId, count - 1);
      }
    };
    const update = (): void => {
      const progress = Math.min(
        1,
        Math.max(0, elapsed - request.startSeconds) / request.durationSeconds,
      );
      const scaled = progress * (request.points.length - 1);
      const index = Math.min(request.points.length - 2, Math.floor(scaled));
      const local = smoothPathProgress(scaled - index);
      const from = new Vector3(...request.points[index]!);
      const to = new Vector3(...request.points[index + 1]!);
      const position = from.lerp(to, local);
      objects.forEach(({ object }, objectIndex) => {
        object.position.copy(position).add(offsets[objectIndex]!);
      });
    };
    update();
    return {
      update: (deltaSeconds) => {
        if (!isCurrent()) {
          released = true;
          releasePins();
          return;
        }
        if (released || completed || paused) return;
        elapsed += Math.max(0, deltaSeconds);
        update();
      },
      pause: () => {
        paused = true;
      },
      resume: () => {
        paused = false;
      },
      release: (reason) => {
        if (released) return;
        if (reason === 'shot-completed') {
          completed = true;
          return;
        }
        released = true;
        if (isCurrent() && reason === 'landing') {
          let overrides = this.visualPositionOverrides.get(
            loaded.definition.id,
          );
          if (!overrides) {
            overrides = new Map();
            this.visualPositionOverrides.set(loaded.definition.id, overrides);
          }
          for (const [index, visualId] of request.visualIds.entries()) {
            const position = objects[index]!.object.position;
            overrides.set(visualId, [position.x, position.y, position.z]);
          }
        }
        if (
          reason === 'cancelled' ||
          reason === 'failed' ||
          reason === 'disposed'
        ) {
          objects.forEach(({ object, initial }) =>
            object.position.copy(initial),
          );
        }
        releasePins();
      },
    };
  }

  public resolveLocation(position: WorldPosition): ResolvedLevelLocation {
    return this.requireLocations().resolveLocation(position);
  }

  private createPreparedHandle(
    ownership: PreparedLevelOwnership,
  ): PreparedLevelTransition {
    let consumed = false;
    const consume = (): void => {
      if (consumed)
        throw new Error('Prepared level transition was already used');
      consumed = true;
    };
    return {
      generation: ownership.generation,
      levelId: ownership.level.definition.id,
      spawn: ownership.spawn,
      commit: async (landing) => {
        consume();
        await this.commitPrepared(ownership, landing);
      },
      cancel: () => {
        consume();
        this.cancelPrepared(ownership);
      },
    };
  }

  private async commitPrepared(
    ownership: PreparedLevelOwnership,
    landing?: LevelLandingOperation,
  ): Promise<void> {
    this.requireCurrentPreparation(ownership);
    const source = this.loaded;
    const destination = ownership.level;
    this.prepared = undefined;
    this.preparationState = 'committing';

    const pending = (async () => {
      const restoration: LevelRestorationOperation[] = [];
      if (source) this.deactivateLevel(source);
      this.activateLevel(destination);
      try {
        await landing?.({
          level: destination.definition,
          spawn: ownership.spawn,
          onRollback: (operation) => restoration.push(operation),
        });
      } catch (error) {
        this.deactivateLevel(destination);
        disposeLevel(destination);
        if (source) this.activateLevel(source);
        const restorationErrors: unknown[] = [];
        for (const operation of restoration.reverse()) {
          try {
            await operation();
          } catch (restorationError) {
            restorationErrors.push(restorationError);
          }
        }
        const message = error instanceof Error ? error.message : String(error);
        this.preparationState = 'failed';
        this.preparationError =
          restorationErrors.length === 0
            ? message
            : `${message} (${restorationErrors.length} restoration operation(s) failed)`;
        this.lastError = this.preparationError;
        throw error;
      }
      if (source) disposeLevel(source);
      this.preparationState = 'idle';
      this.preparationError = undefined;
      this.lastError = undefined;
    })();
    this.transition = pending;
    try {
      await pending;
    } finally {
      if (this.transition === pending) this.transition = undefined;
    }
  }

  private cancelPrepared(ownership: PreparedLevelOwnership): void {
    this.requireCurrentPreparation(ownership);
    this.prepared = undefined;
    disposeLevel(ownership.level);
    this.preparationState = 'idle';
    this.preparationError = undefined;
  }

  private requireCurrentPreparation(ownership: PreparedLevelOwnership): void {
    if (
      this.prepared !== ownership ||
      ownership.generation !== this.preparationGeneration
    ) {
      throw new StaleLevelPreparationError(ownership.level.definition.id);
    }
  }

  private disposePrepared(): void {
    if (this.prepared) disposeLevel(this.prepared.level);
    this.prepared = undefined;
  }

  private deactivateLevel(level: LoadedLevel): void {
    if (this.loaded !== level) return;
    this.activeLevelGeneration += 1;
    this.visualPathPins.clear();
    for (const sectorId of activeSectorIds(level)) {
      this.events.emit('sector:unloaded', {
        levelId: level.definition.id,
        sectorId,
      });
      this.unloadCount += 1;
    }
    this.scene.remove(level.root);
    this.loaded = undefined;
    this.events.emit('level:unloaded', { levelId: level.definition.id });
  }

  private activateLevel(level: LoadedLevel): void {
    if (this.loaded) {
      throw new Error(
        `Cannot activate level "${level.definition.id}" while "${this.loaded.definition.id}" is active`,
      );
    }
    this.activeLevelGeneration += 1;
    this.visualPathPins.clear();
    this.loaded = level;
    this.scene.add(level.root);
    this.applyDebugVisibility();
    for (const sectorId of activeSectorIds(level)) {
      const sector = level.sectors.get(sectorId)!;
      this.loadCount += 1;
      this.events.emit('sector:loaded', {
        levelId: level.definition.id,
        sectorId,
        colliders: filterDefinition(
          level.definition,
          new Set(sector.definition.entryIds),
        ).staticCollision,
      });
    }
    this.events.emit('level:loaded', { level: level.definition });
  }

  private requireLocations(): DefinitionLevelLocations {
    if (!this.loaded) throw new Error('No level is loaded');
    return this.loaded.locations;
  }

  private applyDebugVisibility(): void {
    if (!this.loaded) return;
    for (const sector of this.loaded.sectors.values()) {
      for (const [group, visible] of this.debugGroups) {
        const object = sector.debug.getObjectByName(debugGroupNames[group]);
        if (object) object.visible = visible;
      }
      sector.debug.visible = this.debugVisible;
    }
  }

  private createLevel(definition: LevelDefinition): LoadedLevel {
    const root = namedGroup(`level:${definition.id}`);
    const semanticMarkers = namedGroup('semantic-markers');
    semanticMarkers.visible = false;
    root.add(semanticMarkers);
    const definitions = sectorsFor(definition, this.streamingEnabled);
    return {
      definition,
      root,
      locations: new DefinitionLevelLocations(definition),
      sectors: new Map(),
      states: new Map<string, SectorLifecycleState>(
        definitions.map((sector) => [sector.id, 'inactive']),
      ),
    };
  }

  private async buildSector(
    definition: LevelDefinition,
    sector: WorldSectorDefinition,
  ): Promise<LoadedSector> {
    const root = namedGroup(`sector:${sector.id}`);
    const visuals = namedGroup('rendered-geometry');
    const debug = namedGroup('debug-helpers');
    const resources = new Set<BufferGeometry | Material>();
    const modelInstances = new Set<ModelInstance>();
    root.add(visuals, debug);
    const entries = new Set(sector.entryIds);
    const sectorDefinition = filterDefinition(definition, entries);

    try {
      const buildingRenderer = new AshfallBuildingRenderer(
        this.assets,
        resources,
      );
      const surfaceMaterials = new Map<string, Promise<MeshStandardMaterial>>();
      const results = await Promise.allSettled(
        sectorDefinition.environment.map((visual) =>
          visual.kind === 'building'
            ? buildingRenderer.create(visual)
            : this.createVisual(
                visual,
                resources,
                surfaceMaterials,
                modelInstances,
              ),
        ),
      );
      const failure = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected',
      );
      if (failure) throw failure.reason;
      const objects = results.map(
        (result) => (result as PromiseFulfilledResult<Object3D>).value,
      );
      visuals.add(...objects);
      const overrides = this.visualPositionOverrides.get(definition.id);
      if (overrides) {
        for (const [visualId, position] of overrides) {
          const object = root.getObjectByName(`visual:${visualId}`);
          if (object) object.position.set(...position);
        }
      }
      buildDebug(sectorDefinition, debug, resources);
      return {
        definition: sector,
        root,
        debug,
        ownedResources: resources,
        modelInstances,
      };
    } catch (error) {
      for (const instance of modelInstances) instance.dispose();
      for (const resource of resources) resource.dispose();
      root.clear();
      throw error;
    }
  }

  private async createVisual(
    visual: EnvironmentVisualDefinition,
    resources: Set<BufferGeometry | Material>,
    surfaceMaterials: Map<string, Promise<MeshStandardMaterial>>,
    modelInstances: Set<ModelInstance>,
  ): Promise<Object3D> {
    if (visual.kind === 'gltf') {
      const instance = await this.assets.instantiateModel(visual.assetId);
      modelInstances.add(instance);
      const clone = instance.scene;
      clone.name = `visual:${visual.id}`;
      applyTransform(clone, visual);
      return clone;
    }
    if (visual.kind === 'building') {
      throw new Error('Building visuals require the shared building renderer');
    }
    if (visual.kind === 'spline-road') {
      const geometry = own(resources, createSplineRoadGeometry(visual));
      const material = own(
        resources,
        new MeshStandardMaterial({
          color: visual.color,
          flatShading: true,
          roughness: 0.96,
          metalness: 0,
        }),
      );
      const mesh = new Mesh(geometry, material);
      mesh.name = `visual:${visual.id}`;
      mesh.receiveShadow = true;
      return mesh;
    }
    const geometry = own(resources, new BoxGeometry(...visual.size));
    if (visual.textureAssetId && visual.uvMetersPerRepeat) {
      scaleBoxUvs(geometry, visual.size, visual.uvMetersPerRepeat);
    }
    const material = visual.textureAssetId
      ? await this.texturedBoxMaterial(visual, resources, surfaceMaterials)
      : own(
          resources,
          new MeshStandardMaterial({
            color: visual.color,
            flatShading: true,
            roughness: 0.9,
          }),
        );
    const mesh = new Mesh(geometry, material);
    mesh.name = `visual:${visual.id}`;
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    applyTransform(mesh, visual);
    return mesh;
  }

  private texturedBoxMaterial(
    visual: BoxVisualDefinition,
    resources: Set<BufferGeometry | Material>,
    surfaceMaterials: Map<string, Promise<MeshStandardMaterial>>,
  ): Promise<MeshStandardMaterial> {
    const assetId = visual.textureAssetId!;
    let pending = surfaceMaterials.get(assetId);
    if (!pending) {
      pending = this.assets.loadTexture(assetId).then((texture) => {
        configureSurfaceTexture(texture);
        return own(
          resources,
          new MeshStandardMaterial({
            map: texture,
            color: visual.color,
            roughness: 0.96,
            metalness: 0,
          }),
        );
      });
      surfaceMaterials.set(assetId, pending);
    }
    return pending;
  }

  private async reconcile(
    position: WorldPosition,
    initial = false,
  ): Promise<void> {
    const loaded = this.loaded;
    if (!loaded) return;
    const desired = [
      ...desiredSectors(
        loaded.definition,
        position,
        this.streamingEnabled,
        loaded.sectors,
      ),
    ];
    const desiredIds = new Set(desired.map(({ id }) => id));
    for (const sector of sectorsFor(loaded.definition, this.streamingEnabled)) {
      if (this.visualPathPins.has(sector.id) && !desiredIds.has(sector.id)) {
        desired.push(sector);
        desiredIds.add(sector.id);
      }
    }
    for (const [sectorId, state] of loaded.states) {
      if (state === 'failed' && !desiredIds.has(sectorId)) {
        loaded.states.set(sectorId, 'inactive');
      }
    }
    for (const sector of desired) {
      if (
        !loaded.sectors.has(sector.id) &&
        loaded.states.get(sector.id) !== 'failed'
      )
        loaded.states.set(sector.id, 'requested');
    }
    let loadFailed = desired.some(
      ({ id }) => loaded.states.get(id) === 'failed',
    );
    for (const sector of desired) {
      if (
        loaded.sectors.has(sector.id) ||
        loaded.states.get(sector.id) === 'failed'
      )
        continue;
      loaded.states.set(sector.id, 'loading');
      try {
        const built = await this.buildSector(loaded.definition, sector);
        if (this.loaded !== loaded) {
          disposeSector(built);
          return;
        }
        loaded.sectors.set(sector.id, built);
        loaded.root.add(built.root);
        this.applyDistanceLod(position);
        loaded.states.set(sector.id, 'active');
        this.loadCount += 1;
        this.applyDebugVisibility();
        this.events.emit('sector:loaded', {
          levelId: loaded.definition.id,
          sectorId: sector.id,
          colliders: filterDefinition(
            loaded.definition,
            new Set(sector.entryIds),
          ).staticCollision,
        });
      } catch (error) {
        loadFailed = true;
        loaded.states.set(sector.id, 'failed');
        this.lastError = error instanceof Error ? error.message : String(error);
        if (initial) throw error;
      }
    }
    if (loadFailed) return;
    this.lastError = undefined;
    for (const sectorId of [...loaded.sectors.keys()].sort()) {
      if (!desiredIds.has(sectorId)) this.unloadSector(loaded, sectorId);
    }
  }

  private unloadSector(loaded: LoadedLevel, sectorId: string): void {
    const sector = loaded.sectors.get(sectorId);
    if (!sector) return;
    loaded.states.set(sectorId, 'unloading');
    this.events.emit('sector:unloaded', {
      levelId: loaded.definition.id,
      sectorId,
    });
    loaded.root.remove(sector.root);
    disposeSector(sector);
    loaded.sectors.delete(sectorId);
    loaded.states.set(sectorId, 'inactive');
    this.unloadCount += 1;
  }

  private applyDistanceLod(position: WorldPosition): void {
    if (!this.loaded) return;
    for (const sector of this.loaded.sectors.values()) {
      sector.root.traverse((object) => {
        if (!isDistanceLodDetail(object)) return;
        const world = object.getWorldPosition(new Vector3());
        object.visible =
          Math.hypot(position.x - world.x, position.z - world.z) <= 24;
      });
    }
  }
}

function smoothPathProgress(value: number): number {
  return value * value * (3 - 2 * value);
}

export function createSplineRoadGeometry(
  visual: SplineRoadVisualDefinition,
): BufferGeometry {
  const center = sampleSplineRoad(visual);
  const left = offsetSplineSamples(center, visual.width / 2);
  const right = offsetSplineSamples(center, -visual.width / 2);
  const positions: number[] = [];
  const uvs: number[] = [];
  for (let index = 0; index < center.length; index += 1) {
    positions.push(...left[index]!.position, ...right[index]!.position);
    const v = center[index]!.distance / 4;
    uvs.push(0, v, 1, v);
  }
  const indices: number[] = [];
  for (let index = 0; index < center.length - 1; index += 1) {
    const leftStart = index * 2;
    const rightStart = leftStart + 1;
    const leftEnd = leftStart + 2;
    const rightEnd = leftStart + 3;
    indices.push(leftStart, leftEnd, rightStart, rightStart, leftEnd, rightEnd);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function configureSurfaceTexture(texture: Texture): void {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
}

function scaleBoxUvs(
  geometry: BoxGeometry,
  size: Vector3Tuple,
  metersPerRepeat: number,
): void {
  const uv = geometry.getAttribute('uv');
  const repeatX = Math.max(size[0], size[2]) / metersPerRepeat;
  const repeatY =
    Math.max(size[1], Math.min(size[0], size[2])) / metersPerRepeat;
  for (let index = 0; index < uv.count; index += 1) {
    uv.setXY(index, uv.getX(index) * repeatX, uv.getY(index) * repeatY);
  }
  uv.needsUpdate = true;
}

function buildDebug(
  definition: LevelDefinition,
  debug: Group,
  resources: Set<BufferGeometry | Material>,
): void {
  const collision = namedGroup('collision-geometry');
  for (const collider of definition.staticCollision) {
    collision.add(
      createWireBox(collider, 0xff3b30, `collision:${collider.id}`, resources),
    );
  }

  const spawns = namedGroup('spawn-points');
  for (const spawn of definition.spawns) {
    const color = spawn.kind === 'player' ? 0x39ff88 : 0x48a8ff;
    const marker = createConeMarker(spawn, color, resources);
    marker.name = `spawn:${spawn.id}`;
    spawns.add(marker);
  }

  const triggers = namedGroup('trigger-volumes');
  for (const trigger of definition.triggers) {
    triggers.add(
      createWireBox(trigger, 0xffc928, `trigger:${trigger.id}`, resources),
    );
  }

  const markers = namedGroup('location-markers');
  for (const location of definition.locations) {
    const color = location.kind === 'mission' ? 0xff4fc8 : 0x41e5e0;
    const marker = createSphereMarker(location, color, resources);
    marker.name = `${location.kind}:${location.id}`;
    markers.add(marker);
  }
  for (const zone of definition.zones) {
    markers.add(createWireBox(zone, 0x72f1b8, `zone:${zone.id}`, resources));
  }
  for (const landmark of definition.landmarks) {
    const marker = createSphereMarker(landmark, 0xffdd70, resources);
    marker.name = `landmark:${landmark.id}`;
    marker.scale.setScalar(Math.max(0.7, landmark.radius / 4));
    markers.add(marker);
  }

  const anchors = namedGroup('cinematic-anchors');
  for (const anchor of definition.cinematicAnchors) {
    const marker = createConeMarker(anchor, 0xb45cff, resources);
    marker.name = `cinematic:${anchor.id}`;
    const lineGeometry = own(
      resources,
      new BufferGeometry().setFromPoints([
        new Vector3(...anchor.position),
        new Vector3(...anchor.lookAt),
      ]),
    );
    const lineMaterial = own(
      resources,
      new LineBasicMaterial({ color: 0xb45cff }),
    );
    marker.add(new Line(lineGeometry, lineMaterial));
    anchors.add(marker);
  }
  debug.add(collision, spawns, triggers, markers, anchors);
}

function namedGroup(name: string): Group {
  const group = new Group();
  group.name = name;
  return group;
}

function createWireBox(
  definition: TransformDefinition & { readonly size: Vector3Tuple },
  color: number,
  name: string,
  resources: Set<BufferGeometry | Material>,
): Object3D {
  const box = own(resources, new BoxGeometry(...definition.size));
  const edges = own(resources, new EdgesGeometry(box));
  const material = own(resources, new LineBasicMaterial({ color }));
  const lines = new LineSegments(edges, material);
  lines.name = name;
  applyTransform(lines, definition);
  return lines;
}

function createConeMarker(
  definition: TransformDefinition,
  color: number,
  resources: Set<BufferGeometry | Material>,
): Object3D {
  const geometry = own(resources, new ConeGeometry(0.35, 1.2, 6));
  const material = own(
    resources,
    new MeshBasicMaterial({ color, depthTest: false, wireframe: true }),
  );
  const marker = new Mesh(geometry, material);
  applyTransform(marker, definition);
  marker.position.y += 0.6;
  return marker;
}

function createSphereMarker(
  definition: TransformDefinition,
  color: number,
  resources: Set<BufferGeometry | Material>,
): Object3D {
  const geometry = own(resources, new SphereGeometry(0.4, 8, 6));
  const material = own(
    resources,
    new MeshBasicMaterial({ color, depthTest: false, wireframe: true }),
  );
  const marker = new Mesh(geometry, material);
  applyTransform(marker, definition);
  return marker;
}

function applyTransform(
  object: Object3D,
  transform: TransformDefinition,
): void {
  object.position.set(...transform.position);
  if (transform.rotation) object.rotation.set(...transform.rotation);
  if (transform.scale) object.scale.set(...transform.scale);
}

function own<T extends BufferGeometry | Material>(
  resources: Set<BufferGeometry | Material>,
  resource: T,
): T {
  resources.add(resource);
  return resource;
}

function sectorsFor(
  definition: LevelDefinition,
  streamingEnabled = true,
): readonly WorldSectorDefinition[] {
  return (
    (streamingEnabled ? definition.streaming?.sectors : undefined) ?? [
      {
        id: 'legacy-full-level',
        center: [0, 0],
        loadDistance: 1,
        unloadDistance: 2,
        alwaysLoaded: true,
        entryIds: [
          ...definition.environment.map(({ id }) => id),
          ...definition.staticCollision.map(({ id }) => id),
        ],
      },
    ]
  );
}

function desiredSectors(
  definition: LevelDefinition,
  position: WorldPosition,
  streamingEnabled: boolean,
  activeSectors?: ReadonlyMap<string, LoadedSector>,
): readonly WorldSectorDefinition[] {
  return sectorsFor(definition, streamingEnabled).filter((sector) => {
    if (sector.alwaysLoaded) return true;
    const active = activeSectors?.has(sector.id) ?? false;
    const distance = Math.hypot(
      position.x - sector.center[0],
      position.z - sector.center[1],
    );
    return distance <= (active ? sector.unloadDistance : sector.loadDistance);
  });
}

function activeSectorIds(level: LoadedLevel): readonly string[] {
  const active = new Set(level.sectors.keys());
  return [...level.states.keys()].filter((id) => active.has(id));
}

function filterDefinition(
  definition: LevelDefinition,
  entryIds: ReadonlySet<string>,
): LevelDefinition {
  return {
    ...definition,
    environment: definition.environment.filter(({ id }) => entryIds.has(id)),
    staticCollision: definition.staticCollision.filter(({ id }) =>
      entryIds.has(id),
    ),
    spawns: [],
    locations: [],
    zones: [],
    landmarks: [],
    triggers: [],
    cinematicAnchors: [],
    lighting: undefined,
    mapPresentation: undefined,
    streaming: undefined,
  };
}

function toWorldPosition(position: Vector3Tuple): WorldPosition {
  return { x: position[0], y: position[1], z: position[2] };
}

function disposeSector(sector: LoadedSector): void {
  sector.root.removeFromParent();
  for (const instance of sector.modelInstances) instance.dispose();
  sector.modelInstances.clear();
  sector.root.clear();
  for (const resource of sector.ownedResources) resource.dispose();
  sector.ownedResources.clear();
}

function disposeLevel(level: LoadedLevel): void {
  level.root.removeFromParent();
  for (const sectorId of [...level.sectors.keys()].sort()) {
    const sector = level.sectors.get(sectorId);
    if (sector) disposeSector(sector);
  }
  level.sectors.clear();
  level.root.clear();
}

function countObjects(root: Object3D): number {
  let count = 0;
  root.traverse(() => {
    count += 1;
  });
  return count;
}

function isDistanceLodDetail(object: Object3D): boolean {
  return object.name.endsWith(':roof') || object.name.endsWith(':cornice');
}

function countHiddenLodObjects(root: Object3D): number {
  let count = 0;
  root.traverse((object) => {
    if (isDistanceLodDetail(object) && !object.visible) count += 1;
  });
  return count;
}
