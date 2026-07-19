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
  readonly loadingCount: number;
  readonly mixerOwnerCount: number;
  readonly routeCount: number;
  readonly sectorCounts: Readonly<Record<string, number>>;
  readonly spawnCount: number;
  readonly disposeCount: number;
  readonly pedestrians: readonly PedestrianSnapshot[];
}

interface GameStateSource {
  readonly current: GameState;
}

export class PedestrianSystem implements GameSystem {
  public readonly id = 'pedestrians';
  private readonly characters: readonly CharacterDefinition[];
  private readonly entities = new Map<string, PedestrianEntity>();
  private readonly loading = new Map<string, number>();
  private readonly unsubscribeWorld: (() => void)[] = [];
  private generation = 0;
  private spawnCount = 0;
  private disposeCount = 0;

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
        this.clearSector(sectorId),
      ),
      this.events.on('level:unloaded', () => this.clear()),
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
      entity.update(time.delta, neighbors);
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
      loadingCount: this.loading.size,
      mixerOwnerCount: pedestrians.reduce(
        (sum, pedestrian) => sum + pedestrian.mixerOwnerCount,
        0,
      ),
      routeCount: new Set(pedestrians.map(({ routeId }) => routeId)).size,
      sectorCounts,
      spawnCount: this.spawnCount,
      disposeCount: this.disposeCount,
      pedestrians,
    };
  }

  public dispose(): void {
    for (const unsubscribe of this.unsubscribeWorld.splice(0)) unsubscribe();
    this.clear();
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
          const random = seededUnit(population.seed, ordinal);
          const character =
            this.characters[
              (population.seed + ordinal) % this.characters.length
            ]!;
          const entity = new PedestrianEntity(
            `pedestrian.${route.id}.${index + 1}`,
            route,
            character,
            this.loader,
            this.collision,
            route.speed[0] + (route.speed[1] - route.speed[0]) * random,
            Math.floor((index * route.nodes.length) / route.population),
            seededUnit(population.seed ^ 0x9e3779b9, ordinal),
          );
          constructing.push(entity);
        }
      }
      await Promise.all(constructing.map((entity) => entity.init()));
      if (
        this.loading.get(sectorId) !== version ||
        this.levels.activeLevel?.id !== level.id
      ) {
        for (const entity of constructing) entity.dispose();
        return;
      }
      for (const entity of constructing) {
        this.entities.set(entity.id, entity);
        this.scene.add(entity.object3d);
        this.spawnCount += 1;
      }
    } catch (error) {
      for (const entity of constructing) entity.dispose();
      throw error;
    } finally {
      if (this.loading.get(sectorId) === version) this.loading.delete(sectorId);
    }
  }

  private clearSector(sectorId: string): void {
    this.loading.delete(sectorId);
    this.generation += 1;
    for (const [id, entity] of this.entities) {
      if (entity.route.sectorId !== sectorId) continue;
      this.scene.remove(entity.object3d);
      entity.dispose();
      this.entities.delete(id);
      this.disposeCount += 1;
    }
  }

  private clear(): void {
    this.generation += 1;
    this.loading.clear();
    for (const entity of this.entities.values()) {
      this.scene.remove(entity.object3d);
      entity.dispose();
      this.disposeCount += 1;
    }
    this.entities.clear();
  }
}

function seededUnit(seed: number, ordinal: number): number {
  let value = (seed ^ Math.imul(ordinal + 1, 0x45d9f3b)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b) >>> 0;
  return ((value ^ (value >>> 16)) >>> 0) / 0x1_0000_0000;
}
