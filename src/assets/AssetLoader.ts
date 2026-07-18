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
  getPerformanceSnapshot?(): AssetLoaderPerformanceSnapshot;
  dispose(): void;
}

export interface AssetLoaderPerformanceSnapshot {
  readonly cacheEntries: number;
  /** Loader-owned source assets retained until loader disposal. */
  readonly sourceReferences: number;
  /** Live cloned model instances owned by gameplay systems. */
  readonly instanceReferences: number;
  readonly instancesCreated: number;
  readonly instancesDisposed: number;
  readonly loaded: number;
  readonly inFlight: number;
  readonly failures: number;
  readonly disposed: boolean;
}

export interface AssetLoadInterceptor {
  run<Value>(
    id: string,
    load: () => Promise<Value>,
    onProgress: (progress: number) => void,
  ): Promise<Value>;
  getSnapshot(): unknown;
  reset(): void;
  dispose?(): void;
}

export interface AssetBackend {
  loadTexture(
    url: string,
    onProgress: (progress: number) => void,
  ): Promise<Texture>;
  loadGltf(url: string, onProgress: (progress: number) => void): Promise<GLTF>;
}

type AssetHeadRequest = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Pick<Response, 'ok' | 'status' | 'headers'>>;

export class AssetSourceUnavailableError extends Error {
  public constructor(
    public readonly url: string,
    detail: string,
  ) {
    super(`Asset source "${url}" is unavailable: ${detail}`);
    this.name = 'AssetSourceUnavailableError';
  }
}

export class BrowserAssetBackend implements AssetBackend {
  private readonly textureLoader = new TextureLoader();
  private readonly gltfLoader = new GLTFLoader();

  public constructor(
    private readonly request: AssetHeadRequest = (input, init) =>
      fetch(input, init),
  ) {}

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

  public async loadGltf(
    url: string,
    onProgress: (progress: number) => void,
  ): Promise<GLTF> {
    const response = await this.request(url, { method: 'HEAD' });
    const contentType = response.headers.get('content-type') ?? '';
    if (!response.ok) {
      throw new AssetSourceUnavailableError(
        url,
        `HTTP ${response.status || 'error'}`,
      );
    }
    if (contentType.toLowerCase().includes('text/html')) {
      throw new AssetSourceUnavailableError(
        url,
        'server returned HTML instead of model data',
      );
    }
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
    public readonly optional = false,
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
  private activeInstances = 0;
  private instancesCreated = 0;
  private instancesDisposed = 0;

  public constructor(
    catalog: AssetCatalog | AssetManifest,
    private readonly backend: AssetBackend = new BrowserAssetBackend(),
    private readonly interceptor?: AssetLoadInterceptor,
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
    this.activeInstances += 1;
    this.instancesCreated += 1;
    return {
      assetId: id,
      scene,
      animations: source.animations,
      dispose: () => {
        if (instanceDisposed) return;
        scene.removeFromParent();
        scene.clear();
        instanceDisposed = true;
        this.activeInstances -= 1;
        this.instancesDisposed += 1;
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

  public getPerformanceSnapshot(): AssetLoaderPerformanceSnapshot {
    const statuses = [...this.statuses.values()];
    return {
      cacheEntries: this.cache.size,
      sourceReferences: this.cache.size,
      instanceReferences: this.activeInstances,
      instancesCreated: this.instancesCreated,
      instancesDisposed: this.instancesDisposed,
      loaded: statuses.filter(({ phase }) => phase === 'loaded').length,
      inFlight: statuses.filter(({ phase }) => phase === 'loading').length,
      failures: statuses.filter(({ phase }) => phase === 'error').length,
      disposed: this.disposed,
    };
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
    this.interceptor?.dispose?.();
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
    const onProgress = (progress: number): void => {
      if (!this.disposed) this.publish({ id, phase: 'loading', progress });
    };
    const begin = (): Promise<LoadedAsset> => load(onProgress);
    const pending = (
      this.interceptor ? this.interceptor.run(id, begin, onProgress) : begin()
    )
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
            : new AssetLoadError(
                id,
                asset.type,
                asset.url,
                cause,
                asset.optional ?? false,
              );
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
