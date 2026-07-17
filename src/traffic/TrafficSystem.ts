import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three';
import type { Material, Object3D, Scene } from 'three';
import type { GameAssetLoader, ModelInstance } from '../assets/AssetLoader';
import type { FrameTime } from '../core/time';
import type { GameSystem } from '../core/lifecycle';
import type { GameContext } from '../game/GameRuntime';
import type { CollisionWorld } from '../physics/CollisionWorld';
import type { DebugRegistry, DebugUnregister } from '../debug/DebugRegistry';
import { debugSections } from '../debug/DebugRegistry';
import {
  TrafficSimulation,
  ashfallTrafficLanes,
  defaultTrafficConfig,
} from './TrafficSimulation';
import type {
  TrafficApproach,
  TrafficConfig,
  TrafficVehicleSnapshot,
} from './TrafficSimulation';

export const trafficAssetIds = [
  'vehicle.traffic.pickup',
  'vehicle.traffic.sports-car',
] as const;

interface VehicleSlot {
  readonly instance: ModelInstance;
  readonly root: Group;
  readonly assetIndex: number;
  readonly detection: Mesh;
  vehicleId?: string;
}

/** Scene adapter for the deterministic, deliberately small traffic simulation. */
export class TrafficSystem implements GameSystem {
  public readonly id = 'traffic';
  public readonly simulation: TrafficSimulation;
  private readonly root = new Group();
  private readonly debugRoot = new Group();
  private readonly slots: VehicleSlot[] = [];
  private readonly debugResources = new Set<BufferGeometry | Material>();
  private readonly unregisterDebug: DebugUnregister[] = [];
  private initialized = false;
  private state: GameContext['state'] | undefined;

  public constructor(
    private readonly scene: Scene,
    private readonly assets: GameAssetLoader,
    private readonly collision: CollisionWorld,
    private readonly debug?: DebugRegistry,
    config: TrafficConfig = defaultTrafficConfig,
  ) {
    this.simulation = new TrafficSimulation(config);
    this.root.name = 'traffic-vehicles';
    this.debugRoot.name = 'traffic-debug';
    this.debugRoot.visible = false;
    this.root.add(this.debugRoot);
  }

