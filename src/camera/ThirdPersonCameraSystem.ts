import { MathUtils, Vector3 } from 'three';
import type { PerspectiveCamera } from 'three';
import type { GameSystem } from '../core/lifecycle';
import type { FrameTime } from '../core/time';
import type { GameContext } from '../game/GameRuntime';
import type { InputReader, PointerInputReader } from '../input/InputSystem';
import type { CollisionWorld } from '../physics/CollisionWorld';
import type { PlayerControllerSystem } from '../player/PlayerControllerSystem';
import type {
  WorldPose,
  WorldPoseSource,
  WorldPosition,
} from '../world/Spatial';
import type { CinematicAnchorDefinition } from '../world/LevelDefinition';
import type { AccessibilityPreferenceStore } from '../accessibility/AccessibilityPreferences';
import {
  CameraPreferenceStore,
  cameraPreferenceLimits,
  defaultCameraPreferences,
} from './CameraPreferences';
import type {
  CameraPreferences,
  CameraShoulderSide,
} from './CameraPreferences';
import {
  calculateConversationFraming,
  resolveConversationCameraProfile,
} from './ConversationCameraProfile';
import type { ConversationCameraProfile } from './ConversationCameraProfile';

export interface ThirdPersonCameraConfig {
  readonly targetHeight: number;
  readonly minPitch: number;
  readonly maxPitch: number;
  readonly initialPitch: number;
  readonly initialYaw: number;
  readonly minDistance: number;
  readonly maxDistance: number;
  readonly initialDistance: number;
  readonly zoomSensitivity: number;
  readonly keyboardOrbitSpeed: number;
  readonly gamepadOrbitSpeed: number;
  readonly zoomSharpness: number;
  readonly followSharpness: number;
  readonly collisionEnterSharpness: number;
  readonly collisionRecoverySharpness: number;
  readonly collisionRecoveryDelay: number;
  readonly collisionJitterTolerance: number;
  readonly recenterDelay: number;
  readonly recenterSharpness: number;
  readonly shoulderOffset: number;
  readonly shoulderSharpness: number;
  readonly collisionRadius: number;
  readonly collisionPadding: number;
  readonly teleportSnapDistance: number;
  readonly modeTransitionDuration: number;
  readonly directedCameraSharpness: number;
}

export const defaultThirdPersonCameraConfig: ThirdPersonCameraConfig = {
  targetHeight: 1.35,
  minPitch: MathUtils.degToRad(-65),
  maxPitch: MathUtils.degToRad(25),
  initialPitch: MathUtils.degToRad(-18),
  // The default player spawn faces into the district along -Z. Keeping the
  // camera on +Z places it behind that authored facing direction.
  initialYaw: 0,
  minDistance: cameraPreferenceLimits.minFollowDistance,
  maxDistance: cameraPreferenceLimits.maxFollowDistance,
  initialDistance: defaultCameraPreferences.followDistance,
  zoomSensitivity: 0.006,
  keyboardOrbitSpeed: MathUtils.degToRad(105),
  gamepadOrbitSpeed: MathUtils.degToRad(150),
  zoomSharpness: 12,
  followSharpness: 12,
  collisionEnterSharpness: 30,
  collisionRecoverySharpness: 8,
  collisionRecoveryDelay: 0.12,
  collisionJitterTolerance: 0.04,
  recenterDelay: 1.5,
  recenterSharpness: 2.5,
  shoulderOffset: 0.75,
  shoulderSharpness: 10,
  collisionRadius: 0.22,
  collisionPadding: 0.12,
  teleportSnapDistance: 12,
  modeTransitionDuration: 0.65,
  directedCameraSharpness: 9,
};

export type CameraMode = 'gameplay' | 'conversation' | 'cinematic';

export const cameraControlPriorities = {
  gameplay: 0,
  conversation: 50,
  cinematic: 100,
} as const;

export interface CameraAnchor {
  readonly id?: string;
  readonly position: WorldPosition;
  readonly lookAt: WorldPosition;
  readonly fieldOfView?: number;
}

