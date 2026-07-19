import type {
  BoxVisualDefinition,
  EnvironmentVisualDefinition,
  LevelModule,
  Vector3Tuple,
} from '../LevelDefinition';
import type { StaticColliderDefinition } from '../../physics/StaticCollider';
import {
  fixturePlayerSpawns,
  fixtureSpawns,
  ashfallExpansionPlan,
  eastQuayCurvedRoad,
  intersectionApproachSpawns,
  intersectionAssetIds,
  intersectionCornerSpawns,
  intersectionLandmarks,
  intersectionLayout,
  intersectionTrafficControls,
} from './intersectionLayout';
import { splineRoadColliders } from './SplineRoadGeometry';
import {
  ashfallBuildingAssets,
  ashfallBuildingTextureIds,
} from '../buildings/AshfallBuildingKit';
import {
  createAshfallBuildingPlacement,
  world002ABuildingPlacements,
  world002ASidewalks,
  world002AWestRoad,
  world002BBuildingPlacements,
  world002BContact,
  world002BPlan,
  world002BRimSpawns,
  world002BRoads,
  world002BSidewalks,
} from './junctionGrowth';

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
  textureAssetId?: string,
  uvMetersPerRepeat?: number,
): void {
  paired.push({
    visual: box(
      `v.${id}`,
      position,
      size,
      color,
      textureAssetId,
      uvMetersPerRepeat,
    ),
    collider: collider(`c.${id}`, position, size, tags),
  });
}

surface('road-east-west', [0, -0.2, 0], [56, 0.4, 12], colors.asphalt);
surface('road-north-south', [0, -0.2, 0], [12, 0.4, 56], colors.asphalt);
for (const [id, z] of [
  ['east-quay-ground-north', 14],
  ['east-quay-ground-south', -14],
] as const) {
  surface(
    id,
    [35, -0.225, z],
    [14, 0.35, 28],
    colors.sidewalk,
    ['walkable'],
    ashfallBuildingTextureIds.sidewalkConcrete,
    6,
  );
}

for (const [id, x, z] of [
  ['northwest', -17, 17],
  ['northeast', 17, 17],
  ['southwest', -17, -17],
  ['southeast', 17, -17],
] as const) {
  surface(
    `sidewalk-${id}`,
    [x, 0.1, z],
    [22, 0.2, 22],
    colors.sidewalk,
    ['walkable', 'sidewalk'],
    ashfallBuildingTextureIds.sidewalkConcrete,
    6,
  );
}

export const ashfallBuildingPlacements = [
  createAshfallBuildingPlacement(
    'northwest-north',
    'foundry-long',
    [-18, 0.2, 24],
    0,
    'c.ruin-northwest',
  ),
  createAshfallBuildingPlacement(
    'northwest-west',
    'canal-workshop',
    [-24.5, 0.2, 15],
    Math.PI / 2,
  ),
  createAshfallBuildingPlacement(
    'northeast-north',
    'channel-house',
    [17.5, 0.2, 24],
    Math.PI / 2,
    'c.ruin-northeast',
  ),
  createAshfallBuildingPlacement(
    'northeast-east',
    'canal-workshop',
    [24.5, 0.2, 15],
    Math.PI / 2,
  ),
  createAshfallBuildingPlacement(
    'southwest-south',
    'foundry-long',
    [-18, 0.2, -24],
    0,
    'c.ruin-southwest',
  ),
  createAshfallBuildingPlacement(
    'southwest-west',
    'canal-workshop',
    [-24.5, 0.2, -15],
    Math.PI / 2,
  ),
  createAshfallBuildingPlacement(
    'southeast-south',
    'harbor-row',
    [18, 0.2, -24.5],
    Math.PI / 2,
    'c.ruin-southeast',
  ),
  createAshfallBuildingPlacement(
    'southeast-east',
    'beacon-works',
    [22.5, 0.2, -15.5],
    0,
  ),
  createAshfallBuildingPlacement(
    'east-quay-north',
    'canal-workshop',
    [38.5, -0.05, 23],
    Math.PI / 2,
  ),
  createAshfallBuildingPlacement(
    'east-quay-south',
    'freight-annex',
    [37.5, -0.05, -18.5],
    Math.PI / 2,
  ),
  ...world002ABuildingPlacements,
  ...world002BBuildingPlacements,
] as const;

