import type {
  BoxVisualDefinition,
  LevelModule,
  Vector3Tuple,
} from '../LevelDefinition';
import type { StaticColliderDefinition } from '../../physics/StaticCollider';

const colors = {
  asphalt: 0x252b31,
  concrete: 0x8b9090,
  curb: 0xb7b3a7,
  garage: 0x587080,
  garageTrim: 0xd6a95c,
  brick: 0x8b493d,
  metal: 0x3d5d58,
  obstacle: 0xd56b42,
  marking: 0xe9d36f,
  plaza: 0x78958d,
  yard: 0x48545a,
  overlook: 0x71828d,
  boundary: 0x4b646b,
  greenery: 0x52785a,
} as const;

const rampAngle = Math.atan2(2.8, 9);
const rampLength = Math.hypot(2.8, 9);
const rampThickness = 0.35;
const rampCenterY = 1.4 - (rampThickness / 2) * Math.cos(rampAngle);
const rampCenterZ = 1.5 - (rampThickness / 2) * Math.sin(rampAngle);
const servicePassageYaw = Math.PI / 4;

const overlookRampAngle = Math.atan2(3, 9);
const overlookRampLength = Math.hypot(3, 9);
const overlookRampCenterY =
  1.5 - (rampThickness / 2) * Math.cos(overlookRampAngle);
const overlookRampCenterZ =
  -19.5 - (rampThickness / 2) * Math.sin(overlookRampAngle);

const stairs = Array.from({ length: 8 }, (_, index) => {
  const height = (index + 1) * 0.35;
  const position: Vector3Tuple = [9.5, height / 2, 1.2 - index * 0.6];
  const size: Vector3Tuple = [3, height, 0.65];
  return {
    visual: box(`v.stair-${index + 1}`, position, size, colors.concrete),
    collider: collider(`c.stair-${index + 1}`, position, size, ['walkable']),
  };
});

