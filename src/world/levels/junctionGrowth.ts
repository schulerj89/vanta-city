import type { StaticColliderDefinition } from '../../physics/StaticCollider';
import type {
  BoxVisualDefinition,
  BuildingVisualDefinition,
  Vector3Tuple,
} from '../LevelDefinition';
import { getAshfallBuildingVariant } from '../buildings/AshfallBuildingKit';

export interface AshfallBuildingPlacement {
  readonly visual: BuildingVisualDefinition;
  readonly collider: StaticColliderDefinition;
}

export interface JunctionSurfacePair {
  readonly visual: BoxVisualDefinition;
  readonly collider: StaticColliderDefinition;
}

export interface JunctionOwnedBuildingPlacement extends AshfallBuildingPlacement {
  readonly sectorId: string;
  readonly purpose: 'contact-yard' | 'street-frontage' | 'world-growth';
}

export interface JunctionOwnedVisual {
  readonly visual: BoxVisualDefinition;
  readonly sectorId: string;
}

export const world002ABaseline = {
  bounds: { minX: -28, maxX: 42, minZ: -28, maxZ: 28 },
  widthMetres: 70,
  depthMetres: 56,
  playableAreaSquareMetres: 3920,
  buildingCount: 10,
  sectorCount: 6,
} as const;

/** First independently measured +25%-area milestone: east/west growth only. */
export const world002APlan = {
  id: 'world-002a-east-west-rim',
  bounds: { minX: -36.75, maxX: 50.75, minZ: -28, maxZ: 28 },
  widthMetres: 87.5,
  depthMetres: 56,
  playableAreaSquareMetres: 4900,
  growthPercentFromPrior: 25,
  minimumPedestrianClearanceMetres: 4,
  minimumEntranceClearanceMetres: 1.8,
  trafficEndpointInsetMetres: 3,
  addedBuildingIds: [
    'v.building-west-rim-south-works',
    'v.building-west-rim-corner-kiosk',
    'v.building-west-rim-north-workshop',
    'v.building-east-rim-south-kiosk',
    'v.building-east-rim-south-workshop',
    'v.building-east-rim-north-workshop',
  ],
  addedSectorIds: [
    'sector.west-rim-north',
    'sector.west-rim-south',
    'sector.east-rim-north',
    'sector.east-rim-south',
  ],
  roadVisualIds: ['v.road-west-rim', 'v.road-east-quay-curve'],
} as const;

/** Second independently measured +25%-area milestone: north/south growth. */
export const world002BPlan = {
  id: 'world-002b-north-south-rim',
  bounds: { minX: -36.75, maxX: 50.75, minZ: -35, maxZ: 35 },
  widthMetres: 87.5,
  depthMetres: 70,
  playableAreaSquareMetres: 6125,
  growthPercentFromPrior: 25,
  minimumPedestrianClearanceMetres: 4,
  minimumEntranceClearanceMetres: 1.8,
  trafficEndpointInsetMetres: 3,
  addedBuildingIds: [
    'v.building-north-rim-west-workshop',
    'v.building-north-rim-arcade-kiosk',
    'v.building-north-rim-east-workshop',
    'v.building-south-rim-west-workshop',
    'v.building-south-rim-court-kiosk',
    'v.building-south-rim-east-workshop',
  ],
  addedSectorIds: [
    'sector.north-rim-west',
    'sector.north-rim-east',
    'sector.south-rim-west',
    'sector.south-rim-east',
  ],
  roadVisualIds: ['v.road-north-rim', 'v.road-south-rim'],
} as const;

export const world002BContact = {
  locationId: 'location.ash-001.contact-yard',
  spawnId: 'spawn.ash-001.contact',
  cameraAnchorId: 'camera.ash-001.contact-reveal',
  position: [30, 0.22, 26.6] as Vector3Tuple,
  cameraPosition: [30, 5, 18] as Vector3Tuple,
  cameraLookAt: [30, 1.4, 27] as Vector3Tuple,
} as const;

