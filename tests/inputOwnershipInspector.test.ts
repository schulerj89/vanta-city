import { AccessibilityPreferenceStore } from '../src/accessibility/AccessibilityPreferences';
import { EventBus } from '../src/core/events';
import { GameStateMachine } from '../src/core/gameState';
import type { StateEvents } from '../src/core/gameState';
import { DebugRegistry, debugSections } from '../src/debug/DebugRegistry';
import { InputOwnershipInspector } from '../src/debug/InputOwnershipInspector';
import { InputSystem } from '../src/input/InputSystem';
import { defaultBindings } from '../src/input/defaultBindings';
import type { CharacterPickerSystem } from '../src/ui/CharacterPickerSystem';
import type { HelpOverlayController } from '../src/ui/LazyHelpOverlaySystem';
import type { DialogueSessionController } from '../src/dialogue/DialogueSessionController';

const frame = (number: number) => ({
  delta: 1 / 60,
  elapsed: number / 60,
  frame: number,
});

describe('InputOwnershipInspector', () => {
  it('reports mixed devices, modal rejection, focus, and connection timeline', () => {
    const events = new EventBus<StateEvents>();
    const state = new GameStateMachine(events);
    state.transition('playing');
    let helpOpen = false;
    let pickerOpen = false;
    let dialogueState: 'idle' | 'ready' = 'idle';
    const help = {
      open: vi.fn(),
      close: vi.fn(),
      getSnapshot: () => ({
        open: helpOpen,
        openedFromPlaying: helpOpen,
        focusedElement: undefined,
        preferences: undefined,
      }),
    } satisfies HelpOverlayController;
    const picker = {
      getSnapshot: () => ({ open: pickerOpen }),
    } as unknown as CharacterPickerSystem;
    const dialogue = {
      getSnapshot: () => ({ state: dialogueState }),
    } as unknown as DialogueSessionController;
    const preferences = new AccessibilityPreferenceStore(undefined, {
      reducedCameraMotion: true,
      dialogueTypewriter: false,
    });
    const registry = new DebugRegistry();
    const input = new InputSystem(defaultBindings);
    const inspector = new InputOwnershipInspector(
      input,
      state,
      help,
      picker,
      dialogue,
      preferences,
      registry,
    );
    input.init();
    inspector.init();
    inspector.setVirtualGamepad({
      connected: true,
      axes: [0.1, -0.8, 0.6, 0],
      buttons: Array.from({ length: 17 }, (_, index) => (index === 2 ? 1 : 0)),
    });
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    input.update();
    inspector.update(frame(1));
    let snapshot = inspector.getDebugSnapshot();

    expect(snapshot).toMatchObject({
      owner: 'gameplay',
      activeInputFamily: 'mixed',
      activeDevice: 'gamepad',
      pointerLocked: false,
      accessibility: {
        reducedCameraMotion: true,
        dialogueTypewriter: false,
      },
    });
    expect(snapshot.actions.keyboard.accepted).toContain('moveForward');
    expect(snapshot.actions.gamepad.accepted).toContain('interact');
    expect(snapshot.gamepad.rawAxes).toEqual([0.1, -0.8, 0.6, 0]);
    expect(snapshot.mostRecentRejected).toBeUndefined();
    expect(
      registry
        .readValues()
        .filter(({ group }) => group === debugSections.input),
    ).not.toHaveLength(0);

    input.lateUpdate();
    inspector.setVirtualGamepad({
      connected: true,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, (_, index) => (index === 9 ? 1 : 0)),
    });
    helpOpen = true;
    state.transition('paused');
    input.update();
    inspector.update(frame(2));
    snapshot = inspector.getDebugSnapshot();
    expect(snapshot.owner).toBe('help');
    expect(snapshot.actions.gamepad.rejected).toContain('pause');
    expect(snapshot.mostRecentRejected).toMatchObject({
      device: 'gamepad',
      action: 'pause',
      reason: 'help-modal-owns-input',
    });

    input.lateUpdate();
    inspector.setVirtualGamepad({ connected: false, axes: [], buttons: [] });
    input.update();
    inspector.update(frame(3));
    expect(
      inspector
        .getDebugSnapshot()
        .timeline.some(({ summary }) => summary === 'gamepad disconnected'),
    ).toBe(true);

    helpOpen = false;
    state.transition('playing');
    const field = document.createElement('input');
    document.body.append(field);
    field.focus();
    field.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'KeyR', bubbles: true }),
    );
    input.update();
    inspector.update(frame(4));
    expect(inspector.getDebugSnapshot()).toMatchObject({
      owner: 'focused-ui',
      focusedElement: { tag: 'input', textEntry: true },
      mostRecentRejected: {
        device: 'keyboard',
        action: 'toggleRun',
        reason: 'focused-text-entry',
      },
    });

    dialogueState = 'ready';
    pickerOpen = true;
    expect(dialogueState).toBe('ready');
    inspector.dispose();
    input.dispose();
    field.remove();
  });
});
