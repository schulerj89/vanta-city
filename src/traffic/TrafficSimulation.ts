import {
  trafficVehicleCatalog,
  type TrafficVehicleDefinition,
  type TrafficVehicleId,
} from './TrafficVehicleCatalog';
import {
  TrafficSignalController,
  defaultTrafficSignalConfig,
  type TrafficSignalConfig,
  type TrafficSignalGroup,
  type TrafficSignalIndication,
} from './TrafficSignalController';
import {
  eastQuayCurvedRoad,
  intersectionTrafficControls,
} from '../world/levels/intersectionLayout';
import { world002APlan, world002BPlan } from '../world/levels/junctionGrowth';
import {
  offsetSplineSamples,
  pointAlongSamples,
  sampleSplineRoad,
  type SplineSample,
} from '../world/levels/SplineRoadGeometry';

export type TrafficApproach = 'north' | 'east' | 'south' | 'west';
export type TrafficAxis = TrafficSignalGroup;
export type TrafficStopReason =
  | 'signal-red'
  | 'signal-yellow'
  | 'vehicle-ahead'
  | 'player'
  | 'blocked-intersection'
  | 'static-world'
  | undefined;

export interface TrafficLane {
  readonly approach: TrafficApproach;
  readonly axis: TrafficAxis;
  readonly signalGroup: TrafficSignalGroup;
  readonly startX: number;
  readonly startZ: number;
  readonly directionX: number;
  readonly directionZ: number;
  readonly yaw: number;
  readonly length: number;
  readonly points: readonly TrafficLanePoint[];
  readonly detectorStart: number;
  readonly stopLine: number;
  readonly intersectionEntry: number;
  readonly intersectionExit: number;
}

export interface TrafficLanePoint {
  readonly x: number;
  readonly z: number;
  readonly distance: number;
}

const curvedCenterline = sampleSplineRoad(eastQuayCurvedRoad);
const trafficBoundaryInset = world002APlan.trafficEndpointInsetMetres;
const eastIncomingCurve = trimLaneEnd(
  offsetSplineSamples(curvedCenterline, 1.5),
  trafficBoundaryInset,
)
  .map(({ position }) => [position[0], position[2]] as const)
  .reverse();
const westOutgoingCurve = trimLaneEnd(
  offsetSplineSamples(curvedCenterline, -1.5),
  trafficBoundaryInset,
).map(({ position }) => [position[0], position[2]] as const);
const straightStopLine =
  24.5 - intersectionTrafficControls.stopLineDistanceFromCenter;
const curvedStopLine = polylineLength(eastIncomingCurve) + straightStopLine;

export const ashfallTrafficLanes: readonly TrafficLane[] = [
  lane(
    'north',
    'north-south',
    [
      [
        -1.5,
        world002BPlan.bounds.maxZ - world002BPlan.trafficEndpointInsetMetres,
      ],
      [
        -1.5,
        world002BPlan.bounds.minZ + world002BPlan.trafficEndpointInsetMetres,
      ],
    ],
    26.7,
    26.7,
    37.3,
  ),
  lane(
    'east',
    'east-west',
    [...eastIncomingCurve, [-24.5, 1.5]],
    curvedStopLine,
    polylineLength(eastIncomingCurve) + 19.2,
    polylineLength(eastIncomingCurve) + 29.8,
  ),
  lane(
    'south',
    'north-south',
    [
      [
        1.5,
        world002BPlan.bounds.minZ + world002BPlan.trafficEndpointInsetMetres,
      ],
      [
        1.5,
        world002BPlan.bounds.maxZ - world002BPlan.trafficEndpointInsetMetres,
      ],
    ],
    26.7,
    26.7,
    37.3,
  ),
  lane(
    'west',
    'east-west',
    [
      [world002APlan.bounds.minX + trafficBoundaryInset, -1.5],
      ...westOutgoingCurve,
    ],
    28,
    28,
    38.6,
  ),
];

function lane(
  approach: TrafficApproach,
  signalGroup: TrafficSignalGroup,
  path: readonly (readonly [x: number, z: number])[],
  stopLine: number,
  intersectionEntry: number,
  intersectionExit: number,
): TrafficLane {
  const points = cumulativePoints(path);
  const start = points[0]!;
  const next = points[1]!;
  const directionX = (next.x - start.x) / (next.distance - start.distance);
  const directionZ = (next.z - start.z) / (next.distance - start.distance);
  return {
    approach,
    axis: signalGroup,
    signalGroup,
    startX: start.x,
    startZ: start.z,
    directionX,
    directionZ,
    yaw: Math.atan2(directionX, directionZ),
    length: points.at(-1)!.distance,
    points,
    detectorStart: Math.max(
      0,
      stopLine - intersectionTrafficControls.detectorLength,
    ),
    stopLine,
    intersectionEntry,
    intersectionExit,
  };
}

