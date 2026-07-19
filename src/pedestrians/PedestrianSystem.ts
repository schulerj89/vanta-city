import type { Scene } from 'three';
import type { CharacterDefinition } from '../characters/CharacterDefinition';
import type { GameState } from '../core/gameState';
import type { EventBus } from '../core/events';
import type { GameSystem } from '../core/lifecycle';
import type { FrameTime } from '../core/time';
import type { CollisionWorld } from '../physics/CollisionWorld';
import type { LevelDefinition } from '../world/LevelDefinition';
import type { SectorStreamingSnapshot } from '../world/LevelSystem';
import type { WorldEvents } from '../world/WorldEvents';
import type { WorldPoseSource } from '../world/Spatial';
import {
  PedestrianBoundaryLifecyclePolicy,
  type PedestrianBoundaryEdge,
  type PedestrianLifecycleReason,
} from './PedestrianBoundaryLifecyclePolicy';
import {
  PedestrianEntity,
  type PedestrianCharacterLoader,
  type PedestrianSnapshot,
} from './PedestrianEntity';

export interface PedestrianLevelSource {
  readonly activeLevel: LevelDefinition | undefined;
  getStreamingSnapshot(): SectorStreamingSnapshot;
}

export interface PedestrianPopulationSnapshot {
  readonly levelId: string | undefined;
  readonly seed: number | undefined;
  readonly residentCap: number;
  readonly residentCount: number;
  readonly activeCount: number;
  readonly visibleCount: number;
  readonly loadingCount: number;
  readonly mixerOwnerCount: number;
  readonly routeCount: number;
  readonly sectorCounts: Readonly<Record<string, number>>;
  readonly plan: PedestrianPopulationPlanSnapshot;
  readonly spawnCount: number;
  readonly disposeCount: number;
  readonly boundaryExitCount: number;
  readonly retiredCount: number;
  readonly repopulationCount: number;
  readonly loadCancellationCount: number;
  readonly lifecycleEvents: readonly PedestrianLifecycleRecord[];
  readonly pedestrians: readonly PedestrianSnapshot[];
}

export interface PedestrianPopulationPlanSnapshot {
  readonly residentCount: number;
  readonly routeCount: number;
  readonly routeIds: readonly string[];
  readonly routeCounts: Readonly<Record<string, number>>;
  readonly sectorCounts: Readonly<Record<string, number>>;
}

export interface PedestrianLifecycleRecord {
  readonly sequence: number;
  readonly id: string;
  readonly routeId: string;
  readonly sectorId: string;
  readonly state: 'despawned' | 'disposed';
  readonly reason: PedestrianLifecycleReason;
  readonly boundaryEdge: PedestrianBoundaryEdge | null;
  readonly position: readonly [number, number, number];
  readonly distanceTravelled: number;
  readonly mixerOwnerCountBeforeDispose: number;
}

interface GameStateSource {
  readonly current: GameState;
}

export class PedestrianSystem implements GameSystem {
  public readonly id = 'pedestrians';
  private readonly characters: readonly CharacterDefinition[];
  private readonly entities = new Map<string, PedestrianEntity>();
  private readonly loading = new Map<string, number>();
  private readonly constructing = new Map<string, PedestrianEntity[]>();
  private readonly retired = new Map<string, PedestrianLifecycleRecord>();
  private readonly repopulateOnNextLoad = new Set<string>();
  private readonly lifecycleEvents: PedestrianLifecycleRecord[] = [];
  private readonly unsubscribeWorld: (() => void)[] = [];
  private generation = 0;
  private spawnCount = 0;
  private disposeCount = 0;
  private boundaryExitCount = 0;
  private repopulationCount = 0;
  private loadCancellationCount = 0;
  private lifecycleSequence = 0;

