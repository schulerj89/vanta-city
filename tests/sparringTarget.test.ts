import {
  AnimationClip,
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Scene,
} from 'three';
import { evaluateActionTarget } from '../src/actions/ActionTarget';
import type { LoadedCharacter } from '../src/characters/CharacterLoader';
import { EventBus } from '../src/core/events';
import { SparringTargetSystem } from '../src/debug/SparringTargetSystem';
import { sparringTargetConfig } from '../src/debug/sparringTarget';
import type { PlayerActionEvents } from '../src/player/PlayerControllerSystem';
import { GameObjectWorld } from '../src/entities/GameObjectWorld';
import { testDistrict } from '../src/world/levels/testDistrict';

function player() {
  const events = new EventBus<PlayerActionEvents>();
  let pose = {
    position: { x: 3.5, y: 0.15, z: 14 },
    forward: { x: 0, y: 0, z: -1 },
  };
  return {
    events,
    getWorldPose: () => pose,
    setPose: (next: typeof pose) => {
      pose = next;
    },
  };
}

function loader() {
  const disposals: ReturnType<typeof vi.fn>[] = [];
  return {
    disposals,
    instantiate: async (definition: LoadedCharacter['definition']) => {
      const root = new Group();
      const mesh = new Mesh(
        new BoxGeometry(0.5, 1.8, 0.35),
        new MeshBasicMaterial(),
      );
      mesh.position.y = 0.9;
      root.add(mesh);
      const dispose = vi.fn();
      disposals.push(dispose);
      return {
        definition,
        root,
        animationClips: new Map([
          ['idle', new AnimationClip('CharacterArmature|Idle', 1, [])],
          [
            'getHit',
            new AnimationClip('CharacterArmature|HitRecieve', 0.54, []),
          ],
        ]),
        discoveredClipNames: [],
        source: 'asset' as const,
        warnings: [],
        dispose,
      } satisfies LoadedCharacter;
    },
  };
}

function impact(
  action: 'punchLeft' | 'punchRight' | 'kickLeft' | 'kickRight',
  sequence: number,
): PlayerActionEvents['character-action:impact'] {
  return { action, source: 'keyboard', sequence, normalizedTime: 0.55 };
}

