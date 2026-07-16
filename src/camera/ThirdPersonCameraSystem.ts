import { MathUtils, Vector3 } from 'three';
import type { PerspectiveCamera } from 'three';
import type { GameSystem } from '../core/lifecycle';
import type { FrameTime } from '../core/time';
import type { GameContext } from '../game/GameRuntime';
import type { InputReader, PointerInputReader } from '../input/InputSystem';
import type { CollisionWorld } from '../physics/CollisionWorld';
import type { PlayerControllerSystem } from '../player/PlayerControllerSystem';

export interface ThirdPersonCameraConfig {
  readonly targetHeight: number;
  readonly minPitch: number;
  readonly maxPitch: number;
  readonly initialPitch: number;
  readonly initialYaw: number;
  readonly minDistance: number;
  readonly maxDistance: number;
  readonly initialDistance: number;
  readonly orbitSensitivity: number;
  readonly zoomSensitivity: number;
  readonly followSharpness: number;
  readonly distanceSharpness: number;
  readonly recenterDelay: number;
  readonly recenterSharpness: number;
  readonly collisionRadius: number;
  readonly collisionPadding: number;
  readonly teleportSnapDistance: number;
}

export const defaultThirdPersonCameraConfig: ThirdPersonCameraConfig = {
  targetHeight: 1.35,
  minPitch: MathUtils.degToRad(-65),
  maxPitch: MathUtils.degToRad(25),
  initialPitch: MathUtils.degToRad(-18),
  initialYaw: Math.PI,
  minDistance: 2.2,
  maxDistance: 9,
  initialDistance: 5.5,
  orbitSensitivity: 0.0025,
  zoomSensitivity: 0.006,
  followSharpness: 12,
  distanceSharpness: 15,
  recenterDelay: 1.5,
  recenterSharpness: 2.5,
  collisionRadius: 0.22,
  collisionPadding: 0.12,
  teleportSnapDistance: 12,
};

export interface ThirdPersonCameraDebugSnapshot {
  readonly active: boolean;
  readonly position: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly target: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly distance: number;
  readonly safetyMinDistance: number;
  readonly safetyMaxDistance: number;
  readonly obstructed: boolean;
}

export class ThirdPersonCameraSystem implements GameSystem {
  public readonly id = 'third-person-camera';
  public readonly updateMode = 'always' as const;
  public obstructed = false;

  private input: InputReader | undefined;
  private state: GameContext['state'] | undefined;
  private yaw: number;
  private pitch: number;
  private desiredDistance: number;
  private currentDistance: number;
  private secondsSinceOrbit = 0;
  private initializedTarget = false;
  private readonly target = new Vector3();
  private readonly desiredPosition = new Vector3();

  public constructor(
    private readonly camera: PerspectiveCamera,
    private readonly pointer: PointerInputReader,
    private readonly player: PlayerControllerSystem,
    private readonly collision: CollisionWorld,
    public readonly config: ThirdPersonCameraConfig = defaultThirdPersonCameraConfig,
  ) {
    this.yaw = config.initialYaw;
    this.pitch = config.initialPitch;
    this.desiredDistance = config.initialDistance;
    this.currentDistance = config.initialDistance;
  }

  public init(context: GameContext): void {
    this.input = context.input;
    this.state = context.state;
    this.snapToPlayer();
  }

  public getYaw(): number {
    return this.yaw;
  }

  public getDebugSnapshot(): ThirdPersonCameraDebugSnapshot {
    return {
      active: this.initializedTarget,
      position: {
        x: this.camera.position.x,
        y: this.camera.position.y,
        z: this.camera.position.z,
      },
      target: { x: this.target.x, y: this.target.y, z: this.target.z },
      distance: this.camera.position.distanceTo(this.target),
      safetyMinDistance:
        this.config.collisionRadius + this.config.collisionPadding,
      safetyMaxDistance: this.config.maxDistance,
      obstructed: this.obstructed,
    };
  }

