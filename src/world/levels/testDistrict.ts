import type {
  BoxVisualDefinition,
  BuildingVisualDefinition,
  EnvironmentVisualDefinition,
  LevelModule,
  Vector3Tuple,
} from '../LevelDefinition';
import type { StaticColliderDefinition } from '../../physics/StaticCollider';
import {
  fixturePlayerSpawns,
  fixtureSpawns,
  intersectionApproachSpawns,
  intersectionAssetIds,
  intersectionCornerSpawns,
  intersectionLandmarks,
  intersectionLayout,
} from './intersectionLayout';
import {
  ashfallBuildingAssets,
  getAshfallBuildingVariant,
} from '../buildings/AshfallBuildingKit';

const colors = {
  asphalt: 0x24282b,
  sidewalk: 0x858783,
  curb: 0xb9b4a7,
  marking: 0xe7d9a1,
  boundary: 0x59666a,
  signalBox: 0x31585a,
} as const;

const paired: Array<{
  visual: BoxVisualDefinition;
  collider: StaticColliderDefinition;
}> = [];

function surface(
  id: string,
  position: Vector3Tuple,
  size: Vector3Tuple,
  color: number,
  tags: readonly string[] = ['walkable'],
): void {
  paired.push({
    visual: box(`v.${id}`, position, size, color),
    collider: collider(`c.${id}`, position, size, tags),
  });
}

surface('road-east-west', [0, -0.2, 0], [56, 0.4, 12], colors.asphalt);
surface('road-north-south', [0, -0.2, 0], [12, 0.4, 56], colors.asphalt);

for (const [id, x, z] of [
  ['northwest', -17, 17],
  ['northeast', 17, 17],
  ['southwest', -17, -17],
  ['southeast', 17, -17],
] as const) {
  surface(`sidewalk-${id}`, [x, 0.1, z], [22, 0.2, 22], colors.sidewalk);
}

export const ashfallBuildingPlacements = [
  buildingPlacement('northwest', 'seawall-court', [-19, 0.2, 19]),
  buildingPlacement('northeast', 'breaker-block', [20, 0.2, 21]),
  buildingPlacement('southwest', 'freight-annex', [-19.5, 0.2, -22]),
  buildingPlacement('southeast', 'drydock-office', [20.5, 0.2, -22]),
] as const;

const buildings = ashfallBuildingPlacements.map(({ visual }) => visual);
const buildingCollision = ashfallBuildingPlacements.map(
  ({ collider: definition }) => definition,
);

// Visible, collidable termination at every road end and around the outer corners.
for (const [id, position, size] of [
  ['boundary-north', [0, 0.65, 27.5], [56, 1.3, 1]],
  ['boundary-south', [0, 0.65, -27.5], [56, 1.3, 1]],
  ['boundary-east', [27.5, 0.65, 0], [1, 1.3, 56]],
  ['boundary-west', [-27.5, 0.65, 0], [1, 1.3, 56]],
] as const)
  surface(id, position, size, colors.boundary, ['boundary']);

// Lane dashes complement the imported crosswalk without affecting collision.
const markings: BoxVisualDefinition[] = [];
for (const offset of [-22, -16, 16, 22]) {
  const label = offset < 0 ? `neg${Math.abs(offset)}` : `pos${offset}`;
  markings.push(
    box(
      `v.marking-ns-${label}`,
      [0, 0.015, offset],
      [0.18, 0.03, 4],
      colors.marking,
    ),
  );
  markings.push(
    box(
      `v.marking-ew-${label}`,
      [offset, 0.015, 0],
      [4, 0.03, 0.18],
      colors.marking,
    ),
  );
}

const props: EnvironmentVisualDefinition[] = [
  gltf('v.crosswalk', intersectionAssetIds.crosswalk, [0, 0.015, 0]),
  gltf(
    'v.traffic-light',
    intersectionAssetIds.trafficLight,
    intersectionLayout.trafficLight,
    [0, Math.PI, 0],
  ),
  gltf(
    'v.street-light-nw',
    intersectionAssetIds.streetLight,
    [-8.5, 0.2, 8.5],
    [0, Math.PI / 2, 0],
  ),
  gltf(
    'v.street-light-se',
    intersectionAssetIds.streetLight,
    [8.5, 0.2, -8.5],
    [0, -Math.PI / 2, 0],
  ),
  gltf('v.hydrant', intersectionAssetIds.hydrant, [-8.2, 0.2, -8.2]),
  gltf(
    'v.barrier-west',
    intersectionAssetIds.barrier,
    [-20, 0, -4.6],
    [0, Math.PI / 2, 0],
  ),
  gltf(
    'v.barrier-east',
    intersectionAssetIds.barrier,
    [20, 0, 4.6],
    [0, -Math.PI / 2, 0],
  ),
  gltf(
    'v.pallet',
    intersectionAssetIds.pallet,
    [-10.5, 0.2, 11.5],
    [0, 0.4, 0],
  ),
  gltf(
    'v.trash-bags',
    intersectionAssetIds.trashBags,
    [11, 0.2, -10.5],
    [0, -0.5, 0],
  ),
];

