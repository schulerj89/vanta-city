import { EventBus } from '../src/core/events';
import { GameStateMachine } from '../src/core/gameState';
import type { StateEvents } from '../src/core/gameState';
import type { FrameTime } from '../src/core/time';
import type { ConversationDefinition } from '../src/dialogue/DialogueDefinition';
import { DialogueSessionController } from '../src/dialogue/DialogueSessionController';
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
    {
      id: 'test.conversation.two',
      speakerId: 'rook',
      text: 'Second line.',
    },
  ],
  onComplete: { id: 'test.completed' },
};

function createHarness(
  options: {
    readonly typewriterEnabled?: boolean;
    readonly charactersPerSecond?: number;
  } = {},
) {
  const events = new EventBus<StateEvents>();
  const state = new GameStateMachine(events);
  state.transition('playing');
  const input = new TestInput();
  const controller = new DialogueSessionController(input, state, options);
  controller.init({ events, state, input });
  return { controller, events, input, state };
}

function frame(delta: number): FrameTime {
  return { delta, elapsed: delta, frame: 1 };
}

describe('DialogueSessionController', () => {
  it('starts on the first line and enters the existing dialogue game state', () => {
    const { controller, state } = createHarness({
      typewriterEnabled: false,
    });
    const started = vi.fn();
    const changed = vi.fn();
    controller.events.on('dialogue:started', started);
    controller.events.on('dialogue:line-changed', changed);

    void controller.start(conversation);

    expect(state.current).toBe('dialogue');
    expect(controller.getSnapshot()).toMatchObject({
      conversationId: 'test.conversation',
      lineIndex: 0,
      speakerId: 'mack',
      fullText: 'First line.',
      visibleText: 'First line.',
      state: 'ready',
    });
    expect(started).toHaveBeenCalledOnce();
    expect(changed).toHaveBeenCalledWith(
      expect.objectContaining({ lineIndex: 0, speakerId: 'mack' }),
    );
  });

  it('uses advance input to finish partial text before changing lines', () => {
    const { controller, input } = createHarness({
      charactersPerSecond: 10,
    });
    void controller.start(conversation);
    controller.update(frame(0.1));
    expect(controller.getSnapshot().visibleText).toBe('F');

    input.pressed.add('advanceDialogue');
    controller.update(frame(0));
    input.pressed.clear();
    expect(controller.getSnapshot()).toMatchObject({
      lineIndex: 0,
      visibleText: 'First line.',
      state: 'ready',
    });

    input.pressed.add('advanceDialogue');
    controller.update(frame(0));
    input.pressed.clear();
    expect(controller.getSnapshot()).toMatchObject({
      lineIndex: 1,
      state: 'typing',
    });
  });

  it('does not consume the input edge that started the conversation', () => {
    const { controller, input } = createHarness({ typewriterEnabled: false });
    input.pressed.add('advanceDialogue');

    void controller.start(conversation);
    controller.update(frame(0));
    expect(controller.getSnapshot().lineIndex).toBe(0);

    input.pressed.clear();
    controller.update(frame(0));
    input.pressed.add('advanceDialogue');
    controller.update(frame(0));
    expect(controller.getSnapshot().lineIndex).toBe(1);
  });

  it('prevents overlapping sessions without replacing the active one', () => {
    const { controller } = createHarness({ typewriterEnabled: false });
    void controller.start(conversation);

    expect(() => controller.start(conversation)).toThrow(
      'while "test.conversation" is active',
    );
    expect(controller.getSnapshot().lineIndex).toBe(0);
  });

  it('advances through completion, emits hooks and events, and resolves completion', async () => {
    const { controller, state } = createHarness({
      typewriterEnabled: false,
    });
    const facts: string[] = [];
    controller.events.on('dialogue:hook', ({ phase, hook }) =>
      facts.push(`${phase}:${hook.id}`),
    );
    controller.events.on('dialogue:completed', ({ conversationId }) =>
      facts.push(`completed:${conversationId}`),
    );
    const completion = controller.start(conversation);

    controller.advance();
    controller.advance();

    await expect(completion).resolves.toEqual({
      status: 'completed',
      conversationId: 'test.conversation',
    });
    expect(state.current).toBe('playing');
    expect(controller.getSnapshot().state).toBe('idle');
    expect(facts).toEqual([
      'line-entry:test.first-entered',
      'completion:test.completed',
      'completed:test.conversation',
    ]);
  });

  it('cancels only when allowed and emits the cancellation reason', async () => {
    const { controller, state } = createHarness({
      typewriterEnabled: false,
    });
    const cancelled = vi.fn();
    controller.events.on('dialogue:cancelled', cancelled);
    const completion = controller.start(conversation);

    expect(controller.cancel()).toBe(true);
    await expect(completion).resolves.toEqual({
      status: 'cancelled',
      conversationId: 'test.conversation',
      reason: 'cancelled',
    });
    expect(state.current).toBe('playing');
    expect(cancelled).toHaveBeenCalledWith({
      conversationId: 'test.conversation',
      reason: 'cancelled',
    });

    const locked = { ...conversation, id: 'test.locked', canCancel: false };
    void controller.start(locked);
    expect(controller.cancel()).toBe(false);
    expect(controller.getSnapshot().conversationId).toBe('test.locked');
  });

  it('cancels through public state events when another system leaves dialogue', async () => {
    const { controller, state } = createHarness({
      typewriterEnabled: false,
    });
    const completion = controller.start(conversation);

    state.transition('paused');

    await expect(completion).resolves.toMatchObject({
      status: 'cancelled',
      reason: 'game-state-changed',
    });
    expect(controller.getSnapshot().state).toBe('idle');
  });
});
