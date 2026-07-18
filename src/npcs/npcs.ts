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
  gesture: {
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
  gesture: {
    clipNames: ['HumanArmature|Female_Clapping'],
    required: true,
  },
} as const;

export const npcFixtureCharacterDefinitions = validateCharacterDefinitions([
  {
    id: 'npc-worker',
    displayName: 'Worker',
    modelAssetId: 'character.npc-worker.model',
    equipmentRigId: 'animated-men',
    animations: animatedMenNpcAnimations,
    transform: { scale: 0.37, rotation: [0, Math.PI, 0] },
    fallback: 'placeholder',
  },
  {
    id: 'npc-hoodie',
    displayName: 'Hoodie Character',
    modelAssetId: 'character.npc-hoodie.model',
    equipmentRigId: 'animated-men',
    animations: animatedMenNpcAnimations,
    transform: { scale: 0.368, rotation: [0, Math.PI, 0] },
    fallback: 'placeholder',
  },
  {
    id: 'npc-punk',
    displayName: 'Punk',
    modelAssetId: 'character.npc-punk.model',
    equipmentRigId: 'animated-men',
    animations: animatedMenNpcAnimations,
    transform: { scale: 0.369, rotation: [0, Math.PI, 0] },
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
    transform: { scale: 0.38, rotation: [0, Math.PI, 0] },
    fallback: 'placeholder',
  },
  {
    id: 'pedestrian-street',
    displayName: 'Street Pedestrian',
    modelAssetId: 'character.pedestrian-street.model',
    animations: animatedWomenPedestrianAnimations,
    transform: { scale: 0.38, rotation: [0, Math.PI, 0] },
    fallback: 'placeholder',
  },
  {
    id: 'pedestrian-tank-top',
    displayName: 'Tank Top Pedestrian',
    modelAssetId: 'character.pedestrian-tank-top.model',
    animations: animatedWomenPedestrianAnimations,
    transform: { scale: 0.38, rotation: [0, Math.PI, 0] },
    fallback: 'placeholder',
  },
  {
    id: 'pedestrian-dress',
    displayName: 'Dress Pedestrian',
    modelAssetId: 'character.pedestrian-dress.model',
    animations: animatedWomenPedestrianAnimations,
    transform: { scale: 0.38, rotation: [0, Math.PI, 0] },
    fallback: 'placeholder',
  },
] satisfies readonly CharacterDefinition[]);

/** Authoritative NPC presentation registry consumed by loaders and debug labs. */
export const npcCharacterDefinitions = validateCharacterDefinitions([
  ...npcFixtureCharacterDefinitions,
  ...pedestrianCharacterDefinitions,
]);

export const npcDefinitions = validateNpcDefinitions(
  [
    {
      id: 'mack',
      displayName: 'Mack',
      characterId: 'npc-worker',
      portraitAssetId: 'portrait.npc-mack',
      defaultAnimation: 'idle',
      gestureAnimation: 'gesture',
      spawnId: 'spawn.npc-mechanic',
      interactionLabel: 'Talk',
      conversationId: 'conversation.mack.introduction',
      idleYaw: Math.PI * 0.75,
      ambientYaw: 0.08,
      conversationCameraProfileId: 'close',
    },
    {
      id: 'nox',
      displayName: 'Nox',
      characterId: 'npc-hoodie',
      portraitAssetId: 'portrait.npc-nox',
      defaultAnimation: 'idle',
      gestureAnimation: 'gesture',
      spawnId: 'spawn.npc-alley',
      interactionLabel: 'Talk',
      conversationId: 'conversation.nox.check-in',
      conversationGesture: false,
      idleYaw: Math.PI,
      ambientYaw: 0.12,
    },
    {
      id: 'raze',
      displayName: 'Raze',
      characterId: 'npc-punk',
      portraitAssetId: 'portrait.npc-raze',
      defaultAnimation: 'idle',
      gestureAnimation: 'gesture',
      spawnId: 'spawn.npc-deck',
      interactionLabel: 'Talk',
      conversationId: 'conversation.raze.check-in',
      conversationGesture: false,
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
  npcDefinitions.filter(({ id }) => id === 'mack'),
);