const buildings = ashfallBuildingPlacements.map(({ visual }) => visual);
const buildingCollision = ashfallBuildingPlacements.map(
  ({ collider: definition }) => definition,
);

// Thin authored curb faces sit entirely above the sidewalk collision surface.
// Their segments stop at the inside corner so no coplanar faces overlap.
const curbs: BoxVisualDefinition[] = [];
for (const [id, signX, signZ] of [
  ['northwest', -1, 1],
  ['northeast', 1, 1],
  ['southwest', -1, -1],
  ['southeast', 1, -1],
] as const) {
  curbs.push(
    box(
      `v.curb-${id}-vertical`,
      [signX * 6.125, 0.11, signZ * 17.125],
      [0.25, 0.22, 21.75],
      colors.curb,
      ashfallBuildingTextureIds.curbAggregate,
      3,
    ),
    box(
      `v.curb-${id}-horizontal`,
      [signX * 17.125, 0.11, signZ * 6.125],
      [21.75, 0.22, 0.25],
      colors.curb,
      ashfallBuildingTextureIds.curbAggregate,
      3,
    ),
  );
}

// Visible, collidable termination at every road end and around the outer corners.
for (const [id, position, size] of [
  ['boundary-north', [7, 0.65, 34.5], [87.5, 1.3, 1]],
  ['boundary-south', [7, 0.65, -34.5], [87.5, 1.3, 1]],
  ['boundary-east', [50.25, 0.65, 0], [1, 1.3, 70]],
  ['boundary-west', [-36.25, 0.65, 0], [1, 1.3, 70]],
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
for (const control of intersectionTrafficControls.approaches) {
  markings.push(
    box(
      `v.marking-stop-line-${control.approach}`,
      control.stopLine,
      control.stopLineSize,
      colors.marking,
    ),
  );
}

const props: EnvironmentVisualDefinition[] = [
  gltf('v.crosswalk', intersectionAssetIds.crosswalk, [0, 0.015, 0]),
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
const signalPoleColliders = intersectionTrafficControls.approaches.map(
  (control) =>
    collider(
      `c.traffic-signal-${control.approach}`,
      [control.pole[0], 2.25, control.pole[2]],
      [0.34, 4.1, 0.34],
      ['obstacle', 'camera'],
    ),
);

const environment = [
  ...paired.map(({ visual }) => visual),
  world002AWestRoad.visual,
  ...world002ASidewalks.map(({ visual }) => visual),
  ...world002BRoads.map(({ visual }) => visual),
  ...world002BSidewalks.map(({ visual }) => visual),
  eastQuayCurvedRoad,
  ...markings,
  ...curbs,
  ...buildings,
  ...props,
  signalControllerVisual,
] as const;

const staticCollision = [
  ...paired.map(({ collider: definition }) => definition),
  world002AWestRoad.collider,
  ...world002ASidewalks.map(({ collider: definition }) => definition),
  ...world002BRoads.map(({ collider: definition }) => definition),
  ...world002BSidewalks.map(({ collider: definition }) => definition),
  ...splineRoadColliders(eastQuayCurvedRoad),
  ...buildingCollision,
  signalControllerCollider,
  ...signalPoleColliders,
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
  collider('c.barrier-west', [-20, 0.4, -4.6], [0.5, 0.8, 2.1], ['obstacle']),
  collider('c.barrier-east', [20, 0.4, 4.6], [0.5, 0.8, 2.1], ['obstacle']),
] as const;

const streamableEntries = [...environment, ...staticCollision];
const world002AEntryIds = new Set([
  world002AWestRoad.visual.id,
  world002AWestRoad.collider.id,
  ...world002ASidewalks.flatMap(({ visual, collider: definition }) => [
    visual.id,
    definition.id,
  ]),
  ...world002ABuildingPlacements.flatMap(({ visual, collider: definition }) => [
    visual.id,
    definition.id,
  ]),
  ...streamableEntries
    .filter(
      ({ id }) =>
        id.includes('east-quay-ground') || id.includes('building-east-quay'),
    )
    .map(({ id }) => id),
  'v.boundary-west',
  'c.boundary-west',
  'v.boundary-east',
  'c.boundary-east',
]);
const world002BEntryIds = new Set([
  ...world002BRoads.flatMap(({ visual, collider: definition }) => [
    visual.id,
    definition.id,
  ]),
  ...world002BSidewalks.flatMap(({ visual, collider: definition }) => [
    visual.id,
    definition.id,
  ]),
  ...world002BBuildingPlacements.flatMap(({ visual, collider: definition }) => [
    visual.id,
    definition.id,
  ]),
  'v.boundary-north',
  'c.boundary-north',
  'v.boundary-south',
  'c.boundary-south',
]);
const coreEntryIds = streamableEntries
  .filter(
    ({ id }) =>
      !world002AEntryIds.has(id) &&
      !world002BEntryIds.has(id) &&
      !id.includes('east-quay') &&
      /road-|marking-|crosswalk|traffic-light|signal-controller/.test(id),
  )
  .map(({ id }) => id);
const eastQuayEntryIds = streamableEntries
  .filter(
    ({ id }) =>
      !world002AEntryIds.has(id) &&
      !world002BEntryIds.has(id) &&
      id.includes('east-quay'),
  )
  .map(({ id }) => id);
const quadrantEntries = streamableEntries.filter(
  ({ id }) =>
    !world002AEntryIds.has(id) &&
    !world002BEntryIds.has(id) &&
    !coreEntryIds.includes(id) &&
    !eastQuayEntryIds.includes(id),
);
const quadrantIds = (east: boolean, north: boolean): string[] =>
  quadrantEntries
    .filter(
      ({ position }) => position[0] >= 0 === east && position[2] >= 0 === north,
    )
    .map(({ id }) => id);
const rimIds = (east: boolean, north: boolean): string[] =>
  streamableEntries
    .filter(
      ({ id, position }) =>
        world002AEntryIds.has(id) &&
        position[0] >= 7 === east &&
        position[2] >= 0 === north,
    )
    .map(({ id }) => id);
const cardinalRimIds = (west: boolean, north: boolean): string[] =>
  streamableEntries
    .filter(
      ({ id, position }) =>
        world002BEntryIds.has(id) &&
        position[0] < 7 === west &&
        position[2] >= 0 === north,
    )
    .map(({ id }) => id);

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
    environment,
    staticCollision,
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
      {
        id: world002BContact.spawnId,
        kind: 'player',
        position: world002BContact.position,
        rotation: [0, Math.PI, 0],
        tags: ['ash-001', 'contact-yard', 'approach'],
      },
      ...world002BRimSpawns.map(({ id, position, yaw }) => ({
        id,
        kind: 'player' as const,
        position,
        rotation: [0, yaw, 0] as Vector3Tuple,
        tags: ['world-002b', 'outer-rim'],
      })),
    ],
    locations: [
      {
        id: 'interaction.signal-controller',
        kind: 'interaction',
        name: 'Signal Controller',
        position: intersectionLayout.signalController,
        tags: ['street', 'signal'],
      },
      {
        id: 'mission.intersection-center',
        kind: 'mission',
        name: 'Ashfall Crossing',
        position: [0, 0, 0],
        tags: ['future', 'intersection'],
      },
      {
        id: world002BContact.locationId,
        kind: 'interaction',
        name: 'Contact Yard',
        position: world002BContact.position,
        tags: ['ash-001', 'contact-yard', 'north-rim'],
      },
    ],
    zones: [
      {
        id: 'zone.ashfall-junction',
        name: 'Ashfall Junction',
        position: [7, 3, 0],
        size: [87.5, 10, 70],
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
        id: 'camera.ash-001.north-arrival',
        position: [7.5, 3.4, 24.5],
        lookAt: [0, 1.15, 20],
        fieldOfView: 46,
        tags: ['cinematic', 'ash-001', 'north-approach'],
      },
      {
        id: 'camera.ash-001.junction-watch',
        position: [-7.5, 4.2, 16.5],
        lookAt: [0, 1.4, 3],
        fieldOfView: 50,
        tags: ['cinematic', 'ash-001', 'junction'],
      },
      {
        id: 'camera.ash-001.mack-position',
        position: [-4, 3.5, 16],
        lookAt: [-12, 1.45, 9.5],
        fieldOfView: 46,
        tags: ['cinematic', 'ash-001', 'mack'],
      },
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
        position: [15, 4.8, 4],
        lookAt: [6.8, 4.1, 4],
        fieldOfView: 44,
        tags: ['interaction', 'traffic-signal-review'],
      },
      {
        id: 'camera.traffic-signal-north-review',
        position: [-1.5, 4.8, 15],
        lookAt: [-1.5, 4.1, 6.8],
        fieldOfView: 44,
        tags: ['debug', 'traffic-signal-review'],
      },
      {
        id: 'camera.east-quay-overhead',
        position: [10, 58, 20],
        lookAt: [10, 2.5, 0],
        fieldOfView: 48,
        tags: ['debug', 'world-001', 'map'],
      },
      {
        id: 'camera.east-quay-street',
        position: [30, 6, -8],
        lookAt: [36, 1.2, 7],
        fieldOfView: 52,
        tags: ['debug', 'world-001', 'street'],
      },
      {
        id: world002BContact.cameraAnchorId,
        position: world002BContact.cameraPosition,
        lookAt: world002BContact.cameraLookAt,
        fieldOfView: 50,
        tags: ['cinematic', 'ash-001', 'contact-yard', 'destination-reveal'],
      },
      {
        id: 'camera.world-002b.overhead',
        position: [7, 100, 0],
        // Aim above the floor to keep camera obstruction from collapsing the view.
        lookAt: [7, 5, 0.1],
        fieldOfView: 60,
        tags: ['debug', 'world-002b', 'bounds'],
      },
      {
        id: 'camera.world-002b.west-rim',
        position: [-24, 7, -8],
        lookAt: [-34, 2, 0],
        fieldOfView: 52,
        tags: ['debug', 'world-002b', 'street', 'west-rim'],
      },
      {
        id: 'camera.world-002b.east-rim',
        position: [35, 25, -15],
        lookAt: [44, 5, 5],
        fieldOfView: 46,
        tags: ['debug', 'world-002b', 'street', 'east-rim', 'curve'],
      },
      {
        id: 'camera.world-002b.south-rim',
        position: [30, 5, -22],
        lookAt: [30, 2, -32],
        fieldOfView: 52,
        tags: ['debug', 'world-002b', 'street', 'south-rim'],
      },
    ],
    lighting: {
      lamps: [
        {
          id: 'lamp.street-light-nw',
          visualId: 'v.street-light-nw',
          position: [-6.12, 6.57, 8.5],
          emissiveMaterialName: 'Light',
        },
        {
          id: 'lamp.street-light-se',
          visualId: 'v.street-light-se',
          position: [6.12, 6.57, -8.5],
          emissiveMaterialName: 'Light',
        },
      ],
    },
    mapPresentation: {
      orientation: 'north-up',
      bounds: {
        ...world002BPlan.bounds,
      },
      geometry: [
        { entryId: 'v.road-east-west', layer: 'roads' },
        { entryId: 'v.road-north-south', layer: 'roads' },
        { entryId: eastQuayCurvedRoad.id, layer: 'roads' },
        { entryId: world002AWestRoad.visual.id, layer: 'roads' },
        ...world002BRoads.map(({ visual }) => ({
          entryId: visual.id,
          layer: 'roads' as const,
        })),
        ...ashfallBuildingPlacements.map(({ visual }) => ({
          entryId: visual.id,
          layer: 'structures' as const,
        })),
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
        {
          entryId: world002BContact.locationId,
          layer: 'interactions',
        },
        {
          entryId: world002BContact.spawnId,
          layer: 'spawns',
        },
        ...world002BRimSpawns.map(({ id }) => ({
          entryId: id,
          layer: 'spawns' as const,
        })),
      ],
    },
    streaming: {
      sectors: [
        {
          id: 'sector.core',
          center: [0, 0],
          loadDistance: 1,
          unloadDistance: 2,
          alwaysLoaded: true,
          entryIds: coreEntryIds,
        },
        ...(
          [
            ['sector.northwest', false, true, -14, 14],
            ['sector.northeast', true, true, 14, 14],
            ['sector.southwest', false, false, -14, -14],
            ['sector.southeast', true, false, 14, -14],
          ] as const
        ).map(([id, east, north, x, z]) => ({
          id,
          center: [x, z] as const,
          loadDistance: 26,
          unloadDistance: 32,
          entryIds: quadrantIds(east, north),
        })),
        {
          id: ashfallExpansionPlan.addedSectorId,
          // Keep East Quay continuity resident from the final north contact yard.
          center: [35, 8],
          loadDistance: 26,
          unloadDistance: 32,
          entryIds: eastQuayEntryIds,
        },
        ...(
          [
            ['sector.west-rim-north', false, true, -32.375, 17],
            ['sector.west-rim-south', false, false, -32.375, -17],
            ['sector.east-rim-north', true, true, 46.375, 17],
            ['sector.east-rim-south', true, false, 46.375, -17],
          ] as const
        ).map(([id, east, north, x, z]) => ({
          id,
          center: [x, z] as const,
          loadDistance: 26,
          unloadDistance: 32,
          entryIds: rimIds(east, north),
        })),
        ...(
          [
            ['sector.north-rim-west', true, true, -21.375, 31.5],
            ['sector.north-rim-east', false, true, 28.375, 31.5],
            ['sector.south-rim-west', true, false, -21.375, -31.5],
            ['sector.south-rim-east', false, false, 28.375, -31.5],
          ] as const
        ).map(([id, west, north, x, z]) => ({
          id,
          center: [x, z] as const,
          loadDistance: 26,
          unloadDistance: 32,
          entryIds: cardinalRimIds(west, north),
        })),
      ],
    },
    pedestrians: {
      seed: 0x415348,
      residentCap: 16,
      activationDistance: 38,
      visibilityDistance: 46,
      routes: [
        sidewalkLoop('route.northwest', 'sector.northwest', 'northwest', [
          [-9.5, 0.2, 11.5],
          [-9.5, 0.2, 18],
          [-15, 0.2, 18],
          [-15, 0.2, 11.5],
        ]),
        sidewalkLoop('route.northeast', 'sector.northeast', 'northeast', [
          [9.5, 0.2, 11.5],
          [15, 0.2, 11.5],
          [15, 0.2, 18],
          [9.5, 0.2, 18],
        ]),
        sidewalkLoop('route.southwest', 'sector.southwest', 'southwest', [
          [-9.5, 0.2, -11.5],
          [-15, 0.2, -11.5],
          [-15, 0.2, -18],
          [-9.5, 0.2, -18],
        ]),
        sidewalkLoop('route.southeast', 'sector.southeast', 'southeast', [
          [9.5, 0.2, -11.5],
          [9.5, 0.2, -18],
          [15, 0.2, -18],
          [15, 0.2, -11.5],
        ]),
      ],
    },
  },
} as const satisfies LevelModule;

function sidewalkLoop(
  id: string,
  sectorId: string,
  surface: string,
  positions: readonly Vector3Tuple[],
) {
  return {
    id,
    sectorId,
    loop: true as const,
    population: 4,
    speed: [1.15, 1.48] as const,
    nodes: positions.map((position, index) => ({
      id: `${id}.node-${index + 1}`,
      position,
      surfaceColliderId: `c.sidewalk-${surface}`,
      ...(index === 0 || index === 2
        ? { pauseSeconds: [0.65, 1.8] as const }
        : {}),
    })),
  };
}

function box(
  id: string,
  position: Vector3Tuple,
  size: Vector3Tuple,
  color: number,
  textureAssetId?: string,
  uvMetersPerRepeat?: number,
): BoxVisualDefinition {
  return {
    id,
    kind: 'box',
    position,
    size,
    color,
    textureAssetId,
    uvMetersPerRepeat,
  };
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
