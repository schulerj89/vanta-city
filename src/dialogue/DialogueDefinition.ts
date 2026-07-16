export interface DialogueEventHook {
  /** Stable fact name consumed by future mission or narrative adapters. */
  readonly id: string;
  readonly payload?: Readonly<Record<string, string | number | boolean>>;
}

export interface DialoguePortraitOverride {
  readonly src: string;
  readonly alt?: string;
}

export interface DialogueLine {
  readonly id: string;
  readonly speakerId: string;
  readonly text: string;
  readonly portraitOverride?: DialoguePortraitOverride;
  /** Omit to continue to the next ordered line. */
  readonly nextLine?: string;
  readonly onEnter?: DialogueEventHook;
}

export interface ConversationDefinition {
  readonly id: string;
  readonly lines: readonly DialogueLine[];
  readonly canCancel?: boolean;
  readonly onComplete?: DialogueEventHook;
}

const idPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

export function validateConversation(
  conversation: ConversationDefinition,
): void {
  if (!idPattern.test(conversation.id)) {
    throw new Error(`Invalid conversation id: ${conversation.id}`);
  }
  if (conversation.lines.length === 0) {
    throw new Error(`Conversation "${conversation.id}" has no lines`);
  }
  const lineIds = new Set<string>();
  for (const line of conversation.lines) {
    if (!idPattern.test(line.id)) {
      throw new Error(`Invalid dialogue line id: ${line.id}`);
    }
    if (lineIds.has(line.id)) {
      throw new Error(`Duplicate dialogue line id: ${line.id}`);
    }
    if (line.text.trim().length === 0) {
      throw new Error(`Dialogue line "${line.id}" has no text`);
    }
    lineIds.add(line.id);
  }
  for (const line of conversation.lines) {
    if (line.nextLine && !lineIds.has(line.nextLine)) {
      throw new Error(
        `Dialogue line "${line.id}" points to missing line "${line.nextLine}"`,
      );
    }
  }
}
