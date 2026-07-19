import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Group,
  Line,
  LineBasicMaterial,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import type { Material, Object3D, Scene } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
  pointAlongLane,
} from './TrafficSimulation';
import type {
  TrafficApproach,
  TrafficConfig,
  TrafficVehicleSnapshot,
} from './TrafficSimulation';
import {
  trafficVehicleById,
  trafficVehicleCatalog,
  type TrafficVehicleDefinition,
  type TrafficVehicleId,
  type VehicleForwardAxis,
} from './TrafficVehicleCatalog';
import type {
  TrafficSignalGroup,
  TrafficSignalIndication,
} from './TrafficSignalController';
import { intersectionTrafficControls } from '../world/levels/intersectionLayout';

interface VehicleSlot {
  readonly instance: ModelInstance;
  readonly root: Group;
  readonly vehicleType: TrafficVehicleId;
  readonly detection: Mesh;
  vehicleId?: string;
}

interface SignalLens {
  readonly group: TrafficSignalGroup;
  readonly indication: TrafficSignalIndication;
  readonly material: MeshStandardMaterial;
}

/** Scene adapter for the deterministic, deliberately small traffic simulation. */
export class TrafficSystem implements GameSystem {
  public readonly id = 'traffic';
  public readonly simulation: TrafficSimulation;
  private readonly root = new Group();
  private readonly debugRoot = new Group();
  private readonly slots: VehicleSlot[] = [];
  private readonly debugResources = new Set<BufferGeometry | Material>();
  private readonly signalLenses: SignalLens[] = [];
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
      this.buildSignalFixtures();
      for (
        let index = 0;
        index < this.simulation.config.maxPopulation;
        index += 1
      ) {
        const definition =
          trafficVehicleCatalog[index % trafficVehicleCatalog.length]!;
        const instance = await this.assets.instantiateModel(definition.assetId);
        this.slots.push(this.createSlot(instance, definition));
      }
      this.scene.add(this.root);
      this.registerDevelopmentControls();
      if (this.simulation.config.spawnCadence > 0) {
        this.simulation.populateResidents();
      }
      this.initialized = true;
      this.syncScene();
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
    readonly catalog: readonly {
      readonly id: TrafficVehicleId;
      readonly assetId: string;
      readonly pooledModels: number;
      readonly activeVehicles: number;
    }[];
    readonly visualizationVisible: boolean;
  } {
    return {
      ...this.simulation.getSnapshot(),
      pooledModels: this.slots.length,
      catalog: trafficVehicleCatalog.map(({ id, assetId }) => ({
        id,
        assetId,
        pooledModels: this.slots.filter(({ vehicleType }) => vehicleType === id)
          .length,
        activeVehicles: this.slots.filter(
          ({ vehicleType, vehicleId }) => vehicleType === id && vehicleId,
        ).length,
      })),
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
    this.signalLenses.length = 0;
    this.initialized = false;
    this.state = undefined;
  }

  private createSlot(
    instance: ModelInstance,
    definition: TrafficVehicleDefinition,
  ): VehicleSlot {
    const root = new Group();
    root.name = `traffic-model-slot:${this.slots.length}`;
    root.visible = false;
    const model = instance.scene;
    consolidateStaticWheelMeshes(model, this.debugResources);
    normalizeVehicleModel(model, definition);
    model.traverse((child) => {
      if ('isMesh' in child) {
        const mesh = child as Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    root.add(model);
    const { presentation } = definition;
    const geometry = own(
      this.debugResources,
      new BoxGeometry(
        presentation.detectionWidth,
        presentation.detectionHeight,
        presentation.detectionLength,
      ),
    );
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
    return { instance, root, vehicleType: definition.id, detection };
  }

  private syncScene(): void {
    if (!this.initialized) return;
    const snapshot = this.simulation.getSnapshot();
    const vehicles = snapshot.vehicles;
    for (const lens of this.signalLenses) {
      const active = snapshot.signal.groups[lens.group] === lens.indication;
      lens.material.emissiveIntensity = active ? 3.2 : 0.04;
      lens.material.opacity = active ? 1 : 0.34;
    }
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
        slot = this.slots.find(
          ({ vehicleId, vehicleType }) =>
            vehicleId === undefined && vehicleType === vehicle.vehicleType,
        );
        if (!slot) continue;
        slot.vehicleId = vehicle.id;
      }
      slot.root.visible = true;
      slot.root.position.set(vehicle.x, 0.02, vehicle.z);
      slot.root.rotation.y = vehicle.yaw;
      slot.detection.visible = true;
      const presentation = trafficVehicleById(vehicle.vehicleType).presentation;
      const detectorCenter =
        presentation.length / 2 + presentation.detectionLength / 2;
      slot.detection.position.set(
        vehicle.x + vehicle.directionX * detectorCenter,
        presentation.detectionHeight / 2,
        vehicle.z + vehicle.directionZ * detectorCenter,
      );
      slot.detection.rotation.y = vehicle.yaw;
    }
  }

  private dynamicObstacleDistance(
    vehicle: TrafficVehicleSnapshot,
  ): number | undefined {
    if (!this.collision.castDynamicSegment) return undefined;
    const presentation = trafficVehicleById(vehicle.vehicleType).presentation;
    const frontX = vehicle.x + vehicle.directionX * (presentation.length / 2);
    const frontZ = vehicle.z + vehicle.directionZ * (presentation.length / 2);
    const detectionLength = Math.min(
      presentation.detectionLength,
      this.simulation.config.detectionDistance,
    );
    const hit = this.collision.castDynamicSegment(
      new Vector3(frontX, 0.8, frontZ),
      new Vector3(
        frontX + vehicle.directionX * detectionLength,
        0.8,
        frontZ + vehicle.directionZ * detectionLength,
      ),
      presentation.detectionWidth / 2,
    );
    return hit.obstructed ? hit.fraction * detectionLength : undefined;
  }

  private staticObstacleDistance(
    vehicle: TrafficVehicleSnapshot,
  ): number | undefined {
    const lane = ashfallTrafficLanes.find(
      ({ approach }) => approach === vehicle.approach,
    )!;
    const presentation = trafficVehicleById(vehicle.vehicleType).presentation;
    const halfLength = presentation.length / 2;
    const frontX = vehicle.x + vehicle.directionX * halfLength;
    const frontZ = vehicle.z + vehicle.directionZ * halfLength;
    const distance = Math.min(
      presentation.detectionLength,
      this.simulation.config.detectionDistance,
      Math.max(0, lane.length - vehicle.progress - halfLength),
    );
    if (distance <= 0) return undefined;
    const detectionEnd = pointAlongLane(
      lane,
      Math.min(lane.length, vehicle.progress + halfLength + distance),
    );
    const hit = this.collision.castSegment(
      new Vector3(frontX, 0.9, frontZ),
      new Vector3(detectionEnd.x, 0.9, detectionEnd.z),
      { radius: presentation.staticSweepRadius },
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
        new BufferGeometry().setFromPoints(
          lane.points.map(({ x, z }) => new Vector3(x, 0.08, z)),
        ),
      );
      const line = new Line(geometry, material);
      line.name = `traffic-path:${lane.approach}`;
      this.debugRoot.add(line);
    }
  }

  private buildSignalFixtures(): void {
    const signalRoot = new Group();
    signalRoot.name = 'traffic-signal-fixtures';
    this.root.add(signalRoot);
    const metal = own(
      this.debugResources,
      new MeshStandardMaterial({ color: 0x243536, roughness: 0.72 }),
    );
    const housing = own(
      this.debugResources,
      new MeshStandardMaterial({ color: 0x10191a, roughness: 0.82 }),
    );
    const poleGeometry = own(
      this.debugResources,
      new CylinderGeometry(0.11, 0.15, 4.1, 8),
    );
    const lensGeometry = own(
      this.debugResources,
      new SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    );
    for (const control of intersectionTrafficControls.approaches) {
      const assembly = new Group();
      assembly.name = `traffic-signal:${control.approach}`;
      const pole = new Mesh(poleGeometry, metal);
      pole.position.set(control.pole[0], 2.25, control.pole[2]);
      pole.castShadow = true;
      assembly.add(pole);
      const overhead = control.heads[1];
      const armLength = Math.hypot(
        overhead[0] - control.pole[0],
        overhead[2] - control.pole[2],
      );
      const arm = new Mesh(
        own(
          this.debugResources,
          new CylinderGeometry(0.08, 0.08, armLength, 8),
        ),
        metal,
      );
      arm.position.set(
        (overhead[0] + control.pole[0]) / 2,
        overhead[1] + 0.42,
        (overhead[2] + control.pole[2]) / 2,
      );
      arm.rotation.z = Math.PI / 2;
      if (
        Math.abs(overhead[2] - control.pole[2]) >
        Math.abs(overhead[0] - control.pole[0])
      ) {
        arm.rotation.y = Math.PI / 2;
      }
      assembly.add(arm);
      for (const [headIndex, position] of control.heads.entries()) {
        const head = new Group();
        head.name = `traffic-signal-head:${control.approach}:${headIndex}`;
        head.position.set(position[0], position[1], position[2]);
        head.rotation.y = control.headYaw;
        const caseMesh = new Mesh(
          own(this.debugResources, new BoxGeometry(0.52, 1.42, 0.32)),
          housing,
        );
        caseMesh.castShadow = true;
        head.add(caseMesh);
        for (const [index, indication] of (
          ['red', 'yellow', 'green'] as const
        ).entries()) {
          const color = {
            red: 0xff2d2d,
            yellow: 0xffc629,
            green: 0x38e36b,
          }[indication];
          const material = own(
            this.debugResources,
            new MeshStandardMaterial({
              color,
              emissive: color,
              emissiveIntensity: 0.04,
              transparent: true,
              opacity: 0.34,
              roughness: 0.28,
            }),
          );
          const lens = new Mesh(lensGeometry, material);
          lens.position.set(0, 0.43 - index * 0.43, 0.17);
          lens.rotation.x = Math.PI / 2;
          head.add(lens);
          this.signalLenses.push({
            group: control.signalGroup,
            indication,
            material,
          });
        }
        assembly.add(head);
      }
      signalRoot.add(assembly);
    }
  }

  private registerDevelopmentControls(): void {
    if (!this.debug) return;
    this.unregisterDebug.push(
      this.debug.registerToggle({
        id: 'traffic.enabled',
        label: 'Traffic enabled',
        group: debugSections.traffic,
        initialValue: this.simulation.isEnabled,
        onChange: (enabled) => this.simulation.setEnabled(enabled),
      }),
      this.debug.registerCommand({
        id: 'traffic.spawn-each-approach',
        label: 'Spawn traffic on each approach',
        group: debugSections.traffic,
        run: () => {
          this.spawnEachApproach();
        },
      }),
      this.debug.registerCommand({
        id: 'traffic.clear',
        label: 'Clear traffic',
        group: debugSections.traffic,
        run: () => this.clear(),
      }),
      this.debug.registerCommand({
        id: 'traffic.step',
        label: 'Step traffic deterministically',
        group: debugSections.traffic,
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
        group: debugSections.traffic,
        read: () => {
          const state = this.simulation.getSnapshot();
          return `${state.count}/${state.maxPopulation} · ${state.enabled ? 'enabled' : 'disabled'}`;
        },
      }),
      this.debug.registerValue({
        id: 'traffic.signal',
        label: 'Signal phase / remaining',
        group: debugSections.traffic,
        read: () => {
          const signal = this.simulation.getSnapshot().signal;
          return `${signal.phase} · ${signal.remaining.toFixed(1)}s · NS ${signal.groups['north-south']} / EW ${signal.groups['east-west']}`;
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
                  ({
                    id,
                    vehicleType,
                    approach,
                    progress,
                    speed,
                    stoppingReason,
                    controlDistance,
                    queuePosition,
                  }) =>
                    `${id}[${vehicleType}]:${approach}@${progress.toFixed(1)}m ${speed.toFixed(1)}m/s ${stoppingReason ?? 'moving'} d=${controlDistance.toFixed(1)} q=${queuePosition}`,
                )
                .join(' | ');
        },
      }),
    );
  }
}

