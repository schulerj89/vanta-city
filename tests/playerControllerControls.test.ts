import { Group, Scene } from 'three';
import type { CharacterActionName } from '../src/characters/CharacterActions';
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

  public sync(movement: PlayerMovementSimulation): void {
    this.object3d.position.copy(movement.position);
  }
  public triggerCharacterAction(action: CharacterActionName): boolean {
    this.actions.push(action);
    return true;
  }
  public getAlignmentReport(): undefined {
    return undefined;
  }
}

const frame = { delta: 1 / 60, elapsed: 1, frame: 1 } as const;

async function harness() {
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
    undefined,
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
});
