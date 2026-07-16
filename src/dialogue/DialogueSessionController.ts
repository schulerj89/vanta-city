import { EventBus } from '../core/events';
import type { GameSystem } from '../core/lifecycle';
import type { FrameTime } from '../core/time';
import type { GameContext } from '../game/GameRuntime';
import type { InputReader } from '../input/InputSystem';
import type {
  ConversationCoordinator,
  ConversationSession,
} from '../conversations/ConversationCoordinator';
import type {
  ConversationDefinition,
  DialogueLine,
} from '../conversations/ConversationDefinition';
import { validateConversation } from '../conversations/ConversationDefinition';
import type { DialogueEvents } from './DialogueEvents';

export interface DialogueCameraHooks {
  onDialogueStarted?(session: ConversationSession): void;
  onLineChanged?(conversationId: string, line: DialogueLine): void;
  onDialogueEnded?(
    conversationId: string,
    outcome: 'completed' | 'cancelled',
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
  readonly session: ConversationSession;
  readonly npcId: string;
  readonly conversation: ConversationDefinition;
  lineIndex: number;
  visibleCharacters: number;
  characterProgress: number;
  cameraStarted: boolean;
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
  private readonly unsubscribeConversation: (() => void)[] = [];
  private inputArmed = true;

  public constructor(
    private readonly input: InputReader,
    private readonly conversations: ConversationCoordinator,
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
    this.unsubscribeConversation.push(
      this.conversations.events.on('conversation:started', ({ session }) =>
        this.begin(session),
      ),
      this.conversations.events.on(
        'conversation:ended',
        ({ session, reason }) => this.close(session, reason),
      ),
    );
    this.unsubscribeState = context.events.on(
      'game-state:changed',
      ({ to }) => {
        if (this.active && to !== 'dialogue' && this.conversations.active) {
          this.conversations.end('cancelled');
        }
      },
    );
  }

  public update(time: FrameTime): void {
    const active = this.active;
    if (!active) return;
    this.updateTypewriter(active, time.delta);
    if (this.active !== active) return;

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

  public request(conversationId: string, npcId: string): boolean {
    return this.conversations.start(conversationId, npcId);
  }

  private begin(session: ConversationSession): void {
    const conversation = session.definition;
    validateConversation(conversation);
    if (this.active?.session === session) return;
    if (this.active) {
      throw new Error(
        `Cannot start conversation "${conversation.id}" while "${this.active.conversation.id}" is active`,
      );
    }
    const active: ActiveSession = {
      session,
      npcId: session.npcId,
      conversation,
      lineIndex: 0,
      visibleCharacters: 0,
      characterProgress: 0,
      cameraStarted: false,
    };
    this.active = active;
    // An interaction key or debug-panel click may also be bound to dialogue.
    // Wait for that initiating edge to clear before dialogue consumes input.
    this.inputArmed = !this.hasPendingDialogueInput();
    this.events.emit('dialogue:started', { conversation });
    if (this.active !== active) return;
    active.cameraStarted = true;
    this.cameraHooks.onDialogueStarted?.(session);
    if (this.active !== active) return;
    this.enterCurrentLine(active);
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
    if (!line) return;
    const nextIndex = line.nextLine
      ? active.conversation.lines.findIndex(({ id }) => id === line.nextLine)
      : active.lineIndex + 1;
    if (nextIndex < 0 || nextIndex >= active.conversation.lines.length) {
      this.finish(active);
      return;
    }
    active.lineIndex = nextIndex;
    active.visibleCharacters = 0;
    active.characterProgress = 0;
    this.enterCurrentLine(active);
  }

  public skipTypewriter(): void {
    if (this.active) this.completeCurrentLine(this.active);
  }

  public cancel(): boolean {
    if (!this.active || !this.active.conversation.canCancel) return false;
    return this.conversations.end('cancelled');
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
    if (!line) return this.idleSnapshot();
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
    if (this.active) this.conversations.end('cancelled');
    for (const unsubscribe of this.unsubscribeConversation.splice(0))
      unsubscribe();
    this.events.clear();
  }

  private updateTypewriter(active: ActiveSession, delta: number): void {
    if (this.active !== active) return;
    if (!this.typewriterEnabled) {
      this.completeCurrentLine(active);
      return;
    }
    if (this.isCurrentLineComplete(active)) return;
    active.characterProgress += Math.max(0, delta) * this.charactersPerSecond;
    const reveal = Math.floor(active.characterProgress);
    if (reveal === 0) return;
    const line = this.currentLine(active);
    if (!line) return;
    active.visibleCharacters = Math.min(
      Array.from(line.text).length,
      active.visibleCharacters + reveal,
    );
    active.characterProgress -= reveal;
  }

  private enterCurrentLine(active: ActiveSession): void {
    if (this.active !== active) return;
    const line = this.currentLine(active);
    if (!line) return;
    if (!this.typewriterEnabled) this.completeCurrentLine(active);
    const context = {
      conversationId: active.conversation.id,
      lineId: line.id,
      lineIndex: active.lineIndex,
      speakerId: line.speakerId,
    };
    this.events.emit('dialogue:line-changed', { ...context, line });
    if (this.active !== active) return;
    if (line.onEnter) {
      this.events.emit('dialogue:hook', {
        ...context,
        phase: 'line-entry',
        hook: line.onEnter,
      });
      if (this.active !== active) return;
    }
    this.cameraHooks.onLineChanged?.(active.conversation.id, line);
  }

  private finish(active: ActiveSession): void {
    if (this.active !== active) return;
    const conversationId = active.conversation.id;
    const finalLine = this.currentLine(active);
    if (!finalLine) return;
    if (active.conversation.onComplete) {
      this.events.emit('dialogue:hook', {
        conversationId,
        lineId: finalLine.id,
        lineIndex: active.lineIndex,
        speakerId: finalLine.speakerId,
        phase: 'completion',
        hook: active.conversation.onComplete,
      });
      if (this.active !== active) return;
    }
    this.conversations.end('completed');
  }

  private close(
    session: ConversationSession,
    reason: 'completed' | 'cancelled',
  ): void {
    const active = this.active;
    if (!active || active.session !== session) return;
    const conversationId = session.definition.id;
    this.active = undefined;
    // Release camera ownership before observers can synchronously start the
    // next conversation from a completed/cancelled event.
    if (active.cameraStarted) {
      this.cameraHooks.onDialogueEnded?.(conversationId, reason);
    }
    if (reason === 'completed') {
      this.events.emit('dialogue:completed', { conversationId });
    } else {
      this.events.emit('dialogue:cancelled', {
        conversationId,
        reason: 'cancelled',
      });
    }
  }

  private currentLine(active: ActiveSession): DialogueLine | undefined {
    if (this.active !== active) return undefined;
    return active.conversation.lines[active.lineIndex];
  }

  private completeCurrentLine(active: ActiveSession): void {
    const line = this.currentLine(active);
    if (!line) return;
    active.visibleCharacters = Array.from(line.text).length;
    active.characterProgress = 0;
  }

  private isCurrentLineComplete(active: ActiveSession): boolean {
    const line = this.currentLine(active);
    if (!line) return false;
    return active.visibleCharacters >= Array.from(line.text).length;
  }

  private hasPendingDialogueInput(): boolean {
    return ['advanceDialogue', 'skipDialogueTypewriter', 'cancelDialogue'].some(
      (action) => this.input.isDown(action) || this.input.wasPressed(action),
    );
  }

  private idleSnapshot(): DialogueSessionSnapshot {
    return {
      state: 'idle',
      visibleText: '',
      fullText: '',
      canCancel: false,
      typewriterEnabled: this.typewriterEnabled,
    };
  }
}
