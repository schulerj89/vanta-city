import { PerspectiveCamera, Scene, Vector3 } from 'three';
import type { CameraCastResult } from '../src/physics/CollisionWorld';
import { StaticCollisionWorld } from '../src/physics/CollisionWorld';
import { EventBus } from '../src/core/events';
import { GameStateMachine } from '../src/core/gameState';
import type { StateEvents } from '../src/core/gameState';
import { GameObjectWorld } from '../src/entities/GameObjectWorld';
import type {
  InputReader,
  PointerDelta,
  PointerInputReader,
} from '../src/input/InputSystem';
import { PlayerControllerSystem } from '../src/player/PlayerControllerSystem';
import {
  CameraOwnershipError,
  ThirdPersonCameraSystem,
  cameraControlPriorities,
  clampPitch,
  clampZoom,
  defaultThirdPersonCameraConfig,
  isMovingCameraForward,
} from '../src/camera/ThirdPersonCameraSystem';
import type { WorldPoseSource } from '../src/world/Spatial';
import { resolveConversationCameraProfile } from '../src/camera/ConversationCameraProfile';

const frame = { delta: 1 / 60, elapsed: 1, frame: 1 } as const;

class CameraCollisionWorld extends StaticCollisionWorld {
  public cameraFraction = 1;

  public override castCamera(): CameraCastResult {
    return {
      fraction: this.cameraFraction,
      obstructed: this.cameraFraction < 1,
    };
  }
}

class CameraInput implements InputReader, PointerInputReader {
  public delta: PointerDelta = { x: 0, y: 0, wheel: 0 };
  public pointerLocked = false;
  public uiFocused = false;
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

  public consumePointerDelta(): PointerDelta {
    const delta = this.delta;
    this.delta = { x: 0, y: 0, wheel: 0 };
    return delta;
  }

  public isPointerLocked(): boolean {
    return this.pointerLocked;
  }

  public requestPointerLock(): void {
    this.pointerLocked = true;
  }

  public releasePointerLock(): void {
    this.pointerLocked = false;
  }

  public isUiFocused(): boolean {
    return this.uiFocused;
  }
}

interface CameraHarness {
  readonly camera: PerspectiveCamera;
  readonly collision: CameraCollisionWorld;
  readonly input: CameraInput;
  readonly player: PlayerControllerSystem;
  readonly state: GameStateMachine;
  readonly system: ThirdPersonCameraSystem;
}

function createHarness(): CameraHarness {
  const collision = new CameraCollisionWorld();
  const player = new PlayerControllerSystem(
    new GameObjectWorld(new Scene()),
    collision,
  );
  player.movement.teleport(new Vector3(0, 0, 0));
  const input = new CameraInput();
  const camera = new PerspectiveCamera();
  const stateEvents = new EventBus<StateEvents>();
  const state = new GameStateMachine(stateEvents);
  state.transition('playing');
  const system = new ThirdPersonCameraSystem(camera, input, player, collision);
  system.init({ events: stateEvents, state, input });
  return { camera, collision, input, player, state, system };
}

function update(harness: CameraHarness, frames = 1): void {
  for (let index = 0; index < frames; index += 1) {
    harness.system.update(frame);
  }
}

describe('ThirdPersonCameraSystem helpers', () => {
  it('clamps pitch and zoom to configured limits', () => {
    expect(clampPitch(-100, defaultThirdPersonCameraConfig)).toBe(
      defaultThirdPersonCameraConfig.minPitch,
    );
    expect(clampPitch(100, defaultThirdPersonCameraConfig)).toBe(
      defaultThirdPersonCameraConfig.maxPitch,
    );
    expect(clampZoom(0, defaultThirdPersonCameraConfig)).toBe(
      defaultThirdPersonCameraConfig.minDistance,
    );
    expect(clampZoom(100, defaultThirdPersonCameraConfig)).toBe(
      defaultThirdPersonCameraConfig.maxDistance,
    );
  });

  it('distinguishes camera-forward movement from backward and strafe input', () => {
    expect(isMovingCameraForward(new Vector3(0, 0, -2), 0)).toBe(true);
    expect(isMovingCameraForward(new Vector3(0, 0, 2), 0)).toBe(false);
    expect(isMovingCameraForward(new Vector3(2, 0, 0), 0)).toBe(false);
  });
});

