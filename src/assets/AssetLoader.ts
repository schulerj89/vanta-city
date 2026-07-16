import { Texture, TextureLoader } from 'three';
import type { AnimationClip, Material, Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { AssetCatalog } from './AssetCatalog';
import type { AssetDescriptor, AssetManifest } from './AssetCatalog';

export type {
  AssetAttribution,
  AssetDescriptor,
  AssetManifest,
  AssetType,
} from './AssetCatalog';

export type AssetLoadPhase = 'idle' | 'loading' | 'loaded' | 'error';

export interface AssetLoadStatus {
  readonly id: string;
  readonly phase: AssetLoadPhase;
  readonly progress: number;
  readonly error?: Error;
}

export type AssetStatusListener = (status: AssetLoadStatus) => void;

export interface ModelInstance {
  readonly assetId: string;
  readonly scene: Object3D;
  readonly animations: readonly AnimationClip[];
  dispose(): void;
}

export interface GameAssetLoader {
  loadTexture(id: string): Promise<Texture>;
  /** Returns loader-owned source data. Add only instances to a live scene. */
  loadGltf(id: string): Promise<GLTF>;
  instantiateModel(id: string): Promise<ModelInstance>;
  getStatus(id: string): AssetLoadStatus;
  onStatus(listener: AssetStatusListener): () => void;
  dispose(): void;
}

export interface AssetBackend {
  loadTexture(
    url: string,
    onProgress: (progress: number) => void,
  ): Promise<Texture>;
  loadGltf(url: string, onProgress: (progress: number) => void): Promise<GLTF>;
}

export class BrowserAssetBackend implements AssetBackend {
  private readonly textureLoader = new TextureLoader();
  private readonly gltfLoader = new GLTFLoader();

  public loadTexture(
    url: string,
    onProgress: (progress: number) => void,
  ): Promise<Texture> {
    return new Promise((resolve, reject) => {
      this.textureLoader.load(
        url,
        resolve,
        (event) => onProgress(toProgress(event)),
        reject,
      );
    });
  }

  public loadGltf(
    url: string,
    onProgress: (progress: number) => void,
  ): Promise<GLTF> {
    return new Promise((resolve, reject) => {
      this.gltfLoader.load(
        url,
        resolve,
        (event) => onProgress(toProgress(event)),
        reject,
      );
    });
  }
}

export class AssetLoadError extends Error {
  public constructor(
    public readonly assetId: string,
    public readonly assetType: AssetDescriptor['type'],
    public readonly url: string,
    cause: unknown,
  ) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(
      `Failed to load ${assetType} asset "${assetId}" from "${url}": ${detail}`,
      { cause },
    );
    this.name = 'AssetLoadError';
  }
}

type LoadedAsset = Texture | GLTF;

export class ThreeAssetLoader implements GameAssetLoader {
  private readonly catalog: AssetCatalog;
  private readonly cache = new Map<string, Promise<LoadedAsset>>();
  private readonly statuses = new Map<string, AssetLoadStatus>();
  private readonly listeners = new Set<AssetStatusListener>();
  private disposed = false;

  public constructor(
    catalog: AssetCatalog | AssetManifest,
    private readonly backend: AssetBackend = new BrowserAssetBackend(),
  ) {
    this.catalog =
      catalog instanceof AssetCatalog ? catalog : new AssetCatalog(catalog);
  }

  public loadTexture(id: string): Promise<Texture> {
    const asset = this.resolve(id, ['texture']);
    return this.cached(id, asset, (onProgress) =>
      this.backend.loadTexture(asset.url, onProgress),
    ) as Promise<Texture>;
  }

  public loadGltf(id: string): Promise<GLTF> {
    const asset = this.resolve(id, ['model', 'animation']);
    return this.cached(id, asset, (onProgress) =>
      this.backend.loadGltf(asset.url, onProgress),
    ) as Promise<GLTF>;
  }

