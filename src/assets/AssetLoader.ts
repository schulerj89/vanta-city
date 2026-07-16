import { TextureLoader } from 'three';
import type { Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

export type AssetType = 'texture' | 'gltf';
export interface AssetDescriptor {
  readonly type: AssetType;
  readonly url: string;
}
export type AssetManifest = Readonly<Record<string, AssetDescriptor>>;

export interface GameAssetLoader {
  loadTexture(id: string): Promise<Texture>;
  loadGltf(id: string): Promise<GLTF>;
  dispose(): void;
}

export class ThreeAssetLoader implements GameAssetLoader {
  private readonly textureLoader = new TextureLoader();
  private readonly gltfLoader = new GLTFLoader();
  private readonly cache = new Map<string, Promise<Texture | GLTF>>();

  public constructor(private readonly manifest: AssetManifest) {}

  public loadTexture(id: string): Promise<Texture> {
    const asset = this.resolve(id, 'texture');
    return this.cached(id, () =>
      this.textureLoader.loadAsync(asset.url),
    ) as Promise<Texture>;
  }

  public loadGltf(id: string): Promise<GLTF> {
    const asset = this.resolve(id, 'gltf');
    return this.cached(id, () =>
      this.gltfLoader.loadAsync(asset.url),
    ) as Promise<GLTF>;
  }

  public dispose(): void {
    for (const asset of this.cache.values()) {
      void asset.then((value) => {
        if ('isTexture' in value) value.dispose();
      });
    }
    this.cache.clear();
  }

  private resolve(id: string, expectedType: AssetType): AssetDescriptor {
    const asset = this.manifest[id];
    if (!asset) throw new Error(`Unknown asset id: ${id}`);
    if (asset.type !== expectedType) {
      throw new Error(`Asset "${id}" is ${asset.type}, not ${expectedType}`);
    }
    return asset;
  }

  private cached(
    id: string,
    load: () => Promise<Texture | GLTF>,
  ): Promise<Texture | GLTF> {
    const existing = this.cache.get(id);
    if (existing) return existing;
    const pending = load().catch((error: unknown) => {
      this.cache.delete(id);
      throw error;
    });
    this.cache.set(id, pending);
    return pending;
  }
}
