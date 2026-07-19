import type { StaticColliderDefinition } from '../../physics/StaticCollider';
import type {
  BoxVisualDefinition,
  EnvironmentVisualDefinition,
  LevelModule,
  Vector3Tuple,
} from '../LevelDefinition';
import {
  ashfallBuildingAssets,
  ashfallBuildingTextureIds,
} from '../buildings/AshfallBuildingKit';

const colors = {
  wetConcrete: 0x687074,
  platform: 0x8b8c84,
  curb: 0xb7ae93,
  lane: 0x252a2c,
  brick: 0x735e52,
  zinc: 0x496365,
  glass: 0x6d8b8d,
  fluorescent: 0xd6e8d7,
  sodium: 0xd58c36,
  paper: 0xd6c9a6,
  carbon: 0x34434c,
  coach: 0x34595d,
  wagon: 0x6b473b,
  divider: 0x777872,
} as const;

export const northbarCoachDepotLayout = {
  bounds: { minX: -24, maxX: 24, minZ: -18, maxZ: 18 },
  playableAreaSquareMetres: 1_728,
  pedestrianRouteWidth: 4,
  entranceClearance: 4,
  cameraPadSize: 4,
  platformEdgeClearance: 1.2,
  departureLaneWidth: 6,
  defaultSpawn: [-13.2, 0.16, 2.2] as Vector3Tuple,
  marks: {
    rookCoachStep: [-13.2, 0.16, 2.2] as Vector3Tuple,
    rookCurb: [-4, 0.16, 1.5] as Vector3Tuple,
    mackPillar: [-1.4, 0.16, 1.5] as Vector3Tuple,
    dellaCounter: [7.2, 0.16, 8.6] as Vector3Tuple,
    wagonPassengerDoor: [7.2, 0.16, -6.2] as Vector3Tuple,
    wagonDriverDoor: [7.2, 0.16, -9.2] as Vector3Tuple,
  },
} as const;

/** Level-owned vehicle choreography; the later vehicle runtime consumes the points. */
export const northbarVehiclePaths = {
  coachArrival: [
    [-14.8, 0.16, -14.5],
    [-14.8, 0.16, -5],
    [-14.8, 0.16, 2.2],
  ],
  wagonExit: [
    [8.5, 0.16, -7.7],
    [13, 0.16, -7.7],
    [18.5, 0.16, -7.7],
    [25.5, 0.16, -7.7],
  ],
} as const satisfies Readonly<Record<string, readonly Vector3Tuple[]>>;

type SectorId = 'infrastructure' | 'arrival' | 'departure';
const environment: EnvironmentVisualDefinition[] = [];
const staticCollision: StaticColliderDefinition[] = [];
const ownership: Record<SectorId, string[]> = {
  infrastructure: [],
  arrival: [],
  departure: [],
};

function visual(
  sector: SectorId,
  id: string,
  position: Vector3Tuple,
  size: Vector3Tuple,
  color: number,
  textureAssetId?: string,
  uvMetersPerRepeat?: number,
  rotation?: Vector3Tuple,
): BoxVisualDefinition {
  const definition: BoxVisualDefinition = {
    id,
    kind: 'box',
    position,
    size,
    color,
    textureAssetId,
    uvMetersPerRepeat,
    rotation,
  };
  environment.push(definition);
  ownership[sector].push(id);
  return definition;
}

function solid(
  sector: SectorId,
  id: string,
  position: Vector3Tuple,
  size: Vector3Tuple,
  color: number,
  tags: readonly string[],
  textureAssetId?: string,
  uvMetersPerRepeat?: number,
  rotation?: Vector3Tuple,
): void {
  visual(
    sector,
    `v.${id}`,
    position,
    size,
    color,
    textureAssetId,
    uvMetersPerRepeat,
    rotation,
  );
  const colliderId = `c.${id}`;
  staticCollision.push({ id: colliderId, position, size, tags, rotation });
  ownership[sector].push(colliderId);
}

