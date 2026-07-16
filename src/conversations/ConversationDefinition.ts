export interface DialogueEventHook {
  readonly id: string;
  readonly payload?: Readonly<Record<string, string | number | boolean>>;
}

export interface DialoguePortraitOverride {
  readonly src: string;
  readonly alt?: string;
}

export interface ConversationLine {
  readonly id: string;
  readonly speakerId: string;
  readonly text: string;
  readonly portraitOverride?: DialoguePortraitOverride;
  readonly nextLine?: string;
  readonly onEnter?: DialogueEventHook;
}

export type DialogueLine = ConversationLine;

export interface ConversationDefinition {
  readonly id: string;
  readonly lines: readonly ConversationLine[];
  readonly placeholder?: boolean;
  readonly canCancel?: boolean;
  readonly onComplete?: DialogueEventHook;
}

const idPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

export function validateConversationDefinitions(
  definitions: readonly ConversationDefinition[],
): readonly ConversationDefinition[] {
  const ids = new Set<string>();
  for (const definition of definitions) {
    if (!idPattern.test(definition.id)) {
      throw new Error(`Invalid conversation id: ${definition.id}`);
    }
    if (ids.has(definition.id)) {
      throw new Error(`Duplicate conversation id: ${definition.id}`);
    }
    if (!definition.placeholder && definition.lines.length === 0) {
      throw new Error(`Conversation "${definition.id}" has no lines`);
    }
    const lineIds = new Set<string>();
    for (const line of definition.lines) {
      if (
        !idPattern.test(line.id) ||
        !idPattern.test(line.speakerId) ||
        line.text.trim().length === 0
      ) {
        throw new Error(`Conversation "${definition.id}" has an invalid line`);
      }
      if (lineIds.has(line.id)) {
        throw new Error(`Duplicate dialogue line id: ${line.id}`);
      }
      lineIds.add(line.id);
    }
    for (const line of definition.lines) {
      if (line.nextLine && !lineIds.has(line.nextLine)) {
        throw new Error(
          `Dialogue line "${line.id}" points to missing line "${line.nextLine}"`,
        );
      }
    }
    ids.add(definition.id);
  }
  return Object.freeze([...definitions]);
}

export function validateConversation(
  conversation: ConversationDefinition,
): void {
  validateConversationDefinitions([conversation]);
}

export class ConversationCatalog {
  private readonly byId: ReadonlyMap<string, ConversationDefinition>;

  public constructor(
    public readonly definitions: readonly ConversationDefinition[],
  ) {
    this.byId = new Map(
      validateConversationDefinitions(definitions).map((definition) => [
        definition.id,
        definition,
      ]),
    );
  }

  public get(id: string): ConversationDefinition {
    const definition = this.byId.get(id);
    if (!definition) throw new Error(`Unknown conversation: ${id}`);
    return definition;
  }
}
