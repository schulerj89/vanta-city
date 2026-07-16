import { AssetCatalog } from './AssetCatalog';
import type { AssetManifest } from './AssetCatalog';

export const assetManifest = {
  'character.casual.model': {
    type: 'model',
    url: '/assets/characters/ultimate-modular-men/casual-character.glb',
    attribution: {
      title: 'Casual Character — Ultimate Modular Men Pack',
      creator: 'Quaternius',
      sourceUrl:
        'https://poly.pizza/bundle/Ultimate-Modular-Men-Pack-ZiH8muWqwQ',
      license: 'CC0 1.0 Universal',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    },
    metadata: { intendedUse: 'playable-character', embeddedAnimations: 24 },
  },
  'character.punk.model': {
    type: 'model',
    url: '/assets/characters/ultimate-modular-men/punk-character.glb',
    attribution: {
      title: 'Punk — Ultimate Modular Men Pack',
      creator: 'Quaternius',
      sourceUrl:
        'https://poly.pizza/bundle/Ultimate-Modular-Men-Pack-ZiH8muWqwQ',
      license: 'CC0 1.0 Universal',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    },
    metadata: { intendedUse: 'playable-character', embeddedAnimations: 24 },
  },
  'character.npc-worker.model': {
    type: 'model',
    url: '/assets/characters/ultimate-modular-men/worker.glb',
    optional: true,
    attribution: {
      title: 'Worker — Ultimate Modular Men Pack',
      creator: 'Quaternius',
      sourceUrl:
        'https://poly.pizza/bundle/Ultimate-Modular-Men-Pack-ZiH8muWqwQ',
      license: 'CC0 1.0 Universal',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    },
    metadata: { intendedUse: 'npc-mack', embeddedAnimations: 24 },
  },
  'character.npc-hoodie.model': {
    type: 'model',
    url: '/assets/characters/ultimate-modular-men/hoodie-character.glb',
    optional: true,
    attribution: {
      title: 'Hoodie Character — Ultimate Modular Men Pack',
      creator: 'Quaternius',
      sourceUrl:
        'https://poly.pizza/bundle/Ultimate-Modular-Men-Pack-ZiH8muWqwQ',
      license: 'CC0 1.0 Universal',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    },
    metadata: { intendedUse: 'npc-nox', embeddedAnimations: 24 },
  },
  'character.npc-punk.model': {
    type: 'model',
    url: '/assets/characters/ultimate-modular-men/punk.glb',
    optional: true,
    attribution: {
      title: 'Punk — Ultimate Modular Men Pack',
      creator: 'Quaternius',
      sourceUrl:
        'https://poly.pizza/bundle/Ultimate-Modular-Men-Pack-ZiH8muWqwQ',
      license: 'CC0 1.0 Universal',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    },
    metadata: { intendedUse: 'npc-raze', embeddedAnimations: 24 },
  },
  'portrait.npc-mack': {
    type: 'texture',
    url: '/assets/portraits/npcs/mack.webp',
    optional: true,
    metadata: { intendedUse: 'dialogue-portrait' },
  },
  'portrait.npc-nox': {
    type: 'texture',
    url: '/assets/portraits/npcs/nox.webp',
    optional: true,
    metadata: { intendedUse: 'dialogue-portrait' },
  },
  'portrait.npc-raze': {
    type: 'texture',
    url: '/assets/portraits/npcs/raze.webp',
    optional: true,
    metadata: { intendedUse: 'dialogue-portrait' },
  },
} as const satisfies AssetManifest;

export const assetCatalog = new AssetCatalog(assetManifest);