// One always-loaded slab prevents grounding seams during sector changes.
solid(
  'infrastructure',
  'northbar-ground',
  [0, -0.2, 0],
  [48, 0.4, 36],
  colors.wetConcrete,
  ['walkable', 'ground'],
  ashfallBuildingTextureIds.sidewalkConcrete,
  5,
);
solid(
  'infrastructure',
  'northbar-departure-lane',
  [4, 0.015, -8],
  [40, 0.03, 6],
  colors.lane,
  ['walkable', 'vehicle-lane'],
);
solid(
  'infrastructure',
  'northbar-platform',
  [-7, 0.075, 2],
  [30, 0.15, 7],
  colors.platform,
  ['walkable', 'platform'],
  ashfallBuildingTextureIds.sidewalkConcrete,
  4,
);
solid(
  'infrastructure',
  'northbar-baggage-walk',
  [4, 0.075, -2],
  [32, 0.15, 4],
  colors.platform,
  ['walkable', 'sidewalk'],
  ashfallBuildingTextureIds.sidewalkConcrete,
  4,
);

// The waiting room is a glazed-brick shell with a 4m south entrance and a
// broad service opening. Its walls never occupy the close-up sightline.
for (const [id, position, size] of [
  ['waiting-room-north', [7, 2.7, 14.5], [20, 5.4, 0.5]],
  ['waiting-room-west', [-3, 2.7, 10.5], [0.5, 5.4, 8.5]],
  ['waiting-room-east', [17, 2.7, 10.5], [0.5, 5.4, 8.5]],
  ['waiting-room-south-west', [1, 2.7, 6.5], [8, 5.4, 0.5]],
  ['waiting-room-south-east', [14, 2.7, 6.5], [6, 5.4, 0.5]],
] as const) {
  solid(
    'arrival',
    id,
    position,
    size,
    colors.brick,
    ['obstacle', 'camera', 'building'],
    ashfallBuildingTextureIds.brickStucco,
    3.5,
  );
}
solid(
  'arrival',
  'waiting-room-roof',
  [7, 5.6, 10.5],
  [20.5, 0.35, 9],
  colors.zinc,
  ['obstacle', 'camera', 'roof'],
  ashfallBuildingTextureIds.roofMembrane,
  4,
);

// A production-intended transfer canopy: low-profile structural boxes and
// alternating raised zinc teeth make Northbar unlike Junction's street grid.
solid(
  'infrastructure',
  'transfer-canopy',
  [-6, 5.25, 0.8],
  [34, 0.32, 14],
  colors.zinc,
  ['obstacle', 'camera', 'roof'],
  ashfallBuildingTextureIds.corrugatedTeal,
  3,
);
for (const [index, x] of [-18, -12, -6, 0, 6].entries()) {
  visual(
    'infrastructure',
    `v.canopy-sawtooth-${index + 1}`,
    [x, 5.72, 0.8],
    [5.6, 0.5, 13.6],
    index % 2 === 0 ? colors.zinc : colors.glass,
    index % 2 === 0
      ? ashfallBuildingTextureIds.corrugatedTeal
      : ashfallBuildingTextureIds.windowDeco,
    3,
  );
}
for (const [id, x, z] of [
  ['west-north', -19.2, 4.6],
  ['west-south', -19.2, -3],
  ['center-north', -8.5, 4.6],
  ['center-south', -8.5, -3],
  ['mack-north', -0.8, 4.6],
] as const) {
  solid(
    'infrastructure',
    `canopy-column-${id}`,
    [x, 2.6, z],
    [0.35, 5.2, 0.35],
    colors.divider,
    ['obstacle', 'camera', 'structure'],
  );
}

