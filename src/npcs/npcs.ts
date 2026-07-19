import type { CharacterDefinition } from '../characters/CharacterDefinition';
import { validateCharacterDefinitions } from '../characters/CharacterDefinition';
import { conversationCatalog } from '../conversations/conversations';
import type { NpcDefinition } from './NpcDefinition';
import { validateNpcDefinitions } from './NpcDefinition';

const animatedMenNpcAnimations = {
  idle: {
    clipNames: ['HumanArmature|Man_Idle'],
    required: true,
  },
  applaud: {
    clipNames: ['HumanArmature|Man_Clapping'],
    required: true,
  },
  death: {
    clipNames: ['HumanArmature|Man_Death'],
    required: true,
  },
  knifeSlash: {
    clipNames: ['HumanArmature|Man_SwordSlash'],
    required: true,
  },
} as const;

const animatedWomenPedestrianAnimations = {
  idle: {
    clipNames: ['HumanArmature|Female_Idle'],
    required: true,
  },
  walk: {
    clipNames: ['HumanArmature|Female_Walk'],
    required: true,
  },
  applaud: {
    clipNames: ['HumanArmature|Female_Clapping'],
    required: true,
  },
} as const;

const ultimateModularCastAnimations = {
  idle: { clipNames: ['CharacterArmature|Idle'], required: true },
  walk: { clipNames: ['CharacterArmature|Walk'], required: true },
  run: { clipNames: ['CharacterArmature|Run'], required: true },
  interact: { clipNames: ['CharacterArmature|Interact'], required: true },
  wave: { clipNames: ['CharacterArmature|Wave'], required: true },
} as const;

const universalPerformerAnimations = {
  idle: {
    assetId: 'character.cast-performer.animations',
    clipNames: ['Idle_Loop'],
    required: true,
  },
  walk: {
    assetId: 'character.cast-performer.animations',
    clipNames: ['Walk_Loop'],
    required: true,
  },
  run: {
    assetId: 'character.cast-performer.animations',
    clipNames: ['Jog_Fwd_Loop'],
    required: true,
  },
  dance: {
    assetId: 'character.cast-performer.animations',
    clipNames: ['Dance_Loop'],
    required: true,
  },
  sit: {
    assetId: 'character.cast-performer.animations',
    clipNames: ['Sitting_Enter'],
    required: true,
  },
  seatedHold: {
    assetId: 'character.cast-performer.animations',
    clipNames: ['Sitting_Idle_Loop'],
    required: true,
  },
  stand: {
    assetId: 'character.cast-performer.animations',
    clipNames: ['Sitting_Exit'],
    required: true,
  },
} as const;

const cinematicCastModelEntries = [
  ['cast-business', 'Business Cast Member', 'character.cast-business.model'],
  ['cast-beach', 'Beach Cast Member', 'character.cast-beach.model'],
  ['cast-farmer', 'Farmhand Cast Member', 'character.cast-farmer.model'],
  ['cast-hoodie', 'Hoodie Cast Member', 'character.cast-hoodie.model'],
  ['cast-worker', 'Worker Cast Member', 'character.cast-worker.model'],
] as const;

export const npcFixtureCharacterDefinitions = validateCharacterDefinitions([
  {
    id: 'npc-worker',
    displayName: 'Worker',
    modelAssetId: 'character.npc-worker.model',
    equipmentRigId: 'animated-men',
    animations: animatedMenNpcAnimations,
    transform: { scale: 0.37 },
    fallback: 'placeholder',
  },
  {
    id: 'npc-hoodie',
    displayName: 'Hoodie Character',
    modelAssetId: 'character.npc-hoodie.model',
    equipmentRigId: 'animated-men',
    animations: animatedMenNpcAnimations,
    transform: { scale: 0.368 },
    fallback: 'placeholder',
  },
  {
    id: 'npc-punk',
    displayName: 'Punk',
    modelAssetId: 'character.npc-punk.model',
    equipmentRigId: 'animated-men',
    animations: animatedMenNpcAnimations,
    transform: { scale: 0.369 },
    fallback: 'placeholder',
  },
] satisfies readonly CharacterDefinition[]);

