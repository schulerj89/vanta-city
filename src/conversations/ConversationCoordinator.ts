import { EventBus } from '../core/events';
import type { GameStateMachine } from '../core/gameState';
import type { GameSystem } from '../core/lifecycle';
import type {
  ConversationCatalog,
  ConversationDefinition,
} from './ConversationDefinition';
import { isPlayableConversation } from './ConversationDefinition';

export interface ConversationSession {
  readonly npcId: string;
  readonly definition: ConversationDefinition;
}

export interface ConversationEvents {
  'conversation:started': { readonly session: ConversationSession };
  'conversation:ended': {
    readonly session: ConversationSession;
    readonly reason: 'completed' | 'cancelled';
  };
}

/**
 * Dialogue-facing session signal. It owns no UI or camera; future dialogue
 * presentation subscribes to these events and calls end when content finishes.
 */
export class ConversationCoordinator implements GameSystem {
  public readonly id = 'conversations';
  public readonly events = new EventBus<ConversationEvents>();
  private session: ConversationSession | undefined;

  public constructor(
    private readonly catalog: ConversationCatalog,
    private readonly state: GameStateMachine,
  ) {}

  public get active(): ConversationSession | undefined {
    return this.session;
  }

  public start(conversationId: string, npcId: string): boolean {
    if (this.session || this.state.current !== 'playing') return false;
    // Resolve and admit the definition before publishing any lifecycle event.
    // Empty placeholders are valid NPC references, but have no dialogue
    // session that could be advanced or completed.
    const definition = this.catalog.get(conversationId);
    if (!isPlayableConversation(definition)) return false;
    const session = {
      npcId,
      definition,
    } satisfies ConversationSession;
    this.session = session;
    try {
      this.events.emit('conversation:started', { session });
    } catch (error) {
      // A presentation subscriber may have acquired UI or camera ownership
      // before a later subscriber fails. Roll back through the same end event
      // used by ordinary cancellation so every initialized owner releases.
      if (this.session === session) {
        this.session = undefined;
        this.events.emit('conversation:ended', {
          session,
          reason: 'cancelled',
        });
      }
      throw error;
    }

    // A started observer may synchronously reject/end the request.
    if (this.session !== session) return false;

    // Let the initiating InteractionSystem finish its immediate action before
    // changing state; availability is already locked by the active session.
    queueMicrotask(() => {
      if (this.session === session && this.state.current === 'playing') {
        this.state.transition('dialogue');
      }
    });
    return true;
  }

  public end(reason: 'completed' | 'cancelled' = 'completed'): boolean {
    const session = this.session;
    if (!session) return false;
    this.session = undefined;
    if (
      this.state.current !== 'playing' &&
      this.state.canTransition('playing')
    ) {
      this.state.transition('playing');
    }
    this.events.emit('conversation:ended', { session, reason });
    return true;
  }

  public dispose(): void {
    this.end('cancelled');
    this.events.clear();
  }
}
