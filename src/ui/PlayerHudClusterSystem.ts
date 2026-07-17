import type { GameSystem } from '../core/lifecycle';

/** Shared safe-area anchor for player-owned top-right HUD readouts. */
export class PlayerHudClusterSystem implements GameSystem {
  public readonly id = 'player-hud-cluster';
  public readonly element = document.createElement('div');

  public constructor(private readonly mount: HTMLElement) {
    this.element.className = 'player-hud-cluster';
    this.element.setAttribute('aria-label', 'Player status');
  }

  public init(): void {
    this.mount.append(this.element);
  }

  public dispose(): void {
    this.element.remove();
  }
}