  public async init(context?: GameContext): Promise<void> {
    try {
      this.state = context?.state;
      this.buildPathDebug();
      for (
        let index = 0;
        index < this.simulation.config.maxPopulation;
        index += 1
      ) {
        const assetIndex = index % trafficAssetIds.length;
        const instance = await this.assets.instantiateModel(
          trafficAssetIds[assetIndex]!,
        );
        this.slots.push(this.createSlot(instance, assetIndex));
      }
      this.scene.add(this.root);
      this.registerDevelopmentControls();
      this.initialized = true;
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  public update(time: FrameTime): void {
    if (this.state && this.state.current !== 'playing') return;
    this.step(time.delta);
  }

  /** Deterministic development/test step; normal play is driven by GameRuntime. */
  public step(delta: number): void {
    this.simulation.update(delta, {
      playerDistance: (vehicle) => this.dynamicObstacleDistance(vehicle),
      staticDistance: (vehicle) => this.staticObstacleDistance(vehicle),
    });
    this.syncScene();
  }

  public setVisualizationVisible(visible: boolean): void {
    this.debugRoot.visible = visible;
  }

  public spawn(approach: TrafficApproach): boolean {
    const spawned = this.simulation.spawn(approach) !== undefined;
    this.syncScene();
    return spawned;
  }

  public spawnEachApproach(): number {
    const count = this.simulation.spawnEachApproach();
    this.syncScene();
    return count;
  }

  public clear(): void {
    this.simulation.clear();
    this.syncScene();
  }

  public getSnapshot(): ReturnType<TrafficSimulation['getSnapshot']> & {
    readonly pooledModels: number;
    readonly visualizationVisible: boolean;
  } {
    return {
      ...this.simulation.getSnapshot(),
      pooledModels: this.slots.length,
      visualizationVisible: this.debugRoot.visible,
    };
  }

  public dispose(): void {
    for (const unregister of this.unregisterDebug.splice(0)) unregister();
    this.simulation.clear();
    for (const slot of this.slots.splice(0)) slot.instance.dispose();
    this.root.removeFromParent();
    this.root.clear();
    for (const resource of this.debugResources) resource.dispose();
    this.debugResources.clear();
    this.initialized = false;
    this.state = undefined;
  }

  private createSlot(instance: ModelInstance, assetIndex: number): VehicleSlot {
    const root = new Group();
    root.name = `traffic-model-slot:${this.slots.length}`;
    root.visible = false;
    const model = instance.scene;
    normalizeVehicleModel(model);
    model.traverse((child) => {
      if ('isMesh' in child) {
        const mesh = child as Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    root.add(model);
    const geometry = own(this.debugResources, new BoxGeometry(1.8, 1, 7));
    const material = own(
      this.debugResources,
      new MeshBasicMaterial({
        color: 0xffa928,
        wireframe: true,
        depthTest: false,
        transparent: true,
        opacity: 0.75,
      }),
    );
    const detection = new Mesh(geometry, material);
    detection.name = `traffic-detection:${this.slots.length}`;
    detection.visible = false;
    this.root.add(root);
    this.debugRoot.add(detection);
    return { instance, root, assetIndex, detection };
  }

  private syncScene(): void {
    if (!this.initialized) return;
    const vehicles = this.simulation.getSnapshot().vehicles;
    const activeIds = new Set(vehicles.map(({ id }) => id));
    for (const slot of this.slots) {
      if (slot.vehicleId && !activeIds.has(slot.vehicleId)) {
        slot.vehicleId = undefined;
        slot.root.visible = false;
        slot.detection.visible = false;
      }
    }
    for (const vehicle of vehicles) {
      let slot = this.slots.find(({ vehicleId }) => vehicleId === vehicle.id);
      if (!slot) {
        slot =
          this.slots.find(
            ({ vehicleId, assetIndex }) =>
              vehicleId === undefined && assetIndex === vehicle.assetIndex,
          ) ?? this.slots.find(({ vehicleId }) => vehicleId === undefined);
        if (!slot) continue;
        slot.vehicleId = vehicle.id;
      }
      slot.root.visible = true;
      slot.root.position.set(vehicle.x, 0.02, vehicle.z);
      slot.root.rotation.y = vehicle.yaw;
      slot.detection.visible = true;
      const lane = ashfallTrafficLanes.find(
        ({ approach }) => approach === vehicle.approach,
      )!;
      slot.detection.position.set(
        vehicle.x + lane.directionX * 5.7,
        0.7,
        vehicle.z + lane.directionZ * 5.7,
      );
      slot.detection.rotation.y = vehicle.yaw;
    }
  }

  private dynamicObstacleDistance(
    vehicle: TrafficVehicleSnapshot,
  ): number | undefined {
    if (!this.collision.castDynamicSegment) return undefined;
    const lane = ashfallTrafficLanes.find(
      ({ approach }) => approach === vehicle.approach,
    )!;
    const frontX = vehicle.x + lane.directionX * 2.2;
    const frontZ = vehicle.z + lane.directionZ * 2.2;
    const hit = this.collision.castDynamicSegment(
      new Vector3(frontX, 0.8, frontZ),
      new Vector3(
        frontX + lane.directionX * this.simulation.config.detectionDistance,
        0.8,
        frontZ + lane.directionZ * this.simulation.config.detectionDistance,
      ),
      0.9,
    );
    return hit.obstructed
      ? hit.fraction * this.simulation.config.detectionDistance
      : undefined;
  }

  private staticObstacleDistance(
    vehicle: TrafficVehicleSnapshot,
  ): number | undefined {
    const lane = ashfallTrafficLanes.find(
      ({ approach }) => approach === vehicle.approach,
    )!;
    const frontX = vehicle.x + lane.directionX * 2.2;
    const frontZ = vehicle.z + lane.directionZ * 2.2;
    const distance = Math.min(
      this.simulation.config.detectionDistance,
      Math.max(0, lane.length - vehicle.progress - 2.2),
    );
    if (distance <= 0) return undefined;
    const hit = this.collision.castSegment(
      new Vector3(frontX, 0.9, frontZ),
      new Vector3(
        frontX + lane.directionX * distance,
        0.9,
        frontZ + lane.directionZ * distance,
      ),
      { radius: 0.75 },
    );
    return hit.obstructed ? hit.fraction * distance : undefined;
  }

  private buildPathDebug(): void {
    const material = own(
      this.debugResources,
      new LineBasicMaterial({ color: 0x4de1ff, depthTest: false }),
    );
    for (const lane of ashfallTrafficLanes) {
      const geometry = own(
        this.debugResources,
        new BufferGeometry().setFromPoints([
          new Vector3(lane.startX, 0.08, lane.startZ),
          new Vector3(
            lane.startX + lane.directionX * lane.length,
            0.08,
            lane.startZ + lane.directionZ * lane.length,
          ),
        ]),
      );
      const line = new Line(geometry, material);
      line.name = `traffic-path:${lane.approach}`;
      this.debugRoot.add(line);
    }
  }

  private registerDevelopmentControls(): void {
    if (!this.debug) return;
    this.unregisterDebug.push(
      this.debug.registerToggle({
        id: 'traffic.enabled',
        label: 'Traffic enabled',
        group: debugSections.actions,
        initialValue: this.simulation.isEnabled,
        onChange: (enabled) => this.simulation.setEnabled(enabled),
      }),
      this.debug.registerCommand({
        id: 'traffic.spawn-each-approach',
        label: 'Spawn traffic on each approach',
        group: debugSections.actions,
        run: () => {
          this.spawnEachApproach();
        },
      }),
      this.debug.registerCommand({
        id: 'traffic.clear',
        label: 'Clear traffic',
        group: debugSections.actions,
        run: () => this.clear(),
      }),
      this.debug.registerCommand({
        id: 'traffic.step',
        label: 'Step traffic deterministically',
        group: debugSections.actions,
        argumentLabel: 'seconds (0–10)',
        run: (argument) => {
          const seconds = Number(argument);
          if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 10) {
            throw new Error('Expected traffic step seconds in (0, 10]');
          }
          this.step(seconds);
        },
      }),
      this.debug.registerValue({
        id: 'traffic.population',
        label: 'Traffic population',
        group: debugSections.world,
        read: () => {
          const state = this.simulation.getSnapshot();
          return `${state.count}/${state.maxPopulation} · ${state.enabled ? 'enabled' : 'disabled'}`;
        },
      }),
      this.debug.registerValue({
        id: 'traffic.vehicles',
        label: 'Lane / occupancy / stop / speed',
        group: debugSections.collision,
        read: () => {
          const vehicles = this.simulation.getSnapshot().vehicles;
          return vehicles.length === 0
            ? 'none'
            : vehicles
                .map(
                  ({ id, approach, progress, speed, stoppingReason }) =>
                    `${id}:${approach}@${progress.toFixed(1)}m ${speed.toFixed(1)}m/s ${stoppingReason ?? 'moving'}`,
                )
                .join(' | ');
        },
      }),
    );
  }
}

function normalizeVehicleModel(model: Object3D): void {
  model.updateMatrixWorld(true);
  const initial = new Box3().setFromObject(model);
  const size = initial.getSize(new Vector3());
  const horizontalLength = Math.max(size.x, size.z);
  const scale = horizontalLength > 0 ? 4.4 / horizontalLength : 1;
  model.scale.multiplyScalar(scale);
  model.updateMatrixWorld(true);
  const scaled = new Box3().setFromObject(model);
  const center = scaled.getCenter(new Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= scaled.min.y;
}

function own<Resource extends BufferGeometry | Material>(
  resources: Set<BufferGeometry | Material>,
  resource: Resource,
): Resource {
  resources.add(resource);
  return resource;
}
