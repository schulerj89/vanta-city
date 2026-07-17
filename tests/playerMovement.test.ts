import { Vector2, Vector3 } from 'three';
import { StaticCollisionWorld } from '../src/physics/CollisionWorld';
import {
  PlayerMovementSimulation,
  decideMovementState,
  signedHeadingError,
  stepSmoothedHeading,
} from '../src/player/PlayerMovement';
import { testDistrict } from '../src/world/levels/testDistrict';

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
  it.each([
    ['forward', new Vector2(0, 1), [0, -1], Math.PI],
    ['backward', new Vector2(0, -1), [0, 1], 0],
    ['left', new Vector2(-1, 0), [-1, 0], -Math.PI / 2],
    ['right', new Vector2(1, 0), [1, 0], Math.PI / 2],
  ] as const)(
    'maps camera-relative %s intent to the matching world direction and facing',
    (_label, move, [expectedX, expectedZ], expectedYaw) => {
      const movement = new PlayerMovementSimulation(new StaticCollisionWorld());
      movement.teleport(new Vector3(0, 0, 0));

      movement.simulate({ move, sprint: false, jump: false }, 0, 0.1);

      expect(movement.velocity.x).toBeCloseTo(expectedX * 2.2);
      expect(movement.velocity.z).toBeCloseTo(expectedZ * 2.2);
      expect(
        Math.abs(signedHeadingError(movement.desiredFacingYaw, expectedYaw)),
      ).toBeLessThan(1e-6);
      expect(
        Math.abs(signedHeadingError(movement.facingYaw, expectedYaw)),
      ).toBeLessThanOrEqual(Math.abs(signedHeadingError(0, expectedYaw)));
    },
  );

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

  it.each([30, 60, 120])(
    'converges to the same sharp-turn heading at %i Hz',
    (hz) => {
      let heading = 0;
      let angularVelocity = 0;
      for (let frame = 0; frame < hz; frame += 1) {
        const step = stepSmoothedHeading(
          heading,
          (Math.PI * 3) / 4,
          angularVelocity,
          0.24,
          1 / hz,
        );
        heading = step.heading;
        angularVelocity = step.angularVelocity;
      }
      expect(heading).toBeCloseTo(2.3509, 3);
      expect(angularVelocity).toBeCloseTo(0.0393, 3);
    },
  );

  it('turns through a small arc monotonically without overshoot', () => {
    let heading = 0;
    let angularVelocity = 0;
    let previousError = Math.PI / 6;
    for (let frame = 0; frame < 60; frame += 1) {
      const step = stepSmoothedHeading(
        heading,
        Math.PI / 6,
        angularVelocity,
        0.24,
        1 / 60,
      );
      heading = step.heading;
      angularVelocity = step.angularVelocity;
      expect(step.signedError).toBeGreaterThanOrEqual(-1e-8);
      expect(step.signedError).toBeLessThanOrEqual(previousError + 1e-8);
      previousError = step.signedError;
    }
    expect(heading).toBeCloseTo(Math.PI / 6, 2);
  });

  it('tracks a continuous circular target consistently across frame rates', () => {
    const outcomes = [30, 60, 120].map((hz) => {
      let heading = 0;
      let angularVelocity = 0;
      for (let frame = 1; frame <= hz * 4; frame += 1) {
        const desired = 0.75 * (frame / hz);
        const step = stepSmoothedHeading(
          heading,
          desired,
          angularVelocity,
          0.24,
          1 / hz,
        );
        heading = step.heading;
        angularVelocity = step.angularVelocity;
      }
      return { heading, angularVelocity };
    });
    expect(Math.max(...outcomes.map(({ heading }) => heading))).toBeLessThan(
      Math.min(...outcomes.map(({ heading }) => heading)) + 0.02,
    );
    expect(
      Math.max(...outcomes.map(({ angularVelocity }) => angularVelocity)),
    ).toBeLessThan(
      Math.min(...outcomes.map(({ angularVelocity }) => angularVelocity)) +
        0.02,
    );
  });

  it('smooths a 180-degree reversal without snapping', () => {
    let heading = 0;
    let angularVelocity = 0;
    const first = stepSmoothedHeading(
      heading,
      Math.PI,
      angularVelocity,
      0.24,
      1 / 60,
    );
    expect(Math.abs(first.heading)).toBeLessThan(0.05);
    expect(Math.abs(first.signedError)).toBeGreaterThan(3);
    heading = first.heading;
    angularVelocity = first.angularVelocity;
    for (let frame = 1; frame < 90; frame += 1) {
      const step = stepSmoothedHeading(
        heading,
        Math.PI,
        angularVelocity,
        0.24,
        1 / 60,
      );
      heading = step.heading;
      angularVelocity = step.angularVelocity;
    }
    expect(Math.abs(signedHeadingError(heading, Math.PI))).toBeLessThan(0.001);
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

  it('uses the visible upper face of a rotated ramp as the foot-contact plane', () => {
    const collision = new StaticCollisionWorld();
    const ramp = testDistrict.definition.staticCollision.find(
      ({ id }) => id === 'c.deck-ramp',
    );
    expect(ramp).toBeDefined();
    collision.addDefinition(ramp!);
    const movement = new PlayerMovementSimulation(collision);

    movement.teleport(new Vector3(13.5, 0.1, 5.95));
    expect(movement.grounded).toBe(true);
    expect(movement.groundColliderId).toBe('c.deck-ramp');
    expect(movement.position.y).toBeGreaterThanOrEqual(0);
    expect(movement.position.y).toBeLessThanOrEqual(0.02);

    movement.teleport(new Vector3(13.5, 2.9, -3));
    expect(movement.grounded).toBe(true);
    expect(movement.position.y).toBeCloseTo(2.8, 5);
  });

  it('keeps named curb, ramp, stair, and deck transitions grounded in both directions', () => {
    const collision = new StaticCollisionWorld();
    collision.addDefinitions(testDistrict.definition.staticCollision);
    const movement = new PlayerMovementSimulation(collision);
    const frame = 1 / 60;
    const walk = (forward: number, frames: number, cameraYaw = 0) => {
      const supports = new Set<string>();
      for (let index = 0; index < frames; index += 1) {
        movement.simulate(
          {
            move: new Vector2(0, forward),
            sprint: false,
            jump: false,
          },
          cameraYaw,
          frame,
        );
        expect(movement.grounded).toBe(true);
        supports.add(movement.groundColliderId);
      }
      return supports;
    };

    movement.teleport(new Vector3(-4.6, 0, 8));
    const curbSupports = walk(1, 45, Math.PI / 2);
    expect(curbSupports).toContain('c.curb-west');
    expect(curbSupports).toContain('c.sidewalk-west');
    expect(movement.position.y).toBeCloseTo(0.2, 5);

    movement.teleport(new Vector3(13.5, 0.1, 5.8));
    const uphillSupports = walk(1, 180);
    expect(uphillSupports).toContain('c.deck-ramp');
    expect(uphillSupports).toContain('c.loading-deck');
    expect(movement.position.y).toBeCloseTo(2.8, 5);
    const downhillSupports = walk(-1, 220);
    expect(downhillSupports).toContain('c.deck-ramp');
    expect(downhillSupports).toContain('c.east-lot');
    expect(movement.position.y).toBeCloseTo(0, 5);

    movement.teleport(new Vector3(9.5, 0.35, 1.2));
    const stairSupports = walk(1, 110);
    expect(stairSupports).toContain('c.stair-1');
    expect(stairSupports).toContain('c.stair-8');
    expect(stairSupports).toContain('c.loading-deck');
    expect(movement.position.y).toBeCloseTo(2.8, 5);
    walk(-1, 150);
    expect(movement.position.y).toBeCloseTo(0, 5);
  });

  it('projects horizontal speed so authored walk speed is preserved along slopes', () => {
    const collision = new StaticCollisionWorld();
    collision.addRamp({
      id: 'grade',
      minX: -1,
      maxX: 1,
      minZ: -20,
      maxZ: 20,
      baseHeight: 10,
      slopeX: 0,
      slopeZ: -0.25,
    });
    const movement = new PlayerMovementSimulation(collision);
    movement.teleport(new Vector3(0, 1, 16));
    expect(movement.grounded).toBe(true);

    for (let index = 0; index < 30; index += 1) {
      movement.simulate(
        { move: new Vector2(0, 1), sprint: false, jump: false },
        0,
        1 / 60,
      );
    }

    const grade = 0.25;
    const surfaceSpeed = Math.hypot(
      movement.velocity.z,
      movement.velocity.z * grade,
    );
    expect(surfaceSpeed).toBeCloseTo(movement.config.walkSpeed, 5);
  });
});
