import { Vector2, Vector3 } from 'three';
import { EventBus } from '../core/events';
import type { GameState } from '../core/gameState';
import type { GameSystem } from '../core/lifecycle';
import type { FrameTime } from '../core/time';
import type { GameObjectWorld } from '../entities/GameObjectWorld';
import type { GameContext } from '../game/GameRuntime';
import type { InputReader } from '../input/InputSystem';
import type { CollisionWorld } from '../physics/CollisionWorld';
import type {
  WorldPose,
  WorldPoseSource,
  WorldPosition,
} from '../world/Spatial';
import { idlePlayerIntent, readPlayerIntent } from './PlayerIntent';
import {
  PlayerMovementSimulation,
  defaultPlayerMovementConfig,
} from './PlayerMovement';
import type {
  PlayerMovementConfig,
  PlayerMovementState,
} from './PlayerMovement';
import { PlaceholderPlayerVisual } from './PlayerVisual';
import type { PlayerVisual } from './PlayerVisual';
import type {
  CharacterActionName,
  CharacterActionRequestState,
} from '../characters/CharacterActions';
import { HealthComponent } from '../health/Health';
import { CharacterEquipment } from '../equipment/CharacterEquipment';
import type { CharacterLocomotionSnapshot } from '../characters/CharacterLocomotionPolicy';
import type { EquipmentId } from '../equipment/EquipmentDefinition';
import type { WeaponDamageTarget } from '../combat/WeaponDamage';

const idleCharacterActionState: CharacterActionRequestState = {
  active: undefined,
  busy: false,
  lastRequested: undefined,
  lastSource: undefined,
  lastAccepted: false,
  lastRejection: undefined,
  busyRejectionCount: 0,
  sequence: 0,
  activeNormalizedTime: 0,
  lastImpact: undefined,
  lastImpactSource: undefined,
  impactSequence: 0,
  impactNormalizedTime: undefined,
  completedSequenceAtImpact: undefined,
  lastCompleted: undefined,
  lastCompletedSource: undefined,
  completedSequence: 0,
  completionRelease: undefined,
};

export interface PlayerActionEvents {
  'character-action:started': {
    readonly action: CharacterActionName;
    readonly source: string | undefined;
    readonly sequence: number;
  };
  'character-action:impact': {
    readonly action: CharacterActionName;
    readonly source: string | undefined;
    readonly sequence: number;
    readonly normalizedTime: number;
  };
  'character-action:completed': {
    readonly action: CharacterActionName;
    readonly source: string | undefined;
    readonly sequence: number;
  };
}

export interface PlayerDebugSnapshot {
  readonly velocity: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly grounded: boolean;
  readonly groundColliderId: string;
  readonly groundNormal: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly movementState: PlayerMovementState;
  readonly blocked: boolean;
  readonly desiredFacingYaw: number;
  readonly facingYaw: number;
  readonly facingError: number;
  readonly facingTurnRate: number;
  readonly facingSmoothingActive: boolean;
  readonly presentationFacingYaw: number;
  readonly runMode: boolean;
  readonly actionBusy: boolean;
  readonly depleted: boolean;
  readonly equipment: ReturnType<CharacterEquipment['getSnapshot']>;
  readonly roll: RollDebugSnapshot;
  readonly fire: FireDebugSnapshot;
  readonly locomotion: PlayerLocomotionSnapshot;
}

export const playerRollConfig = {
  distance: 3,
  movementDuration: 0.75,
} as const;

export interface RollDebugSnapshot {
  readonly active: boolean;
  readonly direction: { readonly x: number; readonly z: number } | undefined;
  readonly source: 'movement-intent' | 'facing-fallback' | undefined;
  readonly requestedDistance: number;
  readonly actualDistance: number;
  readonly blocked: boolean;
  readonly blockedBy: string | undefined;
  readonly latestRejection: string | undefined;
}

export interface FireDebugSnapshot {
  readonly holding: boolean;
  readonly cadenceSeconds: number | undefined;
  readonly cooldownRemaining: number;
  readonly acceptedShotCount: number;
  readonly reloadCount: number;
  readonly latestRejection: string | undefined;
}

