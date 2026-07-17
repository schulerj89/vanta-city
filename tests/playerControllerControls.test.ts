import { Group, Scene } from 'three';
import type { CharacterActionName } from '../src/characters/CharacterActions';
import type { CharacterActionRequestState } from '../src/characters/CharacterActions';
import { EventBus } from '../src/core/events';
import { GameStateMachine } from '../src/core/gameState';
import type { StateEvents } from '../src/core/gameState';
import { GameObjectWorld } from '../src/entities/GameObjectWorld';
import type { InputReader } from '../src/input/InputSystem';
import { StaticCollisionWorld } from '../src/physics/CollisionWorld';
import { PlayerControllerSystem } from '../src/player/PlayerControllerSystem';
import type { PlayerMovementSimulation } from '../src/player/PlayerMovement';
import type { PlayerVisual } from '../src/player/PlayerVisual';

class ControlInput implements InputReader {
  public readonly down = new Set<string>();
  public readonly pressed = new Set<string>();
  public uiFocused = false;

  public isDown(action: string): boolean {
    return this.down.has(action);
  }
  public wasPressed(action: string): boolean {
    return this.pressed.delete(action);
  }
  public wasReleased(): boolean {
    return false;
  }
  public isUiFocused(): boolean {
    return this.uiFocused;
  }
}

class ActionVisual implements PlayerVisual {
  public readonly id = 'player';
  public readonly object3d = new Group();
  public readonly visualRoot = new Group();
  public readonly loadedModelRoot = new Group();
  public readonly actions: CharacterActionName[] = [];
  private actionState: CharacterActionRequestState = {
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

  public sync(movement: PlayerMovementSimulation): void {
    this.object3d.position.copy(movement.position);
  }
  public triggerCharacterAction(action: CharacterActionName): boolean {
    this.actions.push(action);
    return true;
  }
  public getCharacterActionState(): CharacterActionRequestState {
    return this.actionState;
  }
  public complete(action: CharacterActionName): void {
    this.actionState = {
      ...this.actionState,
      lastCompleted: action,
      lastCompletedSource: 'unit-test',
      completedSequence: this.actionState.completedSequence + 1,
      completionRelease: 'mixer-finished',
    };
  }
  public impact(action: CharacterActionName, normalizedTime: number): void {
    this.actionState = {
      ...this.actionState,
      lastImpact: action,
      lastImpactSource: 'unit-test',
      impactSequence: this.actionState.impactSequence + 1,
      impactNormalizedTime: normalizedTime,
      completedSequenceAtImpact: this.actionState.completedSequence,
    };
  }
  public getAlignmentReport(): undefined {
    return undefined;
  }
}

const frame = { delta: 1 / 60, elapsed: 1, frame: 1 } as const;

async function harness(cameraYaw: () => number = () => 0) {
  const events = new EventBus<StateEvents>();
  const state = new GameStateMachine(events);
  state.transition('playing');
  const input = new ControlInput();
  const visual = new ActionVisual();
  const player = new PlayerControllerSystem(
    new GameObjectWorld(new Scene()),
    new StaticCollisionWorld(),
    undefined,
    undefined,
    cameraYaw,
    visual,
  );
  await player.init({ events, state, input });
  return { input, player, state, visual };
}

describe('PlayerControllerSystem controls', () => {
  it('toggles persistent run mode and visibly selects running locomotion', async () => {
    const { input, player } = await harness();
    input.pressed.add('toggleRun');
    input.down.add('moveForward');
    for (let index = 0; index < 30; index += 1) player.update(frame);
    expect(player.getDebugSnapshot().runMode).toBe(true);
    expect(player.movement.state).toBe('running');

    input.pressed.add('toggleRun');
    for (let index = 0; index < 30; index += 1) player.update(frame);
    expect(player.getDebugSnapshot().runMode).toBe(false);
    expect(player.movement.state).toBe('walking');
  });

  it('alternates punch and kick sides deterministically', async () => {
    const { input, player, visual } = await harness();
    for (const action of ['punch', 'punch', 'kick', 'kick']) {
      input.pressed.add(action);
      player.update(frame);
    }
    expect(visual.actions).toEqual([
      'punchLeft',
      'punchRight',
      'kickLeft',
      'kickRight',
    ]);
  });

  it('isolates gameplay actions from focused UI and non-playing states', async () => {
    const { input, player, state, visual } = await harness();
    input.uiFocused = true;
    input.pressed.add('punch');
    player.update(frame);
    expect(visual.actions).toEqual([]);

    input.uiFocused = false;
    state.transition('dialogue');
    input.pressed.add('kick');
    player.update(frame);
    expect(visual.actions).toEqual([]);
    expect(player.getDebugSnapshot().runMode).toBe(false);
  });

  it('publishes each presentation completion exactly once', async () => {
    const { player, visual } = await harness();
    const completed = vi.fn();
    player.events.on('character-action:completed', completed);
    visual.complete('punchLeft');
    player.update(frame);
    player.update(frame);
    expect(completed).toHaveBeenCalledOnce();
    expect(completed).toHaveBeenCalledWith({
      action: 'punchLeft',
      source: 'unit-test',
      sequence: 1,
    });
  });

  it('publishes each animation-timed impact exactly once', async () => {
    const { player, visual } = await harness();
    const impacted = vi.fn();
    player.events.on('character-action:impact', impacted);
    visual.impact('kickRight', 0.62);
    player.update(frame);
    player.update(frame);
    expect(impacted).toHaveBeenCalledOnce();
    expect(impacted).toHaveBeenCalledWith({
      action: 'kickRight',
      source: 'unit-test',
      sequence: 1,
      normalizedTime: 0.62,
    });
  });

  it('freezes heading state while paused and resumes the same smooth turn', async () => {
    const { input, player, state } = await harness();
    input.down.add('moveForward');
    for (let index = 0; index < 5; index += 1) player.update(frame);
    const beforePause = player.getDebugSnapshot();
    expect(beforePause.facingSmoothingActive).toBe(true);

    state.transition('paused');
    const held = player.getDebugSnapshot();
    expect(held.facingYaw).toBe(beforePause.facingYaw);
    expect(held.desiredFacingYaw).toBe(beforePause.desiredFacingYaw);
    expect(held.facingTurnRate).toBe(beforePause.facingTurnRate);

    state.transition('playing');
    player.update(frame);
    const resumed = player.getDebugSnapshot();
    expect(resumed.facingYaw).not.toBe(beforePause.facingYaw);
    expect(Math.abs(resumed.facingError)).toBeLessThan(
      Math.abs(beforePause.facingError),
    );
  });
});