// Marrow's leased counter keeps the manifest action above subtitle reserve.
solid(
  'arrival',
  'marrow-counter',
  [7.2, 0.75, 7.25],
  [6.8, 1.5, 1.1],
  colors.brick,
  ['obstacle', 'camera', 'counter'],
  ashfallBuildingTextureIds.concreteDeco,
  3,
);
for (const [id, x] of [
  ['left', 3.65],
  ['right', 10.75],
] as const) {
  solid(
    'arrival',
    `counter-frame-${id}`,
    [x, 3.05, 7.25],
    [0.3, 4.6, 0.4],
    colors.zinc,
    ['obstacle', 'camera', 'structure'],
  );
}
visual(
  'arrival',
  'prop.northbar.arrival-manifest',
  [7.2, 1.53, 7.25],
  [1.15, 0.035, 0.72],
  colors.paper,
);
visual(
  'arrival',
  'prop.northbar.manifest-carbon',
  [7.25, 1.56, 7.2],
  [1.05, 0.025, 0.62],
  colors.carbon,
);
visual(
  'arrival',
  'prop.northbar.eastbound-timetable',
  [13.8, 2.5, 6.2],
  [2.5, 2.4, 0.16],
  colors.paper,
);
for (const [id, x] of [
  ['a', 13.2],
  ['b', 14.4],
] as const) {
  visual(
    'arrival',
    `prop.northbar.payphone-${id}`,
    [x, 1.35, 6],
    [0.7, 1.6, 0.45],
    0x32484a,
  );
}

// Vehicle silhouettes are original level-owned geometry, not debug markers.
visual(
  'arrival',
  'vehicle.northbar.intercity-coach',
  [-17.2, 1.75, 1.4],
  [3.1, 3.5, 11.5],
  colors.coach,
  ashfallBuildingTextureIds.corrugatedTeal,
  3,
);
visual(
  'arrival',
  'v.coach-window-band',
  [-15.62, 2.25, 1.4],
  [0.08, 1.05, 8.6],
  colors.glass,
  ashfallBuildingTextureIds.windowDeco,
  2,
);
visual(
  'arrival',
  'v.coach-roof',
  [-17.2, 3.65, 1.4],
  [3.25, 0.25, 11.7],
  0xb8b6a7,
);
visual(
  'arrival',
  'v.coach-windshield',
  [-17.2, 2.55, -4.38],
  [2.45, 1.1, 0.08],
  colors.glass,
  ashfallBuildingTextureIds.windowDeco,
  2,
);
visual(
  'arrival',
  'v.coach-bumper',
  [-17.2, 0.48, -4.5],
  [3.3, 0.28, 0.22],
  colors.curb,
);
for (const [id, x, z] of [
  ['front-left', -15.62, -2.6],
  ['front-right', -18.78, -2.6],
  ['rear-left', -15.62, 4.4],
  ['rear-right', -18.78, 4.4],
] as const) {
  visual(
    'arrival',
    `v.coach-wheel-${id}`,
    [x, 0.55, z],
    [0.32, 0.95, 0.95],
    0x17191a,
  );
}
solid(
  'arrival',
  'coach-body',
  [-17.2, 1.75, 1.4],
  [3.1, 3.5, 11.5],
  colors.coach,
  ['obstacle', 'camera', 'vehicle-staging'],
);