const districtExpansion = [
  // North and south street extensions keep the original block's readable lanes.
  pairedBox('street-north', [0, -0.25, 32], [10, 0.5, 20], colors.asphalt, [
    'walkable',
  ]),
  pairedBox('sidewalk-west-north', [-7, 0, 32], [4, 0.4, 20], colors.concrete, [
    'walkable',
  ]),
  pairedBox('sidewalk-east-north', [7, 0, 32], [4, 0.4, 20], colors.concrete, [
    'walkable',
  ]),
  pairedBox('lot-west-north', [-15, -0.15, 32], [12, 0.3, 20], colors.yard, [
    'walkable',
  ]),
  pairedBox('lot-east-north', [15, -0.15, 32], [12, 0.3, 20], colors.plaza, [
    'walkable',
  ]),
  pairedBox('street-south', [0, -0.25, -32], [10, 0.5, 20], colors.asphalt, [
    'walkable',
  ]),
  pairedBox(
    'sidewalk-west-south',
    [-7, 0, -32],
    [4, 0.4, 20],
    colors.concrete,
    ['walkable'],
  ),
  pairedBox('sidewalk-east-south', [7, 0, -32], [4, 0.4, 20], colors.concrete, [
    'walkable',
  ]),
  pairedBox('lot-west-south', [-15, -0.15, -32], [12, 0.3, 20], colors.yard, [
    'walkable',
  ]),
  pairedBox('lot-east-south', [15, -0.15, -32], [12, 0.3, 20], colors.yard, [
    'walkable',
  ]),

  // East exchange: a compact plaza linked to the existing lot.
  pairedBox('east-plaza-link', [27.5, -0.15, 4], [13, 0.3, 10], colors.plaza, [
    'walkable',
  ]),
  pairedBox('east-plaza', [38, -0.15, 4], [8, 0.3, 18], colors.plaza, [
    'walkable',
  ]),
  pairedBox(
    'east-planter-a',
    [37.5, 0.45, 10.5],
    [4, 0.9, 1.2],
    colors.greenery,
    ['obstacle'],
  ),
  pairedBox(
    'east-planter-b',
    [37.5, 0.45, -2.5],
    [4, 0.9, 1.2],
    colors.greenery,
    ['obstacle'],
  ),
  pairedBox('east-plaza-pillar', [40.2, 1.5, 4], [1, 3, 1], colors.garageTrim, [
    'obstacle',
  ]),

  // West service yard branches from the south lot and creates a tight route.
  pairedBox('west-yard-link', [-27.5, -0.15, -30], [13, 0.3, 10], colors.yard, [
    'walkable',
  ]),
  pairedBox('west-yard', [-38, -0.15, -30], [8, 0.3, 18], colors.yard, [
    'walkable',
  ]),
  pairedBox(
    'west-container-a',
    [-39.5, 1.2, -34],
    [3.5, 2.4, 5],
    colors.obstacle,
    ['obstacle'],
  ),
  pairedBox(
    'west-container-b',
    [-36, 0.8, -25.5],
    [2.5, 1.6, 2.5],
    colors.metal,
    ['obstacle'],
  ),

  // An eastern promenade and ramp lead to a 3m raised overlook.
  pairedBox('overlook-approach', [38, -0.15, -10], [8, 0.3, 10], colors.yard, [
    'walkable',
  ]),
  pairedBox(
    'overlook-ramp',
    [38, overlookRampCenterY, overlookRampCenterZ],
    [4, rampThickness, overlookRampLength],
    colors.overlook,
    ['walkable', 'ramp'],
    [overlookRampAngle, 0, 0],
  ),
  pairedBox('overlook-deck', [38, 1.5, -32], [8, 3, 16], colors.overlook, [
    'walkable',
  ]),
  pairedBox(
    'overlook-bench',
    [40.5, 3.45, -34],
    [1, 0.9, 4],
    colors.garageTrim,
    ['obstacle'],
  ),

  // Visible guard walls make every authored outer edge legible and solid.
  pairedBox('boundary-north', [0, 0.7, 42], [42.5, 1.4, 0.5], colors.boundary, [
    'boundary',
  ]),
  pairedBox(
    'boundary-south',
    [0, 0.7, -42],
    [42.5, 1.4, 0.5],
    colors.boundary,
    ['boundary'],
  ),
  pairedBox(
    'boundary-north-west',
    [-21, 0.7, 32],
    [0.5, 1.4, 20],
    colors.boundary,
    ['boundary'],
  ),
  pairedBox(
    'boundary-north-east',
    [21, 0.7, 32],
    [0.5, 1.4, 20],
    colors.boundary,
    ['boundary'],
  ),
  pairedBox(
    'boundary-south-east',
    [21, 0.7, -35.5],
    [0.5, 1.4, 13],
    colors.boundary,
    ['boundary'],
  ),
  pairedBox(
    'boundary-east-plaza',
    [42, 0.7, 4],
    [0.5, 1.4, 18.5],
    colors.boundary,
    ['boundary'],
  ),
  pairedBox(
    'boundary-east-plaza-north',
    [37.5, 0.7, 13],
    [9.5, 1.4, 0.5],
    colors.boundary,
    ['boundary'],
  ),
  pairedBox(
    'boundary-west-yard',
    [-42, 0.7, -30],
    [0.5, 1.4, 18.5],
    colors.boundary,
    ['boundary'],
  ),
  pairedBox(
    'boundary-west-yard-north',
    [-37.5, 0.7, -21],
    [9.5, 1.4, 0.5],
    colors.boundary,
    ['boundary'],
  ),
  pairedBox(
    'boundary-west-yard-south',
    [-37.5, 0.7, -39],
    [9.5, 1.4, 0.5],
    colors.boundary,
    ['boundary'],
  ),
  pairedBox(
    'boundary-overlook-east',
    [42, 3.7, -32],
    [0.5, 1.4, 16],
    colors.boundary,
    ['boundary'],
  ),
  pairedBox(
    'boundary-overlook-south',
    [38, 3.7, -40],
    [8, 1.4, 0.5],
    colors.boundary,
    ['boundary'],
  ),
  pairedBox(
    'boundary-overlook-west',
    [34, 3.7, -32],
    [0.5, 1.4, 16],
    colors.boundary,
    ['boundary'],
  ),
  // Segment inner edge rails around the three intentional route openings.
  pairedBox(
    'boundary-core-east-north',
    [21, 0.7, 15.5],
    [0.5, 1.4, 13],
    colors.boundary,
    ['boundary'],
  ),
  pairedBox(
    'boundary-core-east-south',
    [21, 0.7, -11.5],
    [0.5, 1.4, 21],
    colors.boundary,
    ['boundary'],
  ),
  pairedBox(
    'boundary-core-east-far-south',
    [21, 0.7, -25.5],
    [0.5, 1.4, 7],
    colors.boundary,
    ['boundary'],
  ),
  pairedBox(
    'boundary-core-west-gap',
    [-21, 0.7, -20],
    [0.5, 1.4, 4],
    colors.boundary,
    ['boundary'],
  ),
  pairedBox(
    'boundary-core-west-south',
    [-21, 0.7, -23.5],
    [0.5, 1.4, 3],
    colors.boundary,
    ['boundary'],
  ),
  pairedBox(
    'boundary-core-west-far-south',
    [-21, 0.7, -38.5],
    [0.5, 1.4, 7],
    colors.boundary,
    ['boundary'],
  ),
  pairedBox(
    'boundary-east-link-north',
    [27.5, 0.7, 9],
    [13, 1.4, 0.5],
    colors.boundary,
    ['boundary'],
  ),
  pairedBox(
    'boundary-east-link-south',
    [27.5, 0.7, -1],
    [13, 1.4, 0.5],
    colors.boundary,
    ['boundary'],
  ),
  pairedBox(
    'boundary-east-plaza-west-north',
    [34, 0.7, 11],
    [0.5, 1.4, 4],
    colors.boundary,
    ['boundary'],
  ),
  pairedBox(
    'boundary-east-plaza-west-south',
    [34, 0.7, -3],
    [0.5, 1.4, 4],
    colors.boundary,
    ['boundary'],
  ),
  pairedBox(
    'boundary-west-link-north',
    [-27.5, 0.7, -25],
    [13, 1.4, 0.5],
    colors.boundary,
    ['boundary'],
  ),
  pairedBox(
    'boundary-west-link-south',
    [-27.5, 0.7, -35],
    [13, 1.4, 0.5],
    colors.boundary,
    ['boundary'],
  ),
  pairedBox(
    'boundary-west-yard-east-north',
    [-34, 0.7, -23],
    [0.5, 1.4, 4],
    colors.boundary,
    ['boundary'],
  ),
  pairedBox(
    'boundary-west-yard-east-south',
    [-34, 0.7, -37],
    [0.5, 1.4, 4],
    colors.boundary,
    ['boundary'],
  ),
  pairedBox(
    'boundary-overlook-approach-west',
    [34, 0.7, -10],
    [0.5, 1.4, 10],
    colors.boundary,
    ['boundary'],
  ),
  pairedBox(
    'boundary-overlook-approach-east',
    [42, 0.7, -10],
    [0.5, 1.4, 10],
    colors.boundary,
    ['boundary'],
  ),
  pairedBox(
    'boundary-overlook-ramp-left',
    [35, 0.7, -15],
    [2, 1.4, 0.5],
    colors.boundary,
    ['boundary'],
  ),
  pairedBox(
    'boundary-overlook-ramp-right',
    [41, 0.7, -15],
    [2, 1.4, 0.5],
    colors.boundary,
    ['boundary'],
  ),
  pairedBox(
    'boundary-overlook-deck-left',
    [35, 3.7, -24],
    [2, 1.4, 0.5],
    colors.boundary,
    ['boundary'],
  ),
  pairedBox(
    'boundary-overlook-deck-right',
    [41, 3.7, -24],
    [2, 1.4, 0.5],
    colors.boundary,
    ['boundary'],
  ),
] as const;

