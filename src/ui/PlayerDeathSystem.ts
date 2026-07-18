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
}

export interface DeathPlayerSurface {
  readonly health: HealthComponent;
  isControlEnabled(): boolean;
  setControlEnabled(enabled: boolean): void;
  reset(): void;
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

  public constructor(
    mount: HTMLElement,
    private readonly player: DeathPlayerSurface,
    private readonly camera: DeathCameraSurface,
    private readonly reducedMotion: boolean,
    private readonly resetOpponent?: () => void,
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
    };
  }

  public reviveNow(): void {
    if (!this.visible) return;
    this.reviveSequence += 1;
    this.resetOpponent?.();
    this.player.reset();
    this.releaseCamera();
    this.camera.snapToPlayer();
  }

  public dispose(): void {
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

  private readonly revive = (): void => this.reviveNow();
}