export interface TrafficConfig {
  readonly enabled: boolean;
  readonly maxPopulation: number;
  readonly speed: number;
  readonly minimumSpacing: number;
  readonly detectionDistance: number;
  readonly spawnCadence: number;
  readonly acceleration: number;
  readonly braking: number;
  readonly stopBuffer: number;
  readonly seed: number;
  readonly signals: TrafficSignalConfig;
}

export const defaultTrafficConfig: TrafficConfig = {
  enabled: true,
  maxPopulation: 8,
  speed: 5.5,
  minimumSpacing: 2,
  detectionDistance: 12,
  spawnCadence: 1.5,
  acceleration: 2.8,
  braking: 5.5,
  stopBuffer: 0.45,
  seed: 0x415348,
  signals: defaultTrafficSignalConfig,
};

export interface TrafficVehicleSnapshot {
  readonly id: string;
  readonly approach: TrafficApproach;
  readonly axis: TrafficAxis;
  readonly signalGroup: TrafficSignalGroup;
  readonly signalIndication: TrafficSignalIndication;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly directionX: number;
  readonly directionZ: number;
  readonly progress: number;
  readonly speed: number;
  readonly stoppingReason: TrafficStopReason;
  readonly controlDistance: number;
  readonly queuePosition: number;
  readonly committedToIntersection: boolean;
  readonly yellowDecision: 'stop' | 'go' | undefined;
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
  controlDistance: number;
  committedToIntersection: boolean;
  yellowDecision: 'stop' | 'go' | undefined;
}

export interface TrafficObstacleQueries {
  playerDistance?(vehicle: TrafficVehicleSnapshot): number | undefined;
  staticDistance?(vehicle: TrafficVehicleSnapshot): number | undefined;
}

