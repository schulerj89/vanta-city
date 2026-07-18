import { EventBus } from '../src/core/events';
import { GameStateMachine } from '../src/core/gameState';
import type { StateEvents } from '../src/core/gameState';
import type { InputReader } from '../src/input/InputSystem';
import {
  ScreenSpaceLayoutSystem,
  screenSpaceZones,
} from '../src/ui/ScreenSpaceLayoutSystem';

const input: InputReader = {
  isDown: () => false,
  wasPressed: () => false,
  wasReleased: () => false,
};

describe('ScreenSpaceLayoutSystem', () => {
  it('creates one stable mount per semantic zone and observes public state', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const events = new EventBus<StateEvents>();
    const state = new GameStateMachine(events);
    const layout = new ScreenSpaceLayoutSystem(mount);

    expect(mount.querySelectorAll('[data-ui-zone]')).toHaveLength(
      screenSpaceZones.length,
    );
    expect(layout.zone('navigation')).toBe(layout.zone('navigation'));
    expect(layout.getSnapshot()).toMatchObject({
      state: 'booting',
      connected: true,
      zones: screenSpaceZones,
    });
    expect(layout.element.getAttribute('role')).toBe('group');

    layout.init({ events, state, input });
    state.transition('playing');
    state.transition('dialogue');
    expect(layout.element.dataset.gameState).toBe('dialogue');
    expect(layout.getSnapshot().state).toBe('dialogue');

    layout.dispose();
    expect(layout.element.isConnected).toBe(false);
    mount.remove();
  });
});