const signalControllerVisual = box(
  'v.signal-controller',
  intersectionLayout.signalController,
  [0.8, 1.3, 0.8],
  colors.signalBox,
);
const signalControllerCollider = collider(
  'c.signal-controller',
  intersectionLayout.signalController,
  [0.8, 1.3, 0.8],
  ['obstacle', 'interaction'],
);

const cc0 = {
  creator: 'Quaternius',
  license: 'CC0 1.0',
  licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
} as const;
const asset = (
  file: string,
  title: string,
  publicId: string,
  triangles: number,
) => ({
  type: 'model' as const,
  url: `/assets/environment/intersection/${file}`,
  attribution: {
    title,
    ...cc0,
    sourceUrl: `https://poly.pizza/m/${publicId}`,
  },
  metadata: { triangles, sourceBundle: 'Post Apocolypse Pack' },
});

export const testDistrict = {
  assets: {
    ...ashfallBuildingAssets,
    [intersectionAssetIds.crosswalk]: asset(
      'crosswalk.glb',
      'Cross walk',
      '9zxw2NmVI6',
      188,
    ),
    [intersectionAssetIds.trafficLight]: asset(
      'traffic-light.glb',
      'Traffic Light',
      'apWcPbwhlq',
      849,
    ),
    [intersectionAssetIds.streetLight]: asset(
      'street-light.glb',
      'Street Light',
      '0lxF8Dl1jU',
      426,
    ),
    [intersectionAssetIds.hydrant]: asset(
      'fire-hydrant.glb',
      'Fire Hydrant',
      'DKkMQbEklp',
      976,
    ),
    [intersectionAssetIds.barrier]: asset(
      'plastic-barrier.glb',
      'Plastic Barrier',
      'QAiXMsbWRc',
      852,
    ),
    [intersectionAssetIds.pallet]: asset(
      'broken-pallet.glb',
      'Pallet Broken',
      'dGcOK3Azfl',
      216,
    ),
    [intersectionAssetIds.trashBags]: asset(
      'trash-bags.glb',
      'Trash Bags',
      'eitNk4I4R1',
      2088,
    ),
  },
  definition: {
    id: 'test-district',
    name: 'Ashfall Junction',
    environment: [
      ...paired.map(({ visual }) => visual),
      ...markings,
      ...buildings,
      ...props,
      signalControllerVisual,
    ],
    staticCollision: [
      ...paired.map(({ collider: definition }) => definition),
      ...buildingCollision,
      signalControllerCollider,
      collider(
        'c.traffic-light-pole',
        [8.25, 2.55, 8.25],
        [0.55, 4.7, 0.55],
        ['obstacle', 'camera'],
      ),
      collider(
        'c.street-light-nw',
        [-8.5, 3.5, 8.5],
        [0.5, 6.6, 0.5],
        ['obstacle', 'camera'],
      ),
      collider(
        'c.street-light-se',
        [8.5, 3.5, -8.5],
        [0.5, 6.6, 0.5],
        ['obstacle', 'camera'],
      ),
      collider(
        'c.barrier-west',
        [-20, 0.4, -4.6],
        [0.5, 0.8, 2.1],
        ['obstacle'],
      ),
      collider('c.barrier-east', [20, 0.4, 4.6], [0.5, 0.8, 2.1], ['obstacle']),
    ],
    spawns: [
      {
        id: 'spawn.player-default',
        kind: 'player',
        default: true,
        position: intersectionLayout.defaultSpawn,
        rotation: [0, Math.PI, 0],
        tags: ['intersection', 'north'],
      },
      ...intersectionApproachSpawns.map(({ id, position, yaw }) => ({
        id,
        kind: 'player' as const,
        position,
        rotation: [0, yaw, 0] as Vector3Tuple,
        tags: ['approach'],
      })),
      ...intersectionCornerSpawns.map(({ id, position, yaw }) => ({
        id,
        kind: 'player' as const,
        position,
        rotation: [0, yaw, 0] as Vector3Tuple,
        tags: ['corner'],
      })),
      ...fixturePlayerSpawns.map(({ id, position, yaw }) => ({
        id,
        kind: 'player' as const,
        position,
        rotation: [0, yaw, 0] as Vector3Tuple,
        tags: ['development-fixture'],
      })),
      ...fixtureSpawns.map(({ id, position, yaw }) => ({
        id,
        kind: 'npc' as const,
        position,
        rotation: [0, yaw, 0] as Vector3Tuple,
        tags: ['development-fixture'],
      })),
    ],
    locations: [
      {
        id: 'interaction.signal-controller',
        kind: 'interaction',
        position: intersectionLayout.signalController,
        tags: ['street', 'signal'],
      },
      {
        id: 'mission.intersection-center',
        kind: 'mission',
        position: [0, 0, 0],
        tags: ['future', 'intersection'],
      },
    ],
    zones: [
      {
        id: 'zone.ashfall-junction',
        name: 'Ashfall Junction',
        position: [0, 3, 0],
        size: [56, 10, 56],
      },
    ],
    landmarks: intersectionLandmarks.map(({ id, name, position }, index) => ({
      id,
      name,
      position,
      radius: index === 0 ? 5 : 4.5,
      priority: index === 0 ? 5 : 2,
    })),
    triggers: [
      {
        id: 'trigger.intersection-center',
        shape: 'box',
        position: [0, 1.5, 0],
        size: [12, 3, 12],
        tags: ['intersection', 'future-mission'],
      },
      {
        id: 'trigger.signal-corner',
        shape: 'box',
        position: [9, 1.5, 9],
        size: [6, 3, 6],
        tags: ['interaction', 'signal'],
      },
    ],
    cinematicAnchors: [
      {
        id: 'camera.intersection-overhead',
        position: [0, 62, 0],
        // Keep the directed camera sweep clear of the floor at the origin.
        lookAt: [0, 5, 0],
        fieldOfView: 50,
        tags: ['debug', 'map'],
      },
      {
        id: 'camera.signal-two-shot',
        position: [14, 5, 14],
        lookAt: [7, 1.5, 7],
        fieldOfView: 48,
        tags: ['interaction'],
      },
    ],
    mapPresentation: {
      orientation: 'north-up',
      bounds: {
        minX: -intersectionLayout.outerEdge,
        maxX: intersectionLayout.outerEdge,
        minZ: -intersectionLayout.outerEdge,
        maxZ: intersectionLayout.outerEdge,
      },
      geometry: [
        { entryId: 'v.road-east-west', layer: 'roads' },
        { entryId: 'v.road-north-south', layer: 'roads' },
        { entryId: 'v.building-northwest', layer: 'structures' },
        { entryId: 'v.building-northeast', layer: 'structures' },
        { entryId: 'v.building-southwest', layer: 'structures' },
        { entryId: 'v.building-southeast', layer: 'structures' },
      ],
      markers: [
        ...intersectionLandmarks.map(({ id }) => ({
          entryId: id,
          layer: 'landmarks' as const,
        })),
        {
          entryId: 'interaction.signal-controller',
          layer: 'interactions',
        },
        ...intersectionApproachSpawns.map(({ id }) => ({
          entryId: id,
          layer: 'spawns' as const,
        })),
        ...intersectionCornerSpawns.map(({ id }) => ({
          entryId: id,
          layer: 'spawns' as const,
        })),
      ],
    },
  },
} as const satisfies LevelModule;

