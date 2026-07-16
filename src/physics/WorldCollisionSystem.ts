import type { EventBus } from '../core/events';
import type { GameSystem } from '../core/lifecycle';
import type { WorldEvents } from '../world/WorldEvents';
import { StaticCollisionWorld } from './CollisionWorld';

/** Keeps the collision query synchronized with the currently loaded level. */
export class WorldCollisionSystem implements GameSystem {
  public readonly id = 'world-collision';
  private readonly unsubscribe: (() => void)[] = [];

  public constructor(
    public readonly world: StaticCollisionWorld,
    private readonly events: EventBus<WorldEvents>,
  ) {}

  public init(): void {
    this.unsubscribe.push(
      this.events.on('level:loaded', ({ level }) => {
        this.world.clear();
        this.world.addDefinitions(level.staticCollision);
      }),
      this.events.on('level:unloaded', () => this.world.clear()),
    );
  }

  public dispose(): void {
    for (const unsubscribe of this.unsubscribe.splice(0)) unsubscribe();
    this.world.clear();
  }
}