const environment: readonly BoxVisualDefinition[] = [
  box('v.street', [0, -0.25, 0], [10, 0.5, 44], colors.asphalt),
  box('v.sidewalk-west', [-7, 0, 0], [4, 0.4, 44], colors.concrete),
  box('v.sidewalk-east', [7, 0, 0], [4, 0.4, 44], colors.concrete),
  box('v.curb-west', [-5.15, 0.1, 0], [0.3, 0.2, 44], colors.curb),
  box('v.curb-east', [5.15, 0.1, 0], [0.3, 0.2, 44], colors.curb),
  box('v.center-line', [0, 0.025, 0], [0.18, 0.04, 36], colors.marking),
  box('v.west-lot', [-15, -0.15, 0], [12, 0.3, 44], colors.asphalt),
  box('v.east-lot', [15, -0.15, 0], [12, 0.3, 44], colors.asphalt),

  // Garage shell: separate wall pieces leave the front bay visually legible.
  box('v.garage-back', [-13, 3, -13], [10, 6, 0.5], colors.garage),
  box('v.garage-left', [-17.75, 3, -6], [0.5, 6, 14], colors.garage),
  box('v.garage-right', [-8.25, 3, -6], [0.5, 6, 14], colors.garage),
  box('v.garage-front-left', [-16, 3, 1], [4, 6, 0.5], colors.garage),
  box('v.garage-front-right', [-10, 3, 1], [4, 6, 0.5], colors.garage),
  box('v.garage-header', [-13, 5.25, 1], [2, 1.5, 0.5], colors.garageTrim),
  box('v.garage-roof', [-13, 6.15, -6], [10.5, 0.3, 14.5], colors.garageTrim),
  box('v.garage-door', [-13, 2, 0.7], [5.2, 4, 0.15], colors.metal),

  // Narrow west alley and enclosing wall exercise camera obstruction.
  box('v.alley-wall', [-21, 2, 2], [0.5, 4, 40], colors.brick),
  box('v.alley-overhang', [-19.3, 3.4, 7], [3.2, 0.4, 5], colors.metal),

  // Raised east loading deck, with both a ramp and a stair route.
  box('v.loading-deck', [13.5, 1.4, -8], [9, 2.8, 10], colors.concrete),
  box('v.deck-wall', [18, 4.5, -8], [0.5, 6, 10], colors.brick),
  box(
    'v.deck-ramp',
    [13.5, rampCenterY, rampCenterZ],
    [4, rampThickness, rampLength],
    colors.concrete,
    [rampAngle, 0, 0],
  ),
  ...stairs.map(({ visual }) => visual),

  // Movement/camera obstacles at street and alley scale.
  box('v.dumpster', [-18.8, 0.75, -2], [2.5, 1.5, 1.3], colors.metal),
  box('v.crate-a', [7.2, 0.7, 8], [1.4, 1.4, 1.4], colors.obstacle),
  box('v.crate-b', [8.4, 0.45, 9.1], [0.9, 0.9, 0.9], colors.garageTrim),
  box('v.road-barrier', [-1.5, 0.65, 13], [4, 1.3, 0.45], colors.obstacle),
  box('v.bollard-a', [-5.8, 0.6, 5], [0.35, 1.2, 0.35], colors.garageTrim),
  box('v.bollard-b', [-7, 0.6, 5], [0.35, 1.2, 0.35], colors.garageTrim),
  box('v.bollard-c', [-8.2, 0.6, 5], [0.35, 1.2, 0.35], colors.garageTrim),

  // Art-ready collision fixtures: a rotated, capsule-tight service passage
  // and a doorway whose clear opening is 1.5m wide.
  box(
    'v.service-wall-north',
    [11.29, 1.4, 12.71],
    [0.3, 2.8, 8],
    colors.brick,
    [0, servicePassageYaw, 0],
  ),
  box(
    'v.service-wall-south',
    [12.71, 1.4, 11.29],
    [0.3, 2.8, 8],
    colors.brick,
    [0, servicePassageYaw, 0],
  ),
  box(
    'v.service-door-left',
    [8.46, 1.4, 11.29],
    [2.5, 2.8, 0.3],
    colors.metal,
    [0, servicePassageYaw, 0],
  ),
  box(
    'v.service-door-right',
    [11.29, 1.4, 8.46],
    [2.5, 2.8, 0.3],
    colors.metal,
    [0, servicePassageYaw, 0],
  ),
  ...districtExpansion.map(({ visual }) => visual),
];

