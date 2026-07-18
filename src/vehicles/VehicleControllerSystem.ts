import { EventBus } from '../core/events';
import type { GameSystem } from '../core/lifecycle';
import type { FrameTime } from '../core/time';
import type { GameContext } from '../game/GameRuntime';
import type { InputReader } from '../input/InputSystem';
import type { InteractionSystem } from '../interactions/InteractionSystem';
import type { CollisionWorld } from '../physics/CollisionWorld';
import type { PlayerControllerSystem } from '../player/PlayerControllerSystem';
import type { TrafficSystem } from '../traffic/TrafficSystem';
import {
  trafficVehicleCatalog,
  type TrafficVehicleDefinition,
} from '../traffic/TrafficVehicleCatalog';
import { normalizeVehicleModel } from '../traffic/TrafficSystem';
import type { GameAssetLoader, ModelInstance } from '../assets/AssetLoader';
import type {
  GameplayCameraFocusHandle,
  ThirdPersonCameraSystem,
} from '../camera/ThirdPersonCameraSystem';
import { Group, MathUtils, Vector3 } from 'three';
import type { Scene } from 'three';

export type VehicleControlMode = 'on-foot' | 'driving';

export interface VehicleSnapshot {
  readonly mode: VehicleControlMode;
  readonly vehicleId: string;
  readonly vehicleLabel: string;
  readonly occupantId: 'player' | undefined;
  readonly position: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly yaw: number;
  readonly speed: number;
  readonly grounded: boolean;
  readonly groundColliderId: string;
  readonly blocked: boolean;
  readonly blockedBy: string | undefined;
  readonly exitAvailable: boolean;
  readonly recoveryCount: number;
  readonly ownership: {
    readonly movement: 'player' | 'vehicle';
    readonly camera: 'gameplay' | 'vehicle-focus';
    readonly input: 'on-foot' | 'vehicle';
  };
}

export interface VehicleEvents {
  changed: VehicleSnapshot;
  entered: VehicleSnapshot;
  exited: VehicleSnapshot;
  recovered: VehicleSnapshot;
}

export const defaultVehicleConfig = {
  acceleration: 7.5,
  braking: 11,
  reverseAcceleration: 4.5,
  coastDrag: 3,
  maximumForwardSpeed: 13,
  maximumReverseSpeed: 4.5,
  steeringRate: 1.45,
  collisionRadius: 0.86,
  trafficClearance: 2.25,
  seatHeight: 0.7,
  recoveryFallHeight: -2,
} as const;

// Close to the default arrival, but outside its interaction/roll envelope.
const vehicleSpawn = new Vector3(6, 0.02, 19);
const vehicleSpawnYaw = Math.PI;
const vehicleShape = {
  radius: defaultVehicleConfig.collisionRadius,
  height: 1.7,
  stepHeight: 0.26,
  maxSlopeAngle: Math.PI / 5,
  groundSnapDistance: 0.45,
} as const;

/** Sole authority for on-foot/vehicle transfer and seated driving state. */
export class VehicleControllerSystem implements GameSystem<GameContext> {
  public readonly id = 'vehicle-controller';
  public readonly events = new EventBus<VehicleEvents>();
  public readonly root = new Group();

  private readonly definition: TrafficVehicleDefinition =
    trafficVehicleCatalog[0]!;
  private readonly position = vehicleSpawn.clone();
  private readonly lastGroundedPosition = vehicleSpawn.clone();
  private input: InputReader | undefined;
  private state: GameContext['state'] | undefined;
  private instance: ModelInstance | undefined;
  private unregisterInteraction: (() => void) | undefined;
  private unregisterDynamicCapsule: (() => void) | undefined;
  private cameraFocus: GameplayCameraFocusHandle | undefined;
  private mode: VehicleControlMode = 'on-foot';
  private speed = 0;
  private yaw = vehicleSpawnYaw;
  private lastGroundedYaw = vehicleSpawnYaw;
  private grounded = true;
  private groundColliderId = 'world-floor';
  private blocked = false;
  private blockedBy: string | undefined;
  private recoveryCount = 0;
  private exitAvailable = true;
  private interactionEnablePending = false;

  public constructor(
    private readonly scene: Scene,
    private readonly assets: GameAssetLoader,
    private readonly collision: CollisionWorld,
    private readonly player: PlayerControllerSystem,
    private readonly interactions: InteractionSystem,
    private readonly traffic: TrafficSystem,
    private readonly camera: ThirdPersonCameraSystem,
  ) {
    this.root.name = 'player-vehicle:ashfall-pickup';
    this.root.position.copy(this.position);
    this.root.rotation.y = this.yaw;
  }