/**
 * WORLD-003 makes the already-authorized final footprint legible without
 * changing its bounds or applying another growth milestone.
 */
export const world003JunctionPlan = {
  id: 'world-003-visible-junction',
  bounds: world002BPlan.bounds,
  playableAreaSquareMetres: world002BPlan.playableAreaSquareMetres,
  growthPercent: 0,
  buildingCountBefore: 22,
  buildingCountAfter: 25,
  addedBuildingIds: [
    'v.building-contact-yard-office',
    'v.building-south-rim-canal-office',
    'v.building-south-rim-ticket-arcade',
  ],
  streetEdgeVisualIds: [
    'v.curb-west-rim-north',
    'v.curb-west-rim-south',
    'v.curb-north-rim-west',
    'v.curb-north-rim-east',
    'v.curb-south-rim-west',
    'v.curb-south-rim-east',
    'v.marking-west-rim',
    'v.marking-north-rim',
    'v.marking-south-rim',
  ],
  seamSurfaceIds: [
    'v.sidewalk-east-quay-rim-seam',
    'c.sidewalk-east-quay-rim-seam',
    'v.east-quay-rim-ground-fill',
    'c.east-quay-rim-ground-fill',
  ],
  pedestrianRouteIds: [
    'route.west-rim-north',
    'route.east-rim-north',
    'route.east-rim-south',
    'route.north-rim-west',
  ],
} as const;

export const world004JunctionPlan = {
  id: 'world-004-four-side-interiors',
  centre: [7, 0] as const,
  bounds: { minX: -47.6875, maxX: 61.6875, minZ: -43.75, maxZ: 43.75 },
  baselineHalfExtents: { x: 43.75, z: 35 },
  targetHalfExtents: { x: 54.6875, z: 43.75 },
  widthMetres: 109.375,
  depthMetres: 87.5,
  playableAreaSquareMetres: 9570.3125,
  linearGrowthPercent: 25,
  areaGrowthPercent: 56.25,
  buildingCountBefore: 25,
  buildingCountAfter: 37,
  minimumPedestrianClearanceMetres: 4,
  minimumEntranceClearanceMetres: 3,
  addedSectorIds: [
    'sector.world-004-west-north',
    'sector.world-004-west-south',
    'sector.world-004-east-north',
    'sector.world-004-east-south',
    'sector.world-004-north-west',
    'sector.world-004-north-east',
    'sector.world-004-south-west',
    'sector.world-004-south-east',
  ],
} as const;

const world004BuildingCatalog = [
  [
    'world-004-west-net-loft',
    'boardwalk-kiosk',
    [-43.5, 0.2, -39],
    -Math.PI / 2,
    'sector.world-004-west-south',
  ],
  [
    'world-004-west-repair-row',
    'canal-workshop',
    [-43.5, 0.2, -13],
    -Math.PI / 2,
    'sector.world-004-west-south',
  ],
  [
    'world-004-west-cold-office',
    'canal-workshop',
    [-44, 0.2, 34],
    -Math.PI / 2,
    'sector.world-004-west-north',
  ],
  [
    'world-004-east-laundry',
    'boardwalk-kiosk',
    [57.5, 0.2, -39],
    Math.PI / 2,
    'sector.world-004-east-south',
  ],
  [
    'world-004-east-tide-shop',
    'canal-workshop',
    [57.5, 0.2, -17],
    Math.PI / 2,
    'sector.world-004-east-south',
  ],
  [
    'world-004-east-warehouse',
    'boardwalk-kiosk',
    [57.5, 0.2, 40],
    Math.PI / 2,
    'sector.world-004-east-north',
  ],
  [
    'world-004-north-foundry',
    'ticket-arcade',
    [-28, 0.2, 39.5],
    Math.PI,
    'sector.world-004-north-west',
  ],
  [
    'world-004-north-boarding',
    'boardwalk-kiosk',
    [15, 0.2, 40],
    Math.PI,
    'sector.world-004-north-east',
  ],
  [
    'world-004-north-chemist',
    'boardwalk-kiosk',
    [43, 0.2, 40],
    Math.PI,
    'sector.world-004-north-east',
  ],
  [
    'world-004-south-printworks',
    'ticket-arcade',
    [-28, 0.2, -39.5],
    0,
    'sector.world-004-south-west',
  ],
  [
    'world-004-south-municipal',
    'boardwalk-kiosk',
    [15, 0.2, -40],
    0,
    'sector.world-004-south-east',
  ],
  [
    'world-004-south-freight',
    'ticket-arcade',
    [43, 0.2, -39.5],
    0,
    'sector.world-004-south-east',
  ],
] as const;