  public update(time: FrameTime): void {
    const playerPosition = this.player.movement.position;
    const rawTarget = new Vector3(
      playerPosition.x,
      playerPosition.y + this.config.targetHeight,
      playerPosition.z,
    );
    if (
      !this.initializedTarget ||
      this.target.distanceTo(rawTarget) > this.config.teleportSnapDistance
    ) {
      this.target.copy(rawTarget);
      this.initializedTarget = true;
    } else {
      this.target.lerp(
        rawTarget,
        smoothingFactor(this.config.followSharpness, time.delta),
      );
    }

    const acceptsInput = this.state?.current === 'playing';
    const pointerDelta = this.pointer.consumePointerDelta();
    const orbiting =
      acceptsInput &&
      (this.pointer.isPointerLocked() ||
        this.input?.isDown('cameraOrbit') === true);
    if (orbiting && (pointerDelta.x !== 0 || pointerDelta.y !== 0)) {
      this.yaw -= pointerDelta.x * this.config.orbitSensitivity;
      this.pitch = MathUtils.clamp(
        this.pitch - pointerDelta.y * this.config.orbitSensitivity,
        this.config.minPitch,
        this.config.maxPitch,
      );
      this.secondsSinceOrbit = 0;
    } else if (acceptsInput) {
      this.secondsSinceOrbit += time.delta;
    }
    if (acceptsInput && pointerDelta.wheel !== 0) {
      this.desiredDistance = MathUtils.clamp(
        this.desiredDistance + pointerDelta.wheel * this.config.zoomSensitivity,
        this.config.minDistance,
        this.config.maxDistance,
      );
    }

    const recenterRequested = this.input?.isDown('cameraRecenter') === true;
    if (
      acceptsInput &&
      (recenterRequested ||
        this.secondsSinceOrbit >= this.config.recenterDelay) &&
      this.player.movement.velocity.lengthSq() > 0.2
    ) {
      const behindPlayer = this.player.movement.facingYaw + Math.PI;
      this.yaw = dampAngle(
        this.yaw,
        behindPlayer,
        this.config.recenterSharpness,
        time.delta,
      );
    }

    const horizontalDistance = Math.cos(this.pitch) * this.desiredDistance;
    this.desiredPosition.set(
      this.target.x + Math.sin(this.yaw) * horizontalDistance,
      this.target.y - Math.sin(this.pitch) * this.desiredDistance,
      this.target.z + Math.cos(this.yaw) * horizontalDistance,
    );
    const cast = this.collision.castCamera(
      this.target,
      this.desiredPosition,
      this.config.collisionRadius,
    );
    this.obstructed = cast.obstructed;
    const collisionDistance = Math.max(
      this.config.collisionRadius + this.config.collisionPadding,
      this.desiredDistance * cast.fraction - this.config.collisionPadding,
    );
    if (collisionDistance < this.currentDistance) {
      this.currentDistance = collisionDistance;
    } else {
      this.currentDistance = MathUtils.lerp(
        this.currentDistance,
        collisionDistance,
        smoothingFactor(this.config.distanceSharpness, time.delta),
      );
    }

    const distanceRatio = this.currentDistance / this.desiredDistance;
    this.camera.position.lerpVectors(
      this.target,
      this.desiredPosition,
      distanceRatio,
    );
    this.camera.lookAt(this.target);
  }

  public snapToPlayer(): void {
    const position = this.player.movement.position;
    this.target.set(
      position.x,
      position.y + this.config.targetHeight,
      position.z,
    );
    this.initializedTarget = true;
    this.currentDistance = this.desiredDistance;
    const horizontalDistance = Math.cos(this.pitch) * this.currentDistance;
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * horizontalDistance,
      this.target.y - Math.sin(this.pitch) * this.currentDistance,
      this.target.z + Math.cos(this.yaw) * horizontalDistance,
    );
    this.camera.lookAt(this.target);
  }
}

function smoothingFactor(sharpness: number, delta: number): number {
  return 1 - Math.exp(-sharpness * delta);
}

function dampAngle(
  current: number,
  target: number,
  sharpness: number,
  delta: number,
): number {
  const difference =
    MathUtils.euclideanModulo(target - current + Math.PI, Math.PI * 2) -
    Math.PI;
  return current + difference * smoothingFactor(sharpness, delta);
}
