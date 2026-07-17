import { AssetCatalog } from './AssetCatalog';
import type { AssetManifest } from './AssetCatalog';

export const assetManifest = {
  'vehicle.traffic.pickup': {
    type: 'model',
    url: '/assets/vehicles/quaternius-cars/pickup-truck.glb',
    attribution: {
      title: 'Pickup Truck',
      creator: 'Quaternius',
      sourceUrl: 'https://poly.pizza/m/qn4grQgHm8',
      license: 'CC0 1.0 Universal',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    },
    metadata: {
      intendedUse: 'civilian-traffic',
      triangles: 6432,
      materials: 3,
      textures: 1,
    },
  },
  'vehicle.traffic.sports-car': {
    type: 'model',
    url: '/assets/vehicles/quaternius-cars/sports-car.glb',
    attribution: {
      title: 'Sports Car',
      creator: 'Quaternius',
      sourceUrl: 'https://poly.pizza/m/OyqKvX9xNh',
      license: 'CC0 1.0 Universal',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    },
    metadata: {
      intendedUse: 'civilian-traffic',
      triangles: 3066,
      materials: 7,
      textures: 0,
    },
  },
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
    url: '/assets/characters/animated-men/mack-long-sleeves.glb',
    attribution: {
      title: 'Man in Long Sleeves — Animated Men Pack',
      creator: 'Quaternius',
      sourceUrl: 'https://poly.pizza/m/DLptRuewTn',
      license: 'CC0 1.0 Universal',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    },
    metadata: { intendedUse: 'npc-mack', embeddedAnimations: 11 },
  },
  'character.npc-hoodie.model': {
    type: 'model',
    url: '/assets/characters/animated-men/nox-layered-shirt.glb',
    attribution: {
      title: 'Man (layered shirt) — Animated Men Pack',
      creator: 'Quaternius',
      sourceUrl: 'https://poly.pizza/m/fjHyMd5Wxw',
      license: 'CC0 1.0 Universal',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    },
    metadata: { intendedUse: 'npc-nox', embeddedAnimations: 11 },
  },
  'character.npc-punk.model': {
    type: 'model',
    url: '/assets/characters/animated-men/raze-suit.glb',
    attribution: {
      title: 'Man in Suit — Animated Men Pack',
      creator: 'Quaternius',
      sourceUrl: 'https://poly.pizza/m/mQnGoME1ez',
      license: 'CC0 1.0 Universal',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    },
    metadata: { intendedUse: 'npc-raze', embeddedAnimations: 11 },
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