/** Source cars split static wheels by side; merge equal-material pieces per instance. */
function consolidateStaticWheelMeshes(
  model: Object3D,
  ownedResources: Set<BufferGeometry | Material>,
): void {
  model.updateMatrixWorld(true);
  const modelInverse = new Matrix4().copy(model.matrixWorld).invert();
  const byMaterial = new Map<Material, Mesh[]>();
  model.traverse((child) => {
    if (!('isMesh' in child) || !/wheel/i.test(child.name)) return;
    const mesh = child as Mesh;
    if (Array.isArray(mesh.material)) return;
    const matches = byMaterial.get(mesh.material) ?? [];
    matches.push(mesh);
    byMaterial.set(mesh.material, matches);
  });
  for (const [material, meshes] of byMaterial) {
    if (meshes.length < 2) continue;
    const transformed = meshes.map((mesh) => {
      const geometry = mesh.geometry.clone();
      geometry.applyMatrix4(
        new Matrix4().multiplyMatrices(modelInverse, mesh.matrixWorld),
      );
      return geometry;
    });
    const mergedGeometry = mergeGeometries(transformed, false);
    for (const geometry of transformed) geometry.dispose();
    if (!mergedGeometry) continue;
    const merged = new Mesh(own(ownedResources, mergedGeometry), material);
    merged.name = `traffic-static-wheels:${material.name || material.uuid}`;
    model.add(merged);
    for (const mesh of meshes) mesh.visible = false;
  }
}

