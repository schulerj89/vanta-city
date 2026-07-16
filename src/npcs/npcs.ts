import type { CharacterDefinition } from '../characters/CharacterDefinition';
import { validateCharacterDefinitions } from '../characters/CharacterDefinition';
import { conversationCatalog } from '../conversations/conversations';
import type { NpcDefinition } from './NpcDefinition';
import { validateNpcDefinitions } from './NpcDefinition';

const npcAnimations = {
  idle: {
    clipNames: ['HumanArmature|Man_Idle'],
    required: true,
  },
  gesture: {
    clipNames: ['HumanArmature|Man_Clapping'],
    required: true,
  },
} as const;

export const npcCharacterDefinitions = validateCharacterDefinitions([
  {
    id: 'npc-worker',
    displayName: 'Worker',
    modelAssetId: 'character.npc-worker.model',
    animations: npcAnimations,
    transform: { scale: 0.37, rotation: [0, Math.PI, 0] },
    fallback: 'placeholder',
  },
  {
    id: 'npc-hoodie',
    displayName: 'Hoodie Character',
    modelAssetId: 'character.npc-hoodie.model',
    animations: npcAnimations,
    transform: { scale: 0.368, rotation: [0, Math.PI, 0] },
    fallback: 'placeholder',
  },
  {
    id: 'npc-punk',
    displayName: 'Punk',
    modelAssetId: 'character.npc-punk.model',
    animations: npcAnimations,
    transform: { scale: 0.369, rotation: [0, Math.PI, 0] },
    fallback: 'placeholder',
  },
] satisfies readonly CharacterDefinition[]);

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
      interactionRadius: 3.25,
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
      interactionRadius: 3,
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
      interactionRadius: 3,
      conversationGesture: false,
      idleYaw: -Math.PI * 0.5,
      ambientYaw: 0.1,
      conversationCameraProfileId: 'wide',
    },
  ] satisfies readonly NpcDefinition[],
  npcCharacterDefinitions,
  conversationCatalog,
);
