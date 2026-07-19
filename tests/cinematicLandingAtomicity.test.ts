import { Group, Scene, Texture } from 'three';
import type { GameAssetLoader } from '../src/assets/AssetLoader';
import { EventBus } from '../src/core/events';
import type { StateEvents } from '../src/core/gameState';
import { GameStateMachine } from '../src/core/gameState';
import type { DialogueEvents } from '../src/dialogue/DialogueEvents';
import type { HealthEvents } from '../src/health/Health';
import type { InteractionEvents } from '../src/interactions/Interactable';
import type { MissionDefinition } from '../src/missions/MissionDefinition';
import { MissionSystem } from '../src/missions/MissionSystem';
import type { LevelModule } from '../src/world/LevelDefinition';
import { LevelRegistry } from '../src/world/LevelRegistry';
import { LevelSystem } from '../src/world/LevelSystem';
import type { WorldEvents } from '../src/world/WorldEvents';

const assets: GameAssetLoader = {
  loadTexture: () => Promise.resolve(new Texture()),
  loadGltf: () =>
    Promise.resolve({ scene: new Group(), animations: [] } as never),
  instantiateModel: (assetId) =>
    Promise.resolve({
      assetId,
      scene: new Group(),
      animations: [],
      dispose: () => undefined,
    }),
  getStatus: (id) => ({ id, phase: 'idle', progress: 0 }),
  onStatus: () => () => undefined,
  dispose: () => undefined,
};

function level(
  id: string,
  position: readonly [number, number, number],
): LevelModule {
  return {
    assets: {},
    definition: {
      id,
      name: id,
      environment: [],
      staticCollision: [
        {
          id: `ground.${id}`,
          position: [position[0], -0.5, position[2]],
          size: [20, 1, 20],
          tags: ['walkable', 'ground'],
        },
      ],
      spawns: [
        {
          id: 'spawn.player-default',
          kind: 'player',
          default: true,
          position,
        },
      ],
      locations: [],
      zones: [],
      landmarks: [],
      triggers: [],
      cinematicAnchors: [],
      streaming: {
        sectors: [
          {
            id: `sector.${id}`,
            center: [position[0], position[2]],
            loadDistance: 2,
            unloadDistance: 3,
            alwaysLoaded: true,
            entryIds: [`ground.${id}`],
          },
        ],
      },
    },
  };
}

const landingMission: MissionDefinition = {
  id: 'landing-atomicity',
  title: 'Landing atomicity',
  narrativePurpose: 'Exercise rollback after a landing hook throws.',
  prerequisiteMissionIds: [],
  prerequisiteFacts: [],
  startCondition: { type: 'event-hook', hookId: 'landing-hook' },
  startLocationId: 'location.test',
  objectives: [
    {
      id: 'landing-objective',
      summary: 'Survive the landing hook.',
      condition: { type: 'event-hook', hookId: 'later-hook' },
    },
  ],
  reward: {
    id: 'reward.landing-atomicity',
    factChanges: {},
  },
  persistentFactIds: ['rook-arrived-in-ashfall'],
};

test('a throwing landing hook restores level, pose, facts, progress, and revision', async () => {
  const source = level('source-level', [0, 0, 0]);
  const destination = level('destination-level', [7, 0, 9]);
  const levels = new LevelSystem(
    new Scene(),
    assets,
    new LevelRegistry([source, destination]),
    source.definition.id,
    new EventBus<WorldEvents>(),
  );
  await levels.init();
  const state = new GameStateMachine(new EventBus<StateEvents>());
  state.transition('playing');
  let pose = { x: 0, y: 0, z: 0 };
  const missions = new MissionSystem(
    [landingMission],
    { 'rook-arrived-in-ashfall': false },
    {
      state,
      player: {
        getWorldPose: () => ({
          position: pose,
          forward: { x: 0, y: 0, z: 1 },
          radius: 0.38,
        }),
      },
      level: {
        get activeLevel() {
          return levels.activeLevel;
        },
        resolveLocation: () => ({
          id: levels.activeLevel!.id,
          name: levels.activeLevel!.name,
          kind: 'level',
          distance: 0,
        }),
      },
      interactions: new EventBus<InteractionEvents>(),
      dialogue: new EventBus<DialogueEvents>(),
      health: new EventBus<HealthEvents>(),
      money: { credit: () => undefined },
      equipment: { owns: () => false, acquire: () => true },
    },
  );
  missions.init();
  const before = missions.getPersistenceSnapshot();
  missions.events.on('mission:started', () => {
    throw new Error('injected landing hook failure');
  });
  const prepared = await levels.prepare(destination.definition.id);

  await expect(
    prepared.commit(({ spawn, onRollback }) => {
      const priorPose = { ...pose };
      onRollback(() => {
        pose = priorPose;
      });
      pose = {
        x: spawn.position[0],
        y: spawn.position[1],
        z: spawn.position[2],
      };
      missions.commitLandingTransaction(
        {
          factChanges: { 'rook-arrived-in-ashfall': true },
          eventHookIds: ['landing-hook'],
        },
        onRollback,
      );
    }),
  ).rejects.toThrow('injected landing hook failure');

  expect(levels.activeLevel?.id).toBe(source.definition.id);
  expect(pose).toEqual({ x: 0, y: 0, z: 0 });
  expect(missions.getPersistenceSnapshot()).toEqual(before);
  expect(missions.getSnapshot().facts['rook-arrived-in-ashfall']).toBe(false);
  levels.dispose();
  missions.dispose();
});
