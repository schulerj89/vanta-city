import type { CharacterDefinition } from './CharacterDefinition';
import { validateCharacterDefinitions } from './CharacterDefinition';

export const characterDefinitions = validateCharacterDefinitions([
  {
    id: 'vanta-placeholder',
    displayName: 'Vanta Placeholder',
    transform: { scale: 0.6 },
    fallback: 'placeholder',
  },
  {
    id: 'modular-man',
    displayName: 'Modular Man',
    modelAssetId: 'character.modular-man.model',
    animations: {
      idle: { clipNames: ['Idle', 'idle'], required: false },
      walk: { clipNames: ['Walk', 'Walking', 'walk'], required: false },
      run: { clipNames: ['Run', 'Running', 'run'], required: false },
    },
    transform: {
      scale: 1,
      rotation: [0, Math.PI, 0],
    },
    materialVariations: [{ id: 'default', displayName: 'Default materials' }],
    fallback: 'placeholder',
  },
] satisfies readonly CharacterDefinition[]);
