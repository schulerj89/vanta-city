import { Vector3 } from 'three';
import { StaticCollisionWorld } from '../src/physics/CollisionWorld';
import { defaultPlayerMovementConfig } from '../src/player/PlayerMovement';

const shape = defaultPlayerMovementConfig;

describe('StaticCollisionWorld oriented geometry', () => {
  it('resolves a character capsule against a rotated wall in wall-local space', () => {
    const world = new StaticCollisionWorld();
    world.addDefinition({
      id: 'angled-wall',
      position: [0, 1.5, 0],
      size: [0.4, 3, 6],
      rotation: [0, Math.PI / 4, 0],
    });
    const transverse = new Vector3(Math.SQRT1_2, 0, -Math.SQRT1_2);
    const start = transverse.clone().multiplyScalar(-2);

    const result = world.moveCharacter(
      start,
      transverse.clone().multiplyScalar(4),
      shape,
      true,
    );
    const localX = result.position.dot(transverse);

    expect(result.blocked).toBe(true);
    expect(localX).toBeCloseTo(-0.2 - shape.radius, 5);
    expect(world.getDebugSnapshot().lastCharacterBlockIds).toEqual([
      'angled-wall',
    ]);
  });

  it('traverses a rotated doorway wider than the capsule diameter', () => {
    const world = new StaticCollisionWorld();
    const yaw = Math.PI / 4;
    const doorway = [
      { id: 'door-left', position: [-1.35, 1.4, 1.35] as const },
      { id: 'door-right', position: [1.35, 1.4, -1.35] as const },
    ];
    for (const side of doorway) {
      world.addDefinition({
        id: side.id,
        position: side.position,
        size: [2.5, 2.8, 0.3],
        rotation: [0, yaw, 0],
      });
    }
    const passage = new Vector3(Math.SQRT1_2, 0, Math.SQRT1_2);

    const result = world.moveCharacter(
      passage.clone().multiplyScalar(-2),
      passage.clone().multiplyScalar(4),
      shape,
      true,
    );

    expect(result.blocked).toBe(false);
    expect(result.position.dot(passage)).toBeCloseTo(2, 5);
  });

  it('grounds on a rotated low step without changing the authored step rules', () => {
    const world = new StaticCollisionWorld();
    world.addDefinition({
      id: 'angled-step',
      position: [0, 0.15, 0],
      size: [2, 0.3, 2],
      rotation: [0, Math.PI / 6, 0],
      tags: ['walkable'],
    });

    const result = world.moveCharacter(
      new Vector3(-1.4, 0, 0),
      new Vector3(0.8, 0, 0),
      shape,
      true,
    );

    expect(result.grounded).toBe(true);
    expect(result.groundColliderId).toBe('angled-step');
    expect(result.position.y).toBeCloseTo(0.3, 5);
  });

  it('casts the camera against yawed boxes and pitched ramp thickness', () => {
    const world = new StaticCollisionWorld();
    world.addDefinition({
      id: 'angled-wall',
      position: [0, 1, 0],
      size: [0.4, 2, 4],
      rotation: [0, Math.PI / 4, 0],
    });
    world.addDefinition({
      id: 'pitched-ramp',
      position: [5, 1, 0],
      size: [2, 0.3, 4],
      rotation: [Math.PI / 6, 0, 0],
      tags: ['walkable', 'ramp'],
    });
    const transverse = new Vector3(Math.SQRT1_2, 0, -Math.SQRT1_2);
    const wallHit = world.castCamera(
      transverse.clone().multiplyScalar(-2).setY(1),
      transverse.clone().multiplyScalar(2).setY(1),
      0.2,
    );
    const rampHit = world.castCamera(
      new Vector3(5, 1, -3),
      new Vector3(5, 1, 3),
      0.1,
    );

    expect(wallHit).toMatchObject({
      obstructed: true,
      colliderId: 'angled-wall',
    });
    expect(wallHit.fraction).toBeCloseTo(0.4, 5);
    expect(rampHit).toMatchObject({
      obstructed: true,
      colliderId: 'pitched-ramp',
    });
  });

  it('ignores an initial participant overlap but still blocks on other bodies', () => {
    const world = new StaticCollisionWorld();
    world.addDefinition({
      id: 'bystander-occupancy',
      position: [0, 1, 1.25],
      size: [0.75, 2, 0.75],
      tags: ['npc-occupancy'],
    });
    world.addDefinition({
      id: 'npc-occupancy',
      position: [0, 1, 0],
      size: [0.75, 2, 0.75],
      tags: ['npc-occupancy'],
    });
    world.addDefinition({
      id: 'alley-wall',
      position: [0, 1, 2],
      size: [4, 2, 0.3],
      tags: ['wall'],
    });

    const ordinary = world.castCamera(
      new Vector3(0, 1, 0),
      new Vector3(0, 1, 4),
      0.2,
    );
    const conversation = world.castCamera(
      new Vector3(0, 1, 0),
      new Vector3(0, 1, 4),
      0.2,
      { ignoreInitialOverlapTags: ['npc-occupancy'] },
    );

    expect(ordinary.colliderId).toBe('npc-occupancy');
    expect(ordinary.fraction).toBe(0);
    expect(conversation.colliderId).toBe('bystander-occupancy');
    expect(conversation.fraction).toBeGreaterThan(0);
  });

  it('uses the same oriented boxes for deterministic visibility queries', () => {
    const world = new StaticCollisionWorld();
    world.addDefinition({
      id: 'privacy-wall',
      position: [0, 1, 0],
      size: [0.3, 2, 4],
      rotation: [0, Math.PI / 4, 0],
    });

    expect(
      world.castSegment(new Vector3(-2, 1, 2), new Vector3(2, 1, -2))
        .obstructed,
    ).toBe(true);
    expect(
      world.castSegment(new Vector3(-2, 1, -3), new Vector3(2, 1, 1))
        .obstructed,
    ).toBe(false);
  });
});
