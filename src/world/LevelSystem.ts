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
  SphereGeometry,
  Vector3,
} from 'three';
import type { Material, Scene } from 'three';
import type { GameAssetLoader } from '../assets/AssetLoader';
import type { EventBus } from '../core/events';
import type { GameSystem } from '../core/lifecycle';
import type { InputReader } from '../input/InputSystem';
import type { StaticColliderDefinition } from '../physics/StaticCollider';
import type {
  CinematicAnchorDefinition,
  EnvironmentVisualDefinition,
  LevelDefinition,
  NamedLocationDefinition,
  SpawnPointDefinition,
  TransformDefinition,
  TriggerVolumeDefinition,
  Vector3Tuple,
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
  readonly debug: Group;
  readonly ownedResources: Set<BufferGeometry | Material>;
  readonly locations: DefinitionLevelLocations;
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

  public constructor(
    private readonly scene: Scene,
    private readonly assets: GameAssetLoader,
    private readonly registry: LevelRegistry,
    private readonly initialLevelId: string,
    private readonly events: EventBus<WorldEvents>,
    private readonly input?: InputReader,
    initiallyDebugVisible = false,
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
  }

  public async load(levelId: string): Promise<void> {
    const definition = this.registry.get(levelId);
    validateLevelDefinition(definition);
    const next = await this.build(definition);
    this.unload();
    this.loaded = next;
    this.applyDebugVisibility();
    this.scene.add(next.root);
    this.events.emit('level:loaded', { level: definition });
  }

  public unload(): void {
    const current = this.loaded;
    if (!current) return;
    this.scene.remove(current.root);
    current.root.clear();
    for (const resource of current.ownedResources) resource.dispose();
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
    for (const [group, visible] of this.debugGroups) {
      const object = this.loaded.debug.getObjectByName(debugGroupNames[group]);
      if (object) object.visible = visible;
    }
    this.loaded.debug.visible = this.debugVisible;
  }

  private async build(definition: LevelDefinition): Promise<LoadedLevel> {
    const root = namedGroup(`level:${definition.id}`);
    const visuals = namedGroup('rendered-geometry');
    const semanticMarkers = namedGroup('semantic-markers');
    semanticMarkers.visible = false;
    const debug = namedGroup('debug-helpers');
    const resources = new Set<BufferGeometry | Material>();
    root.add(visuals, semanticMarkers, debug);

    try {
      const buildingRenderer = new AshfallBuildingRenderer(
        this.assets,
        resources,
      );
      const objects = await Promise.all(
        definition.environment.map((visual) =>
          visual.kind === 'building'
            ? buildingRenderer.create(visual)
            : this.createVisual(visual, resources),
        ),
      );
      visuals.add(...objects);
      buildDebug(definition, debug, resources);
      return {
        definition,
        root,
        debug,
        ownedResources: resources,
        locations: new DefinitionLevelLocations(definition),
      };
    } catch (error) {
      for (const resource of resources) resource.dispose();
      root.clear();
      throw error;
    }
  }

  private async createVisual(
    visual: EnvironmentVisualDefinition,
    resources: Set<BufferGeometry | Material>,
  ): Promise<Object3D> {
    if (visual.kind === 'gltf') {
      const gltf = await this.assets.loadGltf(visual.assetId);
      const clone = gltf.scene.clone(true);
      clone.name = `visual:${visual.id}`;
      applyTransform(clone, visual);
      return clone;
    }
    if (visual.kind === 'building') {
      throw new Error('Building visuals require the shared building renderer');
    }
    const geometry = own(resources, new BoxGeometry(...visual.size));
    const material = own(
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