export const world004BuildingPlacements: readonly JunctionOwnedBuildingPlacement[] =
  world004BuildingCatalog.map(([id, variantId, position, yaw, sectorId]) => ({
    ...createAshfallBuildingPlacement(id, variantId, position, yaw),
    sectorId,
    purpose: 'world-growth',
  }));

export const world004Roads = [
  ownedSurface(
    'road-world-004-west',
    [-42.21875, -0.2, 0],
    [10.9375, 0.4, 12],
    'sector.world-004-west-north',
    ['walkable', 'road', world004JunctionPlan.id],
  ),
  ownedSurface(
    'road-world-004-east',
    [56.21875, -0.2, 8],
    [10.9375, 0.4, 12],
    'sector.world-004-east-north',
    ['walkable', 'road', world004JunctionPlan.id],
  ),
  ownedSurface(
    'road-world-004-north',
    [0, -0.2, 39.375],
    [12, 0.4, 8.75],
    'sector.world-004-north-west',
    ['walkable', 'road', world004JunctionPlan.id],
  ),
  ownedSurface(
    'road-world-004-south',
    [0, -0.2, -39.375],
    [12, 0.4, 8.75],
    'sector.world-004-south-west',
    ['walkable', 'road', world004JunctionPlan.id],
  ),
] as const;

export const world004Sidewalks = [
  ownedSurface(
    'sidewalk-world-004-west-north',
    [-42.21875, 0.1, 24.875],
    [10.9375, 0.2, 37.75],
    'sector.world-004-west-north',
  ),
  ownedSurface(
    'sidewalk-world-004-west-south',
    [-42.21875, 0.1, -24.875],
    [10.9375, 0.2, 37.75],
    'sector.world-004-west-south',
  ),
  ownedSurface(
    'sidewalk-world-004-east-north',
    [56.21875, 0.1, 28.875],
    [10.9375, 0.2, 29.75],
    'sector.world-004-east-north',
  ),
  ownedSurface(
    'sidewalk-world-004-east-south',
    [56.21875, 0.1, -20.875],
    [10.9375, 0.2, 45.75],
    'sector.world-004-east-south',
  ),
  ownedSurface(
    'sidewalk-world-004-north-west',
    [-21.375, 0.1, 39.75],
    [30.75, 0.2, 10.1],
    'sector.world-004-north-west',
  ),
  ownedSurface(
    'sidewalk-world-004-north-east',
    [28.375, 0.1, 39.375],
    [44.75, 0.2, 8.75],
    'sector.world-004-north-east',
  ),
  ownedSurface(
    'sidewalk-world-004-south-west',
    [-21.375, 0.1, -39.375],
    [30.75, 0.2, 8.75],
    'sector.world-004-south-west',
  ),
  ownedSurface(
    'sidewalk-world-004-south-east',
    [28.375, 0.1, -39.375],
    [44.75, 0.2, 8.75],
    'sector.world-004-south-east',
  ),
] as const;

export const world004ClinicFoyer = ownedSurface(
  'sidewalk-world-004-clinic-foyer',
  [28, 0.22, -37],
  [6, 0.24, 4],
  'sector.world-004-south-east',
  ['walkable', 'safe-spawn', 'clinic', world004JunctionPlan.id],
  'environment.ashfall-building.ceramic-tile',
  3,
);

