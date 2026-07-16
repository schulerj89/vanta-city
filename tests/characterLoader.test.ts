import { AnimationClip, Group, NumberKeyframeTrack } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type {
  AssetLoadStatus,
  GameAssetLoader,
  ModelInstance,
} from '../src/assets/AssetLoader';
import {
  CharacterLoader,
  removeSceneRootMotion,
  validateAnimationBindings,
} from '../src/characters/CharacterLoader';
import type { CharacterDefinition } from '../src/characters/CharacterDefinition';

function assetLoader(
  overrides: Partial<GameAssetLoader> = {},
): GameAssetLoader {
  return {
    dispose: vi.fn(),
    getStatus: vi.fn((id: string): AssetLoadStatus => ({
      id,
      phase: 'idle',
      progress: 0,
    })),
    instantiateModel: vi.fn(async (): Promise<ModelInstance> => {
      throw new Error('missing model');
    }),
    loadGltf: vi.fn(async () => ({ animations: [] }) as unknown as GLTF),
    loadTexture: vi.fn(async () => {
      throw new Error('not used');
    }),
    onStatus: vi.fn(() => () => undefined),
    ...overrides,
  };
}

const character: CharacterDefinition = {
  id: 'hero',
  displayName: 'Hero',
  modelAssetId: 'hero.model',
  animations: {
    idle: { clipNames: ['Idle'], required: true },
    walk: { clipNames: ['Walk'], required: false },
  },
  fallback: 'placeholder',
};

describe('CharacterLoader', () => {
  it('falls back to a visible placeholder when a model fails', async () => {
    const warnings: string[] = [];
    const loader = new CharacterLoader(assetLoader(), (warning) =>
      warnings.push(warning),
    );

    const loaded = await loader.instantiate(character);

    expect(loaded.source).toBe('placeholder');
    expect(loaded.root.children.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('using placeholder');
    loaded.dispose();
  });

  it('discovers clips and reports missing logical mappings', async () => {
    const idle = new AnimationClip('Idle', 1, []);
    const result = await validateAnimationBindings(
      character,
      [idle],
      assetLoader(),
    );

    expect(result.clips.get('idle')).toBe(idle);
    expect(result.discoveredClipNames).toEqual(['Idle']);
    expect(result.warnings).toEqual([
      'Optional animation "walk" is missing for character "hero" (tried: Walk)',
    ]);
  });

  it('applies definition corrections to loaded model instances', async () => {
    const scene = new Group();
    const dispose = vi.fn();
    const definition: CharacterDefinition = {
      ...character,
      animations: {},
      transform: {
        scale: 2,
        rotation: [0, 1, 0],
        forwardAxisCorrection: 0.5,
        verticalOffset: 0.25,
        offset: [1, 2, 3],
      },
    };
    const loader = new CharacterLoader(
      assetLoader({
        instantiateModel: vi.fn(async (): Promise<ModelInstance> => ({
          animations: [],
          assetId: 'hero.model',
          dispose,
          scene,
        })),
      }),
    );

    const loaded = await loader.instantiate(definition);

    expect(loaded.source).toBe('asset');
    expect(scene.scale.toArray()).toEqual([2, 2, 2]);
    expect(scene.position.toArray()).toEqual([1, 2, 3]);
    expect(scene.rotation.y).toBe(1.5);
    // Alignment owns verticalOffset; it must not move the loaded model itself.
    expect(scene.position.y).toBe(2);
    loaded.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('removes scene-root translation without stripping child animation', () => {
    const root = new Group();
    root.name = 'CharacterScene';
    const clip = new AnimationClip('Walk', 1, [
      new NumberKeyframeTrack('CharacterScene.position', [0, 1], [0, 1]),
      new NumberKeyframeTrack('Hips.position', [0, 1], [0, 0.1]),
    ]);

    const protectedClips = removeSceneRootMotion(
      new Map([['walk', clip]]),
      root,
    );

    expect(
      protectedClips.get('walk')?.tracks.map((track) => track.name),
    ).toEqual(['Hips.position']);
    expect(clip.tracks).toHaveLength(2);
  });
});