export interface CameraControlRequest {
  readonly owner: string;
  readonly mode: Exclude<CameraMode, 'gameplay'>;
  readonly target?: WorldPoseSource;
  readonly anchor?: CameraAnchor;
  readonly conversationProfile?: ConversationCameraProfile;
  readonly priority?: number;
}

export interface CameraControlHandle {
  readonly owner: string;
  readonly active: boolean;
  release(): void;
  cancel(): void;
}

export class CameraOwnershipError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'CameraOwnershipError';
  }
}

export interface ThirdPersonCameraDebugSnapshot {
  readonly active: boolean;
  readonly mode: CameraMode;
  readonly owner: string;
  readonly position: WorldPosition;
  readonly target: WorldPosition;
  readonly yaw: number;
  readonly pitch: number;
  readonly desiredDistance: number;
  readonly actualDistance: number;
  /** Backward-compatible alias used by the browser smoke bridge. */
  readonly distance: number;
  readonly safetyMinDistance: number;
  readonly safetyMaxDistance: number;
  readonly shoulderSide: CameraShoulderSide;
  readonly shoulderOffset: number;
  readonly activeAnchorId: string | undefined;
  readonly activeConversationProfileId: string | undefined;
  readonly transitionProgress: number;
  readonly obstructed: boolean;
  readonly gameplayReturnPosition: WorldPosition | undefined;
  readonly gameplayReturnTarget: WorldPosition | undefined;
  /** Requested pose before the shared collision query shortens its sweep. */
  readonly unobstructedPosition: WorldPosition;
  /** Requested pose after the shared collision query, before smoothing. */
  readonly adjustedPosition: WorldPosition;
  readonly sweepStart: WorldPosition;
  readonly obstructionColliderId: string | undefined;
}

interface InternalRequest extends CameraControlRequest {
  readonly token: symbol;
  readonly priority: number;
}

interface GameplayViewState {
  readonly owner: 'gameplay';
  readonly yaw: number;
  readonly pitch: number;
  readonly smoothedDistance: number;
  readonly actualDistance: number;
  readonly shoulderOffset: number;
  readonly fieldOfView: number;
  readonly cameraOffset: Vector3;
  readonly targetOffset: Vector3;
}

const UP = new Vector3(0, 1, 0);

/** Coordinates gameplay, conversation, and future cinematic use of one camera. */
export class ThirdPersonCameraSystem implements GameSystem {
  public readonly id = 'third-person-camera';
  public readonly updateMode = 'always' as const;
  public obstructed = false;

  private input: InputReader | undefined;
  private state: GameContext['state'] | undefined;
  private yaw: number;
  private pitch: number;
  private smoothedDistance: number;
  private actualDistance: number;
  private shoulderOffset = 0;
  private secondsSinceOrbit = 0;
  private obstructionClearTime = 0;
  private initializedTarget = false;
  private transitionProgress = 1;
  private readonly target = new Vector3();
  private readonly desiredPosition = new Vector3();
  private readonly desiredTarget = new Vector3();
  private readonly unobstructedPosition = new Vector3();
  private obstructionColliderId: string | undefined;
  private readonly transitionStartPosition = new Vector3();
  private readonly transitionStartTarget = new Vector3();
  private transitionStartFov: number;
  private gameplayFieldOfView: number;
  private readonly requests = new Map<symbol, InternalRequest>();
  private activeRequest: InternalRequest | undefined;
  private savedGameplayView: GameplayViewState | undefined;
  private restoringGameplayView: GameplayViewState | undefined;

  public constructor(
    private readonly camera: PerspectiveCamera,
    private readonly pointer: PointerInputReader,
    private readonly player: PlayerControllerSystem,
    private readonly collision: CollisionWorld,
    public readonly config: ThirdPersonCameraConfig = defaultThirdPersonCameraConfig,
    public readonly preferences: CameraPreferenceStore = new CameraPreferenceStore(
      undefined,
      {
        ...defaultCameraPreferences,
        followDistance: config.initialDistance,
      },
    ),
    private readonly accessibility?: AccessibilityPreferenceStore,
  ) {
    this.preferences.update({
      followDistance: clampZoom(
        this.preferences.current.followDistance,
        config,
      ),
    });
    this.yaw = config.initialYaw;
    this.pitch = clampPitch(config.initialPitch, config);
    this.smoothedDistance = clampZoom(
      preferences.current.followDistance,
      config,
    );
    this.actualDistance = this.smoothedDistance;
    this.transitionStartFov = camera.fov;
    this.gameplayFieldOfView = camera.fov;
  }

