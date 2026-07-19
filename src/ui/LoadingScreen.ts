import type { AssetLoadStatus, GameAssetLoader } from '../assets/AssetLoader';

export type LoadingReadiness = 'starting' | 'world' | 'character' | 'ready';

export interface LoadingScreenSnapshot {
  readonly readiness: LoadingReadiness;
  readonly assetProgress: number | undefined;
  readonly fallbackAssetIds: readonly string[];
  readonly fatal: boolean;
  readonly disposed: boolean;
  readonly slowElapsedSeconds: number | undefined;
  readonly durationsMs: {
    readonly preparingWorld: number | undefined;
    readonly preparingCharacter: number | undefined;
    readonly finalizing: number | undefined;
    readonly total: number | undefined;
  };
}

/** Accessible bootstrap presentation driven only by real lifecycle and asset events. */
export class LoadingScreen {
  private static readonly slowThresholdMs = 3_000;
  private readonly element = document.createElement('section');
  private readonly content = document.createElement('div');
  private readonly phase = document.createElement('p');
  private readonly title = document.createElement('h1');
  private readonly detail = document.createElement('p');
  private readonly elapsed = document.createElement('p');
  private readonly progressFrame = document.createElement('div');
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
  private elapsedTimer: ReturnType<typeof setInterval> | undefined;
  private retryButton: HTMLButtonElement | undefined;
  private dismissButton: HTMLButtonElement | undefined;
  private assetsSubscribed = true;

  public constructor(
    private readonly mount: HTMLElement,
    assets: GameAssetLoader,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.startedAt = this.now();
    this.element.className = 'loading-screen';
    this.element.dataset.testid = 'loading-screen';
    this.element.dataset.readiness = this.readiness;
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-live', 'polite');
    this.element.setAttribute('aria-atomic', 'false');
    const atmosphere = document.createElement('div');
    atmosphere.className = 'loading-screen__atmosphere';
    atmosphere.setAttribute('aria-hidden', 'true');
    this.content.className = 'loading-screen__content';
    this.phase.className = 'loading-screen__phase';
    this.phase.textContent = 'Local startup · Preparing district';
    this.title.textContent = 'Entering Ashfall City';
    this.detail.className = 'loading-screen__detail';
    this.elapsed.className = 'loading-screen__elapsed';
    this.elapsed.hidden = true;
    this.progress.max = 1;
    this.progress.removeAttribute('value');
    this.progress.setAttribute('aria-label', 'Startup progress');
    this.progressFrame.className = 'loading-screen__progress';
    this.progressFrame.append(this.progress);
    this.content.append(
      this.phase,
      this.title,
      this.detail,
      this.elapsed,
      this.progressFrame,
    );
    this.element.append(atmosphere, this.content);
    this.mount.append(this.element);
    this.unsubscribeAssets = assets.onStatus(this.onAssetStatus);
    this.elapsedTimer = setInterval(this.renderElapsed, 1_000);
    this.render();
  }

  public markWorldReady(): void {
    if (!this.canUpdate()) return;
    this.worldReadyAt ??= this.now();
    this.readiness = 'world';
    this.element.dataset.readiness = this.readiness;
    this.render();
  }

  public markCharacterReady(fallback: boolean): void {
    if (!this.canUpdate()) return;
    this.characterReadyAt ??= this.now();
    this.readiness = 'character';
    this.element.dataset.readiness = this.readiness;
    if (fallback) this.fallbackAssets.add('player character');
    this.render();
  }

  public complete(): void {
    if (!this.canUpdate()) return;
    this.finishedAt ??= this.now();
    this.readiness = 'ready';
    this.element.dataset.readiness = this.readiness;
    this.stopElapsedTimer();
    this.unsubscribeAssetStatuses();
    this.progress.value = 1;
    if (this.fallbackAssets.size === 0) {
      this.dispose();
      return;
    }
    this.element.classList.add('loading-screen--fallback');
    this.element.dataset.outcome = 'fallback';
    this.element.setAttribute('role', 'status');
    this.phase.textContent = 'Playable fallback';
    this.title.textContent = 'Ashfall City is ready';
    this.detail.textContent = `${this.fallbackAssets.size} local asset ${this.fallbackAssets.size === 1 ? 'fallback is' : 'fallbacks are'} active. Gameplay is available.`;
    this.progressFrame.remove();
    this.elapsed.hidden = true;
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'loading-screen__action';
    dismiss.dataset.testid = 'loading-dismiss';
    dismiss.textContent = 'Dismiss';
    dismiss.addEventListener('click', this.dismiss);
    this.dismissButton = dismiss;
    this.content.append(dismiss);
  }