const staticCollision: readonly StaticColliderDefinition[] = [
  collider('c.street', [0, -0.25, 0], [10, 0.5, 44], ['walkable']),
  collider('c.sidewalk-west', [-7, 0, 0], [4, 0.4, 44], ['walkable']),
  collider('c.sidewalk-east', [7, 0, 0], [4, 0.4, 44], ['walkable']),
  collider('c.west-lot', [-15, -0.15, 0], [12, 0.3, 44], ['walkable']),
  collider('c.east-lot', [15, -0.15, 0], [12, 0.3, 44], ['walkable']),
  collider('c.curb-west', [-5.15, 0.1, 0], [0.3, 0.2, 44], ['curb']),
  collider('c.curb-east', [5.15, 0.1, 0], [0.3, 0.2, 44], ['curb']),
  collider('c.garage-back', [-13, 3, -13], [10, 6, 0.5], ['building']),
  collider('c.garage-left', [-17.75, 3, -6], [0.5, 6, 14], ['building']),
  collider('c.garage-right', [-8.25, 3, -6], [0.5, 6, 14], ['building']),
  collider('c.garage-front-left', [-16, 3, 1], [4, 6, 0.5], ['building']),
  collider('c.garage-front-right', [-10, 3, 1], [4, 6, 0.5], ['building']),
  collider('c.garage-header', [-13, 5.25, 1], [2, 1.5, 0.5], ['building']),
  collider('c.garage-door', [-13, 2, 0.7], [5.2, 4, 0.15], ['building']),
  collider(
    'c.garage-roof',
    [-13, 6.15, -6],
    [10.5, 0.3, 14.5],
    ['walkable', 'roof'],
  ),
  collider('c.alley-wall', [-21, 2, 2], [0.5, 4, 40], ['wall']),
  collider('c.alley-overhang', [-19.3, 3.4, 7], [3.2, 0.4, 5], ['overhang']),
  collider('c.loading-deck', [13.5, 1.4, -8], [9, 2.8, 10], ['walkable']),
  collider('c.deck-wall', [18, 4.5, -8], [0.5, 6, 10], ['wall']),
  collider(
    'c.deck-ramp',
    [13.5, rampCenterY, rampCenterZ],
    [4, rampThickness, rampLength],
    ['walkable', 'ramp'],
    [rampAngle, 0, 0],
  ),
  ...stairs.map(({ collider: step }) => step),
  collider('c.dumpster', [-18.8, 0.75, -2], [2.5, 1.5, 1.3], ['obstacle']),
  collider('c.crate-a', [7.2, 0.7, 8], [1.4, 1.4, 1.4], ['obstacle']),
  collider('c.crate-b', [8.4, 0.45, 9.1], [0.9, 0.9, 0.9], ['obstacle']),
  collider('c.road-barrier', [-1.5, 0.65, 13], [4, 1.3, 0.45], ['obstacle']),
  collider('c.bollard-a', [-5.8, 0.6, 5], [0.35, 1.2, 0.35], ['obstacle']),
  collider('c.bollard-b', [-7, 0.6, 5], [0.35, 1.2, 0.35], ['obstacle']),
  collider('c.bollard-c', [-8.2, 0.6, 5], [0.35, 1.2, 0.35], ['obstacle']),
  collider(
    'c.service-wall-north',
    [11.29, 1.4, 12.71],
    [0.3, 2.8, 8],
    ['wall', 'debug-geometry'],
    [0, servicePassageYaw, 0],
  ),
  collider(
    'c.service-wall-south',
    [12.71, 1.4, 11.29],
    [0.3, 2.8, 8],
    ['wall', 'debug-geometry'],
    [0, servicePassageYaw, 0],
  ),
  collider(
    'c.service-door-left',
    [8.46, 1.4, 11.29],
    [2.5, 2.8, 0.3],
    ['doorway', 'debug-geometry'],
    [0, servicePassageYaw, 0],
  ),
  collider(
    'c.service-door-right',
    [11.29, 1.4, 8.46],
    [2.5, 2.8, 0.3],
    ['doorway', 'debug-geometry'],
    [0, servicePassageYaw, 0],
  ),
  collider('c.npc-mack', [-10, 1.1, 4], [0.75, 1.8, 0.75], ['npc-occupancy']),
  collider('c.npc-nox', [-19, 1.1, 12], [0.75, 1.8, 0.75], ['npc-occupancy']),
  collider('c.npc-raze', [14, 3.9, -8], [0.75, 1.8, 0.75], ['npc-occupancy']),
  ...districtExpansion.map(({ collider: definition }) => definition),
];

