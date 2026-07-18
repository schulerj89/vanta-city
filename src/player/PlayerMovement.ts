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
  readonly movingStopSpeedThreshold: number;
  readonly runStateSpeedThreshold: number;
  readonly runStateExitSpeedThreshold: number;
  /** Time constant for the critically damped simulation/action heading. */
  readonly facingSmoothTime: number;
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
  movingStopSpeedThreshold: 0.08,
  runStateSpeedThreshold: 4.4,
  runStateExitSpeedThreshold: 3.8,
  facingSmoothTime: 0.24,
};

export interface SmoothedHeadingStep {
  readonly heading: number;
  readonly angularVelocity: number;
  readonly signedError: number;
  readonly active: boolean;
}

export interface KinematicMovementResult {
  readonly requestedDistance: number;
  readonly actualDistance: number;
  readonly blocked: boolean;
  readonly blockedColliderIds: readonly string[];
  readonly grounded: boolean;
  readonly groundColliderId: string;
}

/** Exact critically damped step for a fixed heading target over this frame. */
export function stepSmoothedHeading(
  heading: number,
  desiredHeading: number,
  angularVelocity: number,
  smoothTime: number,
  delta: number,
): SmoothedHeadingStep {
  if (delta <= 0) {
    const signedError = signedHeadingError(heading, desiredHeading);
    return {
      heading,
      angularVelocity,
      signedError,
      active: isHeadingSmoothingActive(signedError, angularVelocity),
    };
  }
  const omega = 2 / Math.max(0.001, smoothTime);
  const displacement = signedHeadingError(desiredHeading, heading);
  const decay = Math.exp(-omega * delta);
  const temporary = (angularVelocity + omega * displacement) * delta;
  const nextDisplacement = (displacement + temporary) * decay;
  const nextAngularVelocity = (angularVelocity - omega * temporary) * decay;
  const nextHeading = normalizeHeading(desiredHeading + nextDisplacement);
  const signedError = signedHeadingError(nextHeading, desiredHeading);
  return {
    heading: nextHeading,
    angularVelocity: nextAngularVelocity,
    signedError,
    active: isHeadingSmoothingActive(signedError, nextAngularVelocity),
  };
}

export function signedHeadingError(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export interface MovementStateInput {
  readonly grounded: boolean;
  readonly justLanded: boolean;
  readonly landingTimeRemaining: number;
  readonly horizontalSpeed: number;
  readonly movingSpeedThreshold: number;
  readonly movingStopSpeedThreshold?: number;
  readonly runStateSpeedThreshold: number;
  readonly runStateExitSpeedThreshold?: number;
  readonly previousState?: PlayerMovementState;
}

export function decideMovementState(
  input: MovementStateInput,
): PlayerMovementState {
  if (!input.grounded) return 'airborne';
  if (input.justLanded || input.landingTimeRemaining > 0) return 'landing';
  const movingThreshold =
    input.previousState === 'walking' || input.previousState === 'running'
      ? (input.movingStopSpeedThreshold ?? input.movingSpeedThreshold)
      : input.movingSpeedThreshold;
  if (input.horizontalSpeed < movingThreshold) return 'idle';
  const runThreshold =
    input.previousState === 'running'
      ? (input.runStateExitSpeedThreshold ?? input.runStateSpeedThreshold)
      : input.runStateSpeedThreshold;
  return input.horizontalSpeed >= runThreshold ? 'running' : 'walking';
}

export class PlayerMovementSimulation {
  public readonly position = new Vector3();
  public readonly velocity = new Vector3();
  public readonly groundNormal = new Vector3(0, 1, 0);
  public grounded = false;
  public groundColliderId = 'world-floor';
  public state: PlayerMovementState = 'idle';
  public facingYaw = 0;
  public desiredFacingYaw = 0;
  public facingTurnRate = 0;
  public facingError = 0;
  public facingSmoothingActive = false;
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

    this.updateFacing(delta);
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
      movingStopSpeedThreshold: this.config.movingStopSpeedThreshold,
      runStateSpeedThreshold: this.config.runStateSpeedThreshold,
      runStateExitSpeedThreshold: this.config.runStateExitSpeedThreshold,
      previousState: this.state,
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
    this.desiredFacingYaw = facingYaw;
    this.facingTurnRate = 0;
    this.facingError = 0;
    this.facingSmoothingActive = false;
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

  public haltHorizontalMovement(): void {
    this.velocity.x = 0;
    this.velocity.z = 0;
    this.desiredFacingYaw = this.facingYaw;
    this.facingTurnRate = 0;
    this.facingError = 0;
    this.facingSmoothingActive = false;
    if (this.grounded) this.state = 'idle';
  }

  /** Moves through the authoritative character collider without root motion. */
  public moveKinematicGrounded(
    direction: Readonly<Vector3>,
    distance: number,
  ): KinematicMovementResult {
    const requestedDistance = Math.max(0, distance);
    const before = this.position.clone();
    this.haltHorizontalMovement();
    const displacement = new Vector3(direction.x, 0, direction.z);
    if (displacement.lengthSq() > 0) displacement.normalize();
    displacement.multiplyScalar(requestedDistance);
    const result = this.collision.moveCharacter(
      this.position,
      displacement,
      this.config,
      this.grounded,
    );
    this.position.copy(result.position);
    this.grounded = result.grounded;
    this.groundNormal.copy(result.groundNormal);
    this.groundColliderId = result.groundColliderId;
    this.blocked = result.blocked;
    this.state = result.grounded ? 'idle' : 'airborne';
    return {
      requestedDistance,
      actualDistance: Math.hypot(
        this.position.x - before.x,
        this.position.z - before.z,
      ),
      blocked: result.blocked,
      blockedColliderIds: result.blockedColliderIds,
      grounded: result.grounded,
      groundColliderId: result.groundColliderId,
    };
  }

  private updateFacing(delta: number): void {
    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (horizontalSpeed < this.config.movingSpeedThreshold) {
      this.desiredFacingYaw = this.facingYaw;
      this.facingTurnRate = 0;
      this.facingError = 0;
      this.facingSmoothingActive = false;
      return;
    }
    this.desiredFacingYaw = Math.atan2(this.velocity.x, this.velocity.z);
    const step = stepSmoothedHeading(
      this.facingYaw,
      this.desiredFacingYaw,
      this.facingTurnRate,
      this.config.facingSmoothTime,
      delta,
    );
    this.facingYaw = step.heading;
    this.facingTurnRate = step.angularVelocity;
    this.facingError = step.signedError;
    this.facingSmoothingActive = step.active;
  }
}

function normalizeHeading(heading: number): number {
  return Math.atan2(Math.sin(heading), Math.cos(heading));
}

function isHeadingSmoothingActive(error: number, turnRate: number): boolean {
  return (
    Math.abs(error) > MathUtils.degToRad(0.25) ||
    Math.abs(turnRate) > MathUtils.degToRad(1)
  );
}

function moveTowards(
  current: number,
  target: number,
  maxDelta: number,
): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}
