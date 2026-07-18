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
  'character.pedestrian-casual.model': {
    type: 'model',
    url: '/assets/characters/animated-women/casual.glb',
    attribution: {
      title: 'Woman Casual — Animated Women Pack',
      creator: 'Quaternius',
      sourceUrl: 'https://poly.pizza/bundle/Animated-Women-Pack-HHSKxnk1mY',
      license: 'CC0 1.0 Universal',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    },
    metadata: { intendedUse: 'ambient-pedestrian', embeddedAnimations: 11 },
  },
  'character.pedestrian-street.model': {
    type: 'model',
    url: '/assets/characters/animated-women/street.glb',
    attribution: {
      title: 'Woman — Animated Women Pack',
      creator: 'Quaternius',
      sourceUrl: 'https://poly.pizza/bundle/Animated-Women-Pack-HHSKxnk1mY',
      license: 'CC0 1.0 Universal',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    },
    metadata: { intendedUse: 'ambient-pedestrian', embeddedAnimations: 11 },
  },
  'character.pedestrian-tank-top.model': {
    type: 'model',
    url: '/assets/characters/animated-women/tank-top.glb',
    attribution: {
      title: 'Woman in Tank Top — Animated Women Pack',
      creator: 'Quaternius',
      sourceUrl: 'https://poly.pizza/bundle/Animated-Women-Pack-HHSKxnk1mY',
      license: 'CC0 1.0 Universal',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    },
    metadata: { intendedUse: 'ambient-pedestrian', embeddedAnimations: 11 },
  },
  'character.pedestrian-dress.model': {
    type: 'model',
    url: '/assets/characters/animated-women/dress.glb',
    attribution: {
      title: 'Woman in Dress — Animated Women Pack',
      creator: 'Quaternius',
      sourceUrl: 'https://poly.pizza/bundle/Animated-Women-Pack-HHSKxnk1mY',
      license: 'CC0 1.0 Universal',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    },
    metadata: { intendedUse: 'ambient-pedestrian', embeddedAnimations: 11 },
  },
  'equipment.handgun.model': {
    type: 'model',
    url: '/assets/equipment/kenney-weapon-pack/handgun.glb',
    attribution: {
      title: 'Pistol — Weapon pack',
      creator: 'Kenney Vleugels and Casper Jorissen (Kenney.nl)',
      sourceUrl: 'https://opengameart.org/content/weapon-pack',
      license: 'CC0 1.0 Universal',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    },
    metadata: {
      intendedUse: 'equipped-handgun',
      triangles: 350,
      materials: 3,
      textures: 0,
    },
  },
  'equipment.knife.model': {
    type: 'model',
    url: '/assets/equipment/kenney-weapon-pack/knife.glb',
    attribution: {
      title: 'Knife Sharp — Weapon pack',
      creator: 'Kenney Vleugels and Casper Jorissen (Kenney.nl)',
      sourceUrl: 'https://opengameart.org/content/weapon-pack',
      license: 'CC0 1.0 Universal',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    },
    metadata: {
      intendedUse: 'equipped-knife',
      triangles: 98,
      materials: 4,
      textures: 0,
    },
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
