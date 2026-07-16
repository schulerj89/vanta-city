import { EventBus } from '../core/events';
import type { GameStateMachine } from '../core/gameState';
import type { GameSystem } from '../core/lifecycle';
import type { FrameTime } from '../core/time';
import type { GameContext } from '../game/GameRuntime';
import type { InputReader } from '../input/InputSystem';
import type {
  ConversationDefinition,
  DialogueLine,
} from './DialogueDefinition';
import { validateConversation } from './DialogueDefinition';
import type {
  DialogueCancelReason,
  DialogueEvents,
  DialogueOutcome,
} from './DialogueEvents';

export interface DialogueCameraHooks {
  onDialogueStarted?(conversationId: string): void;
  onLineChanged?(conversationId: string, line: DialogueLine): void;
  onDialogueEnded?(
    conversationId: string,
    outcome: DialogueOutcome['status'],
  ): void;
}

export interface DialogueSessionOptions {
  readonly typewriterEnabled?: boolean;
  readonly charactersPerSecond?: number;
  readonly cameraHooks?: DialogueCameraHooks;
}

export interface DialogueSessionSnapshot {
  readonly state: 'idle' | 'typing' | 'ready';
  readonly conversationId?: string;
  readonly lineId?: string;
  readonly lineIndex?: number;
  readonly speakerId?: string;
  readonly visibleText: string;
  readonly fullText: string;
  readonly canCancel: boolean;
  readonly typewriterEnabled: boolean;
}

interface ActiveSession {
  readonly conversation: ConversationDefinition;
  lineIndex: number;
  visibleCharacters: number;
  characterProgress: number;
  readonly completion: Promise<DialogueOutcome>;
  resolve(outcome: DialogueOutcome): void;
}

export class DialogueSessionController implements GameSystem<GameContext> {
  public readonly id = 'dialogue-session';
  public readonly updateMode = 'always' as const;
  public readonly events = new EventBus<DialogueEvents>();

  private active: ActiveSession | undefined;
  private typewriterEnabled: boolean;
  private readonly charactersPerSecond: number;
  private readonly cameraHooks: DialogueCameraHooks;
  private unsubscribeState: (() => void) | undefined;
  private inputArmed = true;

  public constructor(
    private readonly input: InputReader,
    private readonly state: GameStateMachine,
    options: DialogueSessionOptions = {},
  ) {
    this.typewriterEnabled = options.typewriterEnabled ?? true;
    this.charactersPerSecond = options.charactersPerSecond ?? 42;
    if (
      !Number.isFinite(this.charactersPerSecond) ||
      this.charactersPerSecond <= 0
    ) {
      throw new Error('Dialogue charactersPerSecond must be positive');
    }
    this.cameraHooks = options.cameraHooks ?? {};
  }

  public init(context: GameContext): void {
    this.unsubscribeState = context.events.on(
      'game-state:changed',
      ({ to }) => {
        if (this.active && to !== 'dialogue') {
          this.cancelInternal('game-state-changed', false);
        }
      },
    );
  }

  public update(time: FrameTime): void {
    const active = this.active;
    if (!active) return;
    this.updateTypewriter(active, time.delta);

    if (!this.inputArmed) {
      if (!this.hasPendingDialogueInput()) this.inputArmed = true;
      return;
    }

    if (this.input.wasPressed('cancelDialogue')) {
      this.cancel();
      return;
    }
    if (this.input.wasPressed('advanceDialogue')) {
      this.advance();
      return;
    }
    if (this.input.wasPressed('skipDialogueTypewriter')) {
      this.skipTypewriter();
    }
  }

  public start(conversation: ConversationDefinition): Promise<DialogueOutcome> {
    validateConversation(conversation);
    if (this.active) {
      throw new Error(
        `Cannot start conversation "${conversation.id}" while "${this.active.conversation.id}" is active`,
      );
    }
    if (this.state.current !== 'playing') {
      throw new Error(
        `Conversation "${conversation.id}" requires playing state; current state is ${this.state.current}`,
      );
    }

    let resolveCompletion: (outcome: DialogueOutcome) => void = () => undefined;
    const completion = new Promise<DialogueOutcome>((resolve) => {
      resolveCompletion = resolve;
    });
    this.active = {
      conversation,
      lineIndex: 0,
      visibleCharacters: 0,
      characterProgress: 0,
      completion,
      resolve: resolveCompletion,
    };
    // An interaction key or debug-panel click may also be bound to dialogue.
    // Wait for that initiating edge to clear before dialogue consumes input.
    this.inputArmed = !this.hasPendingDialogueInput();
    this.state.transition('dialogue');
    this.events.emit('dialogue:started', { conversation });
    this.cameraHooks.onDialogueStarted?.(conversation.id);
    this.enterCurrentLine();
    return completion;
  }

  /** Completes a partial line first; otherwise moves to the next line. */
  public advance(): void {
    const active = this.active;
    if (!active) return;
    if (!this.isCurrentLineComplete(active)) {
      this.completeCurrentLine(active);
      return;
    }

    const line = this.currentLine(active);
    const nextIndex = line.nextLine
      ? active.conversation.lines.findIndex(({ id }) => id === line.nextLine)
      : active.lineIndex + 1;
    if (nextIndex < 0 || nextIndex >= active.conversation.lines.length) {
      this.finish();
      return;
    }
    active.lineIndex = nextIndex;
    active.visibleCharacters = 0;
    active.characterProgress = 0;
    this.enterCurrentLine();
  }

