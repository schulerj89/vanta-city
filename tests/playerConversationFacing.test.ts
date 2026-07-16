import { Scene, Vector3 } from 'three';
import { GameObjectWorld } from '../src/entities/GameObjectWorld';
import { StaticCollisionWorld } from '../src/physics/CollisionWorld';
import { PlayerControllerSystem } from '../src/player/PlayerControllerSystem';

describe('player conversation presentation facing', () => {
  it('faces a live subject without mutating authoritative simulation yaw', () => {
    const player = new PlayerControllerSystem(
      new GameObjectWorld(new Scene()),
      new StaticCollisionWorld(),
    );
    player.movement.teleport(new Vector3(4, 0, -2), -1.2);
    const simulationYaw = player.movement.facingYaw;

    player.setPresentationFacingTarget({
      getWorldPose: () => ({
        position: { x: 8, y: 0, z: -2 },
        forward: { x: 0, y: 0, z: 1 },
      }),
    });

    expect(player.movement.facingYaw).toBe(simulationYaw);
    expect(player.getWorldPose().forward.x).toBeCloseTo(
      Math.sin(simulationYaw),
    );
    expect(player.getDebugSnapshot().presentationFacingYaw).toBeCloseTo(
      Math.PI / 2,
    );
    expect(player.visual.visualRoot.rotation.y).toBeCloseTo(Math.PI / 2);

    player.setPresentationFacingTarget();
    expect(player.getDebugSnapshot().presentationFacingYaw).toBeCloseTo(
      simulationYaw,
    );
  });
});