const world003BuildingCatalog = [
  {
    id: 'contact-yard-office',
    variantId: 'boardwalk-kiosk',
    position: [30, 0.2, 32] as Vector3Tuple,
    yaw: Math.PI,
    sectorId: 'sector.north-rim-east',
    purpose: 'contact-yard',
  },
  {
    id: 'south-rim-canal-office',
    variantId: 'canal-workshop',
    position: [-15, 0.2, -31.5] as Vector3Tuple,
    yaw: 0,
    sectorId: 'sector.south-rim-west',
    purpose: 'street-frontage',
  },
  {
    id: 'south-rim-ticket-arcade',
    variantId: 'ticket-arcade',
    position: [31, 0.2, -31] as Vector3Tuple,
    yaw: 0,
    sectorId: 'sector.south-rim-east',
    purpose: 'street-frontage',
  },
] as const;

export const world003BuildingPlacements: readonly JunctionOwnedBuildingPlacement[] =
  world003BuildingCatalog.map((entry) => ({
    ...createAshfallBuildingPlacement(
      entry.id,
      entry.variantId,
      entry.position,
      entry.yaw,
    ),
    sectorId: entry.sectorId,
    purpose: entry.purpose,
  }));

export const world003StreetEdgeVisuals: readonly JunctionOwnedVisual[] = [
  ownedBox(
    'v.curb-west-rim-north',
    [-32.375, 0.11, 6.125],
    [8.75, 0.22, 0.25],
    0xb9b4a7,
    'sector.west-rim-north',
  ),
  ownedBox(
    'v.curb-west-rim-south',
    [-32.375, 0.11, -6.125],
    [8.75, 0.22, 0.25],
    0xb9b4a7,
    'sector.west-rim-south',
  ),
  ownedBox(
    'v.curb-north-rim-west',
    [-6.125, 0.11, 31.5],
    [0.25, 0.22, 7],
    0xb9b4a7,
    'sector.north-rim-west',
  ),
  ownedBox(
    'v.curb-north-rim-east',
    [6.125, 0.11, 31.5],
    [0.25, 0.22, 7],
    0xb9b4a7,
    'sector.north-rim-east',
  ),
  ownedBox(
    'v.curb-south-rim-west',
    [-6.125, 0.11, -31.5],
    [0.25, 0.22, 7],
    0xb9b4a7,
    'sector.south-rim-west',
  ),
  ownedBox(
    'v.curb-south-rim-east',
    [6.125, 0.11, -31.5],
    [0.25, 0.22, 7],
    0xb9b4a7,
    'sector.south-rim-east',
  ),
  ownedBox(
    'v.marking-west-rim',
    [-32.375, 0.015, 0],
    [4, 0.03, 0.18],
    0xe7d9a1,
    'sector.west-rim-north',
  ),
  ownedBox(
    'v.marking-north-rim',
    [0, 0.015, 31.5],
    [0.18, 0.03, 4],
    0xe7d9a1,
    'sector.north-rim-west',
  ),
  ownedBox(
    'v.marking-south-rim',
    [0, 0.015, -31.5],
    [0.18, 0.03, 4],
    0xe7d9a1,
    'sector.south-rim-west',
  ),
];

/** Raised, textured arrival apron closes the inherited floor drop at the yard. */
export const world003ContactYardApron = surfacePair(
  'sidewalk-contact-yard-apron',
  [30, 0.1, 26],
  [10, 0.2, 4],
  0x858783,
  ['walkable', 'sidewalk', world003JunctionPlan.id],
  'environment.ashfall-building.sidewalk-concrete',
  6,
);

/**
 * Raised overlap under the curve closes the inherited height/edge wedge where
 * the low East Quay apron meets the final east-rim sidewalk.
 */
export const world003EastQuayRimSeam = surfacePair(
  'sidewalk-east-quay-rim-seam',
  [41.75, 0.1, 14],
  [3.5, 0.2, 16],
  0x858783,
  ['walkable', 'sidewalk', world003JunctionPlan.id],
  'environment.ashfall-building.sidewalk-concrete',
  6,
);

