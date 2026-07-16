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
import type { PlayerActionEvents } from '../src/player/PlayerControllerSystem';
import { GameObjectWorld } from '../src/entities/GameObjectWorld';
import { testDistrict } from '../src/world/levels/testDistrict';

function player() {
  const events = new EventBus<PlayerActionEvents>();
  return {
    events,
    getWorldPose: () => ({
      position: { x: 3.5, y: 0.15, z: 14 },
      forward: { x: 0, y: 0, z: -1 },
    }),
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
          ['idle', new AnimationClip('HumanArmature|Man_Idle', 1, [])],
          [
            'getHitLeft',
            new AnimationClip('CharacterArmature|HitRecieve', 0.54, []),
          ],
          [
            'getHitRight',
            new AnimationClip('CharacterArmature|HitRecieve_2', 0.54, []),
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

function completion(
  action: 'punchLeft' | 'punchRight' | 'kickLeft' | 'kickRight',
  sequence: number,
): PlayerActionEvents['character-action:completed'] {
  return { action, source: 'keyboard', sequence };
}

describe('action target foundation', () => {
  it('evaluates horizontal range and facing deterministically', () => {
    expect(
      evaluateActionTarget(
        {
          position: { x: 0, y: 0, z: 0 },
          forward: { x: 0, y: 0, z: 1 },
        },
        {
          position: { x: 0, y: 10, z: 2 },
          forward: { x: 0, y: 0, z: -1 },
        },
        { maxDistance: 2.6, minimumFacingDot: 0.55 },
      ),
    ).toMatchObject({ distance: 2, facingDot: 1, eligible: true });
  });

  it('reacts once per eligible completion, ignores disabled hits, and resets', async () => {
    const scene = new Scene();
    const objects = new GameObjectWorld(scene);
    const actor = player();
    const characterLoader = loader();
    const system = new SparringTargetSystem(characterLoader, objects, actor, {
      activeLevel: testDistrict.definition,
    });
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
    actor.events.emit('character-action:completed', completion('punchLeft', 1));
    expect(system.getSnapshot()).toMatchObject({
      responseSequence: 0,
      ignoredSequence: 1,
      lastIgnoredReason: 'disabled',
    });

    system.setEnabled(true);
    actor.events.emit('character-action:completed', completion('punchLeft', 2));
    expect(system.getSnapshot()).toMatchObject({
      enabled: true,
      eligible: true,
      animation: 'getHitRight',
      busy: true,
      responseSequence: 1,
      lastAction: 'punchLeft',
    });
    actor.events.emit('character-action:completed', completion('kickRight', 3));
    expect(system.getSnapshot()).toMatchObject({
      responseSequence: 1,
      ignoredSequence: 2,
      lastIgnoredReason: 'target-busy',
    });

    objects.update({ delta: 0.6, elapsed: 0.6, frame: 1 });
    expect(system.getSnapshot()).toMatchObject({
      animation: 'idle',
      busy: false,
      responseSequence: 1,
    });
    system.reset();
    expect(system.getSnapshot()).toMatchObject({
      animation: 'idle',
      responseSequence: 0,
      ignoredSequence: 0,
      lastAction: undefined,
    });

    system.dispose();
    expect(objects.get('debug.sparring-target')).toBeUndefined();
    expect(characterLoader.disposals[0]).toHaveBeenCalledOnce();
  });
});
