import {
  trafficVehicleCatalog,
  type TrafficVehicleDefinition,
  type TrafficVehicleId,
} from './TrafficVehicleCatalog';

export type TrafficApproach = 'north' | 'east' | 'south' | 'west';
export type TrafficAxis = 'north-south' | 'east-west';
export type TrafficStopReason =
  'vehicle-ahead' | 'player' | 'intersection' | 'static-world' | undefined;

export interface TrafficLane {
  readonly approach: TrafficApproach;
  readonly axis: TrafficAxis;
  readonly startX: number;
  readonly startZ: number;
  readonly directionX: number;
  readonly directionZ: number;
  readonly yaw: number;
  readonly length: number;
}

export const ashfallTrafficLanes: readonly TrafficLane[] = [
  lane('north', 'north-south', -1.5, 24.5, 0, -1, Math.PI),
  lane('east', 'east-west', 24.5, 1.5, -1, 0, -Math.PI / 2),
  lane('south', 'north-south', 1.5, -24.5, 0, 1, 0),
  lane('west', 'east-west', -24.5, -1.5, 1, 0, Math.PI / 2),
];

function lane(
  approach: TrafficApproach,
  axis: TrafficAxis,
  startX: number,
  startZ: number,
  directionX: number,
  directionZ: number,
  yaw: number,
): TrafficLane {
  return {
    approach,
    axis,
    startX,
    startZ,
    directionX,
    directionZ,
    yaw,
    length: 49,
  };
}

export interface TrafficConfig {
  readonly enabled: boolean;
  readonly maxPopulation: number;
  readonly speed: number;
  readonly minimumSpacing: number;
  readonly detectionDistance: number;
  readonly spawnCadence: number;
  readonly seed: number;
}

export const defaultTrafficConfig: TrafficConfig = {
  enabled: true,
  maxPopulation: 6,
  speed: 4.5,
  minimumSpacing: 2,
  detectionDistance: 7,
  spawnCadence: 4,
  seed: 0x415348,
};

export interface TrafficVehicleSnapshot {
  readonly id: string;
  readonly approach: TrafficApproach;
  readonly axis: TrafficAxis;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly progress: number;
  readonly speed: number;
  readonly stoppingReason: TrafficStopReason;
  readonly vehicleType: TrafficVehicleId;
  readonly vehicleLength: number;
  readonly detectionLength: number;
}

interface MutableVehicle {
  readonly id: string;
  readonly lane: TrafficLane;
  readonly definition: TrafficVehicleDefinition;
  progress: number;
  speed: number;
  stoppingReason: TrafficStopReason;
}

export interface TrafficObstacleQueries {
  playerDistance?(vehicle: TrafficVehicleSnapshot): number | undefined;
  staticDistance?(vehicle: TrafficVehicleSnapshot): number | undefined;
}

/** Deterministic straight-lane traffic with bounded occupancy and no timers. */
export class TrafficSimulation {
  private readonly vehicles: MutableVehicle[] = [];
  private enabled: boolean;
  private spawnElapsed = 0;
  private nextId = 1;
  private randomState: number;
  private spawned = 0;
  private despawned = 0;