export interface PlayerLocomotionSnapshot {
  readonly animation: CharacterLocomotionSnapshot | undefined;
  readonly movement: PlayerMovementState;
  readonly horizontalSpeed: number;
  readonly desiredFacingYaw: number;
  readonly facingYaw: number;
  readonly turning: boolean;
  readonly runMode: boolean;
  readonly equippedItem: EquipmentId | undefined;
  readonly firearm: 'holstered' | 'ready' | 'firing';
  readonly actionLocked: boolean;
}

interface ActiveRoll {
  readonly direction: Vector3;
  readonly source: 'movement-intent' | 'facing-fallback';
  elapsed: number;
  requestedDistance: number;
  actualDistance: number;
  blocked: boolean;
  blockedBy: string | undefined;
}

const controlledStates: readonly GameState[] = ['playing'];

export class PlayerControllerSystem
  implements GameSystem, WorldPoseSource, WeaponDamageTarget
{
  public readonly id = 'player-controller';
  public readonly movement: PlayerMovementSimulation;
  public readonly events = new EventBus<PlayerActionEvents>();
  public readonly health = new HealthComponent('player', 100);

  public readonly ownerId = 'player';

  public get enabled(): boolean {
    return this.health.alive;
  }

  private readonly spawnPosition: Vector3;
  private input: InputReader | undefined;
  private state: GameContext['state'] | undefined;
  private controlEnabled = true;
  private visualAdded = false;
  private runMode = false;
  private nextPunchSide: 'Left' | 'Right' = 'Left';
  private nextKickSide: 'Left' | 'Right' = 'Left';
  private publishedImpactSequence = 0;
  private publishedCompletionSequence = 0;
  private presentationFacingTarget: WorldPoseSource | undefined;
  private presentationFacingYaw: number;
  private unsubscribeHealth: (() => void) | undefined;
  private unsubscribeState: (() => void) | undefined;
  private unregisterQueryCapsule: (() => void) | undefined;
  private activeRoll: ActiveRoll | undefined;
  private lastRoll: ActiveRoll | undefined;
  private lastRollRejection: string | undefined;
  private fireHolding = false;
  private fireCooldownRemaining = 0;
  private acceptedShotCount = 0;
  private reloadCount = 0;
  private lastFireRejection: string | undefined;
  private restoredHealthBeforeInit: number | undefined;
  public readonly equipment: CharacterEquipment;

  public constructor(
    private readonly objects: GameObjectWorld,
    private readonly collision: CollisionWorld,
    spawnPosition = new Vector3(0, 0, 7),
    config: PlayerMovementConfig = defaultPlayerMovementConfig,
    private readonly cameraYaw: () => number = () => 0,
    public readonly visual: PlayerVisual = new PlaceholderPlayerVisual(),
    private readonly spawnFacingYaw = 0,
    equipment?: CharacterEquipment,
  ) {
    this.spawnPosition = spawnPosition.clone();
    this.movement = new PlayerMovementSimulation(collision, config);
    this.presentationFacingYaw = spawnFacingYaw;
    this.equipment =
      equipment ?? visual.equipment ?? new CharacterEquipment('player');
  }

  public async init(context: GameContext): Promise<void> {
    this.input = context.input;
    this.state = context.state;
    await this.visual.init?.();
    this.visual.setDepleted?.(!this.health.alive);
    this.unsubscribeHealth = this.health.events.on('changed', ({ alive }) => {
      this.visual.setDepleted?.(!alive);
      if (!alive) this.movement.haltHorizontalMovement();
      if (!alive) {
        this.finishRoll();
        this.cancelTransientActions('depleted');
      }
    });
    this.unsubscribeState = context.events.on(
      'game-state:changed',
      ({ to }) => {
        if (to !== 'playing') this.cancelTransientActions(`state:${to}`);
      },
    );
    this.objects.add(this.visual);
    this.visualAdded = true;
    if (this.restoredHealthBeforeInit === undefined) {
      this.reset();
    } else {
      this.teleport(this.spawnPosition, this.spawnFacingYaw);
      this.health.set(this.restoredHealthBeforeInit, 'campaign:restore');
      this.cancelTransientActions('campaign:restore');
      this.restoredHealthBeforeInit = undefined;
    }
    this.unregisterQueryCapsule = this.collision.registerDynamicCapsule?.({
      id: 'dynamic.player',
      radius: this.movement.config.radius,
      height: this.movement.config.height,
      position: () => this.movement.position,
    });
  }

  public update(time: FrameTime): void {
    const acceptsInput =
      this.controlEnabled &&
      this.health.alive &&
      this.state !== undefined &&
      controlledStates.includes(this.state.current) &&
      this.input?.isUiFocused?.() !== true;
    if (acceptsInput && this.input?.wasPressed('toggleRun')) {
      this.runMode = !this.runMode;
    }
    if (acceptsInput && this.input?.wasPressed('punch')) {
      const action = `punch${this.nextPunchSide}` as CharacterActionName;
      if (this.triggerCharacterAction(action, 'keyboard:punch')) {
        this.nextPunchSide = this.nextPunchSide === 'Left' ? 'Right' : 'Left';
      }
    }
    if (acceptsInput && this.input?.wasPressed('kick')) {
      const action = `kick${this.nextKickSide}` as CharacterActionName;
      if (this.triggerCharacterAction(action, 'keyboard:kick')) {
        this.nextKickSide = this.nextKickSide === 'Left' ? 'Right' : 'Left';
      }
    }
    if (acceptsInput && this.input?.wasPressed('roll')) {
      const intent = this.input
        ? readPlayerIntent(this.input, this.runMode).move
        : new Vector2();
      this.startRoll(intent, 'keyboard:roll');
    }
    if (acceptsInput && this.input?.wasPressed('quickbar1')) {
      this.toggleQuickbarSlot(1);
    }
    if (acceptsInput && this.input?.wasPressed('quickbar2')) {
      this.toggleQuickbarSlot(2);
    }
    this.updateEquipmentInput(acceptsInput, time.delta);
    const actionBeforeMovement = this.getCharacterActionState().active;
    const intent =
      acceptsInput && this.input && actionBeforeMovement !== 'roll'
        ? readPlayerIntent(this.input, this.runMode)
        : idlePlayerIntent;
    if (acceptsInput && this.activeRoll && !this.activeRoll.blocked) {
      this.advanceRoll(time.delta);
    } else if (!this.activeRoll || !acceptsInput) {
      this.movement.simulate(intent, this.cameraYaw(), time.delta);
    }
    this.visual.sync(this.movement, time.delta);
    const actionState = this.getCharacterActionState();
    if (
      actionState.impactSequence > this.publishedImpactSequence &&
      actionState.lastImpact &&
      actionState.impactNormalizedTime !== undefined
    ) {
      this.publishedImpactSequence = actionState.impactSequence;
      this.events.emit('character-action:impact', {
        action: actionState.lastImpact,
        source: actionState.lastImpactSource,
        sequence: actionState.impactSequence,
        normalizedTime: actionState.impactNormalizedTime,
      });
    }
    if (
      actionState.completedSequence > this.publishedCompletionSequence &&
      actionState.lastCompleted
    ) {
      this.publishedCompletionSequence = actionState.completedSequence;
      this.events.emit('character-action:completed', {
        action: actionState.lastCompleted,
        source: actionState.lastCompletedSource,
        sequence: actionState.completedSequence,
      });
      if (actionState.lastCompleted === 'roll') this.finishRoll();
    }
    this.updatePresentationFacing();
  }

  public setControlEnabled(enabled: boolean): void {
    this.controlEnabled = enabled;
  }

  public isControlEnabled(): boolean {
    return this.controlEnabled;
  }

  /** Presentation handoff for seated/cinematic ownership; simulation persists. */
  public setPresentationVisible(visible: boolean): void {
    this.visual.object3d.visible = visible;
  }

  public isPresentationVisible(): boolean {
    return this.visual.object3d.visible;
  }

  /** Authoritative entry point for short, presentation-only character actions. */
  public triggerCharacterAction(
    action: CharacterActionName,
    source = 'player-controller',
  ): boolean {
    if (action === 'roll') return this.startRoll(new Vector2(), source);
    return this.admitCharacterAction(action, source);
  }

  private admitCharacterAction(
    action: CharacterActionName,
    source: string,
  ): boolean {
    const accepted =
      this.visual.triggerCharacterAction?.(action, source) ?? false;
    if (accepted) {
      const state = this.getCharacterActionState();
      this.events.emit('character-action:started', {
        action,
        source,
        sequence: state.sequence,
      });
    }
    return accepted;
  }

  public useEquippedItem(source = 'player-controller'): boolean {
    if (!this.health.alive) {
      this.lastFireRejection = 'depleted';
      return false;
    }
    const accepted = this.equipment.useWithTrigger(
      (action, requestSource) =>
        this.admitCharacterAction(action, requestSource),
      source,
    );
    if (accepted) {
      this.acceptedShotCount += Number(
        this.equipment.equipped?.id === 'handgun',
      );
      this.lastFireRejection = undefined;
    } else {
      this.lastFireRejection = this.equipment.getSnapshot().lastRejection;
    }
    return accepted;
  }

  public reloadEquippedItem(source = 'player-controller'): boolean {
    if (!this.health.alive || this.state?.current !== 'playing') {
      this.lastFireRejection = !this.health.alive ? 'depleted' : 'state-gated';
      return false;
    }
    if (this.getCharacterActionState().busy || this.fireHolding) {
      this.lastFireRejection = 'reload-busy';
      return false;
    }
    const itemId = this.equipment.equipped?.id;
    if (!itemId || !this.equipment.reload(itemId, source)) {
      this.lastFireRejection = this.equipment.getSnapshot().lastRejection;
      return false;
    }
    this.reloadCount += 1;
    this.lastFireRejection = undefined;
    return true;
  }

  public toggleQuickbarSlot(slot: number): boolean {
    if (
      !this.health.alive ||
      this.getCharacterActionState().busy ||
      this.fireHolding
    )
      return false;
    return this.equipment.toggleQuickbarSlot(slot);
  }

  public getCharacterActionState(): CharacterActionRequestState {
    return this.visual.getCharacterActionState?.() ?? idleCharacterActionState;
  }

  /** Stable public projection for weapon presentation/integration consumers. */
  public getLocomotionSnapshot(): PlayerLocomotionSnapshot {
    const action = this.getCharacterActionState();
    const equippedItem = this.equipment.equipped?.id;
    return {
      animation: this.visual.getLocomotionSnapshot?.(),
      movement: this.movement.state,
      horizontalSpeed: Math.hypot(
        this.movement.velocity.x,
        this.movement.velocity.z,
      ),
      desiredFacingYaw: this.movement.desiredFacingYaw,
      facingYaw: this.movement.facingYaw,
      turning: this.movement.facingSmoothingActive,
      runMode: this.runMode,
      equippedItem,
      firearm:
        equippedItem !== 'handgun'
          ? 'holstered'
          : action.active === 'gunFire' || this.fireHolding
            ? 'firing'
            : 'ready',
      actionLocked: action.busy,
    };
  }

  public getPlayerPosition(): WorldPosition {
    const { x, y, z } = this.movement.position;
    return { x, y, z };
  }

  public getWorldPose(): WorldPose {
    return {
      position: this.getPlayerPosition(),
      radius: this.movement.config.radius,
      forward: {
        x: Math.sin(this.movement.facingYaw),
        y: 0,
        z: Math.cos(this.movement.facingYaw),
      },
    };
  }

  public getHurtVolume(): { readonly radius: number; readonly height: number } {
    return {
      radius: this.movement.config.radius,
      height: this.movement.config.height,
    };
  }

  public getCollisionIgnoreIds(): readonly string[] {
    return ['dynamic.player'];
  }

  /** Faces presentation toward a live subject without changing simulation yaw. */
  public setPresentationFacingTarget(target?: WorldPoseSource): void {
    this.presentationFacingTarget = target;
    this.updatePresentationFacing();
  }

  public getDebugSnapshot(): PlayerDebugSnapshot {
    const { x, y, z } = this.movement.velocity;
    return {
      velocity: { x, y, z },
      grounded: this.movement.grounded,
      groundColliderId: this.movement.groundColliderId,
      groundNormal: {
        x: this.movement.groundNormal.x,
        y: this.movement.groundNormal.y,
        z: this.movement.groundNormal.z,
      },
      movementState: this.movement.state,
      blocked: this.movement.blocked,
      desiredFacingYaw: this.movement.desiredFacingYaw,
      facingYaw: this.movement.facingYaw,
      facingError: this.movement.facingError,
      facingTurnRate: this.movement.facingTurnRate,
      facingSmoothingActive: this.movement.facingSmoothingActive,
      presentationFacingYaw: this.presentationFacingYaw,
      runMode: this.runMode,
      actionBusy: this.getCharacterActionState().busy,
      depleted: !this.health.alive,
      equipment: this.equipment.getSnapshot(),
      roll: this.rollSnapshot(),
      fire: this.fireSnapshot(),
      locomotion: this.getLocomotionSnapshot(),
    };
  }

  public teleport(position: Readonly<Vector3>, facingYaw?: number): void {
    this.movement.teleport(position, facingYaw);
    this.visual.sync(this.movement);
    this.updatePresentationFacing();
  }

  public reset(): void {
    this.teleport(this.spawnPosition, this.spawnFacingYaw);
    this.health.reset('player:reset');
    this.finishRoll();
    this.cancelTransientActions('reset');
  }

  /** Campaign respawn preserves owned state while clearing transient actions. */
  public respawnAt(position: Readonly<Vector3>, facingYaw?: number): void {
    this.teleport(position, facingYaw);
    this.health.reset('player:respawn');
    this.finishRoll();
    this.cancelTransientActions('respawn');
  }

  public restoreCampaignHealthBeforeInit(current: number): void {
    if (
      !Number.isFinite(current) ||
      current <= 0 ||
      current > this.health.maximum
    ) {
      throw new Error('Invalid restored player health');
    }
    this.restoredHealthBeforeInit = current;
  }

  public dispose(): void {
    this.unregisterQueryCapsule?.();
    this.unregisterQueryCapsule = undefined;
    if (this.visualAdded) this.objects.remove(this.visual.id);
    else this.visual.dispose?.();
    this.visualAdded = false;
    this.presentationFacingTarget = undefined;
    this.unsubscribeHealth?.();
    this.unsubscribeHealth = undefined;
    this.unsubscribeState?.();
    this.unsubscribeState = undefined;
    this.input = undefined;
    this.state = undefined;
    this.events.clear();
    this.equipment.dispose();
    this.health.dispose();
  }

  private updatePresentationFacing(): void {
    const target = this.presentationFacingTarget?.getWorldPose();
    const dx = target ? target.position.x - this.movement.position.x : 0;
    const dz = target ? target.position.z - this.movement.position.z : 0;
    this.presentationFacingYaw =
      target && Math.hypot(dx, dz) >= 1e-6
        ? Math.atan2(dx, dz)
        : this.movement.facingYaw;
    this.visual.visualRoot.rotation.y = this.presentationFacingYaw;
  }

  private startRoll(move: Readonly<Vector2>, source: string): boolean {
    if (!this.health.alive) return this.rejectRoll('depleted');
    if (this.state?.current !== 'playing')
      return this.rejectRoll('state-gated');
    if (!this.movement.grounded) return this.rejectRoll('airborne');
    if (this.getCharacterActionState().busy)
      return this.rejectRoll('action-locked');
    const direction = this.cameraRelativeDirection(move);
    const directionSource =
      direction.lengthSq() > 1e-6 ? 'movement-intent' : 'facing-fallback';
    if (directionSource === 'facing-fallback') {
      direction.set(
        Math.sin(this.movement.facingYaw),
        0,
        Math.cos(this.movement.facingYaw),
      );
    } else direction.normalize();
    if (!this.admitCharacterAction('roll', source)) {
      return this.rejectRoll(
        this.getCharacterActionState().lastRejection ?? 'animation-unavailable',
      );
    }
    this.movement.haltHorizontalMovement();
    this.activeRoll = {
      direction,
      source: directionSource,
      elapsed: 0,
      requestedDistance: 0,
      actualDistance: 0,
      blocked: false,
      blockedBy: undefined,
    };
    this.lastRoll = this.activeRoll;
    this.lastRollRejection = undefined;
    return true;
  }

  private advanceRoll(delta: number): void {
    const roll = this.activeRoll;
    if (!roll || delta <= 0) return;
    const before = Math.min(
      1,
      roll.elapsed / playerRollConfig.movementDuration,
    );
    roll.elapsed = Math.min(
      playerRollConfig.movementDuration,
      roll.elapsed + delta,
    );
    const after = Math.min(1, roll.elapsed / playerRollConfig.movementDuration);
    const requested =
      playerRollConfig.distance * (smoothstep(after) - smoothstep(before));
    const result = this.movement.moveKinematicGrounded(
      roll.direction,
      requested,
    );
    roll.requestedDistance += requested;
    roll.actualDistance += result.actualDistance;
    if (result.blocked || !result.grounded) {
      roll.blocked = true;
      roll.blockedBy = result.grounded
        ? result.blockedColliderIds[0]
        : 'left-ground';
    }
  }

  private finishRoll(): void {
    if (this.activeRoll) this.lastRoll = this.activeRoll;
    this.activeRoll = undefined;
  }

  private rejectRoll(reason: string): false {
    this.lastRollRejection = reason;
    return false;
  }

  private cameraRelativeDirection(move: Readonly<Vector2>): Vector3 {
    const yaw = this.cameraYaw();
    return new Vector3(
      Math.cos(yaw) * move.x - Math.sin(yaw) * move.y,
      0,
      -Math.sin(yaw) * move.x - Math.cos(yaw) * move.y,
    );
  }

  private updateEquipmentInput(acceptsInput: boolean, delta: number): void {
    const input = this.input;
    this.fireCooldownRemaining = Math.max(
      0,
      this.fireCooldownRemaining - delta,
    );
    if (!acceptsInput || !input) {
      this.fireHolding = false;
      return;
    }
    if (input.wasPressed('reloadEquipment')) {
      this.reloadEquippedItem('keyboard:reload');
    }
    const useDown = input.isDown('useEquipment');
    if (input.wasReleased('useEquipment') || !useDown) {
      this.fireHolding = false;
    }
    if (input.wasPressed('useEquipment')) {
      const handgun = this.equipment.equipped?.id === 'handgun';
      const accepted = this.useEquippedItem('keyboard:equipment');
      this.fireHolding = handgun && accepted && useDown;
      if (accepted && handgun) {
        this.fireCooldownRemaining =
          this.equipment.equipped?.ammunition?.repeatCadenceSeconds ?? 0;
      }
      return;
    }
    if (
      this.fireHolding &&
      useDown &&
      this.equipment.equipped?.id === 'handgun' &&
      this.fireCooldownRemaining <= 0 &&
      !this.getCharacterActionState().busy
    ) {
      const accepted = this.useEquippedItem('held:equipment');
      if (accepted) {
        this.fireCooldownRemaining =
          this.equipment.equipped.ammunition?.repeatCadenceSeconds ?? 0;
      } else if (this.equipment.getSnapshot().lastRejection === 'empty') {
        this.fireHolding = false;
      }
    }
  }

  private cancelTransientActions(reason: string): void {
    this.visual.cancelCharacterAction?.();
    this.finishRoll();
    this.fireHolding = false;
    this.fireCooldownRemaining = 0;
    this.lastFireRejection = reason;
  }

  private rollSnapshot(): RollDebugSnapshot {
    const roll = this.activeRoll ?? this.lastRoll;
    return {
      active: Boolean(this.activeRoll),
      direction: roll
        ? { x: roll.direction.x, z: roll.direction.z }
        : undefined,
      source: roll?.source,
      requestedDistance: roll?.requestedDistance ?? 0,
      actualDistance: roll?.actualDistance ?? 0,
      blocked: roll?.blocked ?? false,
      blockedBy: roll?.blockedBy,
      latestRejection: this.lastRollRejection,
    };
  }

  private fireSnapshot(): FireDebugSnapshot {
    return {
      holding: this.fireHolding,
      cadenceSeconds: this.equipment.equipped?.ammunition?.repeatCadenceSeconds,
      cooldownRemaining: this.fireCooldownRemaining,
      acceptedShotCount: this.acceptedShotCount,
      reloadCount: this.reloadCount,
      latestRejection: this.lastFireRejection,
    };
  }
}

export function smoothstep(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}
