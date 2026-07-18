import type { CharacterDefinition } from '../characters/CharacterDefinition';

export const sparringTargetCharacterDefinition = {
  id: 'debug-sparring-target',
  displayName: 'Debug Sparring Target',
  pickerVisible: false,
  modelAssetId: 'character.casual.model',
  equipmentRigId: 'ultimate-men',
  animations: {
    idle: {
      clipNames: ['CharacterArmature|Idle'],
      required: true,
    },
    getHit: {
      clipNames: ['CharacterArmature|HitRecieve'],
      required: true,
    },
    death: {
      clipNames: ['CharacterArmature|Death'],
      required: true,
    },
  },
  transform: { scale: 0.98 },
  fallback: 'placeholder',
} as const satisfies CharacterDefinition;

export const sparringTargetConfig = {
  spawnId: 'spawn.debug-sparring-target',
  playerSpawnId: 'spawn.player-sparring',
  collisionId: 'c.debug-sparring-target',
  collisionSize: [0.68, 1.8, 0.68] as const,
  engagementDistance: 3,
  engagementMinimumFacingDot: 0.2,
  focusedCameraDistance: 4.25,
  damage: { punch: 8, kick: 12 },
  volumes: {
    punch: {
      // Authored impact wrists are 0.41–0.44m forward; radius includes fist.
      forwardOffset: 0.18,
      horizontalReach: 0.38,
      radius: 0.12,
      minimumY: 1.15,
      maximumY: 1.55,
    },
    kick: {
      // Authored impact feet are 0.92–0.98m forward; radius includes shoe.
      forwardOffset: 0.28,
      horizontalReach: 0.72,
      radius: 0.14,
      minimumY: 0.45,
      maximumY: 0.95,
    },
    hurt: { radius: 0.3, height: 1.8 },
    minimumFacingDot: 0.65,
  },
} as const;