visual(
  'departure',
  'vehicle.mack.service-wagon',
  [8.5, 0.9, -7.7],
  [4.8, 1.8, 2.2],
  colors.wagon,
  ashfallBuildingTextureIds.brickStucco,
  2.5,
);
visual(
  'departure',
  'v.service-wagon-cabin',
  [8.9, 1.75, -7.7],
  [2.2, 1.2, 2],
  colors.glass,
  ashfallBuildingTextureIds.windowDeco,
  2,
);
visual(
  'departure',
  'v.service-wagon-hood',
  [10.35, 1.05, -7.7],
  [1.35, 0.65, 2.05],
  colors.wagon,
);
visual(
  'departure',
  'v.service-wagon-windshield',
  [9.95, 1.72, -7.7],
  [0.08, 0.82, 1.75],
  colors.glass,
  ashfallBuildingTextureIds.windowDeco,
  2,
);
visual(
  'departure',
  'v.service-wagon-bumper',
  [10.98, 0.55, -7.7],
  [0.2, 0.26, 2.3],
  colors.curb,
);
visual(
  'departure',
  'v.service-wagon-side-stripe',
  [8.5, 1.05, -6.58],
  [3.8, 0.18, 0.08],
  0xd7c28a,
);
visual(
  'departure',
  'v.service-wagon-roof-beacon',
  [8.9, 2.48, -7.7],
  [0.42, 0.24, 0.42],
  0xe09a2d,
);
for (const [id, x, z] of [
  ['front-left', 10.1, -6.58],
  ['front-right', 10.1, -8.82],
  ['rear-left', 7.1, -6.58],
  ['rear-right', 7.1, -8.82],
] as const) {
  visual(
    'departure',
    `v.service-wagon-wheel-${id}`,
    [x, 0.48, z],
    [0.9, 0.9, 0.3],
    0x17191a,
  );
}
solid(
  'departure',
  'service-wagon-body',
  [8.5, 0.9, -7.7],
  [4.8, 1.8, 2.2],
  colors.wagon,
  ['obstacle', 'camera', 'vehicle-staging'],
);

// The divider is the authored loading cover after four metres of tracking.
solid(
  'departure',
  'transition-divider',
  [19.2, 1.3, -4.3],
  [1.2, 2.6, 8.2],
  colors.divider,
  ['obstacle', 'camera', 'loading-cover'],
  ashfallBuildingTextureIds.concreteDeco,
  3,
);
for (const [id, position] of [
  ['bay-two', [-7.5, 5.05, 4.8]],
  ['departure', [12.5, 5.05, -3.2]],
] as const) {
  visual(
    id === 'bay-two' ? 'arrival' : 'departure',
    `v.sodium-lamp-${id}`,
    position,
    [0.45, 0.18, 1.3],
    colors.sodium,
  );
}

// Visible boundary collision closes the yard while leaving the east exit lane
// and southwest pedestrian gate readable and traversable.
for (const [id, position, size] of [
  ['north', [0, 0.75, 17.5], [48, 1.5, 1]],
  ['west-north', [-23.5, 0.75, 8], [1, 1.5, 19]],
  ['west-south', [-23.5, 0.75, -14], [1, 1.5, 8]],
  ['south-west', [-8, 0.75, -17.5], [32, 1.5, 1]],
  ['south-east', [20, 0.75, -17.5], [8, 1.5, 1]],
  ['east-north', [23.5, 0.75, 7], [1, 1.5, 21]],
  ['east-south', [23.5, 0.75, -15], [1, 1.5, 5]],
] as const) {
  solid(
    'infrastructure',
    `boundary-${id}`,
    position,
    size,
    colors.curb,
    ['boundary', 'camera'],
    ashfallBuildingTextureIds.curbAggregate,
    3,
  );
}

const semanticLocations = [
  [
    'mark.northbar.rook-coach-step',
    northbarCoachDepotLayout.marks.rookCoachStep,
  ],
  ['mark.northbar.rook-curb', northbarCoachDepotLayout.marks.rookCurb],
  ['mark.northbar.mack-pillar', northbarCoachDepotLayout.marks.mackPillar],
  ['mark.northbar.della-counter', northbarCoachDepotLayout.marks.dellaCounter],
  [
    'mark.northbar.wagon-passenger-door',
    northbarCoachDepotLayout.marks.wagonPassengerDoor,
  ],
  [
    'mark.northbar.wagon-driver-door',
    northbarCoachDepotLayout.marks.wagonDriverDoor,
  ],
  ['path.northbar.wagon-exit', northbarVehiclePaths.wagonExit[0]],
  ['path.northbar.wagon-exit-1', northbarVehiclePaths.wagonExit[1]],
  ['path.northbar.wagon-exit-2', northbarVehiclePaths.wagonExit[2]],
  ['path.northbar.wagon-exit-3', northbarVehiclePaths.wagonExit[3]],
  ['path.northbar.carbon-start', [7.25, 1.56, 7.2]],
  ['path.northbar.carbon-shift', [8, 1.56, 7.15]],
] as const;

