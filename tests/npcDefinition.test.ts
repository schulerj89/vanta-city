import { ConversationCatalog } from '../src/conversations/ConversationDefinition';
import type { CharacterDefinition } from '../src/characters/CharacterDefinition';
import type { NpcDefinition } from '../src/npcs/NpcDefinition';
import { validateNpcDefinitions } from '../src/npcs/NpcDefinition';
import { assetManifest } from '../src/assets/catalog';
import type { AssetManifest } from '../src/assets/AssetCatalog';
import { characterDefinitions } from '../src/characters/characters';
import {
  cinematicCastCharacterDefinitions,
  npcCharacterDefinitions,
  npcDefinitions,
  npcFixtureCharacterDefinitions,
  pedestrianCharacterDefinitions,
  productionNpcDefinitions,
} from '../src/npcs/npcs';

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
  applauseAnimation: 'applaud',
  spawnId: 'spawn.npc-mack',
  interactionLabel: 'Talk',
  conversationId: 'conversation.test',
  interactionRadius: 3,
};

describe('NPC definition validation', () => {
  it('promotes Mack through the production roster without changing IDs', () => {
    expect(productionNpcDefinitions.map(({ id }) => id)).toEqual([
      'mack',
      'della-voss',
    ]);
    expect(productionNpcDefinitions[0]).toBe(
      npcDefinitions.find(({ id }) => id === 'mack'),
    );
  });

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
          applauseAnimation,
          conversationCameraProfileId,
        }) => ({
          id,
          characterId,
          applauseAnimation,
          conversationCameraProfileId,
        }),
      ),
    ).toEqual([
      {
        id: 'mack',
        characterId: 'npc-worker',
        applauseAnimation: 'applaud',
        conversationCameraProfileId: 'close',
      },
      {
        id: 'della-voss',
        characterId: 'pedestrian-street',
        applauseAnimation: 'applaud',
        conversationCameraProfileId: 'close',
      },
      {
        id: 'nox',
        characterId: 'npc-hoodie',
        applauseAnimation: 'applaud',
        conversationCameraProfileId: undefined,
      },
      {
        id: 'raze',
        characterId: 'npc-punk',
        applauseAnimation: 'applaud',
        conversationCameraProfileId: 'wide',
      },
    ]);
    expect(npcFixtureCharacterDefinitions.map(({ id }) => id)).toEqual([
      'npc-worker',
      'npc-hoodie',
      'npc-punk',
    ]);
    expect(pedestrianCharacterDefinitions.map(({ id }) => id)).toEqual([
      'pedestrian-casual',
      'pedestrian-street',
      'pedestrian-tank-top',
      'pedestrian-dress',
    ]);
    expect(npcCharacterDefinitions).toHaveLength(13);
    expect(characterDefinitions.map(({ id }) => id)).toEqual([
      'casual',
      'punk',
    ]);
    const manifest: AssetManifest = assetManifest;
    for (const definition of npcFixtureCharacterDefinitions) {
      expect(definition.animations).toMatchObject({
        idle: { clipNames: ['HumanArmature|Man_Idle'], required: true },
        applaud: {
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

  it('registers an unplaced CC0 cinematic cast with honest performance clips', () => {
    const manifest: AssetManifest = assetManifest;
    expect(cinematicCastCharacterDefinitions.map(({ id }) => id)).toEqual([
      'cast-business',
      'cast-beach',
      'cast-farmer',
      'cast-hoodie',
      'cast-worker',
      'cast-performer',
    ]);
    for (const definition of cinematicCastCharacterDefinitions) {
      expect(definition.animations).toMatchObject({
        idle: { required: true },
        walk: { required: true },
        run: { required: true },
      });
      expect(manifest[definition.modelAssetId!]?.attribution).toMatchObject({
        creator: 'Quaternius',
        license: 'CC0 1.0 Universal',
      });
    }
    expect(cinematicCastCharacterDefinitions.at(-1)?.animations).toMatchObject({
      dance: { clipNames: ['Dance_Loop'], required: true },
      sit: { clipNames: ['Sitting_Enter'], required: true },
      seatedHold: { clipNames: ['Sitting_Idle_Loop'], required: true },
      stand: { clipNames: ['Sitting_Exit'], required: true },
    });
    const performerModel =
      manifest[cinematicCastCharacterDefinitions.at(-1)!.modelAssetId!];
    expect(performerModel?.url).toContain('venue-performer-industrial.glb');
    expect(performerModel?.metadata?.presentation).toBe(
      'fully-clothed-1997-industrial-stage-outfit',
    );
    expect(performerModel?.metadata?.runtimeTextureResolution).toBe(1024);
    expect(performerModel?.metadata?.sourceComponents).toBe(3);
    expect(performerModel?.url).not.toContain('superhero-female.glb');
    expect(
      npcDefinitions.some(({ characterId }) => characterId.startsWith('cast-')),
    ).toBe(false);
  });

  it('registers four production pedestrian models with exact interaction clips', () => {
    const manifest: AssetManifest = assetManifest;
    for (const definition of pedestrianCharacterDefinitions) {
      expect(definition.animations).toMatchObject({
        idle: { clipNames: ['HumanArmature|Female_Idle'], required: true },
        applaud: {
          clipNames: ['HumanArmature|Female_Clapping'],
          required: true,
        },
      });
      expect(definition.transform).toEqual({
        scale: 0.38,
      });
      expect(definition.fallback).toBe('placeholder');
      const asset = manifest[definition.modelAssetId!];
      expect(asset).toMatchObject({
        type: 'model',
        attribution: {
          creator: 'Quaternius',
          license: 'CC0 1.0 Universal',
        },
        metadata: {
          intendedUse: 'ambient-pedestrian',
          embeddedAnimations: 11,
        },
      });
      expect(asset?.url).toContain('/assets/characters/animated-women/');
      expect(asset?.attribution?.sourceUrl).toBe(
        'https://poly.pizza/bundle/Animated-Women-Pack-HHSKxnk1mY',
      );
    }
  });
});
