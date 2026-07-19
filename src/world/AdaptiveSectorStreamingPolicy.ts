import type { WorldSectorDefinition } from './LevelDefinition';
import type { WorldPosition } from './Spatial';

const MEBIBYTE = 1024 * 1024;

export type StreamingMemoryPressure = 'low' | 'medium' | 'high';

export interface StreamingRendererMemorySnapshot {
  readonly geometries: number;
  readonly textures: number;
}

export interface StreamingAssetMemorySnapshot {
  readonly sourceReferences: number;
  readonly instanceReferences: number;
  readonly inFlight: number;
}

export interface StreamingMemorySample {
  readonly renderer: StreamingRendererMemorySnapshot;
  readonly assets: StreamingAssetMemorySnapshot;
  /** Optional browser measurement. The deterministic renderer/asset proxy remains active. */
  readonly usedJsHeapBytes?: number;
}

export interface StreamingMemoryAssessment {
  readonly pressure: StreamingMemoryPressure;
  readonly source: 'proxy' | 'heap-and-proxy';
  readonly estimatedWorkingSetBytes: number;
  readonly estimatedWorkingSetMb: number;
  readonly preferredCeilingMb: number;
  readonly hardCeilingMb: number;
  readonly overHardCeiling: boolean;
}

export type SectorStreamingReason =
  | 'always-loaded'
  | 'player-current'
  | 'player-near'
  | 'player-adjacent'
  | 'mission-near'
  | 'mission-adjacent'
  | 'authored-proximity'
  | 'movement-prefetch'
  | 'proximity-prefetch'
  | 'active-hysteresis'
  | 'memory-soft-trim'
  | 'memory-high-trim'
  | 'memory-hard-trim'
  | 'outside-retention';

export type SectorStreamingDisposition =
  'desired' | 'retained' | 'evicted' | 'inactive';

export interface SectorStreamingDecision {
  readonly sectorId: string;
  readonly disposition: SectorStreamingDisposition;
  readonly reason: SectorStreamingReason;
  readonly playerDistance: number;
  readonly missionDistance: number | undefined;
  readonly protected: boolean;
}

export interface AdaptiveSectorStreamingSnapshot {
  readonly pressure: StreamingMemoryPressure;
  readonly memory: StreamingMemoryAssessment;
  readonly teleported: boolean;
  readonly desiredSectorIds: readonly string[];
  readonly decisions: Readonly<Record<string, SectorStreamingDecision>>;
}

export interface AdaptiveSectorStreamingInput {
  readonly sectors: readonly WorldSectorDefinition[];
  readonly playerPosition: WorldPosition;
  readonly previousPlayerPosition?: WorldPosition;
  readonly missionPositions?: readonly WorldPosition[];
  readonly activeSectorIds?: ReadonlySet<string>;
  /** Level preparation can request safety coverage before background prefetch. */
  readonly softPrefetchEnabled?: boolean;
  readonly memory?: StreamingMemorySample;
}

export interface AdaptiveSectorStreamingConfig {
  /** Player-to-sector-center ring which memory pressure can never remove. */
  readonly hardNearRadius: number;
  /** Current-sector neighbors inside this center spacing are safety-critical. */
  readonly criticalAdjacencyDistance: number;
  /** Mission destination ring which is made resident before arrival. */
  readonly missionNearRadius: number;
  /** Mission-sector neighbors inside this center spacing are safety-critical. */
  readonly missionAdjacencyDistance: number;
  /** Low-pressure visibility ring beyond authored load distances. */
  readonly lowPressurePrefetchRadius: number;
  /** Medium-pressure visibility ring; high pressure disables soft prefetch. */
  readonly mediumPressurePrefetchRadius: number;
  /** Projected metres used for directional movement look-ahead. */
  readonly movementLookAheadDistance: number;
  readonly movementPrefetchRadius: number;
  /** Movement larger than this is a teleport and has no stale direction. */
  readonly teleportDistance: number;
  /** Extra center distance retained after a sector becomes active. */
  readonly hysteresisDistance: number;
  readonly preferredMemoryMb: number;
  readonly hardMemoryMb: number;
  /** Stable proxy weights used in every browser, including non-Chromium. */
  readonly fallbackBaseMb: number;
  readonly geometryProxyMb: number;
  readonly textureProxyMb: number;
  readonly assetSourceProxyMb: number;
  readonly modelInstanceProxyMb: number;
  readonly inFlightAssetProxyMb: number;
  readonly maxConcurrentLoads: number;
  readonly retryAfterEvaluations: number;
  readonly maxLoadAttempts: number;
}