  public init(context: GameContext): void {
    this.input = context.input;
    this.state = context.state;
    this.snapToPlayer();
  }

  public getYaw(): number {
    return this.yaw;
  }

  public get mode(): CameraMode {
    return this.activeRequest?.mode ?? 'gameplay';
  }

  public get owner(): string {
    return this.activeRequest?.owner ?? 'gameplay';
  }

  public setPreferences(update: Partial<CameraPreferences>): CameraPreferences {
    const bounded = {
      ...update,
      ...(update.followDistance === undefined
        ? {}
        : { followDistance: clampZoom(update.followDistance, this.config) }),
    };
    return this.preferences.update(bounded);
  }

  public switchShoulder(): CameraShoulderSide {
    const side =
      this.preferences.current.shoulderSide === 'right' ? 'left' : 'right';
    this.setPreferences({ shoulderSide: side });
    return side;
  }

  public requestCamera(request: CameraControlRequest): CameraControlHandle {
    if (request.owner.trim().length === 0) {
      throw new CameraOwnershipError('Camera requests require a named owner');
    }
    const priority = request.priority ?? cameraControlPriorities[request.mode];
    const active = this.activeRequest;
    if (
      active &&
      active.owner !== request.owner &&
      priority <= active.priority
    ) {
      throw new CameraOwnershipError(
        `Camera is owned by "${active.owner}" at priority ${active.priority}; ` +
          `"${request.owner}" requested priority ${priority}`,
      );
    }

    for (const [token, existing] of this.requests) {
      if (existing.owner === request.owner) this.requests.delete(token);
    }
    if (this.requests.size === 0 && !this.savedGameplayView) {
      this.savedGameplayView = this.captureGameplayView();
      this.restoringGameplayView = undefined;
    }
    const token = Symbol(request.owner);
    const internal: InternalRequest = { ...request, priority, token };
    this.requests.set(token, internal);
    this.selectActiveRequest();

    const isActive = (): boolean => this.activeRequest?.token === token;
    return {
      owner: request.owner,
      get active(): boolean {
        return isActive();
      },
      release: () => this.releaseRequest(token),
      cancel: () => this.releaseRequest(token),
    };
  }

  public requestConversation(
    owner: string,
    target?: WorldPoseSource,
    anchor?: CameraAnchor,
    conversationProfile: ConversationCameraProfile = resolveConversationCameraProfile(),
  ): CameraControlHandle {
    return this.requestCamera({
      owner,
      mode: 'conversation',
      target,
      anchor,
      conversationProfile,
    });
  }

  public getDebugSnapshot(): ThirdPersonCameraDebugSnapshot {
    const playerFocus = this.getPlayerFocus();
    const gameplayReturnPosition = this.savedGameplayView
      ? playerFocus.clone().add(this.savedGameplayView.cameraOffset)
      : undefined;
    const gameplayReturnTarget = this.savedGameplayView
      ? playerFocus.clone().add(this.savedGameplayView.targetOffset)
      : undefined;
    return {
      active: this.initializedTarget,
      mode: this.mode,
      owner: this.owner,
      position: vectorSnapshot(this.camera.position),
      target: vectorSnapshot(this.target),
      yaw: this.yaw,
      pitch: this.pitch,
      desiredDistance: this.preferences.current.followDistance,
      actualDistance: this.actualDistance,
      distance: this.actualDistance,
      safetyMinDistance:
        this.config.collisionRadius + this.config.collisionPadding,
      safetyMaxDistance: this.config.maxDistance,
      shoulderSide: this.preferences.current.shoulderSide,
      shoulderOffset: this.shoulderOffset,
      activeAnchorId: this.activeRequest?.anchor?.id,
      activeConversationProfileId:
        this.activeRequest?.mode === 'conversation'
          ? (this.activeRequest.conversationProfile?.id ?? 'default')
          : undefined,
      transitionProgress: this.transitionProgress,
      obstructed: this.obstructed,
      gameplayReturnPosition: gameplayReturnPosition
        ? vectorSnapshot(gameplayReturnPosition)
        : undefined,
      gameplayReturnTarget: gameplayReturnTarget
        ? vectorSnapshot(gameplayReturnTarget)
        : undefined,
      unobstructedPosition: vectorSnapshot(this.unobstructedPosition),
      adjustedPosition: vectorSnapshot(this.desiredPosition),
      sweepStart: vectorSnapshot(this.desiredTarget),
      obstructionColliderId: this.obstructionColliderId,
    };
  }

