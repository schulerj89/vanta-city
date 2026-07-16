import { ConversationCoordinator } from '../src/conversations/ConversationCoordinator';
import { ConversationCatalog } from '../src/conversations/ConversationDefinition';
import type { ConversationDefinition } from '../src/conversations/ConversationDefinition';
import { EventBus } from '../src/core/events';
import { GameStateMachine } from '../src/core/gameState';
import type { StateEvents } from '../src/core/gameState';
import { DialoguePortraitResolver } from '../src/dialogue/DialoguePortraitResolver';
import { DialogueSessionController } from '../src/dialogue/DialogueSessionController';
import { DialogueUISystem } from '../src/dialogue/DialogueUISystem';
import type { InputReader } from '../src/input/InputSystem';

const noInput: InputReader = {
  isDown: () => false,
  wasPressed: () => false,
  wasReleased: () => false,
};

function harness(
  conversation: ConversationDefinition,
  typewriterEnabled = false,
) {
  const events = new EventBus<StateEvents>();
  const state = new GameStateMachine(events);
  state.transition('playing');
  const conversations = new ConversationCoordinator(
    new ConversationCatalog([conversation]),
    state,
  );
  const session = new DialogueSessionController(noInput, conversations, {
    typewriterEnabled,
  });
  session.init({ events, input: noInput, state });
  return { conversations, session };
}

describe('DialogueUISystem', () => {
  it('renders safe speaker and portrait fallbacks with long text intact', () => {
    const longText = 'A'.repeat(600);
    const definition: ConversationDefinition = {
      id: 'test.missing-speaker',
      lines: [
        {
          id: 'test.missing-speaker.line',
          speakerId: 'not-registered',
          text: longText,
        },
      ],
    };
    const { conversations, session } = harness(definition);
    const mount = document.createElement('main');
    const ui = new DialogueUISystem(
      mount,
      session,
      new DialoguePortraitResolver([]),
    );
    ui.init();
    conversations.start(definition.id, 'missing');
    ui.update();
    expect(
      mount.querySelector('[data-testid="dialogue-speaker"]')?.textContent,
    ).toBe('Unknown speaker');
    expect(
      mount.querySelector('.dialogue-box__portrait-fallback')?.textContent,
    ).toBe('?');
    expect(
      mount
        .querySelector('.dialogue-box__portrait')
        ?.getAttribute('aria-label'),
    ).toBe('Unknown speaker portrait fallback');
    expect(
      mount.querySelector('.dialogue-box__portrait')?.getAttribute('role'),
    ).toBe('img');
    expect(
      mount.querySelector('[data-testid="dialogue-text"]')?.textContent,
    ).toBe(longText);
    ui.dispose();
  });

  it('uses the selected player identity for the Rook portrait fallback', () => {
    const definition: ConversationDefinition = {
      id: 'test.rook',
      lines: [{ id: 'test.rook.line', speakerId: 'rook', text: 'Ready.' }],
    };
    const { conversations, session } = harness(definition);
    const mount = document.createElement('main');
    const portraits = new DialoguePortraitResolver(
      [{ id: 'rook', displayName: 'Rook', usePlayerIdentity: true }],
      { getSelectedIdentity: () => ({ displayName: 'Vanta Placeholder' }) },
    );
    const ui = new DialogueUISystem(mount, session, portraits);
    ui.init();
    conversations.start(definition.id, 'mack');
    ui.update();
    expect(
      mount.querySelector('.dialogue-box__portrait-fallback')?.textContent,
    ).toBe('VP');
    expect(
      mount
        .querySelector('.dialogue-box__portrait')
        ?.getAttribute('aria-label'),
    ).toBe('Rook portrait fallback');
    expect(ui.getDebugSnapshot().portraitResolution).toBe(
      'fallback:player-identity-fallback',
    );
  });

  it('provides isolated controls to reveal, advance, and cancel', () => {
    const definition: ConversationDefinition = {
      id: 'test.controls',
      canCancel: true,
      lines: [
        { id: 'test.controls.one', speakerId: 'mack', text: 'First.' },
        { id: 'test.controls.two', speakerId: 'rook', text: 'Second.' },
      ],
    };
    const { conversations, session } = harness(definition, true);
    const mount = document.createElement('main');
    const ui = new DialogueUISystem(
      mount,
      session,
      new DialoguePortraitResolver([]),
    );
    const leakedMouseDown = vi.fn();
    window.addEventListener('mousedown', leakedMouseDown);
    ui.init();
    conversations.start(definition.id, 'mack');
    ui.update();

    const continueButton = mount.querySelector<HTMLButtonElement>(
      '[data-testid="dialogue-continue"]',
    );
    expect(continueButton?.textContent).toBe('Reveal text');
    continueButton?.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true }),
    );
    // Simulate the typewriter completing after the control rendered but before
    // the click lands. The displayed reveal action must not advance a line.
    session.skipTypewriter();
    continueButton?.click();
    ui.update();
    expect(leakedMouseDown).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toMatchObject({
      state: 'ready',
      lineIndex: 0,
    });
    expect(continueButton?.textContent).toContain('Continue');

    continueButton?.click();
    ui.update();
    expect(session.getSnapshot()).toMatchObject({
      state: 'typing',
      lineIndex: 1,
    });

    mount
      .querySelector<HTMLButtonElement>('[data-testid="dialogue-cancel"]')
      ?.click();
    ui.update();
    expect(session.getSnapshot().state).toBe('idle');
    expect(mount.querySelector<HTMLElement>('.dialogue-box')?.hidden).toBe(
      true,
    );

    window.removeEventListener('mousedown', leakedMouseDown);
    ui.dispose();
  });
});