describe('ThirdPersonCameraSystem', () => {
  it('starts at the closer untouched gameplay distance', () => {
    const harness = createHarness();
    const snapshot = harness.system.getDebugSnapshot();

    expect(defaultThirdPersonCameraConfig.initialDistance).toBe(4.4);
    expect(snapshot.desiredDistance).toBe(4.4);
    expect(snapshot.actualDistance).toBeCloseTo(4.4, 5);
  });

  it('applies a bounded session follow-distance override without persisting it', () => {
    const harness = createHarness();
    harness.system.setPreferences({ followDistance: 6 });

    expect(harness.system.setFollowDistanceOverride(3.7)).toBe(3.7);
    update(harness, 120);
    const overridden = harness.system.getDebugSnapshot();
    expect(overridden.desiredDistance).toBe(3.7);
    expect(overridden.savedPreferenceDistance).toBe(6);
    expect(overridden.followDistanceOverride).toBe(3.7);
    expect(overridden.actualDistance).toBeCloseTo(3.7, 2);

    expect(harness.system.setFollowDistanceOverride(100)).toBe(9);
    expect(harness.system.preferences.current.followDistance).toBe(6);
    harness.system.setFollowDistanceOverride(undefined);
    expect(harness.system.getDebugSnapshot().desiredDistance).toBe(6);
  });

  it('does not orbit for backward movement but still honors explicit recenter', () => {
    const harness = createHarness();
    const initialYaw = harness.system.getDebugSnapshot().yaw;
    harness.player.movement.velocity.set(0, 0, 3);
    harness.player.movement.facingYaw = 0;

    update(harness, 180);
    expect(harness.system.getDebugSnapshot().yaw).toBeCloseTo(initialYaw);

    harness.input.down.add('cameraRecenter');
    update(harness, 60);
    expect(
      Math.abs(harness.system.getDebugSnapshot().yaw - initialYaw),
    ).toBeGreaterThan(1);
  });

  it('orbits with independent sensitivity and ignores camera input while UI is focused', () => {
    const harness = createHarness();
    harness.input.pointerLocked = true;
    harness.system.setPreferences({
      horizontalSensitivity: 0.004,
      verticalSensitivity: 0.002,
      automaticRecenter: false,
    });
    const initial = harness.system.getDebugSnapshot();
    harness.input.delta = { x: 10, y: 10, wheel: 0 };
    update(harness);
    const orbited = harness.system.getDebugSnapshot();
    expect(orbited.yaw).toBeCloseTo(initial.yaw - 0.04);
    expect(orbited.pitch).toBeCloseTo(initial.pitch - 0.02);

    harness.system.setPreferences({ invertY: true });
    harness.input.delta = { x: 0, y: 10, wheel: 0 };
    update(harness);
    const inverted = harness.system.getDebugSnapshot();
    expect(inverted.pitch).toBeCloseTo(orbited.pitch + 0.02);

    harness.input.uiFocused = true;
    harness.input.delta = { x: 100, y: 100, wheel: 0 };
    update(harness);
    expect(harness.system.getDebugSnapshot().yaw).toBeCloseTo(inverted.yaw);
    expect(harness.input.pointerLocked).toBe(false);
  });

  it('smoothly switches shoulders', () => {
    const harness = createHarness();
    const before = harness.system.getDebugSnapshot();
    expect(before.shoulderSide).toBe('right');
    expect(before.shoulderOffset).toBeGreaterThan(0);

    harness.input.pressed.add('cameraSwitchShoulder');
    update(harness);
    const transitioning = harness.system.getDebugSnapshot();
    expect(transitioning.shoulderSide).toBe('left');
    expect(transitioning.shoulderOffset).toBeGreaterThan(
      -harness.system.config.shoulderOffset,
    );

    update(harness, 120);
    expect(harness.system.getDebugSnapshot().shoulderOffset).toBeCloseTo(
      -harness.system.config.shoulderOffset,
      2,
    );
  });

  it('focuses gameplay distance without changing preference or orientation and restores it exactly', () => {
    const harness = createHarness();
    harness.system.setPreferences({
      followDistance: 7,
      automaticRecenter: false,
      shoulderSide: 'left',
    });
    harness.input.pointerLocked = true;
    harness.input.delta = { x: 30, y: -12, wheel: 0 };
    update(harness, 120);
    const before = harness.system.getDebugSnapshot();
    const focus = harness.system.requestGameplayFocus({
      owner: 'debug-sparring-target',
      maxDistance: 4.1,
    });
    update(harness, 120);
    const focused = harness.system.getDebugSnapshot();
    expect(focus.active).toBe(true);
    expect(focused.mode).toBe('gameplay');
    expect(focused.owner).toBe('gameplay');
    expect(focused.gameplayFocusOwner).toBe('debug-sparring-target');
    expect(focused.gameplayFocusDistance).toBe(4.1);
    expect(focused.desiredDistance).toBe(7);
    expect(focused.actualDistance).toBeCloseTo(4.1, 2);
    expect(focused.yaw).toBe(before.yaw);
    expect(focused.pitch).toBe(before.pitch);
    expect(focused.shoulderSide).toBe(before.shoulderSide);

    focus.release();
    update(harness, 120);
    const restored = harness.system.getDebugSnapshot();
    expect(focus.active).toBe(false);
    expect(restored.gameplayFocusOwner).toBeUndefined();
    expect(restored.desiredDistance).toBe(7);
    expect(restored.actualDistance).toBeCloseTo(7, 2);
    expect(restored.yaw).toBe(before.yaw);
    expect(restored.pitch).toBe(before.pitch);
    expect(restored.shoulderSide).toBe(before.shoulderSide);
  });

  it('applies gameplay focus after a directed-camera return completes', () => {
    const harness = createHarness();
    harness.system.setPreferences({ followDistance: 6.5 });
    const conversation = harness.system.requestConversation('dialogue');
    update(harness, 60);
    conversation.release();
    const focus = harness.system.requestGameplayFocus({
      owner: 'debug-sparring-target',
      maxDistance: 4.1,
    });
    update(harness, 120);
    const snapshot = harness.system.getDebugSnapshot();
    expect(snapshot.mode).toBe('gameplay');
    expect(snapshot.gameplayFocusOwner).toBe('debug-sparring-target');
    expect(snapshot.desiredDistance).toBe(6.5);
    expect(snapshot.actualDistance).toBeCloseTo(4.1, 2);
    focus.release();
  });

  it('orbits left and right from held keyboard actions at a frame-rate-independent speed', () => {
    const harness = createHarness();
    harness.system.setPreferences({ automaticRecenter: false });
    const initialYaw = harness.system.getDebugSnapshot().yaw;
    harness.input.down.add('cameraOrbitLeft');
    update(harness, 60);
    const leftYaw = harness.system.getDebugSnapshot().yaw;
    expect(leftYaw - initialYaw).toBeCloseTo(
      -harness.system.config.keyboardOrbitSpeed,
      4,
    );

    harness.input.down.delete('cameraOrbitLeft');
    harness.input.down.add('cameraOrbitRight');
    update(harness, 60);
    expect(harness.system.getDebugSnapshot().yaw).toBeCloseTo(initialYaw, 4);

    harness.input.uiFocused = true;
    update(harness, 60);
    expect(harness.system.getDebugSnapshot().yaw).toBeCloseTo(initialYaw, 4);
  });

  it('enforces ownership priority and resumes a suspended conversation', () => {
    const harness = createHarness();
    const conversation = harness.system.requestConversation('dialogue');
    expect(conversation.active).toBe(true);
    expect(() => harness.system.requestConversation('other-dialogue')).toThrow(
      CameraOwnershipError,
    );

    const cinematic = harness.system.requestCamera({
      owner: 'story-cinematic',
      mode: 'cinematic',
      priority: cameraControlPriorities.cinematic,
    });
    expect(cinematic.active).toBe(true);
    expect(conversation.active).toBe(false);

    cinematic.release();
    expect(conversation.active).toBe(true);
    expect(harness.system.owner).toBe('dialogue');
    conversation.release();
    expect(harness.system.mode).toBe('gameplay');
  });

  it('honors per-request cut and ease durations without changing caller defaults', () => {
    const harness = createHarness();
    harness.system.requestCamera({
      owner: 'story-cinematic',
      mode: 'cinematic',
      anchor: {
        id: 'camera.cut',
        position: { x: 4, y: 3, z: 2 },
        lookAt: { x: 0, y: 1, z: 0 },
        fieldOfView: 42,
      },
      transitionDurationSeconds: 0,
    });
    update(harness);
    expect(harness.system.getDebugSnapshot()).toMatchObject({
      activeAnchorId: 'camera.cut',
      transitionProgress: 1,
    });
    expectVectorClose(harness.camera.position, { x: 4, y: 3, z: 2 });
    expect(harness.camera.fov).toBeCloseTo(42);

    harness.system.requestCamera({
      owner: 'story-cinematic',
      mode: 'cinematic',
      anchor: {
        id: 'camera.ease',
        position: { x: -4, y: 2, z: 1 },
        lookAt: { x: 0, y: 1, z: 0 },
        fieldOfView: 50,
      },
      transitionDurationSeconds: 0.2,
    });
    update(harness, 6);
    expect(harness.system.getDebugSnapshot().transitionProgress).toBeCloseTo(
      0.5,
    );
    update(harness, 6);
    expect(harness.system.getDebugSnapshot().transitionProgress).toBe(1);
  });

  it('transitions into dialogue and restores the exact gameplay view on release', () => {
    const harness = createHarness();
    harness.input.pointerLocked = true;
    harness.system.setPreferences({
      automaticRecenter: false,
      followDistance: 7,
      shoulderSide: 'left',
    });
    harness.input.delta = { x: 80, y: -30, wheel: 0 };
    update(harness, 30);
    const gameplay = harness.system.getDebugSnapshot();
    const npc: WorldPoseSource = {
      getWorldPose: () => ({
        position: { x: 2, y: 0, z: -2 },
        forward: { x: 0, y: 0, z: 1 },
      }),
    };

    const conversation = harness.system.requestConversation(
      'dialogue',
      npc,
      {
        id: 'camera.dialogue-test',
        position: { x: 4, y: 3, z: 3 },
        lookAt: { x: 1, y: 1, z: -1 },
        fieldOfView: 48,
      },
      resolveConversationCameraProfile('wide'),
    );
    harness.state.transition('dialogue');
    const directedYaw = harness.system.getDebugSnapshot().yaw;
    harness.input.pointerLocked = true;
    harness.input.delta = { x: 500, y: 500, wheel: 500 };
    update(harness);
    expect(harness.system.getDebugSnapshot().yaw).toBe(directedYaw);
    expect(harness.input.pointerLocked).toBe(false);
    update(harness, 60);
    const directed = harness.system.getDebugSnapshot();
    expect(directed.mode).toBe('conversation');
    expect(directed.owner).toBe('dialogue');
    expect(directed.activeAnchorId).toBe('camera.dialogue-test');
    expect(directed.transitionProgress).toBe(1);
    expect(harness.camera.fov).toBeCloseTo(48);
    expectFiniteCamera(harness.camera);

    conversation.release();
    harness.state.transition('playing');
    update(harness, 60);
    const restored = harness.system.getDebugSnapshot();
    expect(restored.mode).toBe('gameplay');
    expect(restored.yaw).toBe(gameplay.yaw);
    expect(restored.pitch).toBe(gameplay.pitch);
    expect(restored.desiredDistance).toBe(gameplay.desiredDistance);
    expect(restored.shoulderSide).toBe(gameplay.shoulderSide);
    expect(restored.transitionProgress).toBe(1);
    expect(harness.camera.fov).toBeCloseTo(50);
    expectVectorClose(restored.position, gameplay.position);
    expectVectorClose(restored.target, gameplay.target);
    expectFiniteCamera(harness.camera);

    // A later conversation captures the current view, not the prior snapshot.
    harness.input.delta = { x: -120, y: 40, wheel: 0 };
    harness.input.pointerLocked = true;
    update(harness, 10);
    const laterGameplay = harness.system.getDebugSnapshot();
    const repeated = harness.system.requestConversation(
      'dialogue:repeat',
      npc,
      undefined,
      resolveConversationCameraProfile('close'),
    );
    update(harness, 60);
    expect(harness.system.getDebugSnapshot().activeConversationProfileId).toBe(
      'close',
    );
    repeated.release();
    update(harness, 60);
    const repeatedRestore = harness.system.getDebugSnapshot();
    expectVectorClose(repeatedRestore.position, laterGameplay.position);
    expectVectorClose(repeatedRestore.target, laterGameplay.target);
  });

  it('restores gameplay on cancellation and remains finite without a valid target', () => {
    const harness = createHarness();
    const gameplay = harness.system.getDebugSnapshot();
    const handle = harness.system.requestConversation('dialogue', undefined, {
      id: 'camera.invalid',
      position: { x: Number.NaN, y: 0, z: 0 },
      lookAt: { x: 0, y: 0, z: 0 },
    });
    update(harness, 60);
    expectFiniteCamera(harness.camera);
    handle.cancel();
    update(harness, 60);
    expect(harness.system.getDebugSnapshot().yaw).toBe(gameplay.yaw);
    expect(harness.system.mode).toBe('gameplay');
  });

  it('shortens for obstructions and smoothly recovers after clearance', () => {
    const harness = createHarness();
    const desired = harness.system.getDebugSnapshot().desiredDistance;
    harness.collision.cameraFraction = 0.4;
    update(harness);
    const obstructed = harness.system.getDebugSnapshot().actualDistance;
    expect(obstructed).toBeLessThan(desired);

    harness.collision.cameraFraction = 1;
    update(harness, 5);
    const delayed = harness.system.getDebugSnapshot().actualDistance;
    expect(delayed).toBeCloseTo(obstructed);
    update(harness, 120);
    const recovered = harness.system.getDebugSnapshot().actualDistance;
    expect(recovered).toBeGreaterThan(obstructed);
    expect(recovered).toBeCloseTo(desired, 2);
  });
});

function expectFiniteCamera(camera: PerspectiveCamera): void {
  expect(camera.position.toArray().every(Number.isFinite)).toBe(true);
  expect(camera.quaternion.toArray().every(Number.isFinite)).toBe(true);
}

function expectVectorClose(
  actual: { readonly x: number; readonly y: number; readonly z: number },
  expected: { readonly x: number; readonly y: number; readonly z: number },
): void {
  expect(actual.x).toBeCloseTo(expected.x, 5);
  expect(actual.y).toBeCloseTo(expected.y, 5);
  expect(actual.z).toBeCloseTo(expected.z, 5);
}
