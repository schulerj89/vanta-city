import type { GameSystem } from '../core/lifecycle';
import type { HealthComponent } from '../health/Health';
import type { CameraControlHandle } from '../camera/ThirdPersonCameraSystem';
import type { WorldPosition } from '../world/Spatial';

export interface PlayerDeathSnapshot {
  readonly visible: boolean;
  readonly reducedMotion: boolean;
  readonly controlsSuppressed: boolean;
  readonly depletionSequence: number;
  readonly reviveSequence: number;
  readonly cameraOwned: boolean;
  readonly lastRespawnId: string | undefined;
  readonly reviveInProgress: boolean;
  readonly lastRespawnError: string | undefined;
}

export interface DeathPlayerSurface {
  readonly health: HealthComponent;
  isControlEnabled(): boolean;
  setControlEnabled(enabled: boolean): void;
  reset(): void;
  respawnAt?(position: WorldPosition, facingYaw?: number): void;
}

export interface DeathRespawnResolution {
  readonly id: string;
  readonly position: WorldPosition;
  readonly facingYaw: number | undefined;
}

export interface DeathCameraSurface {
  getDebugSnapshot(): {
    readonly position: WorldPosition;
    readonly target: WorldPosition;
  };
  requestCamera(request: {
    readonly owner: string;
    readonly mode: 'cinematic';
    readonly anchor: {
      readonly id: string;
      readonly position: WorldPosition;
      readonly lookAt: WorldPosition;
    };
  }): CameraControlHandle;
  snapToPlayer(): void;
}

/** Health-observing, reversible player failure presentation for debug combat. */
export class PlayerDeathSystem implements GameSystem {
  public readonly id = 'player-death-presentation';
  public readonly updateMode = 'always' as const;

  private readonly element: HTMLElement;
  private readonly reviveButton: HTMLButtonElement;
  private unsubscribe: (() => void)[] = [];
  private cameraHandle: CameraControlHandle | undefined;
  private previousControlEnabled = true;
  private visible = false;
  private depletionSequence = 0;
  private reviveSequence = 0;
  private lastRespawnId: string | undefined;
  private revivePromise: Promise<boolean> | undefined;
  private lastRespawnError: string | undefined;
  private disposed = false;

  public constructor(
    mount: HTMLElement,
    private readonly player: DeathPlayerSurface,
    private readonly camera: DeathCameraSurface,
    private readonly reducedMotion: boolean,
    private readonly resetOpponent?: () => void,
    private readonly resolveRespawn?: () =>
      DeathRespawnResolution | Promise<DeathRespawnResolution>,
    private readonly onRespawn?: (resolution: DeathRespawnResolution) => void,
  ) {
    this.element = document.createElement('section');
    this.element.className = 'death-overlay';
    this.element.hidden = true;
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-modal', 'true');
    this.element.setAttribute('aria-labelledby', 'death-overlay-title');
    this.element.setAttribute('aria-describedby', 'death-overlay-detail');
    this.element.dataset.reducedMotion = String(reducedMotion);
    this.element.innerHTML = `
      <div class="death-overlay__wash" aria-hidden="true"></div>
      <div class="death-overlay__content">
        <p class="death-overlay__eyebrow">Vanta City emergency response</p>
        <h1 id="death-overlay-title">DOWNED</h1>
        <p id="death-overlay-detail">Your signal went dark. Revive at the district entry to continue the debug encounter.</p>
        <button class="death-overlay__revive" type="button">Revive &amp; restart</button>
      </div>`;
    this.reviveButton = this.element.querySelector('button')!;
    this.reviveButton.addEventListener('click', this.revive);
    mount.append(this.element);
  }

  public init(): void {
    this.unsubscribe = [
      this.player.health.events.on('depleted', () => this.show()),
      this.player.health.events.on('restored', () => this.hide()),
    ];
    if (!this.player.health.alive) this.show();
  }

  public getSnapshot(): PlayerDeathSnapshot {
    return {
      visible: this.visible,
      reducedMotion: this.reducedMotion,
      controlsSuppressed: this.visible && !this.player.isControlEnabled(),
      depletionSequence: this.depletionSequence,
      reviveSequence: this.reviveSequence,
      cameraOwned: this.cameraHandle?.active ?? false,
      lastRespawnId: this.lastRespawnId,
      reviveInProgress: this.revivePromise !== undefined,
      lastRespawnError: this.lastRespawnError,
    };
  }

  public reviveNow(): Promise<boolean> {
    if (!this.visible || this.disposed) return Promise.resolve(false);
    if (this.revivePromise) return this.revivePromise;
    this.reviveButton.disabled = true;
    this.reviveButton.setAttribute('aria-busy', 'true');
    const pending = this.performRevive();
    this.revivePromise = pending;
    void pending.finally(() => {
      if (this.revivePromise === pending) {
        this.revivePromise = undefined;
        this.reviveButton.disabled = false;
        this.reviveButton.removeAttribute('aria-busy');
      }
    });
    return pending;
  }

  public dispose(): void {
    this.disposed = true;
    for (const unsubscribe of this.unsubscribe.splice(0)) unsubscribe();
    this.releaseCamera();
    if (this.visible)
      this.player.setControlEnabled(this.previousControlEnabled);
    this.reviveButton.removeEventListener('click', this.revive);
    this.element.remove();
    this.visible = false;
  }

  private show(): void {
    if (this.visible) return;
    this.visible = true;
    this.depletionSequence += 1;
    this.previousControlEnabled = this.player.isControlEnabled();
    this.player.setControlEnabled(false);
    const view = this.camera.getDebugSnapshot();
    this.cameraHandle = this.camera.requestCamera({
      owner: this.id,
      mode: 'cinematic',
      anchor: {
        id: 'player-death-freeze',
        position: view.position,
        lookAt: view.target,
      },
    });
    this.element.hidden = false;
    this.reviveButton.focus({ preventScroll: true });
  }

  private hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.element.hidden = true;
    this.releaseCamera();
    this.player.setControlEnabled(this.previousControlEnabled);
  }

  private releaseCamera(): void {
    this.cameraHandle?.release();
    this.cameraHandle = undefined;
  }

  private async performRevive(): Promise<boolean> {
    try {
      const respawn = await this.resolveRespawn?.();
      if (this.disposed || !this.visible) return false;
      this.resetOpponent?.();
      if (respawn && this.player.respawnAt) {
        this.lastRespawnId = respawn.id;
        this.player.respawnAt(respawn.position, respawn.facingYaw);
        this.onRespawn?.(respawn);
      } else {
        this.player.reset();
      }
      this.reviveSequence += 1;
      this.lastRespawnError = undefined;
      this.releaseCamera();
      this.camera.snapToPlayer();
      return true;
    } catch (error) {
      this.lastRespawnError =
        error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  private readonly revive = (): void => {
    void this.reviveNow();
  };
}