export const defaultAdaptiveSectorStreamingConfig: AdaptiveSectorStreamingConfig =
  Object.freeze({
    hardNearRadius: 28,
    criticalAdjacencyDistance: 20,
    missionNearRadius: 30,
    missionAdjacencyDistance: 34,
    lowPressurePrefetchRadius: 46,
    mediumPressurePrefetchRadius: 36,
    movementLookAheadDistance: 18,
    movementPrefetchRadius: 32,
    teleportDistance: 48,
    hysteresisDistance: 8,
    preferredMemoryMb: 650,
    hardMemoryMb: 900,
    fallbackBaseMb: 96,
    geometryProxyMb: 0.25,
    textureProxyMb: 1.5,
    assetSourceProxyMb: 2,
    modelInstanceProxyMb: 1,
    inFlightAssetProxyMb: 4,
    maxConcurrentLoads: 2,
    retryAfterEvaluations: 30,
    maxLoadAttempts: 3,
  });

/** Pure authoritative sector selector. It never loads, unloads, or owns scene data. */
export class AdaptiveSectorStreamingPolicy {
  public readonly config: AdaptiveSectorStreamingConfig;

  public constructor(config: Partial<AdaptiveSectorStreamingConfig> = {}) {
    this.config = Object.freeze({
      ...defaultAdaptiveSectorStreamingConfig,
      ...config,
    });
    validateConfig(this.config);
  }