export const testDistrict = {
  assets: {},
  definition: {
    id: 'test-district',
    name: 'Foundry Test Block',
    environment,
    staticCollision,
    spawns: [
      {
        id: 'spawn.player-default',
        kind: 'player',
        default: true,
        position: [0, 0.15, 17],
        rotation: [0, Math.PI, 0],
        tags: ['street'],
      },
      {
        id: 'spawn.player-garage',
        kind: 'player',
        position: [-13, 0.15, 2.65],
        rotation: [0, Math.PI, 0],
      },
      {
        id: 'spawn.player-talk-mack',
        kind: 'player',
        position: [-10, 0.2, 5.45],
        rotation: [0, Math.PI, 0],
        tags: ['interaction', 'talk'],
      },
      {
        id: 'spawn.player-talk-nox',
        kind: 'player',
        position: [-19, 0.2, 13.45],
        rotation: [0, Math.PI, 0],
        tags: ['interaction', 'talk'],
      },
      {
        id: 'spawn.player-talk-raze',
        kind: 'player',
        position: [14, 3, -6.55],
        rotation: [0, Math.PI, 0],
        tags: ['interaction', 'talk'],
      },
      {
        id: 'spawn.grounding-curb-west',
        kind: 'player',
        position: [-5.15, 0.2, 8],
        rotation: [0, Math.PI / 2, 0],
        tags: ['grounding', 'curb'],
      },
      {
        id: 'spawn.grounding-ramp-low',
        kind: 'player',
        position: [13.5, 0.02, 5.9],
        rotation: [0, Math.PI, 0],
        tags: ['grounding', 'ramp', 'downhill'],
      },
      {
        id: 'spawn.grounding-ramp-high',
        kind: 'player',
        position: [13.5, 2.8, -3],
        rotation: [0, 0, 0],
        tags: ['grounding', 'ramp', 'uphill'],
      },
      {
        id: 'spawn.grounding-stairs-low',
        kind: 'player',
        position: [9.5, 0.35, 1.2],
        rotation: [0, Math.PI, 0],
        tags: ['grounding', 'stairs', 'uphill'],
      },
      {
        id: 'spawn.player-sparring',
        kind: 'player',
        position: [3.5, 0.15, 14],
        rotation: [0, Math.PI, 0],
        tags: ['debug', 'sparring'],
      },
      {
        id: 'spawn.geometry-service-entry',
        kind: 'player',
        position: [9.88, 0, 9.88],
        rotation: [0, Math.PI / 4, 0],
        tags: ['debug', 'collision', 'doorway', 'tight-alley'],
      },
      {
        id: 'spawn.geometry-service-exit',
        kind: 'player',
        position: [14.12, 0, 14.12],
        rotation: [0, (-3 * Math.PI) / 4, 0],
        tags: ['debug', 'collision', 'camera-recovery'],
      },
      {
        id: 'spawn.debug-interactions',
        kind: 'player',
        position: [0, 0.15, -10.8],
        rotation: [0, 0, 0],
        tags: ['debug', 'interaction'],
      },
      {
        id: 'spawn.outer-north-gate',
        kind: 'player',
        position: [0, 0.15, 38],
        rotation: [0, Math.PI, 0],
        tags: ['exploration', 'outer', 'north'],
      },
      {
        id: 'spawn.outer-south-gate',
        kind: 'player',
        position: [0, 0.15, -38],
        rotation: [0, 0, 0],
        tags: ['exploration', 'outer', 'south'],
      },
      {
        id: 'spawn.outer-east-plaza',
        kind: 'player',
        position: [38, 0.15, 4],
        rotation: [0, -Math.PI / 2, 0],
        tags: ['exploration', 'outer', 'plaza'],
      },
      {
        id: 'spawn.outer-west-yard',
        kind: 'player',
        position: [-38, 0.15, -30],
        rotation: [0, Math.PI / 2, 0],
        tags: ['exploration', 'outer', 'yard'],
      },
      {
        id: 'spawn.outer-overlook',
        kind: 'player',
        position: [37, 3, -32],
        rotation: [0, Math.PI, 0],
        tags: ['exploration', 'outer', 'elevated'],
      },
      { id: 'spawn.npc-mechanic', kind: 'npc', position: [-10, 0.2, 4] },
      { id: 'spawn.npc-alley', kind: 'npc', position: [-19, 0.2, 12] },
      { id: 'spawn.npc-deck', kind: 'npc', position: [14, 3, -8] },
      {
        id: 'spawn.debug-sparring-target',
        kind: 'npc',
        position: [3.5, 0, 11.8],
        rotation: [0, 0, 0],
        tags: ['debug', 'sparring'],
      },
    ],
    locations: [
      {
        id: 'interaction.garage-door',
        kind: 'interaction',
        position: [-13, 1, 1.7],
        tags: ['door', 'garage'],
      },
      {
        id: 'interaction.dumpster',
        kind: 'interaction',
        position: [-18.8, 1, -1],
        tags: ['container'],
      },
      {
        id: 'mission.street-arrival',
        kind: 'mission',
        position: [0, 0.2, 10],
        tags: ['arrival'],
      },
      {
        id: 'mission.loading-deck',
        kind: 'mission',
        position: [14, 3, -8],
        tags: ['elevated'],
      },
    ],
    zones: [
      {
        id: 'zone.foundry-core',
        name: 'Foundry Core',
        position: [0, 3, 0],
        size: [42, 14, 44],
      },
      {
        id: 'zone.garage-row',
        name: 'Garage Row',
        position: [-14, 3, -5],
        size: [15, 12, 17],
        priority: 5,
      },
      {
        id: 'zone.loading-deck',
        name: 'Loading Deck',
        position: [13.5, 3.5, -8],
        size: [10, 7, 11],
        priority: 5,
      },
      {
        id: 'zone.north-market',
        name: 'North Market',
        position: [0, 3, 32],
        size: [42, 12, 20],
      },
      {
        id: 'zone.south-gate',
        name: 'South Gate',
        position: [0, 3, -32],
        size: [42, 12, 20],
      },
      {
        id: 'zone.east-exchange',
        name: 'East Exchange',
        position: [32, 3, 4],
        size: [22, 12, 18],
      },
      {
        id: 'zone.west-service-yard',
        name: 'West Service Yard',
        position: [-32, 3, -30],
        size: [22, 12, 18],
      },
      {
        id: 'zone.overlook-route',
        name: 'Overlook Route',
        position: [38, 3, -17],
        size: [9, 12, 25],
      },
      {
        id: 'zone.raised-overlook',
        name: 'Raised Overlook',
        position: [38, 4, -32],
        size: [9, 8, 16],
        priority: 10,
      },
    ],
    landmarks: [
      {
        id: 'landmark.north-gate',
        name: 'North Gate',
        position: [0, 0, 38],
        radius: 4,
      },
      {
        id: 'landmark.south-gate',
        name: 'South Gate',
        position: [0, 0, -38],
        radius: 4,
      },
      {
        id: 'landmark.exchange-beacon',
        name: 'Exchange Beacon',
        position: [40.2, 0, 4],
        radius: 4.5,
      },
      {
        id: 'landmark.freight-stack',
        name: 'Freight Stack',
        position: [-39, 0, -34],
        radius: 4.5,
      },
      {
        id: 'landmark.skyline-bench',
        name: 'Skyline Bench',
        position: [38, 3, -34],
        radius: 4,
        heightTolerance: 3,
        priority: 5,
      },
    ],
    triggers: [
      {
        id: 'trigger.garage-approach',
        shape: 'box',
        position: [-13, 1.5, 4],
        size: [7, 3, 5],
        tags: ['interaction', 'garage'],
      },
      {
        id: 'trigger.alley-entry',
        shape: 'box',
        position: [-19.5, 1.5, 12],
        size: [3, 3, 4],
        tags: ['mission'],
      },
      {
        id: 'trigger.deck-zone',
        shape: 'box',
        position: [13.5, 4, -8],
        size: [8, 2, 8],
        tags: ['mission', 'elevated'],
      },
      {
        id: 'trigger.east-exchange',
        shape: 'box',
        position: [38, 2, 4],
        size: [8, 4, 18],
        tags: ['exploration', 'landmark'],
      },
      {
        id: 'trigger.west-service-yard',
        shape: 'box',
        position: [-38, 2, -30],
        size: [8, 4, 18],
        tags: ['exploration', 'landmark'],
      },
      {
        id: 'trigger.raised-overlook',
        shape: 'box',
        position: [38, 4, -32],
        size: [8, 2, 16],
        tags: ['exploration', 'elevated'],
      },
    ],
    cinematicAnchors: [
      {
        id: 'camera.garage-wide',
        position: [-2, 7, 10],
        lookAt: [-13, 2, -3],
        fieldOfView: 48,
      },
      {
        id: 'camera.alley-low',
        position: [-19, 2, 15],
        lookAt: [-19, 1.5, -5],
        fieldOfView: 55,
      },
      {
        id: 'camera.deck-reveal',
        position: [5, 7, 4],
        lookAt: [13.5, 2.5, -8],
        fieldOfView: 42,
      },
      {
        id: 'camera.district-overhead',
        position: [0, 105, 0],
        // Keep the directed cast clear of floor geometry while framing ±42m.
        lookAt: [0, 5, 0],
        fieldOfView: 55,
        tags: ['debug', 'map'],
      },
      {
        id: 'camera.overlook-wide',
        position: [27, 11, -20],
        lookAt: [38, 3, -32],
        fieldOfView: 48,
        tags: ['exploration'],
      },
    ],
  },
} as const satisfies LevelModule;

function box(
  id: string,
  position: Vector3Tuple,
  size: Vector3Tuple,
  color: number,
  rotation?: Vector3Tuple,
): BoxVisualDefinition {
  return { id, kind: 'box', position, size, color, rotation };
}

function collider(
  id: string,
  position: Vector3Tuple,
  size: Vector3Tuple,
  tags: readonly string[],
  rotation?: Vector3Tuple,
): StaticColliderDefinition {
  return { id, position, size, tags, rotation };
}

function pairedBox(
  id: string,
  position: Vector3Tuple,
  size: Vector3Tuple,
  color: number,
  tags: readonly string[],
  rotation?: Vector3Tuple,
): {
  readonly visual: BoxVisualDefinition;
  readonly collider: StaticColliderDefinition;
} {
  return {
    visual: box(`v.${id}`, position, size, color, rotation),
    collider: collider(`c.${id}`, position, size, tags, rotation),
  };
}