/**
 * Continuous concrete ground beneath the curve's final approach. It remains
 * below the spline road, while extending the inherited quay apron to the rim so
 * the road, sidewalk, and building corridor no longer terminate over sky.
 */
export const world003EastQuayGroundFill = surfacePair(
  'east-quay-rim-ground-fill',
  [39.375, -0.225, 7],
  [23, 0.35, 14],
  0x858783,
  ['walkable', world003JunctionPlan.id],
  'environment.ashfall-building.sidewalk-concrete',
  6,
);

export const world002BRimSpawns = [
  {
    id: 'spawn.rim-west',
    position: [-33, 0.02, 0] as Vector3Tuple,
    yaw: Math.PI / 2,
  },
  {
    id: 'spawn.rim-east',
    position: [46, 0.22, 10] as Vector3Tuple,
    yaw: -Math.PI / 2,
  },
  {
    id: 'spawn.rim-south',
    position: [30, 0.22, -30] as Vector3Tuple,
    yaw: 0,
  },
] as const;

export const world002AWestRoad = surfacePair(
  'road-west-rim',
  [(-36.75 + -28) / 2, -0.2, 0],
  [8.75, 0.4, 12],
  0x24282b,
  ['walkable', 'road', world002APlan.id],
);

export const world002ASidewalks = [
  rimSidewalk('west-rim-north', -32.375, 17),
  rimSidewalk('west-rim-south', -32.375, -17),
  rimSidewalk('east-rim-north', 46.375, 17),
  rimSidewalk('east-rim-south', 46.375, -17),
] as const;

export const world002ABuildingPlacements = [
  createAshfallBuildingPlacement(
    'west-rim-south-works',
    'foundry-long',
    [-32.75, 0.2, -19],
    Math.PI / 2,
  ),
  createAshfallBuildingPlacement(
    'west-rim-corner-kiosk',
    'boardwalk-kiosk',
    [-33.75, 0.2, 13],
    Math.PI / 2,
  ),
  createAshfallBuildingPlacement(
    'west-rim-north-workshop',
    'canal-workshop',
    [-33.25, 0.2, 22],
    Math.PI / 2,
  ),
  createAshfallBuildingPlacement(
    'east-rim-south-kiosk',
    'boardwalk-kiosk',
    [47.75, 0.2, -23],
    -Math.PI / 2,
  ),
  createAshfallBuildingPlacement(
    'east-rim-south-workshop',
    'boardwalk-kiosk',
    [47.75, 0.2, -15],
    -Math.PI / 2,
  ),
  createAshfallBuildingPlacement(
    'east-rim-north-workshop',
    'boardwalk-kiosk',
    [47.75, 0.2, 23],
    -Math.PI / 2,
  ),
] as const;

export const world002BRoads = [
  surfacePair('road-north-rim', [0, -0.2, 31.5], [12, 0.4, 7], 0x24282b, [
    'walkable',
    'road',
    world002BPlan.id,
  ]),
  surfacePair('road-south-rim', [0, -0.2, -31.5], [12, 0.4, 7], 0x24282b, [
    'walkable',
    'road',
    world002BPlan.id,
  ]),
] as const;

export const world002BSidewalks = [
  cardinalSidewalk('north-rim-west', -21.375, 31.85, 30.75, 7.7),
  cardinalSidewalk('north-rim-east', 28.375, 31.5, 44.75),
  cardinalSidewalk('south-rim-west', -21.375, -31.5, 30.75),
  cardinalSidewalk('south-rim-east', 28.375, -31.5, 44.75),
] as const;

