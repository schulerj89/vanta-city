import { EventBus } from '../src/core/events';
import { GameStateMachine } from '../src/core/gameState';
import type { StateEvents } from '../src/core/gameState';

describe('GameStateMachine', () => {
  it('starts booting and emits valid transitions', () => {
    const events = new EventBus<StateEvents>();
    const changed = vi.fn();
    events.on('game-state:changed', changed);
    const state = new GameStateMachine(events);

    state.transition('playing');
    state.transition('paused');

    expect(state.current).toBe('paused');
    expect(changed).toHaveBeenLastCalledWith({ from: 'playing', to: 'paused' });
  });

  it('rejects invalid transitions', () => {
    const state = new GameStateMachine(new EventBus<StateEvents>());
    expect(() => state.transition('cinematic')).toThrow('booting -> cinematic');
  });

  it('enters and leaves character selection from gameplay', () => {
    const state = new GameStateMachine(new EventBus<StateEvents>());
    state.transition('playing');
    state.transition('character-select');
    expect(state.current).toBe('character-select');
    state.transition('playing');
    expect(state.current).toBe('playing');
  });

  it('returns from the map to the exact playing or paused source state', () => {
    const fromPlaying = new GameStateMachine(new EventBus<StateEvents>());
    fromPlaying.transition('playing');
    fromPlaying.transition('map');
    fromPlaying.transition('playing');
    expect(fromPlaying.current).toBe('playing');

    const fromPaused = new GameStateMachine(new EventBus<StateEvents>());
    fromPaused.transition('playing');
    fromPaused.transition('paused');
    fromPaused.transition('map');
    fromPaused.transition('paused');
    expect(fromPaused.current).toBe('paused');
  });
});
