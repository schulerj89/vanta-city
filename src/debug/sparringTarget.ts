import type { CharacterDefinition } from '../characters/CharacterDefinition';

export const sparringTargetCharacterDefinition = {
  id: 'debug-sparring-target',
  displayName: 'Debug Sparring Target',
  pickerVisible: false,
  modelAssetId: 'character.casual.model',
  animations: {
    idle: {
      clipNames: ['CharacterArmature|Idle'],
      required: true,
    },
    getHit: {
      clipNames: ['CharacterArmature|HitRecieve'],
      required: true,
    },
  },
  transform: { scale: 0.98 },
  fallback: 'placeholder',
} as const satisfies CharacterDefinition;

export const sparringTargetConfig = {
  spawnId: 'spawn.debug-sparring-target',
  engagementDistance: 3.2,
  engagementMinimumFacingDot: 0.2,
  focusedCameraDistance: 4.1,
  volumes: {
    punch: {
      forwardOffset: 0.25,
      horizontalReach: 1.25,
      radius: 0.18,
      minimumY: 0.65,
      maximumY: 1.6,
    },
    kick: {
      forwardOffset: 0.2,
      horizontalReach: 1.35,
      radius: 0.22,
      minimumY: 0.3,
      maximumY: 1.35,
    },
    hurt: { radius: 0.38, height: 1.8 },
    minimumFacingDot: 0.65,
  },
} as const;