function box(
  id: string,
  position: Vector3Tuple,
  size: Vector3Tuple,
  color: number,
): BoxVisualDefinition {
  return { id, kind: 'box', position, size, color };
}

function gltf(
  id: string,
  assetId: string,
  position: Vector3Tuple,
  rotation?: Vector3Tuple,
): EnvironmentVisualDefinition {
  return { id, kind: 'gltf', assetId, position, rotation };
}

function collider(
  id: string,
  position: Vector3Tuple,
  size: Vector3Tuple,
  tags: readonly string[],
): StaticColliderDefinition {
  return { id, position, size, tags };
}

function buildingPlacement(
  corner: 'northwest' | 'northeast' | 'southwest' | 'southeast',
  variantId: string,
  position: Vector3Tuple,
): {
  readonly visual: BuildingVisualDefinition;
  readonly collider: StaticColliderDefinition;
} {
  const definition = getAshfallBuildingVariant(variantId);
  const [width, depth] = definition.footprint;
  return {
    visual: {
      id: `v.building-${corner}`,
      kind: 'building',
      variantId,
      position,
    },
    collider: {
      // Retain stable collision IDs used by camera diagnostics and browser tests.
      id: `c.ruin-${corner}`,
      position: [position[0], position[1] + definition.height / 2, position[2]],
      size: [width, definition.height, depth],
      tags: ['obstacle', 'camera', 'building'],
    },
  };
}
