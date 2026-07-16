export interface ConversationLine {
  readonly speakerId: string;
  readonly text: string;
}

export interface ConversationDefinition {
  readonly id: string;
  readonly lines: readonly ConversationLine[];
  readonly placeholder?: boolean;
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
    for (const line of definition.lines) {
      if (!idPattern.test(line.speakerId) || line.text.trim().length === 0) {
        throw new Error(`Conversation "${definition.id}" has an invalid line`);
      }
    }
    ids.add(definition.id);
  }
  return Object.freeze([...definitions]);
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