  public update(time: FrameTime): void {
    const pointerDelta = this.pointer.consumePointerDelta();
    const gameplayInput =
      this.mode === 'gameplay' &&
      this.state?.current === 'playing' &&
      this.pointer.isUiFocused?.() !== true;
    if (!gameplayInput && this.pointer.isPointerLocked()) {
      this.pointer.releasePointerLock?.();
    }

    if (this.activeRequest) {
      this.updateDirectedCamera(time, this.activeRequest);
    } else {
      this.updateGameplayCamera(time, pointerDelta, gameplayInput);
    }
  }

  public snapToPlayer(): void {
    const position = this.player.movement.position;
    this.target.set(
      position.x,
      position.y + this.config.targetHeight,
      position.z,
    );
    this.initializedTarget = true;
    this.actualDistance = this.smoothedDistance;
    this.shoulderOffset =
      shoulderSign(this.preferences.current.shoulderSide) *
      this.config.shoulderOffset;
    this.calculateGameplayPose(this.target, 1 / 60);
    this.camera.position.copy(this.desiredPosition);
    this.camera.lookAt(this.target);
  }

  public dispose(): void {
    this.pointer.releasePointerLock?.();
    this.requests.clear();
    this.activeRequest = undefined;
    this.savedGameplayView = undefined;
    this.restoringGameplayView = undefined;
    this.input = undefined;
    this.state = undefined;
  }

