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

function harness(conversation: ConversationDefinition) {
  const events = new EventBus<StateEvents>();
  const state = new GameStateMachine(events);
  state.transition('playing');
  const conversations = new ConversationCoordinator(
    new ConversationCatalog([conversation]),
    state,
  );
  const session = new DialogueSessionController(noInput, conversations, {
    typewriterEnabled: false,
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
    expect(ui.getDebugSnapshot().portraitResolution).toBe(
      'fallback:player-identity-fallback',
    );
  });
});
