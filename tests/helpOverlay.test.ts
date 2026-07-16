import { EventBus } from '../src/core/events';
import { GameStateMachine } from '../src/core/gameState';
import type { StateEvents } from '../src/core/gameState';
import type { GameRuntime } from '../src/game/GameRuntime';
import type { InputReader } from '../src/input/InputSystem';
import { helpControlEntries } from '../src/input/defaultBindings';
import { HelpOverlaySystem } from '../src/ui/HelpOverlaySystem';

function inputReader(): InputReader {
  return {
    isDown: () => false,
    wasPressed: () => false,
    wasReleased: () => false,
  };
}

describe('HelpOverlaySystem', () => {
  it('renders binding metadata, traps focus, and restores playing state on Escape', () => {
    const events = new EventBus<StateEvents>();
    const state = new GameStateMachine(events);
    state.transition('playing');
    const runtime = {
      state,
      pause: () => state.transition('paused'),
      resume: () => state.transition('playing'),
    } as GameRuntime;
    const mount = document.createElement('main');
    document.body.append(mount);
    const help = new HelpOverlaySystem(mount, runtime, helpControlEntries);
    help.init({ events, state, input: inputReader() });

    const opener = mount.querySelector<HTMLButtonElement>('.help-button')!;
    opener.focus();
    opener.click();
    expect(state.current).toBe('paused');
    expect(help.getSnapshot()).toMatchObject({
      open: true,
      openedFromPlaying: true,
      focusedElement: 'Close controls help',
    });
    expect(mount.textContent).toContain('Orbit camera left');
    expect(mount.textContent).toContain('Interact');

    const overlay = mount.querySelector<HTMLElement>('[role="dialog"]')!;
    overlay.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'Tab', bubbles: true }),
    );
    expect(document.activeElement?.getAttribute('aria-label')).toBe(
      'Close controls help',
    );
    overlay.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }),
    );
    expect(help.getSnapshot().open).toBe(false);
    expect(state.current).toBe('playing');
    expect(document.activeElement).toBe(opener);

    help.dispose();
    mount.remove();
  });

  it('returns to an existing paused state and is unavailable in dialogue', () => {
    const events = new EventBus<StateEvents>();
    const state = new GameStateMachine(events);
    state.transition('playing');
    state.transition('paused');
    const runtime = {
      state,
      pause: vi.fn(),
      resume: vi.fn(),
    } as unknown as GameRuntime;
    const mount = document.createElement('main');
    const help = new HelpOverlaySystem(mount, runtime, helpControlEntries);
    help.init({ events, state, input: inputReader() });
    help.open();
    help.close();
    expect(runtime.resume).not.toHaveBeenCalled();
    expect(state.current).toBe('paused');

    state.transition('playing');
    state.transition('dialogue');
    help.open();
    expect(help.getSnapshot().open).toBe(false);
    expect(mount.querySelector<HTMLButtonElement>('.help-button')!.hidden).toBe(
      true,
    );
    help.dispose();
  });
});
