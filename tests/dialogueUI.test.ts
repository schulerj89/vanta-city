import { EventBus } from '../src/core/events';
import { GameStateMachine } from '../src/core/gameState';
import type { StateEvents } from '../src/core/gameState';
import type { ConversationDefinition } from '../src/dialogue/DialogueDefinition';
import { DialoguePortraitResolver } from '../src/dialogue/DialoguePortraitResolver';
import { DialogueSessionController } from '../src/dialogue/DialogueSessionController';
import { DialogueUISystem } from '../src/dialogue/DialogueUISystem';
import type { InputReader } from '../src/input/InputSystem';

const noInput: InputReader = {
  isDown: () => false,
  wasPressed: () => false,
  wasReleased: () => false,
};

function controller(): DialogueSessionController {
  const events = new EventBus<StateEvents>();
  const state = new GameStateMachine(events);
  state.transition('playing');
  const session = new DialogueSessionController(noInput, state, {
    typewriterEnabled: false,
  });
  session.init({ events, input: noInput, state });
  return session;
}

describe('DialogueUISystem', () => {
  it('renders safe speaker and portrait fallbacks with long text intact', () => {
    const session = controller();
    const mount = document.createElement('main');
    const portraits = new DialoguePortraitResolver([]);
    const ui = new DialogueUISystem(mount, session, portraits);
    const longText = 'A'.repeat(600);
    const missingSpeaker: ConversationDefinition = {
      id: 'test.missing-speaker',
      lines: [
        {
          id: 'test.missing-speaker.line',
          speakerId: 'not-registered',
          text: longText,
        },
      ],
    };
    ui.init();

    void session.start(missingSpeaker);
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
    expect(ui.getDebugSnapshot()).toMatchObject({
      visible: true,
      portraitResolution: 'fallback:unknown-speaker',
    });
    ui.dispose();
  });

  it('uses the selected player identity for the Rook portrait fallback', () => {
    const session = controller();
    const mount = document.createElement('main');
    const portraits = new DialoguePortraitResolver(
      [{ id: 'rook', displayName: 'Rook', usePlayerIdentity: true }],
      {
        getSelectedIdentity: () => ({ displayName: 'Vanta Placeholder' }),
      },
    );
    const ui = new DialogueUISystem(mount, session, portraits);
    ui.init();
    void session.start({
      id: 'test.rook',
      lines: [{ id: 'test.rook.line', speakerId: 'rook', text: 'Ready.' }],
    });

    ui.update();

    expect(
      mount.querySelector('.dialogue-box__portrait-fallback')?.textContent,
    ).toBe('VP');
    expect(ui.getDebugSnapshot().portraitResolution).toBe(
      'fallback:player-identity-fallback',
    );
  });
});
