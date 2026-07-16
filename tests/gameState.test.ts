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
});
