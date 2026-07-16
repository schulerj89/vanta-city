import { Group, Texture } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { AssetCatalog } from '../src/assets/AssetCatalog';
import { AssetLoadError, ThreeAssetLoader } from '../src/assets/AssetLoader';
import type { AssetBackend } from '../src/assets/AssetLoader';

function createGltf(): GLTF {
  const scene = new Group();
  scene.add(new Group());
  return {
    animations: [],
    asset: { version: '2.0' },
    cameras: [],
    parser: {},
    scene,
    scenes: [scene],
    userData: {},
  } as unknown as GLTF;
}

function createBackend(overrides: Partial<AssetBackend> = {}): AssetBackend {
  return {
    loadGltf: vi.fn(async () => createGltf()),
    loadTexture: vi.fn(async () => new Texture()),
    ...overrides,
  };
}

describe('ThreeAssetLoader', () => {
  it('deduplicates source loads while returning independent model instances', async () => {
    const backend = createBackend();
    const loader = new ThreeAssetLoader(
      new AssetCatalog({ hero: { type: 'model', url: '/hero.glb' } }),
      backend,
    );

    const [first, second] = await Promise.all([
      loader.instantiateModel('hero'),
      loader.instantiateModel('hero'),
    ]);

    expect(backend.loadGltf).toHaveBeenCalledOnce();
    expect(first.scene).not.toBe(second.scene);
    expect(first.scene.children[0]).not.toBe(second.scene.children[0]);
    expect(loader.getStatus('hero')).toMatchObject({
      phase: 'loaded',
      progress: 1,
    });
    first.dispose();
    second.dispose();
    loader.dispose();
  });

  it('publishes progress and clean errors, then permits retry', async () => {
    const failure = new Error('network unavailable');
    const backend = createBackend({
      loadGltf: vi.fn(
        async (_url: string, onProgress: (progress: number) => void) => {
          onProgress(0.5);
          throw failure;
        },
      ),
    });
    const loader = new ThreeAssetLoader(
      { hero: { type: 'model', url: '/hero.glb' } },
      backend,
    );
    const statuses: string[] = [];
    loader.onStatus((status) =>
      statuses.push(`${status.phase}:${status.progress}`),
    );

    await expect(loader.loadGltf('hero')).rejects.toBeInstanceOf(
      AssetLoadError,
    );
    expect(loader.getStatus('hero').error?.message).toContain(
      'Failed to load model asset "hero"',
    );
    await expect(loader.loadGltf('hero')).rejects.toBeInstanceOf(
      AssetLoadError,
    );

    expect(backend.loadGltf).toHaveBeenCalledTimes(2);
    expect(statuses).toContain('loading:0.5');
    expect(statuses.at(-1)).toBe('error:0');
    loader.dispose();
  });

  it('rejects mismatched asset types and use after disposal', async () => {
    const loader = new ThreeAssetLoader(
      { portrait: { type: 'texture', url: '/portrait.png' } },
      createBackend(),
    );

    expect(() => loader.loadGltf('portrait')).toThrow('portrait" is texture');
    loader.dispose();
    expect(() => loader.getStatus('portrait')).toThrow('disposed');
  });
});

describe('AssetLoadError', () => {
  it('retains the logical id, type, URL, and original failure context', () => {
    const cause = new Error('network unavailable');
    const error = new AssetLoadError(
      'character.hero',
      'model',
      '/assets/hero.glb',
      cause,
    );

    expect(error.message).toContain(
      'Failed to load model asset "character.hero" from "/assets/hero.glb"',
    );
    expect(error).toMatchObject({
      assetId: 'character.hero',
      assetType: 'model',
      url: '/assets/hero.glb',
      cause,
    });
  });
});