  public async instantiateModel(id: string): Promise<ModelInstance> {
    this.resolve(id, ['model']);
    const source = await this.loadGltf(id);
    const scene = cloneSkeleton(source.scene);
    let instanceDisposed = false;
    return {
      assetId: id,
      scene,
      animations: source.animations,
      dispose: () => {
        if (instanceDisposed) return;
        scene.removeFromParent();
        scene.clear();
        instanceDisposed = true;
      },
    };
  }

  public getStatus(id: string): AssetLoadStatus {
    this.assertActive();
    this.catalog.get(id);
    return this.statuses.get(id) ?? { id, phase: 'idle', progress: 0 };
  }

  public onStatus(listener: AssetStatusListener): () => void {
    this.assertActive();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const pending of this.cache.values()) {
      void pending.then(disposeLoadedAsset).catch(() => undefined);
    }
    this.cache.clear();
    this.statuses.clear();
    this.listeners.clear();
  }

  private resolve(
    id: string,
    expectedTypes: readonly AssetDescriptor['type'][],
  ): AssetDescriptor {
    this.assertActive();
    const asset = this.catalog.get(id);
    if (!expectedTypes.includes(asset.type)) {
      throw new Error(
        `Asset "${id}" is ${asset.type}, expected ${expectedTypes.join(' or ')}`,
      );
    }
    return asset;
  }

  private cached(
    id: string,
    asset: AssetDescriptor,
    load: (onProgress: (progress: number) => void) => Promise<LoadedAsset>,
  ): Promise<LoadedAsset> {
    const existing = this.cache.get(id);
    if (existing) return existing;

    this.publish({ id, phase: 'loading', progress: 0 });
    const pending = load((progress) => {
      if (!this.disposed) this.publish({ id, phase: 'loading', progress });
    })
      .then((value) => {
        if (this.disposed) {
          disposeLoadedAsset(value);
          throw new Error(`Asset loader was disposed while loading "${id}"`);
        }
        this.publish({ id, phase: 'loaded', progress: 1 });
        return value;
      })
      .catch((cause: unknown) => {
        this.cache.delete(id);
        const error =
          cause instanceof AssetLoadError
            ? cause
            : new AssetLoadError(id, asset.type, asset.url, cause);
        if (!this.disposed)
          this.publish({ id, phase: 'error', progress: 0, error });
        throw error;
      });

    this.cache.set(id, pending);
    return pending;
  }

  private publish(status: AssetLoadStatus): void {
    this.statuses.set(status.id, status);
    for (const listener of [...this.listeners]) listener(status);
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('Asset loader has been disposed');
  }
}

function toProgress(event: ProgressEvent<EventTarget>): number {
  if (!event.lengthComputable || event.total <= 0) return 0;
  return Math.min(1, Math.max(0, event.loaded / event.total));
}

function disposeLoadedAsset(asset: LoadedAsset): void {
  if (asset instanceof Texture) {
    asset.dispose();
    return;
  }
  disposeObjectResources(asset.scene);
}

function disposeObjectResources(root: Object3D): void {
  const geometries = new Set<{ dispose(): void }>();
  const materials = new Set<Material>();
  const textures = new Set<{ dispose(): void }>();

  root.traverse((object) => {
    if ('geometry' in object && isDisposable(object.geometry))
      geometries.add(object.geometry);
    if (!('material' in object)) return;
    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of objectMaterials) {
      if (!isMaterial(material)) continue;
      materials.add(material);
      for (const value of Object.values(
        material as unknown as Record<string, unknown>,
      )) {
        if (isTexture(value)) textures.add(value);
      }
    }
  });

  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}

function isDisposable(value: unknown): value is { dispose(): void } {
  return typeof value === 'object' && value !== null && 'dispose' in value;
}

function isMaterial(value: unknown): value is Material {
  return typeof value === 'object' && value !== null && 'isMaterial' in value;
}

function isTexture(value: unknown): value is { dispose(): void } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'isTexture' in value &&
    value.isTexture === true &&
    isDisposable(value)
  );
}