  private updateGameplayCamera(
    time: FrameTime,
    pointerDelta: {
      readonly x: number;
      readonly y: number;
      readonly wheel: number;
    },
    acceptsInput: boolean,
  ): void {
    const switchShoulderRequested =
      acceptsInput && this.input?.wasPressed('cameraSwitchShoulder') === true;
    const restoreInterrupted =
      acceptsInput &&
      (pointerDelta.x !== 0 ||
        pointerDelta.y !== 0 ||
        pointerDelta.wheel !== 0 ||
        this.input?.isDown('cameraOrbitLeft') === true ||
        this.input?.isDown('cameraOrbitRight') === true ||
        this.input?.isDown('cameraRecenter') === true ||
        switchShoulderRequested ||
        Math.hypot(
          this.player.movement.velocity.x,
          this.player.movement.velocity.z,
        ) > 0.05);
    if (
      this.restoringGameplayView &&
      (this.transitionProgress < 1 || !restoreInterrupted)
    ) {
      const playerFocus = this.getPlayerFocus();
      this.desiredPosition
        .copy(playerFocus)
        .add(this.restoringGameplayView.cameraOffset);
      this.desiredTarget
        .copy(playerFocus)
        .add(this.restoringGameplayView.targetOffset);
      this.applyPose(
        this.desiredPosition,
        this.desiredTarget,
        this.restoringGameplayView.fieldOfView,
        time.delta,
        this.config.followSharpness,
      );
      return;
    }
    this.restoringGameplayView = undefined;
    const preferences = this.preferences.current;
    const orbiting =
      acceptsInput &&
      (this.pointer.isPointerLocked() ||
        this.input?.isDown('cameraOrbit') === true);
    if (orbiting && (pointerDelta.x !== 0 || pointerDelta.y !== 0)) {
      this.yaw -= pointerDelta.x * preferences.horizontalSensitivity;
      const yDirection = preferences.invertY ? 1 : -1;
      this.pitch = clampPitch(
        this.pitch +
          pointerDelta.y * preferences.verticalSensitivity * yDirection,
        this.config,
      );
      this.secondsSinceOrbit = 0;
    } else if (acceptsInput) {
      const keyboardOrbit =
        Number(this.input?.isDown('cameraOrbitRight') === true) -
        Number(this.input?.isDown('cameraOrbitLeft') === true);
      const gamepadX = this.input?.readAxis?.('cameraX') ?? 0;
      const gamepadY = this.input?.readAxis?.('cameraY') ?? 0;
      if (keyboardOrbit !== 0 || gamepadX !== 0 || gamepadY !== 0) {
        this.yaw +=
          (keyboardOrbit * this.config.keyboardOrbitSpeed +
            gamepadX * this.config.gamepadOrbitSpeed) *
          time.delta;
        const yDirection = preferences.invertY ? -1 : 1;
        this.pitch = clampPitch(
          this.pitch -
            gamepadY * this.config.gamepadOrbitSpeed * yDirection * time.delta,
          this.config,
        );
        this.secondsSinceOrbit = 0;
      } else {
        this.secondsSinceOrbit += time.delta;
      }
    }

    if (acceptsInput && pointerDelta.wheel !== 0) {
      this.setPreferences({
        followDistance:
          preferences.followDistance +
          pointerDelta.wheel * this.config.zoomSensitivity,
      });
    }
    if (switchShoulderRequested) {
      this.switchShoulder();
    }

    const currentPreferences = this.preferences.current;
    const explicitRecenter = this.input?.isDown('cameraRecenter') === true;
    const automaticRecenter =
      currentPreferences.automaticRecenter &&
      this.accessibility?.current.reducedCameraMotion !== true &&
      this.secondsSinceOrbit >= this.config.recenterDelay &&
      isMovingCameraForward(this.player.movement.velocity, this.yaw);
    const recenterRequested = explicitRecenter || automaticRecenter;
    if (
      acceptsInput &&
      recenterRequested &&
      this.player.movement.velocity.lengthSq() > 0.2
    ) {
      this.yaw = dampAngle(
        this.yaw,
        this.player.movement.facingYaw + Math.PI,
        this.config.recenterSharpness,
        time.delta,
      );
    }

    const reducedMotion =
      this.accessibility?.current.reducedCameraMotion === true;
    const followDistance = clampZoom(
      currentPreferences.followDistance,
      this.config,
    );
    const shoulderOffset =
      shoulderSign(currentPreferences.shoulderSide) *
      this.config.shoulderOffset;
    this.smoothedDistance = reducedMotion
      ? followDistance
      : damp(
          this.smoothedDistance,
          followDistance,
          this.config.zoomSharpness,
          time.delta,
        );
    this.shoulderOffset = reducedMotion
      ? shoulderOffset
      : damp(
          this.shoulderOffset,
          shoulderOffset,
          this.config.shoulderSharpness,
          time.delta,
        );

    const playerPosition = this.player.movement.position;
    this.desiredTarget.set(
      playerPosition.x,
      playerPosition.y + this.config.targetHeight,
      playerPosition.z,
    );
    if (
      !this.initializedTarget ||
      this.target.distanceTo(this.desiredTarget) >
        this.config.teleportSnapDistance
    ) {
      this.target.copy(this.desiredTarget);
      this.initializedTarget = true;
    } else if (this.transitionProgress >= 1) {
      this.target.lerp(
        this.desiredTarget,
        reducedMotion
          ? 1
          : smoothingFactor(this.config.followSharpness, time.delta),
      );
    }
    this.calculateGameplayPose(this.desiredTarget, time.delta);
    this.applyPose(
      this.desiredPosition,
      this.desiredTarget,
      this.gameplayFieldOfView,
      time.delta,
      this.config.followSharpness,
    );
  }

