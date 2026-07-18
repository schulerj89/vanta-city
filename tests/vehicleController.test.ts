import {
  BoxGeometry,
  Group,
  Mesh,
  PerspectiveCamera,
  Scene,
  Vector3,
} from 'three';
import { EventBus } from '../src/core/events';
import type { StateEvents } from '../src/core/gameState';
import { GameStateMachine } from '../src/core/gameState';
import { GameObjectWorld } from '../src/entities/GameObjectWorld';
import type { GameAssetLoader, ModelInstance } from '../src/assets/AssetLoader';
import type { InputReader, PointerInputReader } from '../src/input/InputSystem';
import { InteractionSystem } from '../src/interactions/InteractionSystem';
import { StaticCollisionWorld } from '../src/physics/CollisionWorld';
import { PlayerControllerSystem } from '../src/player/PlayerControllerSystem';
import { ThirdPersonCameraSystem } from '../src/camera/ThirdPersonCameraSystem';
import type { TrafficSystem } from '../src/traffic/TrafficSystem';
import { VehicleControllerSystem } from '../src/vehicles/VehicleControllerSystem';

class VehicleInput implements InputReader, PointerInputReader {
  public readonly down = new Set<string>();
  public readonly pressed = new Set<string>();
  public isDown(action: string): boolean {
    return this.down.has(action);
  }
  public wasPressed(action: string): boolean {
    return this.pressed.delete(action);
  }
  public wasReleased(): boolean {
    return false;
  }
  public consumePointerDelta() {
    return { x: 0, y: 0, wheel: 0 };
  }
  public isPointerLocked(): boolean {
    return false;
  }
  public requestPointerLock(): void {}
}

const frame = { delta: 1 / 60, elapsed: 1, frame: 1 } as const;

async function harness() {
  const events = new EventBus<StateEvents>();
  const state = new GameStateMachine(events);
  state.transition('playing');
  const input = new VehicleInput();
  const scene = new Scene();
  const collision = new StaticCollisionWorld();
  const player = new PlayerControllerSystem(
    new GameObjectWorld(scene),
    collision,
  );
  await player.init({ events, state, input });
  const interactions = new InteractionSystem(input, state, player, collision);
  interactions.init({ events });
  const camera = new ThirdPersonCameraSystem(
    new PerspectiveCamera(),
    input,
    player,
    collision,
  );
  camera.init({ events, state, input });
  let disposed = 0;
  const assets = {
    instantiateModel: async (assetId: string): Promise<ModelInstance> => {
      const model = new Group();
      model.add(new Mesh(new BoxGeometry(2, 1.5, 5)));
      return {
        assetId,
        scene: model,
        animations: [],
        dispose: () => {
          disposed += 1;
        },
      };
    },
  } as GameAssetLoader;
  const traffic = {
    getSnapshot: () => ({ vehicles: [] }),
  } as unknown as TrafficSystem;
  const vehicle = new VehicleControllerSystem(
    scene,
    assets,
    collision,
    player,
    interactions,
    traffic,
    camera,
  );
  await vehicle.init({ events, state, input });
  return {
    camera,
    collision,
    disposed: () => disposed,
    input,
    interactions,
    player,
    state,
    vehicle,
  };
}

