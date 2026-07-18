import {
  BufferGeometry,
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
  readonly lastError: string | undefined;
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
  private loadCount = 0;
  private unloadCount = 0;
  private lastError: string | undefined;

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
    const definition = this.registry.get(levelId);
    validateLevelDefinition(definition);
    const next = this.createLevel(definition);
    this.unload();
    this.loaded = next;
    this.scene.add(next.root);
    try {
      await this.reconcile(
        this.positionSource?.() ??
          toWorldPosition(findDefaultSpawn(definition)),
        true,
      );
    } catch (error) {
      this.unload();
      throw error;
    }
    this.applyDebugVisibility();
    this.events.emit('level:loaded', { level: definition });
  }

  public unload(): void {
    const current = this.loaded;
    if (!current) return;
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

  public resolveLocation(position: WorldPosition): ResolvedLevelLocation {
    return this.requireLocations().resolveLocation(position);
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
      const objects = await Promise.all(
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
      visuals.add(...objects);
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
    const definitions = sectorsFor(loaded.definition, this.streamingEnabled);
    const desired = definitions.filter((sector) => {
      if (sector.alwaysLoaded) return true;
      const active = loaded.sectors.has(sector.id);
      const distance = Math.hypot(
        position.x - sector.center[0],
        position.z - sector.center[1],
      );
      return distance <= (active ? sector.unloadDistance : sector.loadDistance);
    });
    const desiredIds = new Set(desired.map(({ id }) => id));
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
    let loadFailed = false;
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

function findDefaultSpawn(definition: LevelDefinition): Vector3Tuple {
  return (
    definition.spawns.find((spawn) => spawn.kind === 'player' && spawn.default)
      ?.position ?? [0, 0, 0]
  );
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