  private calculateGameplayPose(
    target: Readonly<Vector3>,
    delta: number,
  ): void {
    const horizontalDistance = Math.cos(this.pitch) * this.smoothedDistance;
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);
    this.desiredPosition.set(
      target.x +
        Math.sin(this.yaw) * horizontalDistance +
        rightX * this.shoulderOffset,
      target.y - Math.sin(this.pitch) * this.smoothedDistance,
      target.z +
        Math.cos(this.yaw) * horizontalDistance +
        rightZ * this.shoulderOffset,
    );
    this.unobstructedPosition.copy(this.desiredPosition);
    this.applyCollision(target, this.desiredPosition, delta);
  }

  private updateDirectedCamera(
    time: FrameTime,
    request: InternalRequest,
  ): void {
    const anchor = validAnchor(request.anchor) ? request.anchor : undefined;
    if (anchor) {
      this.desiredPosition.copy(asVector(anchor.position));
      this.desiredTarget.copy(asVector(anchor.lookAt));
    } else {
      this.calculateConversationPose(
        request.target?.getWorldPose(),
        request.conversationProfile ?? resolveConversationCameraProfile(),
      );
    }
    this.unobstructedPosition.copy(this.desiredPosition);
    this.applyDirectedCollision(this.desiredTarget, this.desiredPosition);
    this.actualDistance = this.desiredPosition.distanceTo(this.desiredTarget);
    const desiredFov =
      anchor?.fieldOfView && isFiniteNumber(anchor.fieldOfView)
        ? MathUtils.clamp(anchor.fieldOfView, 15, 120)
        : request.mode === 'conversation' &&
            request.conversationProfile?.fieldOfView
          ? MathUtils.clamp(request.conversationProfile.fieldOfView, 15, 120)
          : this.gameplayFieldOfView;
    this.applyPose(
      this.desiredPosition,
      this.desiredTarget,
      desiredFov,
      time.delta,
      this.config.directedCameraSharpness,
    );
  }

  private calculateConversationPose(
    targetPose: WorldPose | undefined,
    profile: ConversationCameraProfile,
  ): void {
    const playerPose = this.player.getWorldPose();
    const playerPosition = validPose(playerPose)
      ? asVector(playerPose.position)
      : this.player.movement.position.clone();
    const playerFocus = playerPosition.clone().addScaledVector(UP, 1.35);
    if (validPose(targetPose)) {
      const framing = calculateConversationFraming(
        playerPose,
        targetPose,
        profile,
        this.preferences.current.shoulderSide,
        this.camera.aspect,
      );
      const alternate = calculateConversationFraming(
        playerPose,
        targetPose,
        profile,
        this.preferences.current.shoulderSide === 'right' ? 'left' : 'right',
        this.camera.aspect,
      );
      const preferredClearance = this.collision.castCamera(
        framing.lookAt,
        framing.position,
        this.config.collisionRadius,
      ).fraction;
      const alternateClearance = this.collision.castCamera(
        alternate.lookAt,
        alternate.position,
        this.config.collisionRadius,
      ).fraction;
      const selected =
        alternateClearance > preferredClearance + 0.05 ? alternate : framing;
      this.desiredTarget.copy(selected.lookAt);
      this.desiredPosition.copy(selected.position);
      return;
    }

    const forward = validPose(playerPose)
      ? asVector(playerPose.forward)
      : new Vector3(0, 0, 1);
    forward.y = 0;
    if (forward.lengthSq() < Number.EPSILON) forward.set(0, 0, 1);
    forward.normalize();
    const side = new Vector3(-forward.z, 0, forward.x).multiplyScalar(
      shoulderSign(this.preferences.current.shoulderSide),
    );
    this.desiredTarget.copy(playerFocus);
    this.desiredPosition
      .copy(playerFocus)
      .addScaledVector(forward, -4)
      .addScaledVector(side, 1.1)
      .addScaledVector(UP, 0.8);
  }

  private applyCollision(
    from: Readonly<Vector3>,
    desired: Vector3,
    delta: number,
  ): void {
    const cast = this.collision.castCamera(
      from,
      desired,
      this.config.collisionRadius,
    );
    this.obstructionColliderId = cast.colliderId;
    const minimum = this.config.collisionRadius + this.config.collisionPadding;
    const collisionDistance = Math.max(
      minimum,
      this.smoothedDistance * cast.fraction - this.config.collisionPadding,
    );
    this.obstructed = cast.obstructed;
    if (cast.obstructed) {
      this.obstructionClearTime = 0;
      if (
        collisionDistance < this.actualDistance ||
        Math.abs(collisionDistance - this.actualDistance) >
          this.config.collisionJitterTolerance
      ) {
        this.actualDistance = Math.min(
          collisionDistance,
          damp(
            this.actualDistance,
            collisionDistance,
            this.config.collisionEnterSharpness,
            delta,
          ),
        );
      }
    } else {
      this.obstructionClearTime += delta;
      if (this.obstructionClearTime >= this.config.collisionRecoveryDelay) {
        this.actualDistance = damp(
          this.actualDistance,
          this.smoothedDistance,
          this.config.collisionRecoverySharpness,
          delta,
        );
      }
    }
    this.actualDistance = MathUtils.clamp(
      this.actualDistance,
      minimum,
      this.smoothedDistance,
    );
    const ratio =
      this.actualDistance / Math.max(this.smoothedDistance, minimum);
    desired.lerpVectors(from, desired, ratio);
  }

  private applyDirectedCollision(
    from: Readonly<Vector3>,
    desired: Vector3,
  ): void {
    const cast = this.collision.castCamera(
      from,
      desired,
      this.config.collisionRadius,
    );
    this.obstructionColliderId = cast.colliderId;
    this.obstructed = cast.obstructed;
    if (!cast.obstructed) return;
    const fullDistance = from.distanceTo(desired);
    const safeDistance = Math.max(
      this.config.collisionRadius + this.config.collisionPadding,
      fullDistance * cast.fraction - this.config.collisionPadding,
    );
    desired.lerpVectors(
      from,
      desired,
      safeDistance / Math.max(fullDistance, 0.001),
    );
  }

  private applyPose(
    desiredPosition: Readonly<Vector3>,
    desiredTarget: Readonly<Vector3>,
    desiredFov: number,
    delta: number,
    sharpness: number,
  ): void {
    if (!isFiniteVector(desiredPosition) || !isFiniteVector(desiredTarget)) {
      return;
    }
    if (this.accessibility?.current.reducedCameraMotion === true) {
      this.transitionProgress = 1;
      this.camera.position.copy(desiredPosition);
      this.target.copy(desiredTarget);
      this.camera.fov = desiredFov;
      this.camera.lookAt(this.target);
      this.camera.updateProjectionMatrix();
      return;
    }
    if (this.transitionProgress < 1) {
      this.transitionProgress = Math.min(
        1,
        this.transitionProgress + delta / this.config.modeTransitionDuration,
      );
      const amount = smoothStep(this.transitionProgress);
      this.camera.position.lerpVectors(
        this.transitionStartPosition,
        desiredPosition,
        amount,
      );
      this.target.lerpVectors(
        this.transitionStartTarget,
        desiredTarget,
        amount,
      );
      this.camera.fov = MathUtils.lerp(
        this.transitionStartFov,
        desiredFov,
        amount,
      );
    } else {
      const amount = smoothingFactor(sharpness, delta);
      this.camera.position.lerp(desiredPosition, amount);
      this.target.lerp(desiredTarget, amount);
      this.camera.fov = MathUtils.lerp(this.camera.fov, desiredFov, amount);
    }
    if (isFiniteVector(this.camera.position) && isFiniteVector(this.target)) {
      this.camera.lookAt(this.target);
      this.camera.updateProjectionMatrix();
    }
  }

  private releaseRequest(token: symbol): void {
    if (!this.requests.delete(token)) return;
    this.selectActiveRequest();
  }

  private selectActiveRequest(): void {
    const previous = this.activeRequest;
    this.activeRequest = [...this.requests.values()].sort(
      (a, b) => b.priority - a.priority,
    )[0];
    if (previous?.token === this.activeRequest?.token) return;
    if (!this.activeRequest && this.savedGameplayView) {
      this.restoreGameplayView(this.savedGameplayView);
      this.savedGameplayView = undefined;
    }
    this.beginTransition();
  }

  private beginTransition(): void {
    this.transitionStartPosition.copy(this.camera.position);
    this.transitionStartTarget.copy(this.target);
    this.transitionStartFov = this.camera.fov;
    this.transitionProgress = 0;
    if (this.activeRequest) this.pointer.releasePointerLock?.();
  }

  private captureGameplayView(): GameplayViewState {
    const playerFocus = this.getPlayerFocus();
    return {
      owner: 'gameplay',
      yaw: this.yaw,
      pitch: this.pitch,
      smoothedDistance: this.smoothedDistance,
      actualDistance: this.actualDistance,
      shoulderOffset: this.shoulderOffset,
      fieldOfView: this.camera.fov,
      cameraOffset: this.camera.position.clone().sub(playerFocus),
      targetOffset: this.target.clone().sub(playerFocus),
    };
  }

  private restoreGameplayView(view: GameplayViewState): void {
    this.yaw = view.yaw;
    this.pitch = view.pitch;
    this.smoothedDistance = view.smoothedDistance;
    this.actualDistance = view.actualDistance;
    this.shoulderOffset = view.shoulderOffset;
    this.gameplayFieldOfView = view.fieldOfView;
    this.restoringGameplayView = view;
    this.obstructionClearTime = 0;
  }

  private getPlayerFocus(): Vector3 {
    const position = this.player.movement.position;
    return new Vector3(
      position.x,
      position.y + this.config.targetHeight,
      position.z,
    );
  }
}