  public evaluate(
    input: AdaptiveSectorStreamingInput,
  ): AdaptiveSectorStreamingSnapshot {
    const active = input.activeSectorIds ?? new Set<string>();
    const memory = this.assessMemory(input.memory);
    const sectors = input.sectors;
    const distances = new Map(
      sectors.map((sector) => [
        sector.id,
        distanceToCenter(input.playerPosition, sector),
      ]),
    );
    const missionDistances = new Map(
      sectors.map((sector) => [
        sector.id,
        nearestDistance(input.missionPositions ?? [], sector),
      ]),
    );
    const streamable = sectors.filter(({ alwaysLoaded }) => !alwaysLoaded);
    const current = closestSector(streamable, input.playerPosition);
    const missionAnchors = new Set(
      (input.missionPositions ?? []).flatMap((position) => {
        const sector = closestSector(streamable, position);
        return sector ? [sector.id] : [];
      }),
    );
    const movement = movementProjection(
      input.playerPosition,
      input.previousPlayerPosition,
      this.config,
    );
    const reasons = new Map<string, SectorStreamingReason>();
    const protectedIds = new Set<string>();
    const protect = (sectorId: string, reason: SectorStreamingReason): void => {
      protectedIds.add(sectorId);
      reasons.set(sectorId, preferReason(reasons.get(sectorId), reason));
    };

    for (const sector of sectors) {
      const distance = distances.get(sector.id)!;
      const missionDistance = missionDistances.get(sector.id);
      if (sector.alwaysLoaded) protect(sector.id, 'always-loaded');
      else if (sector.id === current?.id) protect(sector.id, 'player-current');
      else if (distance <= this.config.hardNearRadius)
        protect(sector.id, 'player-near');
      if (
        missionDistance !== undefined &&
        missionDistance <= this.config.missionNearRadius
      ) {
        protect(sector.id, 'mission-near');
      }
    }

    if (current) {
      for (const sector of streamable) {
        if (
          centerDistance(current, sector) <=
          this.config.criticalAdjacencyDistance
        ) {
          protect(sector.id, 'player-adjacent');
        }
      }
    }
    for (const anchorId of missionAnchors) {
      const anchor = sectors.find(({ id }) => id === anchorId);
      if (!anchor) continue;
      for (const sector of streamable) {
        if (
          centerDistance(anchor, sector) <= this.config.missionAdjacencyDistance
        ) {
          protect(sector.id, 'mission-adjacent');
        }
      }
    }

    const prefetchRadius =
      input.softPrefetchEnabled === false
        ? 0
        : memory.pressure === 'low'
          ? this.config.lowPressurePrefetchRadius
          : memory.pressure === 'medium'
            ? this.config.mediumPressurePrefetchRadius
            : 0;
    for (const sector of sectors) {
      if (protectedIds.has(sector.id)) continue;
      const distance = distances.get(sector.id)!;
      if (distance <= sector.loadDistance) {
        reasons.set(sector.id, 'authored-proximity');
      } else if (
        prefetchRadius > 0 &&
        movement.projected &&
        distanceToCenter(movement.projected, sector) <=
          this.config.movementPrefetchRadius
      ) {
        reasons.set(sector.id, 'movement-prefetch');
      } else if (prefetchRadius > 0 && distance <= prefetchRadius) {
        reasons.set(sector.id, 'proximity-prefetch');
      } else if (
        !memory.overHardCeiling &&
        active.has(sector.id) &&
        distance <= sector.unloadDistance + this.config.hysteresisDistance
      ) {
        reasons.set(sector.id, 'active-hysteresis');
      }
    }

    const decisions: Record<string, SectorStreamingDecision> = {};
    for (const sector of [...sectors].sort((left, right) =>
      left.id.localeCompare(right.id),
    )) {
      const selectedReason = reasons.get(sector.id);
      const isActive = active.has(sector.id);
      const selected = selectedReason !== undefined;
      const trimReason = memory.overHardCeiling
        ? 'memory-hard-trim'
        : memory.pressure === 'high'
          ? 'memory-high-trim'
          : memory.pressure === 'medium'
            ? 'memory-soft-trim'
            : 'outside-retention';
      decisions[sector.id] = {
        sectorId: sector.id,
        disposition: selected
          ? isActive
            ? 'retained'
            : 'desired'
          : isActive
            ? 'evicted'
            : 'inactive',
        reason: selectedReason ?? trimReason,
        playerDistance: distances.get(sector.id)!,
        missionDistance: missionDistances.get(sector.id),
        protected: protectedIds.has(sector.id),
      };
    }
    return {
      pressure: memory.pressure,
      memory,
      teleported: movement.teleported,
      desiredSectorIds: Object.values(decisions)
        .filter(
          ({ disposition }) =>
            disposition === 'desired' || disposition === 'retained',
        )
        .map(({ sectorId }) => sectorId)
        .sort(),
      decisions,
    };
  }

  public assessMemory(
    sample?: StreamingMemorySample,
  ): StreamingMemoryAssessment {
    const proxyMb = sample
      ? sample.renderer.geometries * this.config.geometryProxyMb +
        sample.renderer.textures * this.config.textureProxyMb +
        sample.assets.sourceReferences * this.config.assetSourceProxyMb +
        sample.assets.instanceReferences * this.config.modelInstanceProxyMb +
        sample.assets.inFlight * this.config.inFlightAssetProxyMb
      : 0;
    const usedJsHeapBytes = sample?.usedJsHeapBytes;
    const heapMb =
      usedJsHeapBytes !== undefined
        ? usedJsHeapBytes / MEBIBYTE
        : this.config.fallbackBaseMb;
    const estimatedWorkingSetMb = heapMb + proxyMb;
    const mediumThreshold = this.config.preferredMemoryMb * 0.75;
    const pressure: StreamingMemoryPressure =
      estimatedWorkingSetMb >= this.config.preferredMemoryMb
        ? 'high'
        : estimatedWorkingSetMb >= mediumThreshold
          ? 'medium'
          : 'low';
    return {
      pressure,
      source: usedJsHeapBytes !== undefined ? 'heap-and-proxy' : 'proxy',
      estimatedWorkingSetBytes: estimatedWorkingSetMb * MEBIBYTE,
      estimatedWorkingSetMb,
      preferredCeilingMb: this.config.preferredMemoryMb,
      hardCeilingMb: this.config.hardMemoryMb,
      overHardCeiling: estimatedWorkingSetMb >= this.config.hardMemoryMb,
    };
  }
}