  public constructor(
    characterDefinitions: readonly CharacterDefinition[],
    private readonly loader: PedestrianCharacterLoader,
    private readonly scene: Scene,
    private readonly collision: CollisionWorld,
    private readonly player: WorldPoseSource,
    private readonly levels: PedestrianLevelSource,
    private readonly events: EventBus<WorldEvents>,
    private readonly gameState: GameStateSource,
  ) {
    this.characters = [...characterDefinitions].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    if (this.characters.length === 0)
      throw new Error('PedestrianSystem requires character definitions');
  }

  public async init(): Promise<void> {
    this.unsubscribeWorld.push(
      this.events.on('sector:loaded', ({ levelId, sectorId }) => {
        if (this.levels.activeLevel?.id !== levelId) return;
        void this.spawnSector(sectorId).catch((error: unknown) =>
          console.error(
            `Failed to populate pedestrian sector "${sectorId}"`,
            error,
          ),
        );
      }),
      this.events.on('sector:unloaded', ({ sectorId }) =>
        this.clearSector(sectorId, 'sector-unloaded'),
      ),
      this.events.on('level:unloaded', () => this.clear('level-unloaded')),
      this.events.on('level:loaded', ({ level }) => {
        if (!level.pedestrians) return;
        for (const sectorId of this.levels.getStreamingSnapshot().active) {
          void this.spawnSector(sectorId).catch((error: unknown) =>
            console.error(
              `Failed to populate pedestrian sector "${sectorId}"`,
              error,
            ),
          );
        }
      }),
    );
    const level = this.levels.activeLevel;
    if (!level) throw new Error('Pedestrians require an active level');
    await Promise.all(
      this.levels
        .getStreamingSnapshot()
        .active.map((sectorId) => this.spawnSector(sectorId)),
    );
  }

  public update(time: FrameTime): void {
    if (this.gameState.current === 'cinematic') return;
    const playerPosition = this.player.getWorldPose()?.position;
    const definition = this.levels.activeLevel?.pedestrians;
    const neighbors = [...this.entities.values()];
    for (const entity of neighbors) {
      if (playerPosition && definition) {
        const position = entity.object3d.position;
        const distance = Math.hypot(
          position.x - playerPosition.x,
          position.z - playerPosition.z,
        );
        const isActive = entity.getSnapshot().state !== 'inactive';
        entity.setActive(
          isActive
            ? distance <= definition.visibilityDistance
            : distance <= definition.activationDistance,
        );
      }
      const update = entity.update(time.delta, neighbors);
      if (update.shouldDespawn && update.reason) {
        this.retireAtBoundary(entity, update.reason, update.edge);
      }
    }
  }

  public getSnapshot(): PedestrianPopulationSnapshot {
    const pedestrians = [...this.entities.values()]
      .map((entity) => entity.getSnapshot())
      .sort((a, b) => a.id.localeCompare(b.id));
    const sectorCounts: Record<string, number> = {};
    for (const pedestrian of pedestrians)
      sectorCounts[pedestrian.sectorId] =
        (sectorCounts[pedestrian.sectorId] ?? 0) + 1;
    const definition = this.levels.activeLevel?.pedestrians;
    return {
      levelId: this.levels.activeLevel?.id,
      seed: definition?.seed,
      residentCap: definition?.residentCap ?? 0,
      residentCount: pedestrians.length,
      activeCount: pedestrians.filter(({ state }) => state !== 'inactive')
        .length,
      visibleCount: pedestrians.filter(({ visible }) => visible).length,
      loadingCount: this.loading.size,
      mixerOwnerCount: pedestrians.reduce(
        (sum, pedestrian) => sum + pedestrian.mixerOwnerCount,
        0,
      ),
      routeCount: new Set(pedestrians.map(({ routeId }) => routeId)).size,
      sectorCounts,
      plan: this.getPopulationPlan(),
      spawnCount: this.spawnCount,
      disposeCount: this.disposeCount,
      boundaryExitCount: this.boundaryExitCount,
      retiredCount: this.retired.size,
      repopulationCount: this.repopulationCount,
      loadCancellationCount: this.loadCancellationCount,
      lifecycleEvents: [...this.lifecycleEvents],
      pedestrians,
    };
  }

