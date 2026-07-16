import type { CharacterDefinition } from './CharacterDefinition';
import { validateCharacterDefinitions } from './CharacterDefinition';

export const characterDefinitionEntries = [
  {
    id: 'casual',
    displayName: 'Casual',
    modelAssetId: 'character.casual.model',
    animations: {
      idle: { clipNames: ['CharacterArmature|Idle'], required: true },
      walk: { clipNames: ['CharacterArmature|Walk'], required: true },
      run: { clipNames: ['CharacterArmature|Run'], required: true },
      previewIdle: {
        clipNames: ['CharacterArmature|Idle_Neutral'],
        required: true,
      },
      wave: { clipNames: ['CharacterArmature|Wave'], required: true },
      interact: { clipNames: ['CharacterArmature|Interact'], required: true },
    },
    transform: {
      // 1.823 m authored height -> 1.787 m, inside the 1.8 m capsule.
      scale: 0.98,
    },
    fallback: 'placeholder',
  },
  {
    id: 'punk',
    displayName: 'Punk',
    modelAssetId: 'character.punk.model',
    animations: {
      idle: { clipNames: ['CharacterArmature|Idle'], required: true },
      walk: { clipNames: ['CharacterArmature|Walk'], required: true },
      run: { clipNames: ['CharacterArmature|Run'], required: true },
      previewIdle: {
        clipNames: ['CharacterArmature|Idle_Neutral'],
        required: true,
      },
      wave: { clipNames: ['CharacterArmature|Wave'], required: true },
      interact: { clipNames: ['CharacterArmature|Interact'], required: true },
    },
    transform: {
      // 1.936 m authored height -> 1.781 m, inside the 1.8 m capsule.
      scale: 0.92,
    },
    fallback: 'placeholder',
  },
] satisfies readonly CharacterDefinition[];

export const characterDefinitions = validateCharacterDefinitions(
  characterDefinitionEntries,
);
