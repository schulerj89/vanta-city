import type { CharacterDefinition } from '../characters/CharacterDefinition';
import type { ConversationCatalog } from '../conversations/ConversationDefinition';
import type { ConversationCameraProfileId } from '../camera/ConversationCameraProfile';
import { isConversationCameraProfileId } from '../camera/ConversationCameraProfile';

export interface NpcDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly characterId: string;
  readonly portraitAssetId: string;
  readonly defaultAnimation: string;
  /** Explicit celebratory action. Never used as Talk or missing-action fallback. */
  readonly applauseAnimation?: string;
  readonly spawnId: string;
  readonly interactionLabel: string;
  readonly conversationId: string;
  /** Optional Talk surface-gap override; omit for the shared Talk profile. */
  readonly interactionRadius?: number;
  readonly idleYaw?: number;
  readonly ambientYaw?: number;
  readonly conversationCameraProfileId?: ConversationCameraProfileId;
}

const idPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

export function validateNpcDefinitions(
  definitions: readonly NpcDefinition[],
  characters?: readonly CharacterDefinition[],
  conversations?: ConversationCatalog,
): readonly NpcDefinition[] {
  if (definitions.length === 0) throw new Error('At least one NPC is required');
  const ids = new Set<string>();
  const characterIds = characters
    ? new Set(characters.map(({ id }) => id))
    : undefined;
  for (const definition of definitions) {
    if (!idPattern.test(definition.id)) {
      throw new Error(`Invalid NPC id: ${definition.id}`);
    }
    if (ids.has(definition.id)) {
      throw new Error(`Duplicate NPC id: ${definition.id}`);
    }
    if (definition.displayName.trim().length === 0) {
      throw new Error(`NPC "${definition.id}" needs a display name`);
    }
    for (const [label, value] of [
      ['character', definition.characterId],
      ['portrait', definition.portraitAssetId],
      ['spawn', definition.spawnId],
      ['conversation', definition.conversationId],
    ] as const) {
      if (!idPattern.test(value)) {
        throw new Error(`NPC "${definition.id}" has invalid ${label} id`);
      }
    }
    if (definition.defaultAnimation.trim().length === 0) {
      throw new Error(`NPC "${definition.id}" needs a default animation`);
    }
    if (
      definition.applauseAnimation !== undefined &&
      definition.applauseAnimation.trim().length === 0
    ) {
      throw new Error(
        `NPC "${definition.id}" has an invalid applause animation`,
      );
    }
    if (definition.interactionLabel.trim().length === 0) {
      throw new Error(`NPC "${definition.id}" needs an interaction label`);
    }
    if (
      definition.interactionRadius !== undefined &&
      (!Number.isFinite(definition.interactionRadius) ||
        definition.interactionRadius <= 0)
    ) {
      throw new Error(`NPC "${definition.id}" has invalid interaction radius`);
    }
    if (
      definition.conversationCameraProfileId !== undefined &&
      !isConversationCameraProfileId(definition.conversationCameraProfileId)
    ) {
      throw new Error(
        `NPC "${definition.id}" has unknown conversation camera profile`,
      );
    }
    if (characterIds && !characterIds.has(definition.characterId)) {
      throw new Error(
        `NPC "${definition.id}" references unknown character "${definition.characterId}"`,
      );
    }
    conversations?.get(definition.conversationId);
    ids.add(definition.id);
  }
  return Object.freeze([...definitions]);
}
