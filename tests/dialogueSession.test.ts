import { ConversationCoordinator } from '../src/conversations/ConversationCoordinator';
import { ConversationCatalog } from '../src/conversations/ConversationDefinition';
import type { ConversationDefinition } from '../src/conversations/ConversationDefinition';
import { EventBus } from '../src/core/events';
import { GameStateMachine } from '../src/core/gameState';
import type { StateEvents } from '../src/core/gameState';
import type { FrameTime } from '../src/core/time';
import { DialogueSessionController } from '../src/dialogue/DialogueSessionController';
import type { DialogueCameraHooks } from '../src/dialogue/DialogueSessionController';
import type { InputReader } from '../src/input/InputSystem';

class TestInput implements InputReader {
  public readonly pressed = new Set<string>();
  public readonly down = new Set<string>();
  public isDown(action: string): boolean {
    return this.down.has(action);
  }
  public wasPressed(action: string): boolean {
    return this.pressed.has(action);
  }
  public wasReleased(): boolean {
    return false;
  }
}

const conversation: ConversationDefinition = {
  id: 'test.conversation',
  canCancel: true,
  lines: [
    {
      id: 'test.conversation.one',
      speakerId: 'mack',
      text: 'First line.',
      onEnter: { id: 'test.first-entered' },
    },
    { id: 'test.conversation.two', speakerId: 'rook', text: 'Second line.' },
  ],
  onComplete: { id: 'test.completed' },
};

const placeholderConversation: ConversationDefinition = {
  id: 'test.placeholder',
  placeholder: true,
  lines: [],
};

function createHarness(
  typewriterEnabled = false,
  cameraHooks?: DialogueCameraHooks,
) {
  const events = new EventBus<StateEvents>();
  const state = new GameStateMachine(events);
  state.transition('playing');
  const input = new TestInput();
  const conversations = new ConversationCoordinator(
    new ConversationCatalog([conversation, placeholderConversation]),
    state,
  );
  const controller = new DialogueSessionController(input, conversations, {
    typewriterEnabled,
    charactersPerSecond: 10,
    cameraHooks,
  });
  controller.init({ events, state, input });
  return { controller, conversations, events, input, state };
}

const frame = (delta: number): FrameTime => ({
  delta,
  elapsed: delta,
  frame: 1,
});

