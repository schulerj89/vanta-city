import type { EventBus } from './events';

export type GameState =
  | 'booting'
  | 'playing'
  | 'paused'
  | 'map'
  | 'dialogue'
  | 'cinematic'
  | 'character-select';

export interface StateEvents {
  'game-state:changed': { readonly from: GameState; readonly to: GameState };
}

const allowedTransitions: Readonly<Record<GameState, readonly GameState[]>> = {
  booting: ['playing'],
  playing: ['paused', 'map', 'dialogue', 'cinematic', 'character-select'],
  paused: ['playing', 'map', 'cinematic', 'character-select'],
  map: ['playing', 'paused'],
  dialogue: ['playing', 'paused', 'cinematic', 'character-select'],
  cinematic: ['playing', 'paused', 'dialogue', 'character-select'],
  'character-select': ['playing', 'paused', 'dialogue', 'cinematic'],
};

export class GameStateMachine {
  private currentState: GameState = 'booting';

  public constructor(private readonly events: EventBus<StateEvents>) {}

  public get current(): GameState {
    return this.currentState;
  }

  public canTransition(to: GameState): boolean {
    return allowedTransitions[this.currentState].includes(to);
  }

  public transition(to: GameState): void {
    if (to === this.currentState) return;
    if (!this.canTransition(to)) {
      throw new Error(
        `Invalid game-state transition: ${this.currentState} -> ${to}`,
      );
    }
    const from = this.currentState;
    this.currentState = to;
    this.events.emit('game-state:changed', { from, to });
  }
}