describe('action target foundation', () => {
  it('evaluates sweep, hurt cylinder, vertical overlap, facing, and state deterministically', () => {
    const actor = {
      position: { x: 0, y: 0, z: 0 },
      forward: { x: 0, y: 0, z: 1 },
    };
    const target = (x: number, y: number, z: number) => ({
      position: { x, y, z },
      forward: { x: 0, y: 0, z: -1 },
    });
    expect(
      evaluateActionTarget(
        actor,
        target(0, 0, 0.9),
        'punchLeft',
        sparringTargetConfig.volumes,
        { enabled: true, targetBusy: false },
      ),
    ).toMatchObject({
      distance: 0.9,
      facingDot: 1,
      facing: true,
      horizontalContact: true,
      verticalContact: true,
      eligible: true,
      rejectionReason: undefined,
    });
    const punchMiss = evaluateActionTarget(
      actor,
      target(0, 0, 1),
      'punchRight',
      sparringTargetConfig.volumes,
      { enabled: true, targetBusy: false },
    );
    expect(punchMiss).toMatchObject({
      eligible: false,
      rejectionReason: 'out-of-range',
    });
    expect(punchMiss.horizontalGap).toBeCloseTo(0.02);
    const kickContact = evaluateActionTarget(
      actor,
      target(0, 0, 1.4),
      'kickRight',
      sparringTargetConfig.volumes,
      { enabled: true, targetBusy: false },
    );
    expect(kickContact.eligible).toBe(true);
    expect(kickContact.horizontalGap).toBeCloseTo(-0.04);
    expect(
      evaluateActionTarget(
        actor,
        target(0, 4, 0.9),
        'kickLeft',
        sparringTargetConfig.volumes,
        { enabled: true, targetBusy: false },
      ).rejectionReason,
    ).toBe('vertical-miss');
    expect(
      evaluateActionTarget(
        actor,
        target(0, 0, -1),
        'punchRight',
        sparringTargetConfig.volumes,
        { enabled: true, targetBusy: false },
      ).rejectionReason,
    ).toBe('not-facing');
    expect(
      evaluateActionTarget(
        actor,
        target(0, 0, 1),
        'kickRight',
        sparringTargetConfig.volumes,
        { enabled: true, targetBusy: true },
      ).rejectionReason,
    ).toBe('target-busy');
  });

  it('reacts once per eligible impact, reports feedback, and resets', async () => {
    const scene = new Scene();
    const objects = new GameObjectWorld(scene);
    const actor = player();
    const characterLoader = loader();
    let gameplayAvailable = true;
    const focusRelease = vi.fn();
    const requestGameplayFocus = vi.fn(() => ({
      active: true,
      release: focusRelease,
    }));
    const system = new SparringTargetSystem(
      characterLoader,
      objects,
      actor,
      {
        activeLevel: testDistrict.definition,
      },
      {
        camera: { requestGameplayFocus },
        gameplayAvailable: () => gameplayAvailable,
      },
    );
    await system.init();

    const initial = system.getSnapshot();
    expect(initial).toMatchObject({
      enabled: false,
      loaded: true,
      animation: 'idle',
      groundedMinY: 0,
      responseSequence: 0,
    });
    expect(initial.height).toBeCloseTo(1.8);
    actor.events.emit('character-action:impact', impact('punchLeft', 1));
    expect(system.getSnapshot()).toMatchObject({
      responseSequence: 0,
      ignoredSequence: 1,
      lastIgnoredReason: 'disabled',
      feedback: 'ignored-disabled',
    });

    system.setEnabled(true);
    system.setVisualizationVisible(true);
    system.update({ delta: 0, elapsed: 0, frame: 0 });
    expect(system.getSnapshot()).toMatchObject({
      eligible: false,
      rejectionReason: 'out-of-range',
      engagement: { engaged: true, cameraRequested: false },
    });
    actor.events.emit('character-action:started', {
      action: 'punchLeft',
      source: 'keyboard',
      sequence: 1,
    });
    expect(requestGameplayFocus).toHaveBeenCalledWith({
      owner: 'debug-sparring-target',
      maxDistance: 4.25,
    });
    actor.events.emit('character-action:completed', {
      action: 'punchLeft',
      source: 'keyboard',
      sequence: 1,
    });
    expect(focusRelease).toHaveBeenCalledOnce();
    expect(system.getSnapshot().engagement.cameraRequested).toBe(false);
    actor.events.emit('character-action:started', {
      action: 'punchLeft',
      source: 'keyboard',
      sequence: 2,
    });
    expect(requestGameplayFocus).toHaveBeenCalledTimes(2);
    actor.setPose({
      position: { x: 3.5, y: 0.15, z: 12.7 },
      forward: { x: 0, y: 0, z: -1 },
    });
    actor.events.emit('character-action:impact', impact('punchLeft', 2));
    expect(system.getSnapshot()).toMatchObject({
      enabled: true,
      eligible: false,
      rejectionReason: 'target-busy',
      visualizationVisible: true,
      animation: 'reaction:getHit',
      animationGraph: { phase: 'reaction' },
      busy: true,
      responseSequence: 1,
      health: { current: 92, changeSequence: 1 },
      lastAction: 'punchLeft',
      feedback: 'accepted',
      impactSequence: 2,
    });
    actor.events.emit('character-action:impact', impact('kickRight', 3));
    expect(system.getSnapshot()).toMatchObject({
      responseSequence: 1,
      ignoredSequence: 2,
      lastIgnoredReason: 'target-busy',
      feedback: 'ignored-target-busy',
    });

    objects.update({ delta: 0.6, elapsed: 0.6, frame: 1 });
    expect(system.getSnapshot()).toMatchObject({
      animation: 'idle',
      busy: false,
      responseSequence: 1,
    });

    actor.setPose({
      position: { x: 3.5, y: 0.15, z: 20 },
      forward: { x: 0, y: 0, z: -1 },
    });
    actor.events.emit('character-action:impact', impact('kickLeft', 4));
    expect(system.getSnapshot()).toMatchObject({
      lastIgnoredReason: 'out-of-range',
      feedback: 'ignored-out-of-range',
    });
    actor.setPose({
      position: { x: 3.5, y: 0.15, z: 12.7 },
      forward: { x: 0, y: 0, z: 1 },
    });
    actor.events.emit('character-action:impact', impact('kickRight', 5));
    expect(system.getSnapshot()).toMatchObject({
      lastIgnoredReason: 'not-facing',
      feedback: 'ignored-not-facing',
    });
    actor.setPose({
      position: { x: 3.5, y: 4, z: 12.7 },
      forward: { x: 0, y: 0, z: -1 },
    });
    actor.events.emit('character-action:impact', impact('punchRight', 6));
    expect(system.getSnapshot()).toMatchObject({
      lastIgnoredReason: 'vertical-miss',
      feedback: 'ignored-vertical-miss',
    });

    gameplayAvailable = false;
    system.update({ delta: 0, elapsed: 1, frame: 2 });
    expect(system.getSnapshot().engagement).toMatchObject({
      engaged: false,
      gameplayAvailable: false,
      cameraRequested: false,
    });
    expect(focusRelease).toHaveBeenCalledTimes(2);
    actor.events.emit('character-action:impact', impact('kickLeft', 7));
    expect(system.getSnapshot().lastIgnoredReason).toBe('game-state');

    system.reset();
    expect(system.getSnapshot()).toMatchObject({
      animation: 'idle',
      responseSequence: 0,
      ignoredSequence: 0,
      lastAction: undefined,
    });

    system.dispose();
    expect(objects.get('debug.sparring-target')).toBeUndefined();
    expect(objects.get('debug.sparring-eligibility')).toBeUndefined();
    expect(characterLoader.disposals[0]).toHaveBeenCalledOnce();
  });
});