export const northbarCoachDepot = {
  assets: {
    ...ashfallBuildingAssets,
  },
  definition: {
    id: 'northbar-coach-depot',
    name: 'Northbar Coach Depot',
    environment,
    staticCollision,
    spawns: [
      {
        id: 'spawn.player-default',
        kind: 'player',
        default: true,
        position: northbarCoachDepotLayout.defaultSpawn,
        rotation: [0, Math.PI / 2, 0],
        tags: ['northbar', 'arrival', 'rook'],
      },
      {
        id: 'spawn.northbar.mack',
        kind: 'npc',
        position: northbarCoachDepotLayout.marks.mackPillar,
        rotation: [0, -Math.PI / 2, 0],
        tags: ['northbar', 'mack'],
      },
      {
        id: 'spawn.northbar.della-voss',
        kind: 'npc',
        position: northbarCoachDepotLayout.marks.dellaCounter,
        rotation: [0, Math.PI, 0],
        tags: ['northbar', 'della-voss'],
      },
    ],
    locations: semanticLocations.map(([id, position]) => ({
      id,
      kind: 'mission' as const,
      position,
      tags: [
        'northbar',
        id.startsWith('mark.') ? 'blocking-mark' : 'vehicle-path',
      ],
    })),
    zones: [
      {
        id: 'zone.northbar-depot',
        name: 'Northbar Coach Depot',
        position: [0, 3, 0],
        size: [48, 10, 36],
      },
    ],
    landmarks: [
      {
        id: 'landmark.northbar-bay-two',
        name: 'Bay Two',
        position: [-13, 1, 2],
        radius: 7,
        priority: 4,
      },
    ],
    triggers: [
      {
        id: 'trigger.northbar-coach-arrival',
        shape: 'box',
        position: [-14, 1.5, 2],
        size: [7, 3, 12],
        tags: ['cinematic', 'arrival'],
      },
      {
        id: 'trigger.northbar-departure-ready',
        shape: 'box',
        position: [18.5, 1.5, -7.7],
        size: [4, 3, 6],
        tags: ['cinematic', 'departure', 'transition'],
      },
    ],
    cinematicAnchors: [
      anchor(
        'camera.northbar.establish-bay-two',
        [-3, 5, -8],
        [0, 0.8, 2],
        64,
        ['wide', 'desktop'],
      ),
      anchor(
        'camera.northbar.establish-bay-two-safe',
        [12, 4, 1],
        [-1, 1.2, 1.7],
        72,
        ['wide', 'safe', 'narrow'],
      ),
      anchor(
        'camera.northbar.rook-mack-two-shot',
        [-2.7, 1.8, -0.8],
        [-2.7, 1.4, 1.5],
        48,
        ['two-shot', 'fallback'],
      ),
      anchor(
        'camera.northbar.rook-mack-two-shot-safe',
        [8, 3, 1],
        [-3, 1.2, 1.3],
        58,
        ['two-shot', 'safe'],
      ),
      anchor(
        'camera.northbar.mack-missing-close',
        [-3.1, 2, 0.1],
        [-1.4, 1.45, 1.5],
        34,
        ['close-up', 'mack'],
      ),
      anchor(
        'camera.northbar.mack-missing-close-safe',
        [-3.5, 2.15, -0.7],
        [-1.4, 1.45, 1.5],
        38,
        ['close-up', 'mack', 'safe'],
      ),
      anchor(
        'camera.northbar.della-carbon-close-safe',
        [4.5, 2.4, 8.8],
        [7.2, 1.25, 8.4],
        34,
        ['close-up', 'della', 'safe'],
      ),
      anchor(
        'camera.northbar.della-carbon-close-alt',
        [4.2, 2.6, 9.2],
        [7.2, 1.25, 8.4],
        34,
        ['close-up', 'della', 'alternate'],
      ),
      anchor(
        'camera.northbar.three-way-cover',
        [-3, 5, -8],
        [0.2, 0.8, 4],
        62,
        ['three-shot'],
      ),
      anchor(
        'camera.northbar.three-way-cover-safe',
        [12, 4, 1],
        [-1, 1.2, 1.7],
        72,
        ['three-shot', 'safe'],
      ),
      anchor(
        'camera.northbar.rook-decision-close-safe',
        [-2.1, 2, 3],
        [-4, 1.35, 1.5],
        42,
        ['close-up', 'rook', 'safe'],
      ),
      anchor(
        'camera.northbar.rook-decision-close-alt',
        [-1.8, 2.1, 3.2],
        [-4, 1.35, 1.5],
        40,
        ['close-up', 'rook', 'alternate'],
      ),
      anchor(
        'camera.northbar.ticket-choice',
        [-3.4, 2.55, -2.8],
        [-2.7, 1.25, 1.5],
        48,
        ['props', 'choice'],
      ),
      anchor(
        'camera.northbar.ticket-choice-safe',
        [8, 3, 1],
        [-3, 1.2, 1.3],
        58,
        ['choice', 'safe'],
      ),
      anchor(
        'camera.northbar.wagon-entry',
        [12, 2.45, -2.5],
        [9.5, 1.15, -7.7],
        50,
        ['vehicle', 'entry'],
      ),
      anchor(
        'camera.northbar.wagon-departure',
        [13, 2.6, -2.5],
        [18, 1.15, -7.7],
        54,
        ['vehicle', 'departure', 'loading-cover'],
      ),
      anchor('camera.northbar.overhead', [0, 48, 0], [0, 0, 0], 46, [
        'debug',
        'overhead',
      ]),
      anchor(
        'camera.northbar.platform-clearance',
        [-3, 6.5, -10],
        [-6, 0.5, 1.5],
        52,
        ['debug', 'clearance'],
      ),
    ],
    lighting: {
      lamps: [
        {
          id: 'lamp.northbar.bay-two',
          visualId: 'v.sodium-lamp-bay-two',
          position: [-7.5, 5.05, 4.8],
          emissiveMaterialName: 'NorthbarSodium',
        },
        {
          id: 'lamp.northbar.departure',
          visualId: 'v.sodium-lamp-departure',
          position: [12.5, 5.05, -3.2],
          emissiveMaterialName: 'NorthbarSodium',
        },
        {
          id: 'lamp.northbar.waiting-room',
          visualId: 'prop.northbar.eastbound-timetable',
          position: [8, 4.4, 9],
          emissiveMaterialName: 'NorthbarFluorescent',
        },
      ],
    },
    streaming: {
      sectors: [
        {
          id: 'sector.northbar.infrastructure',
          center: [0, 0],
          loadDistance: 1,
          unloadDistance: 2,
          alwaysLoaded: true,
          entryIds: ownership.infrastructure,
        },
        {
          id: 'sector.northbar.arrival',
          center: [-12, 0],
          loadDistance: 40,
          unloadDistance: 48,
          entryIds: ownership.arrival,
        },
        {
          id: 'sector.northbar.departure',
          center: [12, 0],
          loadDistance: 40,
          unloadDistance: 48,
          entryIds: ownership.departure,
        },
      ],
    },
  },
} as const satisfies LevelModule;

function anchor(
  id: string,
  position: Vector3Tuple,
  lookAt: Vector3Tuple,
  fieldOfView: number,
  tags: readonly string[],
) {
  return { id, position, lookAt, fieldOfView, tags } as const;
}
