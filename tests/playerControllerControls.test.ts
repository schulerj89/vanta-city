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
  public readonly released = new Set<string>();
  public uiFocused = false;

  public isDown(action: string): boolean {
    return this.down.has(action);
  }
  public wasPressed(action: string): boolean {
    return this.pressed.delete(action);
  }
  public wasReleased(action: string): boolean {
    return this.released.delete(action);
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
  public depleted = false;
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
    this.actionState = {
      ...this.actionState,
      active: action,
      busy: true,
      lastRequested: action,
      lastAccepted: true,
      sequence: this.actionState.sequence + 1,
    };
    return true;
  }
  public setDepleted(depleted: boolean): void {
    this.depleted = depleted;
  }
  public getCharacterActionState(): CharacterActionRequestState {
    return this.actionState;
  }
  public complete(action: CharacterActionName): void {
    this.actionState = {
      ...this.actionState,
      active: undefined,
      busy: false,
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

  it('toggles both quickbar slots, uses equipment, and locks locomotion for roll', async () => {
    const { input, player, visual } = await harness();
    input.pressed.add('quickbar1');
    player.update(frame);
    expect(player.equipment.getSnapshot().equippedId).toBe('handgun');
    input.pressed.add('useEquipment');
    player.update(frame);
    expect(visual.actions).toContain('gunFire');
    visual.complete('gunFire');
    player.update(frame);

    input.pressed.add('quickbar1');
    player.update(frame);
    expect(player.equipment.getSnapshot().equippedId).toBeUndefined();
    input.pressed.add('quickbar2');
    player.update(frame);
    expect(player.equipment.getSnapshot().equippedId).toBe('knife');

    input.down.add('moveForward');
    input.pressed.add('roll');
    player.update(frame);
    expect(visual.actions).toContain('roll');
    expect(player.movement.velocity.x).toBeCloseTo(0);
    expect(player.movement.velocity.z).toBeCloseTo(0);
  });

  it.each([30, 60, 120])(
    'captures camera-relative roll intent with stable displacement at %i Hz',
    async (hz) => {
      const { input, player } = await harness(() => Math.PI / 2);
      const start = player.movement.position.clone();
      input.down.add('moveForward');
      input.pressed.add('roll');
      const step = { delta: 1 / hz, elapsed: 1, frame: 1 };
      for (let index = 0; index < hz; index += 1) player.update(step);
      const roll = player.getDebugSnapshot().roll;
      expect(roll.source).toBe('movement-intent');
      expect(roll.direction?.x).toBeCloseTo(-1, 5);
      expect(roll.actualDistance).toBeCloseTo(3, 3);
      expect(player.movement.position.x - start.x).toBeCloseTo(-3, 3);
      expect(player.movement.position.z - start.z).toBeCloseTo(0, 3);
      expect(player.movement.grounded).toBe(true);
    },
  );

  it('uses authoritative facing for neutral roll and rejects airborne/state-locked rolls', async () => {
    const { player, state, visual } = await harness();
    expect(player.triggerCharacterAction('roll', 'unit-test')).toBe(true);
    for (let index = 0; index < 60; index += 1) player.update(frame);
    expect(player.getDebugSnapshot().roll).toMatchObject({
      source: 'facing-fallback',
      blocked: false,
    });
    expect(player.getDebugSnapshot().roll.actualDistance).toBeCloseTo(3, 5);
    visual.complete('roll');
    player.update(frame);

    player.teleport(new Group().position.set(0, 3, 7));
    expect(player.triggerCharacterAction('roll', 'unit-test')).toBe(false);
    expect(player.getDebugSnapshot().roll.latestRejection).toBe('airborne');
    state.transition('paused');
    expect(player.triggerCharacterAction('roll', 'unit-test')).toBe(false);
    expect(player.getDebugSnapshot().roll.latestRejection).toBe('state-gated');
  });

  it('repeats held handgun fire by completed cycles, stops on release, and keeps knife edge-triggered', async () => {
    const { input, player, visual } = await harness();
    player.equipment.equip('handgun');
    input.down.add('useEquipment');
    input.pressed.add('useEquipment');
    player.update(frame);
    expect(player.equipment.getAmmunition('handgun')?.current).toBe(7);
    visual.complete('gunFire');
    for (let index = 0; index < 50; index += 1) player.update(frame);
    expect(
      visual.actions.filter((action) => action === 'gunFire'),
    ).toHaveLength(2);
    expect(player.equipment.getAmmunition('handgun')?.current).toBe(6);

    input.down.delete('useEquipment');
    input.released.add('useEquipment');
    visual.complete('gunFire');
    for (let index = 0; index < 60; index += 1) player.update(frame);
    expect(
      visual.actions.filter((action) => action === 'gunFire'),
    ).toHaveLength(2);

    player.equipment.equip('knife');
    input.down.add('useEquipment');
    input.pressed.add('useEquipment');
    player.update(frame);
    visual.complete('knifeSlash');
    for (let index = 0; index < 90; index += 1) player.update(frame);
    expect(
      visual.actions.filter((action) => action === 'knifeSlash'),
    ).toHaveLength(1);
  });

  it('drops held-fire ownership on modal entry and reloads only while idle', async () => {
    const { input, player, state, visual } = await harness();
    player.equipment.equip('handgun');
    input.down.add('useEquipment');
    input.pressed.add('useEquipment');
    player.update(frame);
    expect(player.getDebugSnapshot().fire.holding).toBe(true);
    expect(player.reloadEquippedItem('unit-test')).toBe(false);
    expect(player.getDebugSnapshot().fire.latestRejection).toBe('reload-busy');

    visual.complete('gunFire');
    state.transition('paused');
    expect(player.getDebugSnapshot().fire.holding).toBe(false);
    state.transition('playing');
    for (let index = 0; index < 90; index += 1) player.update(frame);
    expect(player.getDebugSnapshot().fire.acceptedShotCount).toBe(1);

    input.down.delete('useEquipment');
    input.released.add('useEquipment');
    player.update(frame);
    expect(player.reloadEquippedItem('unit-test')).toBe(true);
    expect(player.equipment.getAmmunition('handgun')?.current).toBe(8);
    expect(player.getDebugSnapshot().fire.reloadCount).toBe(1);
  });

  it('gates movement, actions, equipment, and roll while depleted then revives', async () => {
    const { input, player, visual } = await harness();
    player.health.set(0, 'unit-test');
    expect(visual.depleted).toBe(true);
    input.down.add('moveForward');
    for (const action of ['punch', 'roll', 'quickbar1']) {
      input.pressed.add(action);
    }
    player.update(frame);
    expect(visual.actions).toEqual([]);
    expect(player.movement.velocity.lengthSq()).toBe(0);
    expect(player.equipment.getSnapshot().equippedId).toBeUndefined();

    player.health.reset('unit-test');
    expect(visual.depleted).toBe(false);
    input.pressed.clear();
    input.pressed.add('roll');
    player.update(frame);
    expect(visual.actions).toEqual(['roll']);
  });
});
