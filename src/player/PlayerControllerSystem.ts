import { Vector3 } from 'three';
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
}

const controlledStates: readonly GameState[] = ['playing'];

export class PlayerControllerSystem implements GameSystem, WorldPoseSource {
  public readonly id = 'player-controller';
  public readonly movement: PlayerMovementSimulation;
  public readonly events = new EventBus<PlayerActionEvents>();
  public readonly health = new HealthComponent('player', 100);

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
  public readonly equipment: CharacterEquipment;

  public constructor(
    private readonly objects: GameObjectWorld,
    collision: CollisionWorld,
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
    });
    this.objects.add(this.visual);
    this.visualAdded = true;
    this.reset();
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
      this.triggerCharacterAction('roll', 'keyboard:roll');
    }
    if (acceptsInput && this.input?.wasPressed('quickbar1')) {
      this.equipment.toggleQuickbarSlot(1);
    }
    if (acceptsInput && this.input?.wasPressed('quickbar2')) {
      this.equipment.toggleQuickbarSlot(2);
    }
    if (acceptsInput && this.input?.wasPressed('useEquipment')) {
      this.useEquippedItem('keyboard:equipment');
    }
    const actionBeforeMovement = this.getCharacterActionState().active;
    const intent =
      acceptsInput && this.input && actionBeforeMovement !== 'roll'
        ? readPlayerIntent(this.input, this.runMode)
        : idlePlayerIntent;
    this.movement.simulate(intent, this.cameraYaw(), time.delta);
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
    }
    this.updatePresentationFacing();
  }

  public setControlEnabled(enabled: boolean): void {
    this.controlEnabled = enabled;
  }

  public isControlEnabled(): boolean {
    return this.controlEnabled;
  }

  /** Authoritative entry point for short, presentation-only character actions. */
  public triggerCharacterAction(
    action: CharacterActionName,
    source = 'player-controller',
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
    if (!this.health.alive) return false;
    return this.equipment.use(this, source);
  }

  public toggleQuickbarSlot(slot: number): boolean {
    if (!this.health.alive) return false;
    return this.equipment.toggleQuickbarSlot(slot);
  }

  public getCharacterActionState(): CharacterActionRequestState {
    return this.visual.getCharacterActionState?.() ?? idleCharacterActionState;
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
  }

  public dispose(): void {
    if (this.visualAdded) this.objects.remove(this.visual.id);
    else this.visual.dispose?.();
    this.visualAdded = false;
    this.presentationFacingTarget = undefined;
    this.unsubscribeHealth?.();
    this.unsubscribeHealth = undefined;
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
}