  public fail(error: unknown): void {
    if (!this.canUpdate()) return;
    this.finishedAt ??= this.now();
    this.fatal = true;
    this.stopElapsedTimer();
    this.unsubscribeAssetStatuses();
    this.element.className = 'loading-screen loading-screen--error';
    this.element.dataset.outcome = 'fatal';
    this.element.setAttribute('role', 'alert');
    this.element.removeAttribute('aria-live');
    this.phase.textContent = 'Startup interrupted';
    this.title.textContent = 'Vanta City could not start';
    this.detail.textContent =
      error instanceof Error ? error.message : String(error);
    this.progressFrame.remove();
    this.elapsed.hidden = true;
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'loading-screen__action';
    retry.dataset.testid = 'loading-retry';
    retry.textContent = 'Retry';
    retry.addEventListener('click', this.retry);
    this.retryButton = retry;
    this.content.append(retry);
    retry.focus({ preventScroll: true });
  }

  public getSnapshot(): LoadingScreenSnapshot {
    return {
      readiness: this.readiness,
      assetProgress: this.assetProgress(),
      fallbackAssetIds: [...this.fallbackAssets],
      fatal: this.fatal,
      disposed: this.disposed,
      slowElapsedSeconds: this.slowElapsedSeconds(),
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
    this.stopElapsedTimer();
    this.retryButton?.removeEventListener('click', this.retry);
    this.dismissButton?.removeEventListener('click', this.dismiss);
    this.retryButton = undefined;
    this.dismissButton = undefined;
    this.unsubscribeAssetStatuses();
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
      this.phase.textContent = 'Local asset transfer';
      return;
    }
    if (this.fallbackAssets.size > 0) {
      this.detail.textContent =
        'An asset was unavailable. Preparing a safe gameplay fallback…';
      this.phase.textContent = 'Local fallback check';
      return;
    }
    this.phase.textContent =
      this.readiness === 'starting'
        ? 'Preparing district · Indeterminate'
        : this.readiness === 'world'
          ? 'Preparing character · Indeterminate'
          : 'Finalizing startup · Indeterminate';
    this.detail.textContent =
      this.readiness === 'starting'
        ? 'Preparing the district…'
        : this.readiness === 'world'
          ? 'District ready. Preparing your character…'
          : 'Character ready. Starting gameplay…';
  }

  private readonly renderElapsed = (): void => {
    if (!this.canUpdate()) return;
    const seconds = this.slowElapsedSeconds();
    this.elapsed.hidden = seconds === undefined;
    this.elapsed.textContent =
      seconds === undefined
        ? ''
        : `Still working locally · ${seconds} second${seconds === 1 ? '' : 's'} elapsed`;
  };

  private slowElapsedSeconds(): number | undefined {
    if (this.disposed || this.fatal || this.finishedAt !== undefined)
      return undefined;
    const elapsedMs = this.now() - this.startedAt;
    return elapsedMs < LoadingScreen.slowThresholdMs
      ? undefined
      : Math.floor(elapsedMs / 1_000);
  }

  private readonly retry = (): void => window.location.reload();

  private readonly dismiss = (): void => this.dispose();

  private stopElapsedTimer(): void {
    if (this.elapsedTimer !== undefined) clearInterval(this.elapsedTimer);
    this.elapsedTimer = undefined;
    this.elapsed.hidden = true;
  }

  private unsubscribeAssetStatuses(): void {
    if (!this.assetsSubscribed) return;
    this.assetsSubscribed = false;
    this.unsubscribeAssets();
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
