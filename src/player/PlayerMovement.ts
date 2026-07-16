import { MathUtils, Vector3 } from 'three';
import type { CollisionWorld, CharacterShape } from '../physics/CollisionWorld';
import type { PlayerIntent } from './PlayerIntent';

export type PlayerMovementState =
  'idle' | 'walking' | 'running' | 'airborne' | 'landing';

export interface PlayerMovementConfig extends CharacterShape {
  readonly walkSpeed: number;
  readonly runSpeed: number;
  readonly groundAcceleration: number;
  readonly groundDeceleration: number;
  readonly airAcceleration: number;
  readonly gravity: number;
  readonly jumpSpeed: number;
  readonly terminalVelocity: number;
  readonly landingDuration: number;
  readonly movingSpeedThreshold: number;
  readonly runStateSpeedThreshold: number;
}

export const defaultPlayerMovementConfig: PlayerMovementConfig = {
  radius: 0.38,
  height: 1.8,
  stepHeight: 0.38,
  maxSlopeAngle: MathUtils.degToRad(48),
  groundSnapDistance: 0.18,
  walkSpeed: 3.2,
  runSpeed: 6.2,
  groundAcceleration: 22,
  groundDeceleration: 28,
  airAcceleration: 7,
  gravity: 24,
  jumpSpeed: 8.2,
  terminalVelocity: 30,
  landingDuration: 0.12,
  movingSpeedThreshold: 0.15,
  runStateSpeedThreshold: 4.2,
};

export interface MovementStateInput {
  readonly grounded: boolean;
  readonly justLanded: boolean;
  readonly landingTimeRemaining: number;
  readonly horizontalSpeed: number;
  readonly movingSpeedThreshold: number;
  readonly runStateSpeedThreshold: number;
}

export function decideMovementState(
  input: MovementStateInput,
): PlayerMovementState {
  if (!input.grounded) return 'airborne';
  if (input.justLanded || input.landingTimeRemaining > 0) return 'landing';
  if (input.horizontalSpeed < input.movingSpeedThreshold) return 'idle';
  return input.horizontalSpeed >= input.runStateSpeedThreshold
    ? 'running'
    : 'walking';
}

export class PlayerMovementSimulation {
  public readonly position = new Vector3();
  public readonly velocity = new Vector3();
  public readonly groundNormal = new Vector3(0, 1, 0);
  public grounded = false;
  public groundColliderId = 'world-floor';
  public state: PlayerMovementState = 'idle';
  public facingYaw = 0;
  public blocked = false;

  private landingTimeRemaining = 0;

  public constructor(
    private readonly collision: CollisionWorld,
    public readonly config: PlayerMovementConfig = defaultPlayerMovementConfig,
  ) {}

  public simulate(
    intent: PlayerIntent,
    cameraYaw: number,
    delta: number,
  ): void {
    if (delta <= 0) return;
    const forwardX = -Math.sin(cameraYaw);
    const forwardZ = -Math.cos(cameraYaw);
    const rightX = Math.cos(cameraYaw);
    const rightZ = -Math.sin(cameraYaw);
    const desiredDirection = new Vector3(
      rightX * intent.move.x + forwardX * intent.move.y,
      0,
      rightZ * intent.move.x + forwardZ * intent.move.y,
    );
    if (desiredDirection.lengthSq() > 1) desiredDirection.normalize();

    const desiredSpeed = intent.sprint
      ? this.config.runSpeed
      : this.config.walkSpeed;
    // Preserve authored speed along a slope rather than applying the full
    // speed horizontally and gaining extra distance from the vertical rise.
    const slopeRise = this.grounded
      ? -(
          this.groundNormal.x * desiredDirection.x +
          this.groundNormal.z * desiredDirection.z
        ) / Math.max(this.groundNormal.y, 1e-5)
      : 0;
    const slopeSpeedScale = 1 / Math.hypot(1, slopeRise);
    const targetX = desiredDirection.x * desiredSpeed * slopeSpeedScale;
    const targetZ = desiredDirection.z * desiredSpeed * slopeSpeedScale;
    const hasMovementIntent = desiredDirection.lengthSq() > 0;
    const acceleration = this.grounded
      ? hasMovementIntent
        ? this.config.groundAcceleration
        : this.config.groundDeceleration
      : this.config.airAcceleration;
    this.velocity.x = moveTowards(
      this.velocity.x,
      targetX,
      acceleration * delta,
    );
    this.velocity.z = moveTowards(
      this.velocity.z,
      targetZ,
      acceleration * delta,
    );

    if (hasMovementIntent) {
      this.facingYaw = Math.atan2(desiredDirection.x, desiredDirection.z);
    }
    if (intent.jump && this.grounded) {
      this.velocity.y = this.config.jumpSpeed;
      this.grounded = false;
    } else if (this.grounded) {
      this.velocity.y = 0;
    } else {
      this.velocity.y = Math.max(
        -this.config.terminalVelocity,
        this.velocity.y - this.config.gravity * delta,
      );
    }

    const wasGrounded = this.grounded;
    const result = this.collision.moveCharacter(
      this.position,
      this.velocity.clone().multiplyScalar(delta),
      this.config,
      wasGrounded,
    );
    this.position.copy(result.position);
    this.grounded = result.grounded;
    this.groundNormal.copy(result.groundNormal);
    this.groundColliderId = result.groundColliderId;
    this.blocked = result.blocked;
    if (result.hitCeiling && this.velocity.y > 0) this.velocity.y = 0;
    if (this.grounded && this.velocity.y < 0) this.velocity.y = 0;

    const justLanded = !wasGrounded && this.grounded;
    if (justLanded) this.landingTimeRemaining = this.config.landingDuration;
    else
      this.landingTimeRemaining = Math.max(
        0,
        this.landingTimeRemaining - delta,
      );
    this.state = decideMovementState({
      grounded: this.grounded,
      justLanded,
      landingTimeRemaining: this.landingTimeRemaining,
      horizontalSpeed: Math.hypot(this.velocity.x, this.velocity.z),
      movingSpeedThreshold: this.config.movingSpeedThreshold,
      runStateSpeedThreshold: this.config.runStateSpeedThreshold,
    });
  }

  public teleport(
    position: Readonly<Vector3>,
    facingYaw = this.facingYaw,
  ): void {
    this.position.copy(position);
    this.velocity.set(0, 0, 0);
    this.groundNormal.set(0, 1, 0);
    this.groundColliderId = 'world-floor';
    this.grounded = false;
    this.blocked = false;
    this.landingTimeRemaining = 0;
    this.state = 'airborne';
    this.facingYaw = facingYaw;
    const settled = this.collision.moveCharacter(
      this.position,
      new Vector3(0, -this.config.groundSnapDistance, 0),
      this.config,
      true,
    );
    this.position.copy(settled.position);
    this.grounded = settled.grounded;
    this.groundNormal.copy(settled.groundNormal);
    this.groundColliderId = settled.groundColliderId;
    this.state = this.grounded ? 'idle' : 'airborne';
  }
}

function moveTowards(
  current: number,
  target: number,
  maxDelta: number,
): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}