export const world002BBuildingPlacements = [
  createAshfallBuildingPlacement(
    'north-rim-west-workshop',
    'boardwalk-kiosk',
    [-33.75, 0.2, 32],
    Math.PI,
  ),
  createAshfallBuildingPlacement(
    'north-rim-arcade-kiosk',
    'boardwalk-kiosk',
    [14, 0.2, 32],
    Math.PI,
  ),
  createAshfallBuildingPlacement(
    'north-rim-east-workshop',
    'canal-workshop',
    [45.5, 0.2, 31.5],
    Math.PI,
  ),
  createAshfallBuildingPlacement(
    'south-rim-west-workshop',
    'canal-workshop',
    [-30, 0.2, -31.5],
  ),
  createAshfallBuildingPlacement(
    'south-rim-court-kiosk',
    'boardwalk-kiosk',
    [14, 0.2, -32],
  ),
  createAshfallBuildingPlacement(
    'south-rim-east-workshop',
    'canal-workshop',
    [45.5, 0.2, -31.5],
  ),
] as const;

export function createAshfallBuildingPlacement(
  id: string,
  variantId: string,
  position: Vector3Tuple,
  yaw = 0,
  colliderId = `c.building-${id}`,
): AshfallBuildingPlacement {
  const definition = getAshfallBuildingVariant(variantId);
  const [width, depth] = definition.footprint;
  const quarterTurn = Math.abs(Math.sin(yaw)) > 0.5;
  return {
    visual: {
      id: `v.building-${id}`,
      kind: 'building',
      variantId,
      position,
      rotation: [0, yaw, 0],
    },
    collider: {
      id: colliderId,
      position: [position[0], position[1] + definition.height / 2, position[2]],
      size: [
        quarterTurn ? depth : width,
        definition.height,
        quarterTurn ? width : depth,
      ],
      tags: ['obstacle', 'camera', 'building'],
    },
  };
}

export function surfacePair(
  id: string,
  position: Vector3Tuple,
  size: Vector3Tuple,
  color: number,
  tags: readonly string[],
  textureAssetId?: string,
  uvMetersPerRepeat?: number,
): JunctionSurfacePair {
  return {
    visual: {
      id: `v.${id}`,
      kind: 'box',
      position,
      size,
      color,
      textureAssetId,
      uvMetersPerRepeat,
    },
    collider: { id: `c.${id}`, position, size, tags },
  };
}

function rimSidewalk(id: string, x: number, z: number): JunctionSurfacePair {
  return surfacePair(
    `sidewalk-${id}`,
    [x, 0.1, z],
    [8.75, 0.2, 22],
    0x858783,
    ['walkable', 'sidewalk', world002APlan.id],
    'environment.ashfall-building.sidewalk-concrete',
    6,
  );
}

function cardinalSidewalk(
  id: string,
  x: number,
  z: number,
  width: number,
  depth = 7,
): JunctionSurfacePair {
  return surfacePair(
    `sidewalk-${id}`,
    [x, 0.1, z],
    [width, 0.2, depth],
    0x858783,
    ['walkable', 'sidewalk', world002BPlan.id],
    'environment.ashfall-building.sidewalk-concrete',
    6,
  );
}

function ownedBox(
  id: string,
  position: Vector3Tuple,
  size: Vector3Tuple,
  color: number,
  sectorId: string,
): JunctionOwnedVisual {
  return {
    visual: {
      id,
      kind: 'box',
      position,
      size,
      color,
      textureAssetId: 'environment.ashfall-building.curb-aggregate',
      uvMetersPerRepeat: 3,
    },
    sectorId,
  };
}

function ownedSurface(
  id: string,
  position: Vector3Tuple,
  size: Vector3Tuple,
  sectorId: string,
  tags: readonly string[] = ['walkable', 'sidewalk', world004JunctionPlan.id],
  textureAssetId = 'environment.ashfall-building.sidewalk-concrete',
  uvMetersPerRepeat = 6,
): JunctionSurfacePair & { readonly sectorId: string } {
  return {
    ...surfacePair(
      id,
      position,
      size,
      id.includes('road-') ? 0x24282b : 0x858783,
      tags,
      textureAssetId,
      uvMetersPerRepeat,
    ),
    sectorId,
  };
}