export function normalizeVehicleModel(
  model: Object3D,
  definition: TrafficVehicleDefinition,
): void {
  model.rotation.y += forwardAxisRotation(definition.presentation.forwardAxis);
  model.updateMatrixWorld(true);
  const initial = new Box3().setFromObject(model);
  const size = initial.getSize(new Vector3());
  const scale = size.z > 0 ? definition.presentation.length / size.z : 1;
  model.scale.multiplyScalar(scale);
  model.updateMatrixWorld(true);
  const scaled = new Box3().setFromObject(model);
  const center = scaled.getCenter(new Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y += definition.presentation.groundClearance - scaled.min.y;
  model.updateMatrixWorld(true);
  const normalizedSize = new Box3().setFromObject(model).getSize(new Vector3());
  if (
    normalizedSize.x > definition.presentation.maximumWidth + 1e-3 ||
    normalizedSize.y > definition.presentation.maximumHeight + 1e-3
  ) {
    throw new Error(
      `${definition.id} normalized bounds ${normalizedSize.x.toFixed(2)}×${normalizedSize.y.toFixed(2)} exceed presentation contract`,
    );
  }
}

function forwardAxisRotation(axis: VehicleForwardAxis): number {
  switch (axis) {
    case '+z':
      return 0;
    case '-z':
      return Math.PI;
    case '+x':
      return -Math.PI / 2;
    case '-x':
      return Math.PI / 2;
  }
}

function own<Resource extends BufferGeometry | Material>(
  resources: Set<BufferGeometry | Material>,
  resource: Resource,
): Resource {
  resources.add(resource);
  return resource;
}
