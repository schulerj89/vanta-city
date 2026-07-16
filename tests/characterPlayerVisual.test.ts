import { AnimationClip, Group, Vector3, VectorKeyframeTrack } from 'three';
import type { LoadedCharacter } from '../src/characters/CharacterLoader';
import { CharacterSelectionStore } from '../src/characters/CharacterSelection';
import type { CharacterDefinition } from '../src/characters/CharacterDefinition';
import type { PlayerMovementSimulation } from '../src/player/PlayerMovement';
import {
  CharacterPlayerVisual,
  type CharacterInstanceLoader,
} from '../src/player/CharacterPlayerVisual';

const definitions = [
  { id: 'first', displayName: 'First', fallback: 'placeholder' },
  { id: 'second', displayName: 'Second', fallback: 'placeholder' },
  { id: 'third', displayName: 'Third', fallback: 'placeholder' },
] as const satisfies readonly CharacterDefinition[];

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (value) => resolvePromise?.(value),
  };
}

function loadedCharacter(
  definition: CharacterDefinition,
  source: LoadedCharacter['source'] = 'asset',
  clips: ReadonlyMap<string, AnimationClip> = new Map(),
): LoadedCharacter & { readonly dispose: ReturnType<typeof vi.fn> } {
  const root = new Group();
  const dispose = vi.fn(() => root.removeFromParent());
  return {
    definition,
    root,
    animationClips: clips,
    discoveredClipNames: [...clips.values()].map(({ name }) => name),
    source,
    warnings: [],
    dispose,
  };
}

function movement(
  state: PlayerMovementSimulation['state'],
): PlayerMovementSimulation {
  return {
    position: new Vector3(4, 0, 7),
    facingYaw: 1.25,
    state,
  } as PlayerMovementSimulation;
}