  public async init(context: GameContext): Promise<void> {
    this.input = context.input;
    this.state = context.state;
    try {
      this.instance = await this.assets.instantiateModel(
        this.definition.assetId,
      );
      normalizeVehicleModel(this.instance.scene, this.definition);
      this.instance.scene.traverse((child) => {
        if ('isMesh' in child) {
          const mesh = child as { castShadow: boolean; receiveShadow: boolean };
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });
      this.root.add(this.instance.scene);
      this.scene.add(this.root);
      this.unregisterDynamicCapsule = this.collision.registerDynamicCapsule?.({
        id: 'dynamic.player-vehicle',
        radius: defaultVehicleConfig.collisionRadius,
        height: this.definition.presentation.maximumHeight,
        position: () => this.position,
      });
      this.unregisterInteraction = this.interactions.register({
        id: 'vehicle.ashfall-pickup',
        prompt: `Enter ${this.definition.label}`,
        location: () => this.position,
        rangeProfile: 'use',
        targetRadius: this.definition.presentation.maximumWidth / 2,
        priority: 2,
        requiredStates: ['playing'],
        repeatable: true,
        isAvailable: () => this.mode === 'on-foot',
        interact: () => {
          this.enter();
        },
      });
      this.publish('changed');
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  public update(time: FrameTime): void {
    if (this.mode === 'on-foot' && this.interactionEnablePending) {
      this.interactionEnablePending = false;
      this.interactions.setEnabled('vehicle.ashfall-pickup', true);
      this.publish('changed');
      return;
    }
    if (this.mode !== 'driving' || this.state?.current !== 'playing') return;
    if (this.input?.isUiFocused?.() === true) return;
    if (this.input?.wasPressed('interact')) {
      this.exit();
      return;
    }
    if (this.input?.wasPressed('recoverVehicle')) {
      this.recover();
      return;
    }
    this.simulate(time.delta);
  }

  public enter(): boolean {
    if (this.mode !== 'on-foot' || this.state?.current !== 'playing')
      return false;
    this.mode = 'driving';
    this.interactionEnablePending = false;
    this.speed = 0;
    this.player.setControlEnabled(false);
    this.player.setPresentationVisible(false);
    this.interactions.setEnabled('vehicle.ashfall-pickup', false);
    this.cameraFocus = this.camera.requestGameplayFocus({
      owner: 'vehicle-controller',
      maxDistance: 6,
    });
    this.syncSeatedPlayer();
    this.publish('entered');
    return true;
  }

  public exit(): boolean {
    if (this.mode !== 'driving') return false;
    const exit = this.findSafeExit();
    this.exitAvailable = exit !== undefined;
    if (!exit) {
      this.publish('changed');
      return false;
    }
    this.mode = 'on-foot';
    this.speed = 0;
    this.cameraFocus?.release();
    this.cameraFocus = undefined;
    this.player.teleport(exit, this.yaw);
    this.player.setPresentationVisible(true);
    this.player.setControlEnabled(true);
    // InteractionSystem runs later in the frame and observes the same action
    // edge. Restore entry on the next frame so one edge transfers only once.
    this.interactionEnablePending = true;
    this.publish('exited');
    return true;
  }

  public recover(): void {
    this.position.copy(this.lastGroundedPosition);
    this.yaw = this.lastGroundedYaw;
    this.speed = 0;
    this.grounded = true;
    this.blocked = false;
    this.blockedBy = undefined;
    this.recoveryCount += 1;
    this.syncTransforms();
    this.publish('recovered');
  }

  public getSnapshot(): VehicleSnapshot {
    return {
      mode: this.mode,
      vehicleId: this.definition.id,
      vehicleLabel: this.definition.label,
      occupantId: this.mode === 'driving' ? 'player' : undefined,
      position: { x: this.position.x, y: this.position.y, z: this.position.z },
      yaw: this.yaw,
      speed: this.speed,
      grounded: this.grounded,
      groundColliderId: this.groundColliderId,
      blocked: this.blocked,
      blockedBy: this.blockedBy,
      exitAvailable: this.exitAvailable,
      recoveryCount: this.recoveryCount,
      ownership: {
        movement: this.mode === 'driving' ? 'vehicle' : 'player',
        camera: this.mode === 'driving' ? 'vehicle-focus' : 'gameplay',
        input: this.mode === 'driving' ? 'vehicle' : 'on-foot',
      },
    };
  }

  public dispose(): void {
    if (this.mode === 'driving') {
      this.mode = 'on-foot';
      this.cameraFocus?.release();
      this.player.setPresentationVisible(true);
      this.player.setControlEnabled(true);
    }
    this.cameraFocus = undefined;
    this.unregisterInteraction?.();
    this.unregisterInteraction = undefined;
    this.unregisterDynamicCapsule?.();
    this.unregisterDynamicCapsule = undefined;
    this.root.removeFromParent();
    this.root.clear();
    this.instance?.dispose();
    this.instance = undefined;
    this.input = undefined;
    this.state = undefined;
    this.events.clear();
  }

  private simulate(delta: number): void {
    const throttle = Number(this.input?.isDown('moveForward') === true);
    const brakeReverse = Number(this.input?.isDown('moveBackward') === true);
    const steering =
      Number(this.input?.isDown('moveLeft') === true) -
      Number(this.input?.isDown('moveRight') === true);
    if (throttle > 0) {
      this.speed += defaultVehicleConfig.acceleration * delta;
    } else if (brakeReverse > 0) {
      this.speed +=
        (this.speed > 0
          ? -defaultVehicleConfig.braking
          : -defaultVehicleConfig.reverseAcceleration) * delta;
    } else {
      this.speed = approachZero(
        this.speed,
        defaultVehicleConfig.coastDrag * delta,
      );
    }
    this.speed = MathUtils.clamp(
      this.speed,
      -defaultVehicleConfig.maximumReverseSpeed,
      defaultVehicleConfig.maximumForwardSpeed,
    );
    if (steering !== 0 && Math.abs(this.speed) > 0.05) {
      const direction = Math.sign(this.speed);
      const speedFactor = MathUtils.clamp(Math.abs(this.speed) / 5, 0.25, 1);
      this.yaw +=
        steering *
        direction *
        defaultVehicleConfig.steeringRate *
        speedFactor *
        delta;
    }

    const displacement = new Vector3(
      Math.sin(this.yaw) * this.speed * delta,
      -Math.max(0.5, 9.8 * delta),
      Math.cos(this.yaw) * this.speed * delta,
    );
    const candidate = this.position.clone().add(displacement);
    const trafficBlock = this.nearTraffic(candidate);
    const movement = this.collision.moveCharacter(
      this.position,
      displacement,
      vehicleShape,
      this.grounded,
    );
    this.blocked = movement.blocked || trafficBlock !== undefined;
    this.blockedBy = trafficBlock ?? movement.blockedColliderIds[0];
    if (trafficBlock) {
      this.speed = 0;
    } else {
      this.position.copy(movement.position);
      if (movement.blocked) this.speed = 0;
    }
    this.grounded = trafficBlock ? this.grounded : movement.grounded;
    this.groundColliderId = movement.groundColliderId;
    if (this.grounded) {
      this.lastGroundedPosition.copy(this.position);
      this.lastGroundedYaw = this.yaw;
    }
    if (
      !isFiniteVector(this.position) ||
      this.position.y < defaultVehicleConfig.recoveryFallHeight
    ) {
      this.recover();
      return;
    }
    this.syncTransforms();
    this.exitAvailable = this.findSafeExit() !== undefined;
    this.publish('changed');
  }

  private nearTraffic(candidate: Readonly<Vector3>): string | undefined {
    return this.traffic
      .getSnapshot()
      .vehicles.find(
        ({ x, z }) =>
          Math.hypot(candidate.x - x, candidate.z - z) <
          defaultVehicleConfig.trafficClearance,
      )?.id;
  }

  private findSafeExit(): Vector3 | undefined {
    const right = new Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const forward = new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const candidates = [
      this.position.clone().addScaledVector(right, 1.75),
      this.position.clone().addScaledVector(right, -1.75),
      this.position.clone().addScaledVector(forward, -2.8),
    ];
    for (const candidate of candidates) {
      candidate.y = this.position.y + 0.4;
      const result = this.collision.moveCharacter(
        candidate,
        new Vector3(0, -1, 0),
        this.player.movement.config,
        true,
      );
      if (
        result.grounded &&
        !result.blocked &&
        !this.nearTraffic(result.position)
      ) {
        return result.position;
      }
    }
    return undefined;
  }

  private syncTransforms(): void {
    this.root.position.set(
      this.position.x,
      this.position.y + this.definition.presentation.groundClearance,
      this.position.z,
    );
    this.root.rotation.y = this.yaw;
    if (this.mode === 'driving') this.syncSeatedPlayer();
  }

  private syncSeatedPlayer(): void {
    this.player.teleport(
      new Vector3(
        this.position.x,
        this.position.y + defaultVehicleConfig.seatHeight,
        this.position.z,
      ),
      this.yaw,
    );
    this.player.movement.velocity.set(
      Math.sin(this.yaw) * this.speed,
      0,
      Math.cos(this.yaw) * this.speed,
    );
  }

  private publish(type: keyof VehicleEvents): void {
    this.events.emit(type, this.getSnapshot());
  }
}

function approachZero(value: number, amount: number): number {
  if (Math.abs(value) <= amount) return 0;
  return value - Math.sign(value) * amount;
}

function isFiniteVector(value: Readonly<Vector3>): boolean {
  return (
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z)
  );
}
