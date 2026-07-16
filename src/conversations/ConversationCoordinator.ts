import { EventBus } from '../core/events';
import type { GameStateMachine } from '../core/gameState';
import type { GameSystem } from '../core/lifecycle';
import type {
  ConversationCatalog,
  ConversationDefinition,
} from './ConversationDefinition';

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
    const session = {
      npcId,
      definition: this.catalog.get(conversationId),
    } satisfies ConversationSession;
    this.session = session;
    this.events.emit('conversation:started', { session });

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
