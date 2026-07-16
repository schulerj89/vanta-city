import { Vector3 } from 'three';
import type { GameState } from '../core/gameState';
import type { GameSystem } from '../core/lifecycle';
import type { FrameTime } from '../core/time';
import type { GameObjectWorld } from '../entities/GameObjectWorld';
import type { GameContext } from '../game/GameRuntime';
import type { InputReader } from '../input/InputSystem';
import type { CollisionWorld } from '../physics/CollisionWorld';
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

export interface PlayerTransformSnapshot {
  readonly position: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly facingYaw: number;
}

export interface PlayerDebugSnapshot {
  readonly velocity: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly grounded: boolean;
  readonly movementState: PlayerMovementState;
  readonly blocked: boolean;
}

export interface PlayerPositionSource {
  getPlayerPosition(): {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  getPlayerTransform(): PlayerTransformSnapshot;
}

const controlledStates: readonly GameState[] = ['playing'];

export class PlayerControllerSystem
  implements GameSystem, PlayerPositionSource
{
  public readonly id = 'player-controller';
  public readonly movement: PlayerMovementSimulation;
  public readonly visual = new PlaceholderPlayerVisual();

  private readonly spawnPosition: Vector3;
  private input: InputReader | undefined;
  private state: GameContext['state'] | undefined;
  private controlEnabled = true;

  public constructor(
    private readonly objects: GameObjectWorld,
    collision: CollisionWorld,
    spawnPosition = new Vector3(0, 0, 7),
    config: PlayerMovementConfig = defaultPlayerMovementConfig,
    private readonly cameraYaw: () => number = () => 0,
  ) {
    this.spawnPosition = spawnPosition.clone();
    this.movement = new PlayerMovementSimulation(collision, config);
  }

  public init(context: GameContext): void {
    this.input = context.input;
    this.state = context.state;
    this.objects.add(this.visual);
    this.reset();
  }

  public update(time: FrameTime): void {
    const acceptsInput =
      this.controlEnabled &&
      this.state !== undefined &&
      controlledStates.includes(this.state.current);
    const intent =
      acceptsInput && this.input
        ? readPlayerIntent(this.input)
        : idlePlayerIntent;
    this.movement.simulate(intent, this.cameraYaw(), time.delta);
    this.visual.sync(this.movement);
  }

  public setControlEnabled(enabled: boolean): void {
    this.controlEnabled = enabled;
  }

  public isControlEnabled(): boolean {
    return this.controlEnabled;
  }

  public getPlayerPosition(): {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  } {
    const { x, y, z } = this.movement.position;
    return { x, y, z };
  }

  public getPlayerTransform(): PlayerTransformSnapshot {
    return {
      position: this.getPlayerPosition(),
      facingYaw: this.movement.facingYaw,
    };
  }

  public getDebugSnapshot(): PlayerDebugSnapshot {
    const { x, y, z } = this.movement.velocity;
    return {
      velocity: { x, y, z },
      grounded: this.movement.grounded,
      movementState: this.movement.state,
      blocked: this.movement.blocked,
    };
  }

  public teleport(position: Readonly<Vector3>, facingYaw?: number): void {
    this.movement.teleport(position, facingYaw);
    this.visual.sync(this.movement);
  }

  public reset(): void {
    this.teleport(this.spawnPosition, 0);
  }

  public dispose(): void {
    this.objects.remove(this.visual.id);
    this.input = undefined;
    this.state = undefined;
  }
}
