import { ConversationCatalog } from '../src/conversations/ConversationDefinition';
import type { CharacterDefinition } from '../src/characters/CharacterDefinition';
import type { NpcDefinition } from '../src/npcs/NpcDefinition';
import { validateNpcDefinitions } from '../src/npcs/NpcDefinition';

const characters = [
  { id: 'worker', displayName: 'Worker', fallback: 'placeholder' },
] as const satisfies readonly CharacterDefinition[];

const conversations = new ConversationCatalog([
  {
    id: 'conversation.test',
    lines: [
      { id: 'conversation.test.hello', speakerId: 'worker', text: 'Hello' },
    ],
  },
]);

const npc: NpcDefinition = {
  id: 'mack',
  displayName: 'Mack',
  characterId: 'worker',
  portraitAssetId: 'portrait.mack',
  defaultAnimation: 'idle',
  spawnId: 'spawn.npc-mack',
  interactionLabel: 'Talk',
  conversationId: 'conversation.test',
  interactionRadius: 3,
};

describe('NPC definition validation', () => {
  it('accepts a complete data-driven NPC definition', () => {
    expect(validateNpcDefinitions([npc], characters, conversations)).toEqual([
      npc,
    ]);
  });

  it('rejects duplicate ids, invalid radii, and unknown references', () => {
    expect(() => validateNpcDefinitions([npc, npc])).toThrow('Duplicate NPC');
    expect(() =>
      validateNpcDefinitions([{ ...npc, interactionRadius: 0 }]),
    ).toThrow('interaction radius');
    expect(() =>
      validateNpcDefinitions(
        [{ ...npc, characterId: 'missing' }],
        characters,
        conversations,
      ),
    ).toThrow('unknown character');
    expect(() =>
      validateNpcDefinitions(
        [{ ...npc, conversationId: 'conversation.missing' }],
        characters,
        conversations,
      ),
    ).toThrow('Unknown conversation');
  });
});