  public constructor(
    public readonly config: TrafficConfig = defaultTrafficConfig,
    private readonly catalog: readonly TrafficVehicleDefinition[] = trafficVehicleCatalog,
  ) {
    if (config.maxPopulation < 0 || !Number.isInteger(config.maxPopulation)) {
      throw new Error('Traffic maxPopulation must be a non-negative integer');
    }
    this.enabled = config.enabled;
    this.randomState = config.seed >>> 0;
    if (catalog.length === 0) {
      throw new Error('TrafficSimulation requires a vehicle catalog');
    }
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public get isEnabled(): boolean {
    return this.enabled;
  }

  public spawn(approach: TrafficApproach): TrafficVehicleSnapshot | undefined {
    if (this.vehicles.length >= this.config.maxPopulation) return undefined;
    const lane = ashfallTrafficLanes.find(
      (item) => item.approach === approach,
    )!;
    const rearBlocked = this.vehicles.some(
      (vehicle) =>
        vehicle.lane === lane &&
        vehicle.progress <
          vehicle.definition.presentation.length + this.config.minimumSpacing,
    );
    if (rearBlocked) return undefined;
    const definition = this.nextAvailableDefinition();
    if (!definition) return undefined;
    const vehicle: MutableVehicle = {
      id: `traffic-${this.nextId++}`,
      lane,
      definition,
      progress: 0,
      speed: 0,
      stoppingReason: undefined,
    };
    this.spawned += 1;
    this.vehicles.push(vehicle);
    return snapshot(vehicle);
  }

  public spawnEachApproach(): number {
    let count = 0;
    for (const { approach } of ashfallTrafficLanes) {
      if (this.spawn(approach)) count += 1;
    }
    return count;
  }

  public update(delta: number, queries: TrafficObstacleQueries = {}): void {
    if (!this.enabled || delta <= 0) return;
    this.spawnElapsed += delta;
    while (
      this.config.spawnCadence > 0 &&
      this.spawnElapsed >= this.config.spawnCadence
    ) {
      this.spawnElapsed -= this.config.spawnCadence;
      const approach = ashfallTrafficLanes[this.nextRandom() % 4]!.approach;
      this.spawn(approach);
    }

    const reservedAxis = this.resolveIntersectionReservation();
    const ordered = [...this.vehicles].sort((a, b) => b.progress - a.progress);
    for (const vehicle of ordered) {
      const view = snapshot(vehicle);
      let allowed = this.config.speed * delta;
      let reason: TrafficStopReason;
      const ahead = this.vehicles
        .filter(
          (other) =>
            other !== vehicle &&
            other.lane === vehicle.lane &&
            other.progress > vehicle.progress,
        )
        .sort((a, b) => a.progress - b.progress)[0];
      if (ahead) {
        const clearance =
          ahead.progress -
          vehicle.progress -
          Math.max(
            ahead.definition.presentation.length,
            vehicle.definition.presentation.length,
          ) -
          this.config.minimumSpacing;
        if (clearance < allowed) {
          allowed = Math.max(0, clearance);
          reason = 'vehicle-ahead';
        }
      }

      const intersectionEntry = 19.2;
      if (
        reservedAxis !== undefined &&
        vehicle.lane.axis !== reservedAxis &&
        vehicle.progress < intersectionEntry &&
        vehicle.progress + allowed > intersectionEntry
      ) {
        allowed = Math.max(0, intersectionEntry - vehicle.progress);
        reason = 'intersection';
      }

      for (const [obstacleReason, distance] of [
        ['player', queries.playerDistance?.(view)],
        ['static-world', queries.staticDistance?.(view)],
      ] as const) {
        if (
          distance !== undefined &&
          distance <
            Math.min(
              vehicle.definition.presentation.detectionLength,
              this.config.detectionDistance,
            )
        ) {
          const clearance = Math.max(0, distance - this.config.minimumSpacing);
          if (clearance < allowed) {
            allowed = clearance;
            reason = obstacleReason;
          }
        }
      }
      vehicle.progress += allowed;
      vehicle.speed = delta > 0 ? allowed / delta : 0;
      vehicle.stoppingReason =
        allowed + 1e-6 < this.config.speed * delta ? reason : undefined;
    }

    const before = this.vehicles.length;
    for (let index = this.vehicles.length - 1; index >= 0; index -= 1) {
      if (this.vehicles[index]!.progress >= this.vehicles[index]!.lane.length) {
        this.vehicles.splice(index, 1);
      }
    }
    this.despawned += before - this.vehicles.length;
  }

  public clear(): void {
    this.vehicles.length = 0;
    this.spawnElapsed = 0;
  }

  public getSnapshot(): {
    readonly enabled: boolean;
    readonly count: number;
    readonly maxPopulation: number;
    readonly spawned: number;
    readonly despawned: number;
    readonly vehicles: readonly TrafficVehicleSnapshot[];
  } {
    return {
      enabled: this.enabled,
      count: this.vehicles.length,
      maxPopulation: this.config.maxPopulation,
      spawned: this.spawned,
      despawned: this.despawned,
      vehicles: this.vehicles.map(snapshot),
    };
  }

  private resolveIntersectionReservation(): TrafficAxis | undefined {
    const inside = this.vehicles
      .filter(({ progress }) => progress >= 19.2 && progress <= 29.8)
      .sort((a, b) => a.id.localeCompare(b.id));
    if (inside[0]) return inside[0].lane.axis;
    const approaching = this.vehicles
      .filter(({ progress }) => progress < 19.2)
      .sort((a, b) => {
        const distance = 19.2 - a.progress - (19.2 - b.progress);
        return distance || a.id.localeCompare(b.id);
      });
    return approaching[0]?.lane.axis;
  }

  private nextRandom(): number {
    this.randomState =
      (Math.imul(this.randomState, 1_664_525) + 1_013_904_223) >>> 0;
    return this.randomState;
  }

  private nextAvailableDefinition(): TrafficVehicleDefinition | undefined {
    for (let offset = 0; offset < this.catalog.length; offset += 1) {
      const catalogIndex = (this.spawned + offset) % this.catalog.length;
      const capacity = slotCapacity(
        catalogIndex,
        this.catalog.length,
        this.config.maxPopulation,
      );
      const definition = this.catalog[catalogIndex]!;
      const occupied = this.vehicles.filter(
        (vehicle) => vehicle.definition.id === definition.id,
      ).length;
      if (occupied < capacity) return definition;
    }
    return undefined;
  }
}

function slotCapacity(
  index: number,
  catalogSize: number,
  poolSize: number,
): number {
  return Math.max(0, Math.ceil((poolSize - index) / catalogSize));
}

function snapshot(vehicle: MutableVehicle): TrafficVehicleSnapshot {
  return {
    id: vehicle.id,
    approach: vehicle.lane.approach,
    axis: vehicle.lane.axis,
    x: vehicle.lane.startX + vehicle.lane.directionX * vehicle.progress,
    z: vehicle.lane.startZ + vehicle.lane.directionZ * vehicle.progress,
    yaw: vehicle.lane.yaw,
    progress: vehicle.progress,
    speed: vehicle.speed,
    stoppingReason: vehicle.stoppingReason,
    vehicleType: vehicle.definition.id,
    vehicleLength: vehicle.definition.presentation.length,
    detectionLength: vehicle.definition.presentation.detectionLength,
  };
}
