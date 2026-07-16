import { ConversationCatalog } from '../src/conversations/ConversationDefinition';
import type { CharacterDefinition } from '../src/characters/CharacterDefinition';
import type { NpcDefinition } from '../src/npcs/NpcDefinition';
import { validateNpcDefinitions } from '../src/npcs/NpcDefinition';
import { assetManifest } from '../src/assets/catalog';
import type { AssetManifest } from '../src/assets/AssetCatalog';
import { characterDefinitions } from '../src/characters/characters';
import { npcCharacterDefinitions, npcDefinitions } from '../src/npcs/npcs';

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
  gestureAnimation: 'gesture',
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
    expect(() =>
      validateNpcDefinitions([
        {
          ...npc,
          conversationCameraProfileId: 'unknown' as 'default',
        },
      ]),
    ).toThrow('unknown conversation camera profile');
  });

  it('maps the fixed NPC roster to exact non-playable Animated Men assets', () => {
    expect(
      npcDefinitions.map(
        ({
          id,
          characterId,
          gestureAnimation,
          conversationCameraProfileId,
          conversationGesture,
        }) => ({
          id,
          characterId,
          gestureAnimation,
          conversationCameraProfileId,
          conversationGesture,
        }),
      ),
    ).toEqual([
      {
        id: 'mack',
        characterId: 'npc-worker',
        gestureAnimation: 'gesture',
        conversationCameraProfileId: 'close',
        conversationGesture: undefined,
      },
      {
        id: 'nox',
        characterId: 'npc-hoodie',
        gestureAnimation: 'gesture',
        conversationCameraProfileId: undefined,
        conversationGesture: false,
      },
      {
        id: 'raze',
        characterId: 'npc-punk',
        gestureAnimation: 'gesture',
        conversationCameraProfileId: 'wide',
        conversationGesture: false,
      },
    ]);
    expect(npcCharacterDefinitions.map(({ id }) => id)).toEqual([
      'npc-worker',
      'npc-hoodie',
      'npc-punk',
    ]);
    expect(characterDefinitions.map(({ id }) => id)).toEqual([
      'casual',
      'punk',
    ]);
    const manifest: AssetManifest = assetManifest;
    for (const definition of npcCharacterDefinitions) {
      expect(definition.animations).toMatchObject({
        idle: { clipNames: ['HumanArmature|Man_Idle'], required: true },
        gesture: {
          clipNames: ['HumanArmature|Man_Clapping'],
          required: true,
        },
      });
      const asset = manifest[definition.modelAssetId!];
      expect(asset).toBeDefined();
      if (!asset) throw new Error('NPC model asset is not registered');
      expect(asset.url).toContain('/assets/characters/animated-men/');
      expect(asset.url).not.toContain('ultimate-modular-men');
      expect(asset.attribution).toMatchObject({
        creator: 'Quaternius',
        license: 'CC0 1.0 Universal',
      });
      expect(asset.attribution?.sourceUrl).toMatch(
        /^https:\/\/poly\.pizza\/m\//,
      );
    }
  });
});