describe('DialogueSessionController', () => {
  it('presents the coordinator session and enters the existing dialogue state', async () => {
    const harness = createHarness();
    expect(harness.conversations.start(conversation.id, 'mack')).toBe(true);
    await Promise.resolve();
    expect(harness.state.current).toBe('dialogue');
    expect(harness.controller.getSnapshot()).toMatchObject({
      conversationId: conversation.id,
      lineIndex: 0,
      speakerId: 'mack',
      fullText: 'First line.',
      state: 'ready',
    });
  });

  it('rejects empty placeholders before session, camera, or state ownership', async () => {
    const cameraStarted = vi.fn();
    const harness = createHarness(false, {
      onDialogueStarted: cameraStarted,
    });
    const started = vi.fn();
    harness.conversations.events.on('conversation:started', started);

    expect(harness.conversations.start(placeholderConversation.id, 'nox')).toBe(
      false,
    );
    await Promise.resolve();

    expect(harness.conversations.active).toBeUndefined();
    expect(harness.controller.getSnapshot().state).toBe('idle');
    expect(harness.state.current).toBe('playing');
    expect(started).not.toHaveBeenCalled();
    expect(cameraStarted).not.toHaveBeenCalled();
  });

  it('leaves ownership untouched when a conversation id is missing', async () => {
    const harness = createHarness();
    expect(() =>
      harness.conversations.start('test.missing', 'missing'),
    ).toThrow('Unknown conversation');
    await Promise.resolve();
    expect(harness.conversations.active).toBeUndefined();
    expect(harness.controller.getSnapshot().state).toBe('idle');
    expect(harness.state.current).toBe('playing');
  });

  it('rolls back initialized dialogue owners when a start observer fails', async () => {
    const cameraOrder: string[] = [];
    const harness = createHarness(false, {
      onDialogueStarted: () => cameraOrder.push('started'),
      onDialogueEnded: (_conversationId, reason) =>
        cameraOrder.push(`ended:${reason}`),
    });
    harness.conversations.events.on('conversation:started', () => {
      throw new Error('presentation failed');
    });

    expect(() => harness.conversations.start(conversation.id, 'mack')).toThrow(
      'presentation failed',
    );
    await Promise.resolve();

    expect(harness.conversations.active).toBeUndefined();
    expect(harness.controller.getSnapshot().state).toBe('idle');
    expect(harness.state.current).toBe('playing');
    expect(cameraOrder).toEqual(['started', 'ended:cancelled']);
  });

  it('completes partial text before advancing and preserves line order', () => {
    const harness = createHarness(true);
    harness.conversations.start(conversation.id, 'mack');
    harness.controller.update(frame(0.1));
    expect(harness.controller.getSnapshot().visibleText).toBe('F');
    harness.controller.advance();
    expect(harness.controller.getSnapshot().lineIndex).toBe(0);
    harness.controller.advance();
    expect(harness.controller.getSnapshot()).toMatchObject({
      lineIndex: 1,
      speakerId: 'rook',
    });
  });

  it('completes through the shared coordinator and emits hooks', async () => {
    const harness = createHarness();
    const facts: string[] = [];
    harness.controller.events.on('dialogue:hook', ({ phase, hook }) =>
      facts.push(`${phase}:${hook.id}`),
    );
    harness.controller.events.on('dialogue:completed', ({ conversationId }) =>
      facts.push(`completed:${conversationId}`),
    );
    harness.conversations.start(conversation.id, 'mack');
    harness.controller.advance();
    harness.controller.advance();
    await Promise.resolve();
    expect(harness.state.current).toBe('playing');
    expect(harness.controller.getSnapshot().state).toBe('idle');
    expect(facts).toEqual([
      'line-entry:test.first-entered',
      'completion:test.completed',
      'completed:test.conversation',
    ]);
  });

  it('cancels through the coordinator when the game leaves dialogue', async () => {
    const harness = createHarness();
    const cancelled = vi.fn();
    harness.controller.events.on('dialogue:cancelled', cancelled);
    harness.conversations.start(conversation.id, 'mack');
    await Promise.resolve();
    harness.state.transition('paused');
    expect(harness.controller.getSnapshot().state).toBe('idle');
    expect(cancelled).toHaveBeenCalledWith({
      conversationId: conversation.id,
      reason: 'cancelled',
    });
  });

  it('tolerates cancellation from a reentrant dialogue-started observer', () => {
    const cameraStarted = vi.fn();
    const cameraEnded = vi.fn();
    const harness = createHarness(false, {
      onDialogueStarted: cameraStarted,
      onDialogueEnded: cameraEnded,
    });
    harness.controller.events.on('dialogue:started', () => {
      harness.conversations.end('cancelled');
    });

    expect(() =>
      harness.conversations.start(conversation.id, 'mack'),
    ).not.toThrow();
    expect(harness.controller.getSnapshot().state).toBe('idle');
    expect(cameraStarted).not.toHaveBeenCalled();
    expect(cameraEnded).not.toHaveBeenCalled();
  });

  it('stops entering a line when a line observer cancels reentrantly', () => {
    const cameraOrder: string[] = [];
    const harness = createHarness(false, {
      onDialogueStarted: () => cameraOrder.push('started'),
      onLineChanged: () => cameraOrder.push('line-camera'),
      onDialogueEnded: (_conversationId, reason) =>
        cameraOrder.push(`ended:${reason}`),
    });
    const hookEntered = vi.fn();
    harness.controller.events.on('dialogue:hook', hookEntered);
    harness.controller.events.on('dialogue:line-changed', () => {
      harness.conversations.end('cancelled');
    });

    expect(() =>
      harness.controller.request(conversation.id, 'mack'),
    ).not.toThrow();
    expect(harness.controller.getSnapshot().state).toBe('idle');
    expect(cameraOrder).toEqual(['started', 'ended:cancelled']);
    expect(hookEntered).not.toHaveBeenCalled();
  });

  it('releases the old camera before a completion observer restarts dialogue', () => {
    const cameraOrder: string[] = [];
    const harness = createHarness(false, {
      onDialogueStarted: () => cameraOrder.push('started'),
      onDialogueEnded: (_conversationId, reason) =>
        cameraOrder.push(`ended:${reason}`),
    });
    harness.controller.events.on('dialogue:completed', () => {
      cameraOrder.push('completed');
      expect(harness.controller.request(conversation.id, 'mack')).toBe(true);
    });

    harness.controller.request(conversation.id, 'mack');
    harness.controller.advance();
    expect(() => harness.controller.advance()).not.toThrow();

    expect(cameraOrder).toEqual([
      'started',
      'ended:completed',
      'completed',
      'started',
    ]);
    expect(harness.controller.getSnapshot()).toMatchObject({
      conversationId: conversation.id,
      lineIndex: 0,
    });
  });

  it('ignores a stale frame after input synchronously cancels the session', () => {
    const harness = createHarness(true);
    harness.controller.request(conversation.id, 'mack');
    vi.spyOn(harness.input, 'wasPressed').mockImplementation((action) => {
      if (action === 'cancelDialogue') harness.conversations.end('cancelled');
      return action === 'advanceDialogue';
    });

    expect(() => harness.controller.update(frame(0.1))).not.toThrow();
    expect(harness.controller.getSnapshot().state).toBe('idle');
    expect(harness.state.current).toBe('playing');
  });
});