  public skipTypewriter(): void {
    if (this.active) this.completeCurrentLine(this.active);
  }

  public cancel(): boolean {
    if (!this.active || !this.active.conversation.canCancel) return false;
    this.cancelInternal('cancelled', true);
    return true;
  }

  public setTypewriterEnabled(enabled: boolean): void {
    this.typewriterEnabled = enabled;
    if (!enabled && this.active) this.completeCurrentLine(this.active);
  }

  public getCurrentLine(): DialogueLine | undefined {
    return this.active ? this.currentLine(this.active) : undefined;
  }

  public getSnapshot(): DialogueSessionSnapshot {
    const active = this.active;
    if (!active) {
      return {
        state: 'idle',
        visibleText: '',
        fullText: '',
        canCancel: false,
        typewriterEnabled: this.typewriterEnabled,
      };
    }
    const line = this.currentLine(active);
    const characters = Array.from(line.text);
    const complete = active.visibleCharacters >= characters.length;
    return {
      state: complete ? 'ready' : 'typing',
      conversationId: active.conversation.id,
      lineId: line.id,
      lineIndex: active.lineIndex,
      speakerId: line.speakerId,
      visibleText: characters.slice(0, active.visibleCharacters).join(''),
      fullText: line.text,
      canCancel: active.conversation.canCancel ?? false,
      typewriterEnabled: this.typewriterEnabled,
    };
  }

  public dispose(): void {
    this.unsubscribeState?.();
    this.unsubscribeState = undefined;
    if (this.active) this.cancelInternal('system-disposed', false);
    this.events.clear();
  }

  private updateTypewriter(active: ActiveSession, delta: number): void {
    if (!this.typewriterEnabled) {
      this.completeCurrentLine(active);
      return;
    }
    if (this.isCurrentLineComplete(active)) return;
    active.characterProgress += Math.max(0, delta) * this.charactersPerSecond;
    const reveal = Math.floor(active.characterProgress);
    if (reveal === 0) return;
    active.visibleCharacters = Math.min(
      Array.from(this.currentLine(active).text).length,
      active.visibleCharacters + reveal,
    );
    active.characterProgress -= reveal;
  }

  private enterCurrentLine(): void {
    const active = this.requireActive();
    const line = this.currentLine(active);
    if (!this.typewriterEnabled) this.completeCurrentLine(active);
    const context = {
      conversationId: active.conversation.id,
      lineId: line.id,
      lineIndex: active.lineIndex,
      speakerId: line.speakerId,
    };
    this.events.emit('dialogue:line-changed', { ...context, line });
    if (line.onEnter) {
      this.events.emit('dialogue:hook', {
        ...context,
        phase: 'line-entry',
        hook: line.onEnter,
      });
    }
    this.cameraHooks.onLineChanged?.(active.conversation.id, line);
  }

  private finish(): void {
    const active = this.requireActive();
    const conversationId = active.conversation.id;
    const finalLine = this.currentLine(active);
    const outcome: DialogueOutcome = { status: 'completed', conversationId };
    this.active = undefined;
    if (this.state.current === 'dialogue') this.state.transition('playing');
    if (active.conversation.onComplete) {
      this.events.emit('dialogue:hook', {
        conversationId,
        lineId: finalLine.id,
        lineIndex: active.lineIndex,
        speakerId: finalLine.speakerId,
        phase: 'completion',
        hook: active.conversation.onComplete,
      });
    }
    this.events.emit('dialogue:completed', { conversationId });
    this.cameraHooks.onDialogueEnded?.(conversationId, 'completed');
    active.resolve(outcome);
  }

  private cancelInternal(
    reason: DialogueCancelReason,
    transitionToPlaying: boolean,
  ): void {
    const active = this.requireActive();
    const conversationId = active.conversation.id;
    const outcome: DialogueOutcome = {
      status: 'cancelled',
      conversationId,
      reason,
    };
    this.active = undefined;
    if (transitionToPlaying && this.state.current === 'dialogue') {
      this.state.transition('playing');
    }
    this.events.emit('dialogue:cancelled', { conversationId, reason });
    this.cameraHooks.onDialogueEnded?.(conversationId, 'cancelled');
    active.resolve(outcome);
  }

  private currentLine(active: ActiveSession): DialogueLine {
    const line = active.conversation.lines[active.lineIndex];
    if (!line) throw new Error('Active dialogue line is unavailable');
    return line;
  }

  private completeCurrentLine(active: ActiveSession): void {
    active.visibleCharacters = Array.from(this.currentLine(active).text).length;
    active.characterProgress = 0;
  }

  private isCurrentLineComplete(active: ActiveSession): boolean {
    return (
      active.visibleCharacters >=
      Array.from(this.currentLine(active).text).length
    );
  }

  private hasPendingDialogueInput(): boolean {
    return ['advanceDialogue', 'skipDialogueTypewriter', 'cancelDialogue'].some(
      (action) => this.input.isDown(action) || this.input.wasPressed(action),
    );
  }

  private requireActive(): ActiveSession {
    if (!this.active) throw new Error('No dialogue session is active');
    return this.active;
  }
}