/** Production-ready presentation definitions for ambient pedestrian spawning. */
export const pedestrianCharacterDefinitions = validateCharacterDefinitions([
  {
    id: 'pedestrian-casual',
    displayName: 'Casual Pedestrian',
    modelAssetId: 'character.pedestrian-casual.model',
    animations: animatedWomenPedestrianAnimations,
    transform: { scale: 0.38 },
    fallback: 'placeholder',
  },
  {
    id: 'pedestrian-street',
    displayName: 'Street Pedestrian',
    modelAssetId: 'character.pedestrian-street.model',
    animations: animatedWomenPedestrianAnimations,
    transform: { scale: 0.38 },
    fallback: 'placeholder',
  },
  {
    id: 'pedestrian-tank-top',
    displayName: 'Tank Top Pedestrian',
    modelAssetId: 'character.pedestrian-tank-top.model',
    animations: animatedWomenPedestrianAnimations,
    transform: { scale: 0.38 },
    fallback: 'placeholder',
  },
  {
    id: 'pedestrian-dress',
    displayName: 'Dress Pedestrian',
    modelAssetId: 'character.pedestrian-dress.model',
    animations: animatedWomenPedestrianAnimations,
    transform: { scale: 0.38 },
    fallback: 'placeholder',
  },
] satisfies readonly CharacterDefinition[]);

/** Unplaced production candidates for cinematics and future interior population. */
export const cinematicCastCharacterDefinitions = validateCharacterDefinitions([
  ...cinematicCastModelEntries.map(([id, displayName, modelAssetId]) => ({
    id,
    displayName,
    modelAssetId,
    equipmentRigId: 'ultimate-men' as const,
    animations: ultimateModularCastAnimations,
    transform: { scale: 0.98 },
    fallback: 'placeholder' as const,
  })),
  {
    id: 'cast-performer',
    displayName: 'Venue Performer',
    modelAssetId: 'character.cast-performer.model',
    animations: universalPerformerAnimations,
    transform: { scale: 1 },
    fallback: 'placeholder',
  },
] satisfies readonly CharacterDefinition[]);

/** Authoritative NPC presentation registry consumed by loaders and debug labs. */
export const npcCharacterDefinitions = validateCharacterDefinitions([
  ...npcFixtureCharacterDefinitions,
  ...pedestrianCharacterDefinitions,
  ...cinematicCastCharacterDefinitions,
]);

export const npcDefinitions = validateNpcDefinitions(
  [
    {
      id: 'mack',
      displayName: 'Mack',
      characterId: 'npc-worker',
      portraitAssetId: 'portrait.npc-mack',
      defaultAnimation: 'idle',
      applauseAnimation: 'applaud',
      spawnId: 'spawn.npc-mechanic',
      levelSpawnIds: {
        'northbar-coach-depot': 'spawn.northbar.mack',
      },
      interactionLabel: 'Talk',
      conversationId: 'conversation.mack.introduction',
      idleYaw: Math.PI * 0.75,
      ambientYaw: 0.08,
      conversationCameraProfileId: 'close',
    },
    {
      id: 'della-voss',
      displayName: 'Della Voss',
      characterId: 'pedestrian-street',
      portraitAssetId: 'portrait.npc-della-voss',
      defaultAnimation: 'idle',
      applauseAnimation: 'applaud',
      spawnId: 'spawn.northbar.della-voss',
      levelSpawnIds: {
        'test-district': null,
      },
      interactionLabel: 'Speak',
      conversationId: 'conversation.della.northbar-record',
      idleYaw: Math.PI,
      ambientYaw: 0.04,
      conversationCameraProfileId: 'close',
    },
    {
      id: 'nox',
      displayName: 'Nox',
      characterId: 'npc-hoodie',
      portraitAssetId: 'portrait.npc-nox',
      defaultAnimation: 'idle',
      applauseAnimation: 'applaud',
      spawnId: 'spawn.npc-alley',
      interactionLabel: 'Talk',
      conversationId: 'conversation.nox.check-in',
      idleYaw: Math.PI,
      ambientYaw: 0.12,
    },
    {
      id: 'raze',
      displayName: 'Raze',
      characterId: 'npc-punk',
      portraitAssetId: 'portrait.npc-raze',
      defaultAnimation: 'idle',
      applauseAnimation: 'applaud',
      spawnId: 'spawn.npc-deck',
      interactionLabel: 'Talk',
      conversationId: 'conversation.raze.check-in',
      idleYaw: -Math.PI * 0.5,
      ambientYaw: 0.1,
      conversationCameraProfileId: 'wide',
    },
  ] satisfies readonly NpcDefinition[],
  npcCharacterDefinitions,
  conversationCatalog,
);

/** Story-critical NPCs available in production without development flags. */
export const productionNpcDefinitions = Object.freeze(
  npcDefinitions.filter(({ id }) => id === 'mack' || id === 'della-voss'),
);