/** Backward/strafe movement must not implicitly orbit a camera the user owns. */
export function isMovingCameraForward(
  velocity: Readonly<Vector3>,
  cameraYaw: number,
): boolean {
  const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
  if (horizontalSpeed <= 1e-5) return false;
  const forwardX = -Math.sin(cameraYaw);
  const forwardZ = -Math.cos(cameraYaw);
  return (
    (velocity.x * forwardX + velocity.z * forwardZ) / horizontalSpeed > 0.5
  );
}

export function clampPitch(
  pitch: number,
  config: Pick<ThirdPersonCameraConfig, 'minPitch' | 'maxPitch'>,
): number {
  return MathUtils.clamp(
    Number.isFinite(pitch) ? pitch : 0,
    config.minPitch,
    config.maxPitch,
  );
}

export function clampZoom(
  distance: number,
  config: Pick<ThirdPersonCameraConfig, 'minDistance' | 'maxDistance'>,
): number {
  return MathUtils.clamp(
    Number.isFinite(distance) ? distance : config.minDistance,
    config.minDistance,
    config.maxDistance,
  );
}

export function cameraAnchorFromLevel(
  anchor: CinematicAnchorDefinition,
): CameraAnchor {
  const [x, y, z] = anchor.position;
  const [lookX, lookY, lookZ] = anchor.lookAt;
  return {
    id: anchor.id,
    position: { x, y, z },
    lookAt: { x: lookX, y: lookY, z: lookZ },
    ...(anchor.fieldOfView === undefined
      ? {}
      : { fieldOfView: anchor.fieldOfView }),
  };
}

