import { Vector3 } from 'three';
import { EventBus } from '../src/core/events';
import { StaticCollisionWorld } from '../src/physics/CollisionWorld';
import { WorldCollisionSystem } from '../src/physics/WorldCollisionSystem';
import type { WorldEvents } from '../src/world/WorldEvents';
import { testDistrict } from '../src/world/levels/testDistrict';

describe('WorldCollisionSystem', () => {
  it('synchronizes the shared level collider definitions on load and unload', () => {
    const events = new EventBus<WorldEvents>();
    const collision = new StaticCollisionWorld();
    const system = new WorldCollisionSystem(collision, events);
    system.init();

    events.emit('level:loaded', { level: testDistrict.definition });
    expect(
      collision.castCamera(
        new Vector3(7.2, 0.7, 6),
        new Vector3(7.2, 0.7, 10),
        0.1,
      ).obstructed,
    ).toBe(true);

    // Reloading rebuilds rather than accumulating duplicate runtime shapes.
    events.emit('level:loaded', { level: testDistrict.definition });
    events.emit('level:unloaded', { levelId: testDistrict.definition.id });
    expect(
      collision.castCamera(
        new Vector3(7.2, 0.7, 6),
        new Vector3(7.2, 0.7, 10),
        0.1,
      ).obstructed,
    ).toBe(false);

    system.dispose();
  });
});
