import type { EventBus } from '../core/events';
import type { GameSystem } from '../core/lifecycle';
import type { WorldEvents } from '../world/WorldEvents';
import { StaticCollisionWorld } from './CollisionWorld';

/** Keeps the collision query synchronized with the currently loaded level. */
export class WorldCollisionSystem implements GameSystem {
  public readonly id = 'world-collision';
  private readonly unsubscribe: (() => void)[] = [];
  private readonly sectorColliderIds = new Map<string, readonly string[]>();

  public constructor(
    public readonly world: StaticCollisionWorld,
    private readonly events: EventBus<WorldEvents>,
  ) {}

  public init(): void {
    this.unsubscribe.push(
      this.events.on('level:loaded', ({ level }) => {
        if (level.streaming && this.sectorColliderIds.size > 0) return;
        this.world.clear();
        this.sectorColliderIds.clear();
        this.world.addDefinitions(level.staticCollision);
      }),
      this.events.on('level:unloaded', () => {
        this.world.clear();
        this.sectorColliderIds.clear();
      }),
      this.events.on('sector:loaded', ({ sectorId, colliders }) => {
        if (this.sectorColliderIds.has(sectorId)) return;
        this.world.addDefinitions(colliders);
        this.sectorColliderIds.set(
          sectorId,
          colliders.map(({ id }) => id),
        );
      }),
      this.events.on('sector:unloaded', ({ sectorId }) => {
        for (const id of this.sectorColliderIds.get(sectorId) ?? []) {
          this.world.remove(id);
        }
        this.sectorColliderIds.delete(sectorId);
      }),
    );
  }

  public dispose(): void {
    for (const unsubscribe of this.unsubscribe.splice(0)) unsubscribe();
    this.world.clear();
    this.sectorColliderIds.clear();
  }
}
