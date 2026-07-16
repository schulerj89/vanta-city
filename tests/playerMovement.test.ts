import { Vector2, Vector3 } from 'three';
import { StaticCollisionWorld } from '../src/physics/CollisionWorld';
import {
  PlayerMovementSimulation,
  decideMovementState,
} from '../src/player/PlayerMovement';

describe('decideMovementState', () => {
  const base = {
    grounded: true,
    justLanded: false,
    landingTimeRemaining: 0,
    horizontalSpeed: 0,
    movingSpeedThreshold: 0.15,
    runStateSpeedThreshold: 4.2,
  };

  it.each([
    [{ ...base }, 'idle'],
    [{ ...base, horizontalSpeed: 2 }, 'walking'],
    [{ ...base, horizontalSpeed: 5 }, 'running'],
    [{ ...base, grounded: false }, 'airborne'],
    [{ ...base, justLanded: true }, 'landing'],
  ] as const)('chooses %s as %s', (input, expected) => {
    expect(decideMovementState(input)).toBe(expected);
  });
});

describe('PlayerMovementSimulation', () => {
  it('accelerates camera-relative movement instead of changing velocity instantly', () => {
    const movement = new PlayerMovementSimulation(new StaticCollisionWorld());
    movement.teleport(new Vector3(0, 0, 0));
    movement.simulate(
      { move: new Vector2(0, 1), sprint: false, jump: false },
      Math.PI / 2,
      0.1,
    );

    expect(movement.velocity.x).toBeCloseTo(-2.2);
    expect(movement.velocity.z).toBeCloseTo(0);
    expect(movement.velocity.length()).toBeLessThan(movement.config.walkSpeed);
  });

  it('does not pass through registered static obstacles', () => {
    const collision = new StaticCollisionWorld();
    collision.addBox({
      id: 'wall',
      min: new Vector3(-1, 0, -2),
      max: new Vector3(1, 3, -1),
    });
    const movement = new PlayerMovementSimulation(collision);
    movement.teleport(new Vector3(0, 0, 0));

    for (let index = 0; index < 20; index += 1) {
      movement.simulate(
        { move: new Vector2(0, 1), sprint: true, jump: false },
        0,
        0.05,
      );
    }

    expect(movement.position.z).toBeGreaterThanOrEqual(-0.62);
    expect(movement.blocked).toBe(true);
  });

  it('supports grounded jumps and returns to a stable floor', () => {
    const movement = new PlayerMovementSimulation(new StaticCollisionWorld());
    movement.teleport(new Vector3(0, 0, 0));
    movement.simulate(
      { move: new Vector2(), sprint: false, jump: true },
      0,
      1 / 60,
    );
    expect(movement.state).toBe('airborne');
    expect(movement.velocity.y).toBeGreaterThan(0);

    for (let index = 0; index < 120; index += 1) {
      movement.simulate(
        { move: new Vector2(), sprint: false, jump: false },
        0,
        1 / 60,
      );
    }
    expect(movement.grounded).toBe(true);
    expect(movement.position.y).toBe(0);
  });

  it('follows walkable slope ground without losing grounded stability', () => {
    const collision = new StaticCollisionWorld();
    collision.addRamp({
      id: 'ramp',
      minX: -1,
      maxX: 1,
      minZ: -3,
      maxZ: 0,
      baseHeight: 0.6,
      slopeX: 0,
      slopeZ: -0.2,
    });
    const movement = new PlayerMovementSimulation(collision);
    movement.teleport(new Vector3(0, 0, -0.5));

    for (let index = 0; index < 12; index += 1) {
      movement.simulate(
        { move: new Vector2(0, 1), sprint: false, jump: false },
        0,
        0.05,
      );
    }

    expect(movement.grounded).toBe(true);
    expect(movement.position.y).toBeGreaterThan(0.1);
  });
});
