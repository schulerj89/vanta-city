import type { AssetLoadStatus, GameAssetLoader } from '../assets/AssetLoader';

export type LoadingReadiness = 'starting' | 'world' | 'character' | 'ready';

export interface LoadingScreenSnapshot {
  readonly readiness: LoadingReadiness;
  readonly assetProgress: number | undefined;
  readonly fallbackAssetIds: readonly string[];
  readonly fatal: boolean;
  readonly disposed: boolean;
  readonly durationsMs: {
    readonly preparingWorld: number | undefined;
    readonly preparingCharacter: number | undefined;
    readonly finalizing: number | undefined;
    readonly total: number | undefined;
  };
}

/** Accessible bootstrap presentation driven only by real lifecycle and asset events. */
export class LoadingScreen {
  private readonly element = document.createElement('section');
  private readonly title = document.createElement('h1');
  private readonly detail = document.createElement('p');
  private readonly progress = document.createElement('progress');
  private readonly fallbackAssets = new Set<string>();
  private readonly activeAssets = new Map<string, AssetLoadStatus>();
  private readonly unsubscribeAssets: () => void;
  private readiness: LoadingReadiness = 'starting';
  private fatal = false;
  private disposed = false;
  private readonly startedAt: number;
  private worldReadyAt: number | undefined;
  private characterReadyAt: number | undefined;
  private finishedAt: number | undefined;

  public constructor(
    private readonly mount: HTMLElement,
    assets: GameAssetLoader,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.startedAt = this.now();
    this.element.className = 'loading-screen';
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-live', 'polite');
    this.element.setAttribute('aria-atomic', 'true');
    this.title.textContent = 'Entering Vanta City';
    this.progress.max = 1;
    this.progress.removeAttribute('value');
    this.progress.setAttribute('aria-label', 'Startup progress');
    this.element.append(this.title, this.detail, this.progress);
    this.mount.append(this.element);
    this.unsubscribeAssets = assets.onStatus(this.onAssetStatus);
    this.render();
  }

  public markWorldReady(): void {
    if (!this.canUpdate()) return;
    this.worldReadyAt ??= this.now();
    this.readiness = 'world';
    this.render();
  }

  public markCharacterReady(fallback: boolean): void {
    if (!this.canUpdate()) return;
    this.characterReadyAt ??= this.now();
    this.readiness = 'character';
    if (fallback) this.fallbackAssets.add('player character');
    this.render();
  }

  public complete(): void {
    if (!this.canUpdate()) return;
    this.finishedAt ??= this.now();
    this.readiness = 'ready';
    this.progress.value = 1;
    if (this.fallbackAssets.size === 0) {
      this.dispose();
      return;
    }
    this.element.classList.add('loading-screen--fallback');
    this.element.setAttribute('role', 'status');
    this.title.textContent = 'Vanta City is ready';
    this.detail.textContent = `${this.fallbackAssets.size} local asset ${this.fallbackAssets.size === 1 ? 'fallback is' : 'fallbacks are'} active. Gameplay is available.`;
    this.progress.remove();
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.textContent = 'Dismiss';
    dismiss.addEventListener('click', () => this.dispose(), { once: true });
    this.element.append(dismiss);
  }

  public fail(error: unknown): void {
    if (!this.canUpdate()) return;
    this.finishedAt ??= this.now();
    this.fatal = true;
    this.element.className = 'loading-screen loading-screen--error';
    this.element.setAttribute('role', 'alert');
    this.title.textContent = 'Vanta City could not start';
    this.detail.textContent =
      error instanceof Error ? error.message : String(error);
    this.progress.remove();
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Reload';
    retry.addEventListener('click', () => window.location.reload());
    this.element.append(retry);
  }

  public getSnapshot(): LoadingScreenSnapshot {
    return {
      readiness: this.readiness,
      assetProgress: this.assetProgress(),
      fallbackAssetIds: [...this.fallbackAssets],
      fatal: this.fatal,
      disposed: this.disposed,
      durationsMs: {
        preparingWorld:
          this.worldReadyAt === undefined
            ? undefined
            : this.worldReadyAt - this.startedAt,
        preparingCharacter:
          this.worldReadyAt === undefined || this.characterReadyAt === undefined
            ? undefined
            : this.characterReadyAt - this.worldReadyAt,
        finalizing:
          this.characterReadyAt === undefined || this.finishedAt === undefined
            ? undefined
            : this.finishedAt - this.characterReadyAt,
        total:
          this.finishedAt === undefined
            ? undefined
            : this.finishedAt - this.startedAt,
      },
    };
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeAssets();
    this.element.remove();
    this.activeAssets.clear();
  }

  private readonly onAssetStatus = (status: AssetLoadStatus): void => {
    if (!this.canUpdate()) return;
    this.activeAssets.set(status.id, status);
    if (status.phase === 'error') this.fallbackAssets.add(status.id);
    else if (status.phase === 'loaded') this.fallbackAssets.delete(status.id);
    this.render();
  };

  private render(): void {
    const progress = this.assetProgress();
    if (progress === undefined) this.progress.removeAttribute('value');
    else this.progress.value = progress;

    const currentAsset = [...this.activeAssets.values()]
      .reverse()
      .find(({ phase }) => phase === 'loading');
    if (currentAsset) {
      const percent = Math.round(currentAsset.progress * 100);
      this.detail.textContent =
        currentAsset.progress > 0
          ? `Loading local asset ${currentAsset.id} · ${percent}%`
          : `Loading local asset ${currentAsset.id}…`;
      return;
    }
    if (this.fallbackAssets.size > 0) {
      this.detail.textContent =
        'An asset was unavailable. Preparing a safe gameplay fallback…';
      return;
    }
    this.detail.textContent =
      this.readiness === 'starting'
        ? 'Preparing the district…'
        : this.readiness === 'world'
          ? 'District ready. Preparing your character…'
          : 'Character ready. Starting gameplay…';
  }

  private assetProgress(): number | undefined {
    const statuses = [...this.activeAssets.values()];
    if (statuses.length === 0) return undefined;
    return (
      statuses.reduce((sum, status) => {
        if (status.phase === 'loaded') return sum + 1;
        if (status.phase === 'loading') return sum + status.progress;
        return sum;
      }, 0) / statuses.length
    );
  }

  private canUpdate(): boolean {
    return !this.disposed && !this.fatal;
  }
}
