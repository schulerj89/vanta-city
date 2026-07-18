import type { GameState } from '../core/gameState';
import type { GameSystem } from '../core/lifecycle';
import type { GameContext } from '../game/GameRuntime';

export const screenSpaceZones = [
  'player-status',
  'navigation',
  'loadout',
  'interaction',
  'objectives',
  'notifications',
  'conversation',
  'modal',
  'presentation',
  'world-indicator',
] as const;

export type ScreenSpaceZone = (typeof screenSpaceZones)[number];

export interface ScreenSpaceLayoutSnapshot {
  readonly state: GameState;
  readonly zones: readonly ScreenSpaceZone[];
  readonly connected: boolean;
}

/**
 * The sole screen-space placement authority. Feature systems retain their own
 * public state and listeners; this system only supplies semantic mount points.
 */
export class ScreenSpaceLayoutSystem implements GameSystem<GameContext> {
  public readonly id = 'screen-space-layout';
  public readonly element = document.createElement('div');
  private readonly zones = new Map<ScreenSpaceZone, HTMLElement>();
  private state: GameState = 'booting';
  private unsubscribe: (() => void) | undefined;

  public constructor(private readonly mount: HTMLElement) {
    this.element.className = 'ui-layout';
    this.element.dataset.gameState = this.state;
    this.element.setAttribute('role', 'group');
    this.element.setAttribute('aria-label', 'Game interface');
    for (const name of screenSpaceZones) {
      const zone = document.createElement('div');
      zone.className = `ui-zone ui-zone--${name}`;
      zone.dataset.uiZone = name;
      this.zones.set(name, zone);
      this.element.append(zone);
    }
    // Loading is constructed before the runtime initializes. Installing the
    // empty layout now gives it the authoritative presentation mount.
    this.mount.append(this.element);
  }

  public zone(name: ScreenSpaceZone): HTMLElement {
    return this.zones.get(name)!;
  }

  public init(context: GameContext): void {
    this.syncState(context.state.current);
    this.unsubscribe = context.events.on('game-state:changed', ({ to }) =>
      this.syncState(to),
    );
  }

  public getSnapshot(): ScreenSpaceLayoutSnapshot {
    return {
      state: this.state,
      zones: [...this.zones.keys()],
      connected: this.element.isConnected,
    };
  }

  public dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.element.remove();
  }

  private syncState(state: GameState): void {
    this.state = state;
    this.element.dataset.gameState = state;
  }
}