/** Deterministic lane, signal, queue, and vehicle-motion authority. */
export class TrafficSimulation {
  public readonly signals: TrafficSignalController;
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
    for (const [label, value] of [
      ['speed', config.speed],
      ['acceleration', config.acceleration],
      ['braking', config.braking],
      ['minimumSpacing', config.minimumSpacing],
    ] as const) {
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`Traffic ${label} must be positive`);
      }
    }
    this.enabled = config.enabled;
    this.randomState = config.seed >>> 0;
    this.signals = new TrafficSignalController(config.signals);
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
    return this.createVehicle(lane, 0);
  }

  public spawnEachApproach(): number {
    let count = 0;
    for (const { approach } of ashfallTrafficLanes) {
      if (this.spawn(approach)) count += 1;
    }
    return count;
  }

  /** Seeds bounded, separated residents without advancing signal time. */
  public populateResidents(target = this.config.maxPopulation): number {
    const desired = Math.min(this.config.maxPopulation, Math.max(0, target));
    if (this.vehicles.length > 0 || desired === 0) return 0;
    const longest = Math.max(
      ...this.catalog.map(({ presentation }) => presentation.length),
    );
    const separation = longest + this.config.minimumSpacing + 1;
    const waves = Math.ceil(desired / ashfallTrafficLanes.length);
    let created = 0;
    for (let wave = waves - 1; wave >= 0; wave -= 1) {
      for (const lane of ashfallTrafficLanes) {
        if (created >= desired) return created;
        if (this.createVehicle(lane, wave * separation)) created += 1;
      }
    }
    return created;
  }

  public update(delta: number, queries: TrafficObstacleQueries = {}): void {
    if (!this.enabled || !Number.isFinite(delta) || delta <= 0) return;
    let remaining = delta;
    while (remaining > 1e-8) {
      const step = Math.min(0.05, remaining);
      this.updateStep(step, queries);
      remaining -= step;
    }
  }

  public clear(): void {
    this.vehicles.length = 0;
    this.spawnElapsed = 0;
    this.signals.reset();
  }

  public getSnapshot(): {
    readonly enabled: boolean;
    readonly count: number;
    readonly maxPopulation: number;
    readonly spawned: number;
    readonly despawned: number;
    readonly signal: ReturnType<TrafficSignalController['getSnapshot']>;
    readonly vehicles: readonly TrafficVehicleSnapshot[];
  } {
    return {
      enabled: this.enabled,
      count: this.vehicles.length,
      maxPopulation: this.config.maxPopulation,
      spawned: this.spawned,
      despawned: this.despawned,
      signal: this.signals.getSnapshot(),
      vehicles: this.vehicles.map((vehicle) => this.snapshot(vehicle)),
    };
  }

  private updateStep(delta: number, queries: TrafficObstacleQueries): void {
    this.signals.update(delta);
    this.spawnElapsed += delta;
    while (
      this.config.spawnCadence > 0 &&
      this.spawnElapsed >= this.config.spawnCadence
    ) {
      this.spawnElapsed -= this.config.spawnCadence;
      const startIndex = this.nextRandom() % ashfallTrafficLanes.length;
      for (let offset = 0; offset < ashfallTrafficLanes.length; offset += 1) {
        const lane =
          ashfallTrafficLanes[
            (startIndex + offset) % ashfallTrafficLanes.length
          ]!;
        if (this.spawn(lane.approach)) break;
      }
    }

    const ordered = [...this.vehicles].sort((a, b) => b.progress - a.progress);
    for (const vehicle of ordered) this.updateVehicle(vehicle, delta, queries);

    const before = this.vehicles.length;
    for (let index = this.vehicles.length - 1; index >= 0; index -= 1) {
      if (this.vehicles[index]!.progress >= this.vehicles[index]!.lane.length) {
        this.vehicles.splice(index, 1);
      }
    }
    this.despawned += before - this.vehicles.length;
  }

  private updateVehicle(
    vehicle: MutableVehicle,
    delta: number,
    queries: TrafficObstacleQueries,
  ): void {
    const halfLength = vehicle.definition.presentation.length / 2;
    let clearance = Number.POSITIVE_INFINITY;
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
      const followingClearance =
        ahead.progress -
        vehicle.progress -
        ahead.definition.presentation.length / 2 -
        halfLength -
        this.config.minimumSpacing;
      if (followingClearance < clearance) {
        clearance = followingClearance;
        reason = 'vehicle-ahead';
      }
    }

    const frontProgress = vehicle.progress + halfLength;
    const signalDistance =
      vehicle.lane.stopLine - frontProgress - this.config.stopBuffer;
    const indication = this.signals.indication(vehicle.lane.signalGroup);
    if (
      frontProgress < vehicle.lane.stopLine &&
      !vehicle.committedToIntersection
    ) {
      if (indication === 'yellow') {
        const stoppingDistance =
          (vehicle.speed * vehicle.speed) / (2 * this.config.braking) +
          vehicle.speed * 0.35;
        vehicle.yellowDecision ??=
          signalDistance <= stoppingDistance ? 'go' : 'stop';
        if (vehicle.yellowDecision === 'go') {
          vehicle.committedToIntersection = true;
        } else if (signalDistance < clearance) {
          clearance = signalDistance;
          reason = 'signal-yellow';
        }
      } else if (indication === 'green') {
        vehicle.yellowDecision = undefined;
      } else if (indication === 'red' && signalDistance < clearance) {
        clearance = signalDistance;
        reason = 'signal-red';
      }
    }

    const conflictingOccupant = this.vehicles.some(
      (other) =>
        other !== vehicle &&
        other.lane.axis !== vehicle.lane.axis &&
        other.progress >= other.lane.intersectionEntry &&
        other.progress <= other.lane.intersectionExit,
    );
    if (
      conflictingOccupant &&
      frontProgress < vehicle.lane.intersectionEntry &&
      !vehicle.committedToIntersection
    ) {
      const entryClearance =
        vehicle.lane.stopLine - frontProgress - this.config.stopBuffer;
      if (entryClearance < clearance) {
        clearance = entryClearance;
        reason = 'blocked-intersection';
      }
    }

    const view = this.snapshot(vehicle);
    for (const [obstacleReason, distance] of [
      ['player', queries.playerDistance?.(view)],
      ['static-world', queries.staticDistance?.(view)],
    ] as const) {
      if (distance !== undefined) {
        const obstacleClearance = distance - this.config.minimumSpacing;
        if (obstacleClearance < clearance) {
          clearance = obstacleClearance;
          reason = obstacleReason;
        }
      }
    }

    clearance = Math.max(0, clearance);
    const targetSpeed = Number.isFinite(clearance)
      ? Math.min(
          this.config.speed,
          Math.sqrt(2 * this.config.braking * clearance),
        )
      : this.config.speed;
    const rate =
      targetSpeed < vehicle.speed
        ? this.config.braking
        : this.config.acceleration;
    vehicle.speed = moveToward(vehicle.speed, targetSpeed, rate * delta);
    const movement = Math.min(vehicle.speed * delta, clearance);
    vehicle.progress += movement;
    vehicle.controlDistance = Number.isFinite(clearance) ? clearance : -1;
    vehicle.stoppingReason = Number.isFinite(clearance) ? reason : undefined;
    if (vehicle.progress > vehicle.lane.intersectionExit) {
      vehicle.committedToIntersection = false;
      vehicle.yellowDecision = undefined;
    }
  }

  private snapshot(vehicle: MutableVehicle): TrafficVehicleSnapshot {
    const point = pointAlongLane(vehicle.lane, vehicle.progress);
    const queue = this.vehicles.filter(
      (other) =>
        other.lane === vehicle.lane &&
        other.progress > vehicle.progress &&
        other.progress < vehicle.lane.intersectionEntry,
    ).length;
    return {
      id: vehicle.id,
      approach: vehicle.lane.approach,
      axis: vehicle.lane.axis,
      signalGroup: vehicle.lane.signalGroup,
      signalIndication: this.signals.indication(vehicle.lane.signalGroup),
      x: point.x,
      z: point.z,
      yaw: Math.atan2(point.directionX, point.directionZ),
      directionX: point.directionX,
      directionZ: point.directionZ,
      progress: vehicle.progress,
      speed: vehicle.speed,
      stoppingReason: vehicle.stoppingReason,
      controlDistance: vehicle.controlDistance,
      queuePosition: queue,
      committedToIntersection: vehicle.committedToIntersection,
      yellowDecision: vehicle.yellowDecision,
      vehicleType: vehicle.definition.id,
      vehicleLength: vehicle.definition.presentation.length,
      detectionLength: vehicle.definition.presentation.detectionLength,
    };
  }

  private nextRandom(): number {
    this.randomState =
      (Math.imul(this.randomState, 1_664_525) + 1_013_904_223) >>> 0;
    return this.randomState;
  }

  private createVehicle(
    lane: TrafficLane,
    progress: number,
  ): TrafficVehicleSnapshot | undefined {
    const definition = this.nextAvailableDefinition();
    if (!definition) return undefined;
    const vehicle: MutableVehicle = {
      id: `traffic-${this.nextId++}`,
      lane,
      definition,
      progress,
      speed: 0,
      stoppingReason: undefined,
      controlDistance: Math.max(0, lane.stopLine - progress),
      committedToIntersection: false,
      yellowDecision: undefined,
    };
    this.spawned += 1;
    this.vehicles.push(vehicle);
    return this.snapshot(vehicle);
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

function moveToward(
  value: number,
  target: number,
  maximumDelta: number,
): number {
  if (value < target) return Math.min(target, value + maximumDelta);
  return Math.max(target, value - maximumDelta);
}

function slotCapacity(
  index: number,
  catalogSize: number,
  poolSize: number,
): number {
  return Math.max(0, Math.ceil((poolSize - index) / catalogSize));
}

function cumulativePoints(
  path: readonly (readonly [x: number, z: number])[],
): readonly TrafficLanePoint[] {
  let distance = 0;
  return path.map(([x, z], index) => {
    const previous = path[index - 1];
    if (previous) distance += Math.hypot(x - previous[0], z - previous[1]);
    return { x, z, distance };
  });
}

function polylineLength(
  path: readonly (readonly [x: number, z: number])[],
): number {
  return cumulativePoints(path).at(-1)?.distance ?? 0;
}

function trimLaneEnd(
  samples: readonly SplineSample[],
  inset: number,
): readonly SplineSample[] {
  const endDistance = Math.max(0, samples.at(-1)!.distance - inset);
  return [
    ...samples.filter(({ distance }) => distance < endDistance),
    pointAlongSamples(samples, endDistance),
  ];
}

export function pointAlongLane(
  lane: TrafficLane,
  distance: number,
): {
  readonly x: number;
  readonly z: number;
  readonly directionX: number;
  readonly directionZ: number;
} {
  const clamped = Math.max(0, Math.min(distance, lane.length));
  for (let index = 1; index < lane.points.length; index += 1) {
    const end = lane.points[index]!;
    if (end.distance < clamped) continue;
    const start = lane.points[index - 1]!;
    const span = end.distance - start.distance || 1;
    const mix = (clamped - start.distance) / span;
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const magnitude = Math.hypot(dx, dz) || 1;
    return {
      x: start.x + dx * mix,
      z: start.z + dz * mix,
      directionX: dx / magnitude,
      directionZ: dz / magnitude,
    };
  }
  const end = lane.points.at(-1)!;
  const start = lane.points.at(-2)!;
  const magnitude = Math.hypot(end.x - start.x, end.z - start.z) || 1;
  return {
    x: end.x,
    z: end.z,
    directionX: (end.x - start.x) / magnitude,
    directionZ: (end.z - start.z) / magnitude,
  };
}