  /** Authoritative cap-aware allocation for the currently resident sectors. */
  public getPopulationPlan(): PedestrianPopulationPlanSnapshot {
    const population = this.levels.activeLevel?.pedestrians;
    if (!population) return emptyPopulationPlan;
    const active = new Set(this.levels.getStreamingSnapshot().active);
    const routeCounts: Record<string, number> = {};
    const sectorCounts: Record<string, number> = {};
    let ordinal = 0;
    for (const route of population.routes) {
      const available = Math.max(
        0,
        Math.min(route.population, population.residentCap - ordinal),
      );
      ordinal += route.population;
      if (!active.has(route.sectorId) || available === 0) continue;
      routeCounts[route.id] = available;
      sectorCounts[route.sectorId] =
        (sectorCounts[route.sectorId] ?? 0) + available;
    }
    const routeIds = Object.keys(routeCounts).sort();
    return {
      residentCount: Object.values(routeCounts).reduce(
        (sum, count) => sum + count,
        0,
      ),
      routeCount: routeIds.length,
      routeIds,
      routeCounts,
      sectorCounts,
    };
  }

  public dispose(): void {
    for (const unsubscribe of this.unsubscribeWorld.splice(0)) unsubscribe();
    this.clear('system-disposed');
  }

  private async spawnSector(sectorId: string): Promise<void> {
    const level = this.levels.activeLevel;
    const population = level?.pedestrians;
    if (!level || !population) return;
    const routes = population.routes.filter(
      (route) => route.sectorId === sectorId,
    );
    if (routes.length === 0 || this.loading.has(sectorId)) return;
    if (
      [...this.entities.values()].some(
        ({ route }) => route.sectorId === sectorId,
      )
    )
      return;
    const version = ++this.generation;
    this.loading.set(sectorId, version);
    const constructing: PedestrianEntity[] = [];
    const boundaryLifecycle = new PedestrianBoundaryLifecyclePolicy(
      level.mapPresentation?.bounds,
    );
    try {
      for (const route of routes) {
        const routeIndex = population.routes.indexOf(route);
        for (let index = 0; index < route.population; index += 1) {
          const ordinal =
            population.routes
              .slice(0, routeIndex)
              .reduce((sum, candidate) => sum + candidate.population, 0) +
            index;
          if (ordinal >= population.residentCap) continue;
          const id = `pedestrian.${route.id}.${index + 1}`;
          if (this.retired.has(id)) continue;
          const random = seededUnit(population.seed, ordinal);
          const character =
            this.characters[
              (population.seed + ordinal) % this.characters.length
            ]!;
          const entity = new PedestrianEntity(
            id,
            route,
            character,
            this.loader,
            this.collision,
            route.speed[0] + (route.speed[1] - route.speed[0]) * random,
            route.loop
              ? Math.floor((index * route.nodes.length) / route.population)
              : 0,
            seededUnit(population.seed ^ 0x9e3779b9, ordinal),
            boundaryLifecycle,
          );
          constructing.push(entity);
        }
      }
      this.constructing.set(sectorId, constructing);
      const results = await Promise.allSettled(
        constructing.map((entity) => entity.init()),
      );
      const failed = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected',
      );
      if (
        this.loading.get(sectorId) !== version ||
        this.levels.activeLevel?.id !== level.id ||
        this.constructing.get(sectorId) !== constructing
      ) {
        return;
      }
      if (failed) throw failed.reason;
      for (const entity of constructing) {
        this.entities.set(entity.id, entity);
        this.scene.add(entity.object3d);
        this.spawnCount += 1;
        if (this.repopulateOnNextLoad.delete(entity.id)) {
          this.repopulationCount += 1;
        }
      }
    } catch (error) {
      if (this.constructing.get(sectorId) === constructing) {
        this.disposeConstructing(constructing, 'load-failed');
      }
      throw error;
    } finally {
      if (this.loading.get(sectorId) === version) this.loading.delete(sectorId);
      if (this.constructing.get(sectorId) === constructing) {
        this.constructing.delete(sectorId);
      }
    }
  }

  private clearSector(
    sectorId: string,
    reason: Extract<PedestrianLifecycleReason, 'sector-unloaded'>,
  ): void {
    this.loading.delete(sectorId);
    this.generation += 1;
    const constructing = this.constructing.get(sectorId);
    if (constructing) {
      this.constructing.delete(sectorId);
      this.disposeConstructing(constructing, 'load-cancelled');
    }
    for (const [id, record] of this.retired) {
      if (record.sectorId !== sectorId) continue;
      this.retired.delete(id);
      this.repopulateOnNextLoad.add(id);
    }
    for (const [id, entity] of this.entities) {
      if (entity.route.sectorId !== sectorId) continue;
      this.disposeResident(id, entity, reason);
    }
  }

  private clear(
    reason: Extract<
      PedestrianLifecycleReason,
      'level-unloaded' | 'system-disposed'
    >,
  ): void {
    this.generation += 1;
    this.loading.clear();
    for (const constructing of this.constructing.values()) {
      this.disposeConstructing(constructing, 'load-cancelled');
    }
    this.constructing.clear();
    for (const [id, entity] of this.entities) {
      this.disposeResident(id, entity, reason);
    }
    this.retired.clear();
    this.repopulateOnNextLoad.clear();
  }

  private retireAtBoundary(
    entity: PedestrianEntity,
    reason: Extract<PedestrianLifecycleReason, 'authored-boundary-exit'>,
    edge: PedestrianBoundaryEdge | null,
  ): void {
    const record = this.recordLifecycle(entity, 'despawned', reason, edge);
    this.scene.remove(entity.object3d);
    entity.dispose();
    this.entities.delete(entity.id);
    this.retired.set(entity.id, record);
    this.disposeCount += 1;
    this.boundaryExitCount += 1;
  }

  private disposeResident(
    id: string,
    entity: PedestrianEntity,
    reason: PedestrianLifecycleReason,
  ): void {
    this.recordLifecycle(entity, 'disposed', reason, null);
    this.scene.remove(entity.object3d);
    entity.dispose();
    this.entities.delete(id);
    this.disposeCount += 1;
  }

  private disposeConstructing(
    entities: readonly PedestrianEntity[],
    reason: Extract<
      PedestrianLifecycleReason,
      'load-cancelled' | 'load-failed'
    >,
  ): void {
    for (const entity of entities) {
      this.recordLifecycle(entity, 'disposed', reason, null);
      entity.dispose();
      this.disposeCount += 1;
      if (reason === 'load-cancelled') this.loadCancellationCount += 1;
    }
  }

  private recordLifecycle(
    entity: PedestrianEntity,
    state: PedestrianLifecycleRecord['state'],
    reason: PedestrianLifecycleReason,
    boundaryEdge: PedestrianBoundaryEdge | null,
  ): PedestrianLifecycleRecord {
    const snapshot = entity.getSnapshot();
    const record: PedestrianLifecycleRecord = {
      sequence: ++this.lifecycleSequence,
      id: entity.id,
      routeId: entity.route.id,
      sectorId: entity.route.sectorId,
      state,
      reason,
      boundaryEdge,
      position: snapshot.position,
      distanceTravelled: snapshot.distanceTravelled,
      mixerOwnerCountBeforeDispose: snapshot.mixerOwnerCount,
    };
    this.lifecycleEvents.push(record);
    if (this.lifecycleEvents.length > 64) this.lifecycleEvents.shift();
    return record;
  }
}

const emptyPopulationPlan: PedestrianPopulationPlanSnapshot = {
  residentCount: 0,
  routeCount: 0,
  routeIds: [],
  routeCounts: {},
  sectorCounts: {},
};

function seededUnit(seed: number, ordinal: number): number {
  let value = (seed ^ Math.imul(ordinal + 1, 0x45d9f3b)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b) >>> 0;
  return ((value ^ (value >>> 16)) >>> 0) / 0x1_0000_0000;
}
