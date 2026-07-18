import type {
  SplineRoadVisualDefinition,
  Vector3Tuple,
} from '../LevelDefinition';

/** Shared construction dimensions used by the level, maps, and consistency tests. */
export const intersectionLayout = {
  origin: [0, 0, 0] as Vector3Tuple,
  footprint: 56,
  roadWidth: 12,
  laneWidth: 3,
  sidewalkWidth: 4,
  curbHeight: 0.2,
  outerEdge: 28,
  expandedEastEdge: 42,
  crosswalkSize: 8,
  defaultSpawn: [0, 0.02, 19] as Vector3Tuple,
  trafficLight: [8.2, 0.2, 8.2] as Vector3Tuple,
  signalController: [10.2, 0.65, 8.5] as Vector3Tuple,
} as const;

/** WORLD-001 machine-readable growth and construction record. */
export const ashfallExpansionPlan = {
  id: 'world-001-east-canal-curve',
  baselineAreaSquareMetres: 3136,
  bounds: { minX: -28, maxX: 42, minZ: -28, maxZ: 28 },
  playableAreaSquareMetres: 3920,
  growthSquareMetres: 784,
  growthPercent: 25,
  minimumPedestrianClearanceMetres: 4,
  addedBuildingIds: [
    'v.building-east-quay-north',
    'v.building-east-quay-south',
  ],
  addedSectorId: 'sector.east-quay',
  roadVisualId: 'v.road-east-quay-curve',
} as const;

/** One authored spline owns WORLD-001 road rendering, collision, lanes, and map. */
export const eastQuayCurvedRoad = {
  id: ashfallExpansionPlan.roadVisualId,
  kind: 'spline-road',
  position: [0, 0, 0],
  controlPoints: [
    [24, 0.025, 0],
    [30, 0.025, 0],
    [36, 0.025, 8],
    [42, 0.025, 8],
  ],
  width: intersectionLayout.roadWidth,
  thickness: 0.4,
  color: 0x24282b,
  segments: 8,
} as const satisfies SplineRoadVisualDefinition;

/**
 * Development-only combat pad on the open northeast sidewalk apron.
 *
 * The pad stays south of the northeast ruin, east of the signal fixture, and
 * north of the east-road barrier. The player approaches from the south so the
 * combat camera remains clear of both the ruin and the signal controller.
 */
export const sparringTargetArea = {
  target: [16, 0.2, 9.5] as Vector3Tuple,
  targetYaw: Math.PI,
  player: [16, 0.22, 8.6] as Vector3Tuple,
  playerYaw: 0,
  supportColliderId: 'c.sidewalk-northeast',
} as const;

export const intersectionApproachSpawns = [
  {
    id: 'spawn.approach-north',
    position: [0, 0.02, 21] as Vector3Tuple,
    yaw: Math.PI,
  },
  {
    id: 'spawn.approach-east',
    position: [21, 0.02, 0] as Vector3Tuple,
    yaw: -Math.PI / 2,
  },
  {
    id: 'spawn.approach-south',
    position: [0, 0.02, -21] as Vector3Tuple,
    yaw: 0,
  },
  {
    id: 'spawn.approach-west',
    position: [-21, 0.02, 0] as Vector3Tuple,
    yaw: Math.PI / 2,
  },
] as const;

export const intersectionCornerSpawns = [
  {
    id: 'spawn.corner-northwest',
    position: [-9, 0.22, 9] as Vector3Tuple,
    yaw: -Math.PI / 4,
  },
  {
    id: 'spawn.corner-northeast',
    position: [9, 0.22, 9] as Vector3Tuple,
    yaw: Math.PI / 4,
  },
  {
    id: 'spawn.corner-southwest',
    position: [-9, 0.22, -9] as Vector3Tuple,
    yaw: -Math.PI * 0.75,
  },
  {
    id: 'spawn.corner-southeast',
    position: [9, 0.22, -9] as Vector3Tuple,
    yaw: Math.PI * 0.75,
  },
] as const;

export const fixtureSpawns = [
  {
    id: 'spawn.npc-mechanic',
    position: [-9, 0.22, 10] as Vector3Tuple,
    yaw: Math.PI * 0.75,
  },
  {
    id: 'spawn.npc-alley',
    position: [-9, 0.22, -10] as Vector3Tuple,
    yaw: Math.PI,
  },
  {
    id: 'spawn.npc-deck',
    position: [9, 0.22, -10] as Vector3Tuple,
    yaw: -Math.PI / 2,
  },
  {
    id: 'spawn.debug-sparring-target',
    position: sparringTargetArea.target,
    yaw: sparringTargetArea.targetYaw,
  },
] as const;

export const fixturePlayerSpawns = [
  {
    id: 'spawn.player-talk-mack',
    position: [-9, 0.22, 11.45] as Vector3Tuple,
    yaw: Math.PI,
  },
  {
    id: 'spawn.player-talk-nox',
    position: [-9, 0.22, -8.55] as Vector3Tuple,
    yaw: Math.PI,
  },
  {
    id: 'spawn.player-talk-raze',
    position: [9, 0.22, -8.55] as Vector3Tuple,
    yaw: Math.PI,
  },
  {
    id: 'spawn.player-sparring',
    position: sparringTargetArea.player,
    yaw: sparringTargetArea.playerYaw,
  },
  {
    id: 'spawn.debug-interactions',
    position: [0, 0.02, -10.8] as Vector3Tuple,
    yaw: 0,
  },
] as const;

export const intersectionLandmarks = [
  {
    id: 'landmark.signal-corner',
    name: 'Signal Corner',
    position: [8.2, 0.2, 8.2] as Vector3Tuple,
  },
  {
    id: 'landmark.north-approach',
    name: 'North Approach',
    position: [0, 0, 21] as Vector3Tuple,
  },
  {
    id: 'landmark.east-approach',
    name: 'East Approach',
    position: [21, 0, 0] as Vector3Tuple,
  },
  {
    id: 'landmark.south-approach',
    name: 'South Approach',
    position: [0, 0, -21] as Vector3Tuple,
  },
  {
    id: 'landmark.west-approach',
    name: 'West Approach',
    position: [-21, 0, 0] as Vector3Tuple,
  },
] as const;

export const intersectionAssetIds = {
  crosswalk: 'environment.intersection.crosswalk',
  trafficLight: 'environment.intersection.traffic-light',
  streetLight: 'environment.intersection.street-light',
  hydrant: 'environment.intersection.fire-hydrant',
  barrier: 'environment.intersection.plastic-barrier',
  pallet: 'environment.intersection.broken-pallet',
  trashBags: 'environment.intersection.trash-bags',
} as const;
