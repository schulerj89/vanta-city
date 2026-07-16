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
} as const;

const rampAngle = Math.atan2(2.8, 9);
const rampLength = Math.hypot(2.8, 9);
const rampThickness = 0.35;
const rampCenterY = 1.4 - (rampThickness / 2) * Math.cos(rampAngle);
const rampCenterZ = 1.5 - (rampThickness / 2) * Math.sin(rampAngle);
const servicePassageYaw = Math.PI / 4;

const stairs = Array.from({ length: 8 }, (_, index) => {
  const height = (index + 1) * 0.35;
  const position: Vector3Tuple = [9.5, height / 2, 1.2 - index * 0.6];
  const size: Vector3Tuple = [3, height, 0.65];
  return {
    visual: box(`v.stair-${index + 1}`, position, size, colors.concrete),
    collider: collider(`c.stair-${index + 1}`, position, size, ['walkable']),
  };
});

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
        position: [-13, 0.15, 4],
        rotation: [0, Math.PI, 0],
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
        position: [0, 0.15, -12],
        rotation: [0, 0, 0],
        tags: ['debug', 'interaction'],
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
