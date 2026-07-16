import type { CharacterDefinition } from '../characters/CharacterDefinition';

export const sparringTargetCharacterDefinition = {
  id: 'debug-sparring-target',
  displayName: 'Debug Sparring Target',
  pickerVisible: false,
  modelAssetId: 'character.npc-worker.model',
  animations: {
    idle: {
      clipNames: ['HumanArmature|Man_Idle'],
      required: true,
    },
    getHitLeft: {
      assetId: 'animation.debug-sparring-hits',
      clipNames: ['CharacterArmature|HitRecieve'],
      required: true,
    },
    getHitRight: {
      assetId: 'animation.debug-sparring-hits',
      clipNames: ['CharacterArmature|HitRecieve_2'],
      required: true,
    },
  },
  transform: { scale: 0.37, rotation: [0, Math.PI, 0] },
  fallback: 'placeholder',
} as const satisfies CharacterDefinition;

export const sparringTargetConfig = {
  spawnId: 'spawn.debug-sparring-target',
  maxDistance: 2.6,
  minimumFacingDot: 0.55,
} as const;