describe('CharacterPlayerVisual', () => {
  it('prevents stale asynchronous loads from replacing a newer selection', async () => {
    const selection = new CharacterSelectionStore(definitions, 'first');
    const loads = new Map<string, Deferred<LoadedCharacter>>(
      definitions.map(({ id }) => [id, deferred<LoadedCharacter>()]),
    );
    const loader: CharacterInstanceLoader = {
      instantiate: (definition) => loads.get(definition.id)!.promise,
    };
    const visual = new CharacterPlayerVisual(selection, loader);

    const initializing = visual.init();
    selection.select('second');
    selection.select('third');
    const first = loadedCharacter(definitions[0]);
    const second = loadedCharacter(definitions[1]);
    const third = loadedCharacter(definitions[2]);
    loads.get('third')!.resolve(third);
    await Promise.resolve();
    expect(visual.getDebugSnapshot().loadedVisualId).toBe('third');

    loads.get('second')!.resolve(second);
    loads.get('first')!.resolve(first);
    await initializing;
    await Promise.resolve();

    expect(visual.getDebugSnapshot().loadedVisualId).toBe('third');
    expect(first.dispose).toHaveBeenCalledOnce();
    expect(second.dispose).toHaveBeenCalledOnce();
    expect(third.dispose).not.toHaveBeenCalled();
    visual.dispose();
  });

  it('disposes the old instance and reloads only the visual', async () => {
    const selection = new CharacterSelectionStore(definitions, 'first');
    const instances = [
      loadedCharacter(definitions[0]),
      loadedCharacter(definitions[1]),
      loadedCharacter(definitions[1]),
    ];
    const loader: CharacterInstanceLoader = {
      instantiate: vi.fn(async () => instances.shift()!),
    };
    const visual = new CharacterPlayerVisual(selection, loader);
    await visual.init();
    const first = visual.loadedModelRoot.children[0];

    selection.select('second');
    await Promise.resolve();
    expect(first?.parent).toBeNull();
    expect(visual.getDebugSnapshot()).toMatchObject({
      selectedCharacterId: 'second',
      loadedVisualId: 'second',
      fallbackActive: false,
      loadStatus: 'loaded',
    });

    const beforeReload = visual.loadedModelRoot.children[0];
    await visual.reload();
    expect(beforeReload?.parent).toBeNull();
    expect(loader.instantiate).toHaveBeenCalledTimes(3);
    visual.dispose();
  });

  it('reports fallback status for a placeholder result', async () => {
    const selection = new CharacterSelectionStore(definitions, 'first');
    const fallback = loadedCharacter(definitions[0], 'placeholder');
    const visual = new CharacterPlayerVisual(selection, {
      instantiate: vi.fn(async () => fallback),
    });

    await visual.init();

    expect(visual.getDebugSnapshot()).toMatchObject({
      loadedVisualId: 'placeholder',
      fallbackActive: true,
      loadStatus: 'fallback',
      animationState: 'static',
    });
    visual.dispose();
  });

  it('plays mapped clips without allowing root motion to offset the player', async () => {
    const selection = new CharacterSelectionStore(definitions, 'first');
    const rootMotion = new AnimationClip('Walk', 1, [
      new VectorKeyframeTrack('.position', [0, 1], [0, 2, 0, 20, 2, 0]),
    ]);
    const instance = loadedCharacter(
      definitions[0],
      'asset',
      new Map([['walk', rootMotion]]),
    );
    instance.root.position.set(0, 0.35, 0);
    const visual = new CharacterPlayerVisual(selection, {
      instantiate: vi.fn(async () => instance),
    });
    await visual.init();

    visual.sync(movement('walking'), 0.5);

    expect(visual.object3d.position.toArray()).toEqual([4, 0, 7]);
    expect(instance.root.position.toArray()).toEqual([0, 0.35, 0]);
    expect(visual.getDebugSnapshot()).toMatchObject({
      animationState: 'walk',
      verticalOffset: 0.35,
    });
    visual.dispose();
  });

  it('runs authoritative one-shot actions and returns to locomotion', async () => {
    const selection = new CharacterSelectionStore(definitions, 'first');
    const wave = new AnimationClip('Wave', 0.8, [
      new VectorKeyframeTrack('.position', [0, 0.8], [0, 0.2, 0, 8, 0.2, 0]),
    ]);
    const idle = new AnimationClip('Idle', 1, []);
    const instance = loadedCharacter(
      definitions[0],
      'asset',
      new Map([
        ['wave', wave],
        ['idle', idle],
      ]),
    );
    instance.root.position.set(0, 0.2, 0);
    const visual = new CharacterPlayerVisual(selection, {
      instantiate: vi.fn(async () => instance),
    });
    await visual.init();

    expect(visual.triggerCharacterAction('wave', 'unit-test')).toBe(true);
    visual.sync(movement('idle'), 0.4);
    expect(instance.root.position.toArray()).toEqual([0, 0.2, 0]);
    expect(visual.getDebugSnapshot()).toMatchObject({
      animationState: 'action:wave',
      characterAction: {
        active: 'wave',
        lastRequested: 'wave',
        lastSource: 'unit-test',
        lastAccepted: true,
        sequence: 1,
      },
    });

    visual.sync(movement('idle'), 0.5);
    expect(visual.getDebugSnapshot()).toMatchObject({
      animationState: 'idle',
      characterAction: { active: undefined, sequence: 1 },
    });
    visual.dispose();
  });

  it('rejects actions that are unavailable on a fallback visual', async () => {
    const selection = new CharacterSelectionStore(definitions, 'first');
    const fallback = loadedCharacter(definitions[0], 'placeholder');
    const visual = new CharacterPlayerVisual(selection, {
      instantiate: vi.fn(async () => fallback),
    });
    await visual.init();

    expect(visual.triggerCharacterAction('interact', 'unit-test')).toBe(false);
    expect(visual.getCharacterActionState()).toMatchObject({
      active: undefined,
      lastRequested: 'interact',
      lastAccepted: false,
      sequence: 0,
    });
    visual.dispose();
  });
});