function shoulderSign(side: CameraShoulderSide): number {
  return side === 'right' ? 1 : -1;
}

function smoothingFactor(sharpness: number, delta: number): number {
  return 1 - Math.exp(-sharpness * delta);
}

function damp(
  current: number,
  target: number,
  sharpness: number,
  delta: number,
): number {
  return MathUtils.lerp(current, target, smoothingFactor(sharpness, delta));
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

function smoothStep(value: number): number {
  return value * value * (3 - 2 * value);
}

function validPose(pose: WorldPose | undefined): pose is WorldPose {
  return Boolean(
    pose && isFinitePosition(pose.position) && isFinitePosition(pose.forward),
  );
}

function validAnchor(anchor: CameraAnchor | undefined): anchor is CameraAnchor {
  return Boolean(
    anchor &&
    isFinitePosition(anchor.position) &&
    isFinitePosition(anchor.lookAt),
  );
}

function isFinitePosition(value: WorldPosition): boolean {
  return (
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFiniteNumber(value.z)
  );
}

function isFiniteVector(value: Readonly<Vector3>): boolean {
  return isFinitePosition(value);
}

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

function asVector(value: WorldPosition): Vector3 {
  return new Vector3(value.x, value.y, value.z);
}

function vectorSnapshot(value: Readonly<Vector3>): WorldPosition {
  return { x: value.x, y: value.y, z: value.z };
}