const reasonPriority: readonly SectorStreamingReason[] = [
  'always-loaded',
  'player-current',
  'player-near',
  'player-adjacent',
  'mission-near',
  'mission-adjacent',
  'authored-proximity',
  'movement-prefetch',
  'proximity-prefetch',
  'active-hysteresis',
  'memory-hard-trim',
  'memory-high-trim',
  'memory-soft-trim',
  'outside-retention',
];

function preferReason(
  current: SectorStreamingReason | undefined,
  next: SectorStreamingReason,
): SectorStreamingReason {
  if (!current) return next;
  return reasonPriority.indexOf(current) <= reasonPriority.indexOf(next)
    ? current
    : next;
}

function closestSector(
  sectors: readonly WorldSectorDefinition[],
  position: WorldPosition,
): WorldSectorDefinition | undefined {
  return [...sectors].sort((left, right) => {
    const difference =
      distanceToCenter(position, left) - distanceToCenter(position, right);
    return difference || left.id.localeCompare(right.id);
  })[0];
}

function nearestDistance(
  positions: readonly WorldPosition[],
  sector: WorldSectorDefinition,
): number | undefined {
  if (positions.length === 0) return undefined;
  return Math.min(
    ...positions.map((position) => distanceToCenter(position, sector)),
  );
}

function distanceToCenter(
  position: WorldPosition,
  sector: WorldSectorDefinition,
): number {
  return Math.hypot(
    position.x - sector.center[0],
    position.z - sector.center[1],
  );
}

function centerDistance(
  left: WorldSectorDefinition,
  right: WorldSectorDefinition,
): number {
  return Math.hypot(
    left.center[0] - right.center[0],
    left.center[1] - right.center[1],
  );
}

function movementProjection(
  current: WorldPosition,
  previous: WorldPosition | undefined,
  config: AdaptiveSectorStreamingConfig,
): { readonly projected?: WorldPosition; readonly teleported: boolean } {
  if (!previous) return { teleported: false };
  const dx = current.x - previous.x;
  const dz = current.z - previous.z;
  const distance = Math.hypot(dx, dz);
  if (distance > config.teleportDistance) return { teleported: true };
  if (distance < 0.05) return { teleported: false };
  return {
    teleported: false,
    projected: {
      x: current.x + (dx / distance) * config.movementLookAheadDistance,
      y: current.y,
      z: current.z + (dz / distance) * config.movementLookAheadDistance,
    },
  };
}

function validateConfig(config: AdaptiveSectorStreamingConfig): void {
  for (const [key, value] of Object.entries(config)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(
        `Adaptive sector streaming config "${key}" must be non-negative`,
      );
    }
  }
  if (config.preferredMemoryMb >= config.hardMemoryMb) {
    throw new Error(
      'Preferred streaming memory must be below the hard ceiling',
    );
  }
  if (
    config.maxConcurrentLoads < 1 ||
    !Number.isInteger(config.maxConcurrentLoads)
  ) {
    throw new Error('Streaming load concurrency must be a positive integer');
  }
  if (config.maxLoadAttempts < 1 || !Number.isInteger(config.maxLoadAttempts)) {
    throw new Error('Streaming load attempts must be a positive integer');
  }
}
