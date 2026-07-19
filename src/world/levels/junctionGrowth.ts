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
  position: [30, 0.22, 31] as Vector3Tuple,
  cameraPosition: [35, 7.5, 25.5] as Vector3Tuple,
  cameraLookAt: [30, 1.2, 31] as Vector3Tuple,
} as const;

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
    'canal-workshop',
    [47.25, 0.2, -15],
    -Math.PI / 2,
  ),
  createAshfallBuildingPlacement(
    'east-rim-north-workshop',
    'canal-workshop',
    [47.25, 0.2, 23],
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
  cardinalSidewalk('north-rim-west', -21.375, 31.5, 30.75),
  cardinalSidewalk('north-rim-east', 28.375, 31.5, 44.75),
  cardinalSidewalk('south-rim-west', -21.375, -31.5, 30.75),
  cardinalSidewalk('south-rim-east', 28.375, -31.5, 44.75),
] as const;

export const world002BBuildingPlacements = [
  createAshfallBuildingPlacement(
    'north-rim-west-workshop',
    'canal-workshop',
    [-30, 0.2, 31.5],
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
): JunctionSurfacePair {
  return surfacePair(
    `sidewalk-${id}`,
    [x, 0.1, z],
    [width, 0.2, 7],
    0x858783,
    ['walkable', 'sidewalk', world002BPlan.id],
    'environment.ashfall-building.sidewalk-concrete',
    6,
  );
}
