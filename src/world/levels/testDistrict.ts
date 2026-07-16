import type {
  BoxVisualDefinition,
  LevelModule,
  StaticBoxColliderDefinition,
  Vector3Tuple,
} from '../LevelDefinition';

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

const stairs = Array.from({ length: 6 }, (_, index) => {
  const height = (index + 1) * 0.5;
  const position: Vector3Tuple = [9.5, height / 2, -8.5 - index * 0.8];
  const size: Vector3Tuple = [3, height, 0.85];
  return {
    visual: box(`v.stair-${index + 1}`, position, size, colors.concrete),
    collider: collider(`c.stair-${index + 1}`, position, size, ['walkable']),
  };
});

const environment: readonly BoxVisualDefinition[] = [
  box('v.street', [0, -0.25, 0], [10, 0.5, 44], colors.asphalt),
  box('v.sidewalk-west', [-7, 0, 0], [4, 0.4, 44], colors.concrete),
  box('v.sidewalk-east', [7, 0, 0], [4, 0.4, 44], colors.concrete),
  box('v.curb-west', [-5.15, 0.3, 0], [0.3, 0.6, 44], colors.curb),
  box('v.curb-east', [5.15, 0.3, 0], [0.3, 0.6, 44], colors.curb),
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
  box('v.deck-ramp', [13.5, 1.4, 1.5], [4, 0.35, rampLength], colors.concrete, [
    rampAngle,
    0,
    0,
  ]),
  ...stairs.map(({ visual }) => visual),

  // Movement/camera obstacles at street and alley scale.
  box('v.dumpster', [-18.8, 0.75, -2], [2.5, 1.5, 1.3], colors.metal),
  box('v.crate-a', [7.2, 0.7, 8], [1.4, 1.4, 1.4], colors.obstacle),
  box('v.crate-b', [8.4, 0.45, 9.1], [0.9, 0.9, 0.9], colors.garageTrim),
  box('v.road-barrier', [-1.5, 0.65, 13], [4, 1.3, 0.45], colors.obstacle),
  box('v.bollard-a', [-5.8, 0.6, 5], [0.35, 1.2, 0.35], colors.garageTrim),
  box('v.bollard-b', [-7, 0.6, 5], [0.35, 1.2, 0.35], colors.garageTrim),
  box('v.bollard-c', [-8.2, 0.6, 5], [0.35, 1.2, 0.35], colors.garageTrim),
];

const staticCollision: readonly StaticBoxColliderDefinition[] = [
  collider('c.street', [0, -0.25, 0], [10, 0.5, 44], ['walkable']),
  collider('c.sidewalk-west', [-7, 0, 0], [4, 0.4, 44], ['walkable']),
  collider('c.sidewalk-east', [7, 0, 0], [4, 0.4, 44], ['walkable']),
  collider('c.west-lot', [-15, -0.15, 0], [12, 0.3, 44], ['walkable']),
  collider('c.east-lot', [15, -0.15, 0], [12, 0.3, 44], ['walkable']),
  collider('c.curb-west', [-5.15, 0.3, 0], [0.3, 0.6, 44], ['curb']),
  collider('c.curb-east', [5.15, 0.3, 0], [0.3, 0.6, 44], ['curb']),
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
    [13.5, 1.4, 1.5],
    [4, 0.35, rampLength],
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
      { id: 'spawn.npc-mechanic', kind: 'npc', position: [-10, 0.2, 4] },
      { id: 'spawn.npc-alley', kind: 'npc', position: [-19, 0.2, 12] },
      { id: 'spawn.npc-deck', kind: 'npc', position: [14, 3, -8] },
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
): StaticBoxColliderDefinition {
  return { id, kind: 'box', position, size, tags, rotation };
}