describe('VehicleControllerSystem', () => {
  it('transfers explicit ownership, drives, pauses, recovers, and restores on foot', async () => {
    const h = await harness();
    const start = h.vehicle.getSnapshot();
    expect(start).toMatchObject({
      mode: 'on-foot',
      occupantId: undefined,
      ownership: { movement: 'player', camera: 'gameplay', input: 'on-foot' },
    });

    expect(h.vehicle.enter()).toBe(true);
    expect(h.vehicle.getSnapshot()).toMatchObject({
      mode: 'driving',
      occupantId: 'player',
      ownership: {
        movement: 'vehicle',
        camera: 'vehicle-focus',
        input: 'vehicle',
      },
    });
    expect(h.player.isControlEnabled()).toBe(false);
    expect(h.player.isPresentationVisible()).toBe(false);
    expect(h.camera.getDebugSnapshot().gameplayFocusOwner).toBe(
      'vehicle-controller',
    );

    h.input.down.add('moveForward');
    for (let index = 0; index < 60; index += 1) h.vehicle.update(frame);
    h.input.down.clear();
    const driven = h.vehicle.getSnapshot();
    expect(driven.speed).toBeGreaterThan(0);
    expect(driven.position.z).toBeLessThan(start.position.z);
    expect(driven.grounded).toBe(true);

    const beforeSteer = driven.yaw;
    h.input.down.add('moveLeft');
    for (let index = 0; index < 20; index += 1) h.vehicle.update(frame);
    h.input.down.delete('moveLeft');
    expect(h.vehicle.getSnapshot().yaw).not.toBeCloseTo(beforeSteer);

    h.input.down.add('moveBackward');
    for (let index = 0; index < 120; index += 1) h.vehicle.update(frame);
    h.input.down.clear();
    expect(h.vehicle.getSnapshot().speed).toBeLessThan(0);

    h.state.transition('paused');
    const pausedPosition = h.vehicle.getSnapshot().position;
    for (let index = 0; index < 30; index += 1) h.vehicle.update(frame);
    expect(h.vehicle.getSnapshot().position).toEqual(pausedPosition);
    h.state.transition('playing');

    h.input.pressed.add('recoverVehicle');
    h.vehicle.update(frame);
    expect(h.vehicle.getSnapshot()).toMatchObject({
      recoveryCount: 1,
      speed: 0,
    });

    h.input.pressed.add('interact');
    h.vehicle.update(frame);
    expect(h.vehicle.getSnapshot().mode).toBe('on-foot');
    expect(h.player.isControlEnabled()).toBe(true);
    expect(h.player.isPresentationVisible()).toBe(true);
    expect(h.camera.getDebugSnapshot().gameplayFocusOwner).toBeUndefined();

    h.vehicle.dispose();
    expect(h.disposed()).toBe(1);
    h.camera.dispose();
    h.interactions.dispose();
    h.player.dispose();
  });

  it('rejects an unsafe exit and retains seated ownership', async () => {
    const h = await harness();
    h.vehicle.enter();
    const position = h.vehicle.getSnapshot().position;
    for (const [id, x, z] of [
      ['exit-right', position.x - 1.75, position.z],
      ['exit-left', position.x + 1.75, position.z],
      ['exit-rear', position.x, position.z + 2.8],
    ] as const) {
      h.collision.addBox({
        id,
        min: new Vector3(x - 0.8, 0, z - 0.8),
        max: new Vector3(x + 0.8, 2, z + 0.8),
      });
    }
    expect(h.vehicle.exit()).toBe(false);
    expect(h.vehicle.getSnapshot()).toMatchObject({
      mode: 'driving',
      occupantId: 'player',
      exitAvailable: false,
    });
    h.vehicle.dispose();
    h.camera.dispose();
    h.interactions.dispose();
    h.player.dispose();
  });

  it('stops at shared world collision and reports the blocking collider', async () => {
    const h = await harness();
    h.collision.addBox({
      id: 'vehicle-stop',
      min: new Vector3(4, 0, 15.5),
      max: new Vector3(8, 2, 16.5),
    });
    h.vehicle.enter();
    h.input.down.add('moveForward');
    for (let index = 0; index < 180; index += 1) h.vehicle.update(frame);

    expect(h.vehicle.getSnapshot()).toMatchObject({
      blocked: true,
      blockedBy: 'vehicle-stop',
      speed: 0,
      grounded: true,
    });
    h.vehicle.dispose();
    h.camera.dispose();
    h.interactions.dispose();
    h.player.dispose();
  });
});
