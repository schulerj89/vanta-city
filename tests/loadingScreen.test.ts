import type { Texture } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type {
  AssetLoadStatus,
  AssetStatusListener,
  GameAssetLoader,
  ModelInstance,
} from '../src/assets/AssetLoader';
import { LoadingScreen } from '../src/ui/LoadingScreen';

class ObservableAssets implements GameAssetLoader {
  private readonly listeners = new Set<AssetStatusListener>();

  public get listenerCount(): number {
    return this.listeners.size;
  }

  public emit(status: AssetLoadStatus): void {
    for (const listener of this.listeners) listener(status);
  }

  public loadTexture(): Promise<Texture> {
    throw new Error('not used');
  }

  public loadGltf(): Promise<GLTF> {
    throw new Error('not used');
  }

  public instantiateModel(): Promise<ModelInstance> {
    throw new Error('not used');
  }

  public getStatus(id: string): AssetLoadStatus {
    return { id, phase: 'idle', progress: 0 };
  }

  public onStatus(listener: AssetStatusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public dispose(): void {
    this.listeners.clear();
  }
}

describe('LoadingScreen', () => {
  it('presents real asset progress and world/character readiness', () => {
    const mount = document.createElement('main');
    const assets = new ObservableAssets();
    let now = 10;
    const screen = new LoadingScreen(mount, assets, () => now);

    expect(mount.querySelector('progress')?.hasAttribute('value')).toBe(false);
    assets.emit({ id: 'district.model', phase: 'loading', progress: 0.4 });
    expect(mount.textContent).toContain('district.model · 40%');
    expect(screen.getSnapshot().assetProgress).toBe(0.4);

    assets.emit({ id: 'district.model', phase: 'loaded', progress: 1 });
    now = 30;
    screen.markWorldReady();
    expect(mount.textContent).toContain('District ready');
    now = 55;
    screen.markCharacterReady(false);
    expect(mount.textContent).toContain('Character ready');

    now = 65;
    screen.complete();
    expect(screen.getSnapshot()).toMatchObject({
      readiness: 'ready',
      disposed: true,
      fatal: false,
      durationsMs: {
        preparingWorld: 20,
        preparingCharacter: 25,
        finalizing: 10,
        total: 55,
      },
    });
    expect(mount.querySelector('.loading-screen')).toBeNull();
  });

  it('keeps an explicit dismissible fallback state while gameplay continues', () => {
    const mount = document.createElement('main');
    const assets = new ObservableAssets();
    const screen = new LoadingScreen(mount, assets);
    assets.emit({
      id: 'optional.npc',
      phase: 'error',
      progress: 0,
      error: new Error('missing'),
    });
    screen.markWorldReady();
    screen.markCharacterReady(true);
    screen.complete();

    expect(screen.getSnapshot().fallbackAssetIds).toEqual([
      'optional.npc',
      'player character',
    ]);
    expect(mount.textContent).toContain('2 local asset fallbacks are active');
    expect(mount.textContent).toContain('Ashfall City is ready');
    expect(assets.listenerCount).toBe(0);
    mount.querySelector<HTMLButtonElement>('button')?.click();
    expect(screen.getSnapshot().disposed).toBe(true);
  });

  it('shows fatal errors and ignores asset events after disposal', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const assets = new ObservableAssets();
    const failed = new LoadingScreen(mount, assets);
    failed.fail(new Error('renderer unavailable'));
    expect(mount.querySelector('[role="alert"]')?.textContent).toContain(
      'renderer unavailable',
    );
    expect(failed.getSnapshot().fatal).toBe(true);
    expect(assets.listenerCount).toBe(0);
    expect(mount.querySelector('[data-testid="loading-retry"]')).toBe(
      document.activeElement,
    );

    failed.dispose();
    assets.emit({ id: 'late', phase: 'loading', progress: 0.5 });
    expect(failed.getSnapshot().fallbackAssetIds).toEqual([]);
    expect(mount.querySelector('.loading-screen')).toBeNull();
    mount.remove();
  });

  it('shows bounded elapsed truth without time-driving completion', () => {
    vi.useFakeTimers();
    const mount = document.createElement('main');
    const assets = new ObservableAssets();
    let now = 0;
    const screen = new LoadingScreen(mount, assets, () => now);
    expect(screen.getSnapshot().slowElapsedSeconds).toBeUndefined();

    now = 3_200;
    vi.advanceTimersByTime(1_000);
    expect(mount.textContent).toContain('3 seconds elapsed');
    expect(screen.getSnapshot()).toMatchObject({
      readiness: 'starting',
      slowElapsedSeconds: 3,
      disposed: false,
    });

    screen.markWorldReady();
    expect(screen.getSnapshot().readiness).toBe('world');
    screen.dispose();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it('supports clean disposal and reentry without retaining the old root', () => {
    const mount = document.createElement('main');
    const assets = new ObservableAssets();
    const first = new LoadingScreen(mount, assets);
    first.dispose();
    const second = new LoadingScreen(mount, assets);

    expect(
      mount.querySelectorAll('[data-testid="loading-screen"]'),
    ).toHaveLength(1);
    expect(first.getSnapshot().disposed).toBe(true);
    expect(second.getSnapshot().disposed).toBe(false);
    second.dispose();
  });
});
