import { AnimationClip, Group, VectorKeyframeTrack } from 'three';
import type { LoadedCharacter } from '../src/characters/CharacterLoader';
import type { CharacterDefinition } from '../src/characters/CharacterDefinition';
import {
  CharacterPreviewSystem,
  type CharacterPreviewRenderer,
} from '../src/characters/CharacterPreviewSystem';
import type { CharacterInstanceLoader } from '../src/player/CharacterPlayerVisual';

const definitions = [
  { id: 'first', displayName: 'First', fallback: 'placeholder' },
  { id: 'second', displayName: 'Second', fallback: 'placeholder' },
] as const satisfies readonly CharacterDefinition[];

function loadedCharacter(
  definition: CharacterDefinition,
): LoadedCharacter & { readonly dispose: ReturnType<typeof vi.fn> } {
  const root = new Group();
  root.position.set(0, 0.25, 0);
  const clips = new Map([
    [
      'previewIdle',
      new AnimationClip('Idle_Neutral', 1, [
        new VectorKeyframeTrack('.position', [0, 1], [0, 0.25, 0, 4, 0.25, 0]),
      ]),
    ],
    ['wave', new AnimationClip('Wave', 0.5, [])],
    ['interact', new AnimationClip('Interact', 0.4, [])],
  ]);
  const dispose = vi.fn(() => root.removeFromParent());
  return {
    definition,
    root,
    animationClips: clips,
    discoveredClipNames: [...clips.values()].map(({ name }) => name),
    source: 'asset',
    warnings: [],
    dispose,
  };
}

function fakeRenderer(): CharacterPreviewRenderer & {
  readonly render: ReturnType<
    typeof vi.fn<
      (
        scene: import('three').Scene,
        camera: import('three').PerspectiveCamera,
      ) => void
    >
  >;
  readonly dispose: ReturnType<typeof vi.fn<() => void>>;
} {
  return {
    domElement: document.createElement('canvas'),
    outputColorSpace: '',
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    render:
      vi.fn<
        (
          scene: import('three').Scene,
          camera: import('three').PerspectiveCamera,
        ) => void
      >(),
    dispose: vi.fn<() => void>(),
    forceContextLoss: vi.fn(),
  };
}

describe('CharacterPreviewSystem', () => {
  it('plays the inspected preview playlist while restoring model-root motion', async () => {
    const instance = loadedCharacter(definitions[0]);
    const renderer = fakeRenderer();
    const preview = new CharacterPreviewSystem(
      { instantiate: vi.fn(async () => instance) },
      renderer,
    );

    await preview.show(definitions[0]);
    expect(preview.getSnapshot()).toMatchObject({
      status: 'ready',
      loadedCharacterId: 'first',
      animation: 'previewIdle',
      availableAnimations: ['previewIdle', 'wave', 'interact'],
    });

    preview.update(0.5);
    expect(instance.root.position.toArray()).toEqual([0, 0.25, 0]);
    expect(preview.nextAnimation()).toBe(true);
    expect(preview.getSnapshot().animation).toBe('wave');
    expect(renderer.render).toHaveBeenCalled();

    preview.clear();
    expect(instance.dispose).toHaveBeenCalledOnce();
    expect(preview.getSnapshot()).toMatchObject({
      status: 'idle',
      disposalCount: 1,
    });
    preview.dispose();
    expect(renderer.dispose).toHaveBeenCalledOnce();
  });

  it('disposes stale asynchronous models without replacing the focused preview', async () => {
    const pending = new Map<string, (value: LoadedCharacter) => void>();
    const loader: CharacterInstanceLoader = {
      instantiate: vi.fn(
        (definition: CharacterDefinition): Promise<LoadedCharacter> =>
          new Promise<LoadedCharacter>((resolve) =>
            pending.set(definition.id, resolve),
          ),
      ),
    };
    const preview = new CharacterPreviewSystem(loader, fakeRenderer());
    const first = loadedCharacter(definitions[0]);
    const second = loadedCharacter(definitions[1]);

    const firstLoad = preview.show(definitions[0]);
    const secondLoad = preview.show(definitions[1]);
    pending.get('second')!(second);
    await secondLoad;
    pending.get('first')!(first);
    await firstLoad;

    expect(preview.getSnapshot()).toMatchObject({
      requestedCharacterId: 'second',
      loadedCharacterId: 'second',
      disposalCount: 1,
    });
    expect(first.dispose).toHaveBeenCalledOnce();
    expect(second.dispose).not.toHaveBeenCalled();
    preview.dispose();
    expect(second.dispose).toHaveBeenCalledOnce();
  });
});
