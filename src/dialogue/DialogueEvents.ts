import type {
  ConversationDefinition,
  DialogueEventHook,
  DialogueLine,
} from '../conversations/ConversationDefinition';

export type DialogueCancelReason =
  'cancelled' | 'game-state-changed' | 'system-disposed';

export interface DialogueEventContext {
  readonly conversationId: string;
  readonly lineId: string;
  readonly lineIndex: number;
  readonly speakerId: string;
}

export interface DialogueEvents {
  'dialogue:started': {
    readonly conversation: ConversationDefinition;
  };
  'dialogue:line-changed': DialogueEventContext & {
    readonly line: DialogueLine;
  };
  'dialogue:completed': {
    readonly conversationId: string;
  };
  'dialogue:cancelled': {
    readonly conversationId: string;
    readonly reason: DialogueCancelReason;
  };
  'dialogue:hook': DialogueEventContext & {
    readonly phase: 'line-entry' | 'completion';
    readonly hook: DialogueEventHook;
  };
}

export type DialogueOutcome =
  | { readonly status: 'completed'; readonly conversationId: string }
  | {
      readonly status: 'cancelled';
      readonly conversationId: string;
      readonly reason: DialogueCancelReason;
    };
