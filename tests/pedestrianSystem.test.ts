import { AnimationClip, Group, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import type { CharacterDefinition } from '../src/characters/CharacterDefinition';
import type { LoadedCharacter } from '../src/characters/CharacterLoader';
import type { GameState } from '../src/core/gameState';
import { EventBus } from '../src/core/events';
import { pedestrianCharacterDefinitions } from '../src/npcs/npcs';
import { PedestrianSystem } from '../src/pedestrians/PedestrianSystem';
import { StaticCollisionWorld } from '../src/physics/CollisionWorld';
import {
  LevelDefinitionError,
  type LevelDefinition,
  validateLevelDefinition,
} from '../src/world/LevelDefinition';
import type { SectorStreamingSnapshot } from '../src/world/LevelSystem';
import { AdaptiveSectorStreamingPolicy } from '../src/world/AdaptiveSectorStreamingPolicy';
import type { WorldEvents } from '../src/world/WorldEvents';
import { testDistrict } from '../src/world/levels/testDistrict';
import { flushPromises } from './helpers/flushPromises';

class CharacterLoaderFixture {
  public disposed = 0;

  public async instantiate(
    definition: CharacterDefinition,
  ): Promise<LoadedCharacter> {
    const root = new Group();
    root.add(new Group());
    return {
      definition,
      root,
      animationClips: new Map([
        ['idle', new AnimationClip('idle', 1, [])],
        ['walk', new AnimationClip('walk', 1, [])],
      ]),
      discoveredClipNames: ['idle', 'walk'],
      source: 'asset',
      warnings: [],
      dispose: () => {
        this.disposed += 1;
      },
    };
  }
}

class DeferredCharacterLoaderFixture {
  public disposed = 0;
  private readonly pending: {
    readonly definition: CharacterDefinition;
    readonly resolve: (loaded: LoadedCharacter) => void;
  }[] = [];

  public instantiate(
    definition: CharacterDefinition,
  ): Promise<LoadedCharacter> {
    return new Promise((resolve) => {
      this.pending.push({ definition, resolve });
    });
  }

  public resolveNext(): void {
    const pending = this.pending.shift();
    if (!pending) throw new Error('No deferred character load is pending');
    const root = new Group();
    root.add(new Group());
    pending.resolve({
      definition: pending.definition,
      root,
      animationClips: new Map([
        ['idle', new AnimationClip('idle', 1, [])],
        ['walk', new AnimationClip('walk', 1, [])],
      ]),
      discoveredClipNames: ['idle', 'walk'],
      source: 'asset',
      warnings: [],
      dispose: () => {
        this.disposed += 1;
      },
    });
  }
}

const edgeLevel: LevelDefinition = {
  id: 'edge-route-fixture',
  name: 'Edge route fixture',
  environment: [],
  staticCollision: [
    {
      id: 'c.sidewalk-edge',
      position: [1, 0, 0],
      size: [24, 0.4, 4],
      tags: ['walkable', 'sidewalk'],
    },
  ],
  spawns: [
    {
      id: 'spawn.edge-route',
      kind: 'player',
      default: true,
      position: [0, 0.2, 0],
    },
  ],
  locations: [],
  zones: [],
  landmarks: [],
  triggers: [],
  cinematicAnchors: [],
  mapPresentation: {
    orientation: 'north-up',
    bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
    geometry: [],
    markers: [{ entryId: 'spawn.edge-route', layer: 'spawns' }],
  },
  streaming: {
    sectors: [
      {
        id: 'sector.edge',
        center: [0, 0],
        loadDistance: 20,
        unloadDistance: 30,
        alwaysLoaded: true,
        entryIds: ['c.sidewalk-edge'],
      },
    ],
  },
  pedestrians: {
    seed: 3003,
    residentCap: 1,
    activationDistance: 25,
    visibilityDistance: 30,
    routes: [
      {
        id: 'route.edge-east',
        sectorId: 'sector.edge',
        loop: false,
        exit: {
          edge: 'east',
          clearance: 0.35,
          minimumTraversalDistance: 18,
          repopulation: 'sector-reload',
        },
        population: 1,
        speed: [10, 10],
        nodes: [
          {
            id: 'route.edge-east.node-1',
            position: [-8, 0.2, 0],
            surfaceColliderId: 'c.sidewalk-edge',
          },
          {
            id: 'route.edge-east.node-2',
            position: [0, 0.2, 0],
            surfaceColliderId: 'c.sidewalk-edge',
          },
          {
            id: 'route.edge-east.node-3',
            position: [10.4, 0.2, 0],
            surfaceColliderId: 'c.sidewalk-edge',
          },
        ],
      },
    ],
  },
};

function createEdgeHarness(
  loader:
    | CharacterLoaderFixture
    | DeferredCharacterLoaderFixture = new CharacterLoaderFixture(),
) {
  const scene = new Scene();
  const collision = new StaticCollisionWorld();
  collision.addDefinitions(edgeLevel.staticCollision);
  const events = new EventBus<WorldEvents>();
  const levels = {
    activeLevel: edgeLevel as LevelDefinition | undefined,
    getStreamingSnapshot: (): SectorStreamingSnapshot => ({
      levelId: edgeLevel.id,
      authored: 1,
      active: ['sector.edge'],
      pending: [],
      states: { 'sector.edge': 'active' },
      loadCount: 1,
      unloadCount: 0,
      sceneObjects: 0,
      ownedResources: 0,
      modelInstances: 0,
      colliders: 1,
      lodHiddenObjects: 0,
      transitionsPending: false,
      lastError: undefined,
    }),
  };
  const playerPosition = { x: 0, y: 0.2, z: 0 };
  const system = new PedestrianSystem(
    pedestrianCharacterDefinitions,
    loader,
    scene,
    collision,
    {
      getWorldPose: () => ({
        position: playerPosition,
        forward: { x: 0, y: 0, z: 1 },
      }),
    },
    levels,
    events,
    { current: 'playing' },
  );
  return { system, loader, scene, events, levels, playerPosition };
}

function createHarness() {
  const scene = new Scene();
  const collision = new StaticCollisionWorld();
  collision.addDefinitions(testDistrict.definition.staticCollision);
  const events = new EventBus<WorldEvents>();
  const active = testDistrict.definition.streaming.sectors
    .filter(({ id }) => id !== 'sector.east-quay')
    .map(({ id }) => id);
  const levels = {
    activeLevel: testDistrict.definition as LevelDefinition | undefined,
    getStreamingSnapshot: (): SectorStreamingSnapshot => ({
      levelId: testDistrict.definition.id,
      authored: testDistrict.definition.streaming.sectors.length,
      active,
      pending: [],
      states: Object.fromEntries(active.map((id) => [id, 'active'])),
      loadCount: active.length,
      unloadCount: 0,
      sceneObjects: 0,
      ownedResources: 0,
      modelInstances: 0,
      colliders: testDistrict.definition.staticCollision.length,
      lodHiddenObjects: 0,
      transitionsPending: false,
      lastError: undefined,
      policy: new AdaptiveSectorStreamingPolicy().evaluate({
        sectors: testDistrict.definition.streaming.sectors,
        playerPosition: { x: 0, y: 0, z: 0 },
      }),
      attempts: {},
    }),
  };
  const player = {
    getWorldPose: () => ({
      position: { x: 0, y: 0.2, z: 0 },
      forward: { x: 0, y: 0, z: 1 },
    }),
  };
  const state: { current: GameState } = { current: 'playing' };
  const loader = new CharacterLoaderFixture();
  const system = new PedestrianSystem(
    pedestrianCharacterDefinitions,
    loader,
    scene,
    collision,
    player,
    levels,
    events,
    state,
  );
  return { system, loader, scene, events, levels, state };
}

describe('PedestrianSystem', () => {
  it('rejects pedestrian nodes authored on vehicle-road surfaces', () => {
    const route = testDistrict.definition.pedestrians.routes[0];
    const firstNode = route?.nodes[0];
    if (!route || !firstNode)
      throw new Error('Expected authored route fixture');
    const invalid: LevelDefinition = {
      ...testDistrict.definition,
      pedestrians: {
        ...testDistrict.definition.pedestrians,
        routes: [
          {
            ...route,
            nodes: [
              {
                ...firstNode,
                position: [0, 0, 0],
                surfaceColliderId: 'c.road-east-west',
              },
              ...route.nodes.slice(1),
            ],
          },
          ...testDistrict.definition.pedestrians.routes.slice(1),
        ],
      },
    };
    expect(() => validateLevelDefinition(invalid)).toThrow(
      LevelDefinitionError,
    );
    expect(() => validateLevelDefinition(invalid)).toThrow(
      /is not tagged sidewalk/,
    );
  });

  it('spawns a capped deterministic sidewalk population with varied local models', async () => {
    const first = createHarness();
    const second = createHarness();
    await first.system.init();
    await second.system.init();

    const snapshot = first.system.getSnapshot();
    expect(snapshot.residentCount).toBe(16);
    expect(snapshot.activeCount).toBe(16);
    expect(snapshot.mixerOwnerCount).toBe(16);
    expect(snapshot.routeCount).toBe(4);
    expect(new Set(snapshot.pedestrians.map(({ modelId }) => modelId))).toEqual(
      new Set(pedestrianCharacterDefinitions.map(({ id }) => id)),
    );
    expect(
      snapshot.pedestrians.map(({ id, routeId, speed, modelId }) => ({
        id,
        routeId,
        speed,
        modelId,
      })),
    ).toEqual(
      second.system
        .getSnapshot()
        .pedestrians.map(({ id, routeId, speed, modelId }) => ({
          id,
          routeId,
          speed,
          modelId,
        })),
    );
    first.system.dispose();
    second.system.dispose();
  });

  it('walks grounded route segments, turns, and freezes exactly for cinematics', async () => {
    const { system, state } = createHarness();
    await system.init();
    const before = system
      .getSnapshot()
      .pedestrians.map(({ id, position }) => [id, position] as const);
    let sawIntentionalIdle = false;
    for (let frame = 0; frame < 80; frame += 1) {
      system.update({ delta: 0.1, elapsed: frame * 0.1, frame });
      sawIntentionalIdle ||= system
        .getSnapshot()
        .pedestrians.some(({ state: value }) => value === 'idle');
    }
    const moving = system.getSnapshot();
    expect(moving.pedestrians.every(({ grounded }) => grounded)).toBe(true);
    expect(
      moving.pedestrians.every(({ groundColliderId }) =>
        groundColliderId.startsWith('c.sidewalk-'),
      ),
    ).toBe(true);
    expect(sawIntentionalIdle).toBe(true);
    expect(
      moving.pedestrians.map(({ id, position }) => [id, position]),
    ).not.toEqual(before);

    state.current = 'cinematic';
    const frozen = system
      .getSnapshot()
      .pedestrians.map(({ position, facingYaw, currentAnimation }) => ({
        position,
        facingYaw,
        currentAnimation,
      }));
    system.update({ delta: 5, elapsed: 20, frame: 100 });
    expect(
      system
        .getSnapshot()
        .pedestrians.map(({ position, facingYaw, currentAnimation }) => ({
          position,
          facingYaw,
          currentAnimation,
        })),
    ).toEqual(frozen);
    state.current = 'playing';
    system.update({ delta: 0.1, elapsed: 20.1, frame: 101 });
    system.dispose();
  });

  it('disposes sector residents through three unload and respawn cycles', async () => {
    const { system, loader, events, levels, scene } = createHarness();
    await system.init();
    for (let cycle = 0; cycle < 3; cycle += 1) {
      events.emit('sector:unloaded', {
        levelId: testDistrict.definition.id,
        sectorId: 'sector.northwest',
      });
      expect(system.getSnapshot().residentCount).toBe(12);
      events.emit('sector:loaded', {
        levelId: testDistrict.definition.id,
        sectorId: 'sector.northwest',
        colliders: [],
      });
      await flushPromises();
      expect(system.getSnapshot().residentCount).toBe(16);
      expect(system.getSnapshot().mixerOwnerCount).toBe(16);
    }
    const snapshot = system.getSnapshot();
    expect(snapshot.disposeCount).toBe(12);
    expect(snapshot.spawnCount).toBe(28);
    expect(scene.children).toHaveLength(16);
    expect(loader.disposed).toBe(12);
    levels.activeLevel = undefined;
    events.emit('level:unloaded', { levelId: testDistrict.definition.id });
    expect(system.getSnapshot().residentCount).toBe(0);
    expect(scene.children).toHaveLength(0);
    expect(loader.disposed).toBe(28);
    system.dispose();
  });

  it('walks a long terminal route fully through the edge, retires, and repopulates only after sector reload', async () => {
    validateLevelDefinition(edgeLevel);
    const { system, loader, events, scene, playerPosition } =
      createEdgeHarness();
    await system.init();
    expect(system.getSnapshot()).toMatchObject({
      residentCount: 1,
      visibleCount: 1,
      mixerOwnerCount: 1,
      retiredCount: 0,
      boundaryExitCount: 0,
    });

    let sawApproach = false;
    let sawEdgeCrossing = false;
    let sawCulledTraversal = false;
    for (let frame = 0; frame < 30; frame += 1) {
      if (frame === 5) playerPosition.x = -100;
      system.update({ delta: 0.1, elapsed: frame * 0.1, frame });
      const resident = system.getSnapshot().pedestrians[0];
      const lifecycleState = resident?.lifecycleState;
      sawApproach ||= lifecycleState === 'approaching-boundary';
      sawEdgeCrossing ||= lifecycleState === 'exiting-boundary';
      sawCulledTraversal ||= resident?.visible === false;
    }
    expect(sawApproach).toBe(true);
    expect(sawEdgeCrossing).toBe(true);
    expect(sawCulledTraversal).toBe(true);
    const exited = system.getSnapshot();
    expect(exited).toMatchObject({
      residentCount: 0,
      visibleCount: 0,
      mixerOwnerCount: 0,
      retiredCount: 1,
      boundaryExitCount: 1,
      disposeCount: 1,
      repopulationCount: 0,
    });
    expect(exited.lifecycleEvents.at(-1)).toMatchObject({
      id: 'pedestrian.route.edge-east.1',
      state: 'despawned',
      reason: 'authored-boundary-exit',
      boundaryEdge: 'east',
      mixerOwnerCountBeforeDispose: 1,
    });
    expect(
      exited.lifecycleEvents.at(-1)?.distanceTravelled,
    ).toBeGreaterThanOrEqual(18.3);
    expect(exited.lifecycleEvents.at(-1)?.position[0]).toBeGreaterThanOrEqual(
      10.35,
    );
    expect(scene.children).toHaveLength(0);
    expect(loader.disposed).toBe(1);

    for (let frame = 30; frame < 60; frame += 1) {
      system.update({ delta: 0.1, elapsed: frame * 0.1, frame });
    }
    expect(system.getSnapshot()).toMatchObject({
      residentCount: 0,
      retiredCount: 1,
      spawnCount: 1,
    });
    events.emit('sector:loaded', {
      levelId: edgeLevel.id,
      sectorId: 'sector.edge',
      colliders: edgeLevel.staticCollision,
    });
    await flushPromises();
    expect(system.getSnapshot()).toMatchObject({
      residentCount: 0,
      retiredCount: 1,
      spawnCount: 1,
      repopulationCount: 0,
    });

    events.emit('sector:unloaded', {
      levelId: edgeLevel.id,
      sectorId: 'sector.edge',
    });
    expect(system.getSnapshot().retiredCount).toBe(0);
    events.emit('sector:loaded', {
      levelId: edgeLevel.id,
      sectorId: 'sector.edge',
      colliders: edgeLevel.staticCollision,
    });
    await flushPromises();
    playerPosition.x = 0;
    system.update({ delta: 0, elapsed: 6, frame: 60 });
    const repopulated = system.getSnapshot();
    expect(repopulated).toMatchObject({
      residentCount: 1,
      mixerOwnerCount: 1,
      retiredCount: 0,
      repopulationCount: 1,
      spawnCount: 2,
    });
    expect(repopulated.pedestrians[0]).toMatchObject({
      lifecycleState: 'resident',
      lifecycleReason: null,
      visible: true,
      position: [-8, 0.2, 0],
      distanceTravelled: 0,
    });
    for (let cycle = 2; cycle <= 3; cycle += 1) {
      for (let frame = 0; frame < 30; frame += 1) {
        system.update({
          delta: 0.1,
          elapsed: cycle * 10 + frame * 0.1,
          frame: cycle * 100 + frame,
        });
      }
      expect(system.getSnapshot()).toMatchObject({
        residentCount: 0,
        mixerOwnerCount: 0,
        retiredCount: 1,
        boundaryExitCount: cycle,
      });
      events.emit('sector:unloaded', {
        levelId: edgeLevel.id,
        sectorId: 'sector.edge',
      });
      events.emit('sector:loaded', {
        levelId: edgeLevel.id,
        sectorId: 'sector.edge',
        colliders: edgeLevel.staticCollision,
      });
      await flushPromises();
      system.update({ delta: 0, elapsed: cycle * 20, frame: cycle * 200 });
      expect(system.getSnapshot()).toMatchObject({
        residentCount: 1,
        mixerOwnerCount: 1,
        retiredCount: 0,
        boundaryExitCount: cycle,
        repopulationCount: cycle,
      });
    }
    expect(system.getSnapshot()).toMatchObject({
      spawnCount: 4,
      disposeCount: 3,
      boundaryExitCount: 3,
      repopulationCount: 3,
    });
    expect(loader.disposed).toBe(3);
    system.dispose();
    expect(loader.disposed).toBe(4);
    expect(scene.children).toHaveLength(0);
  });

  it('cancels and eventually disposes a model that resolves after sector unload', async () => {
    const loader = new DeferredCharacterLoaderFixture();
    const { system, events, scene } = createEdgeHarness(loader);
    const initialization = system.init();
    await flushPromises();

    events.emit('sector:unloaded', {
      levelId: edgeLevel.id,
      sectorId: 'sector.edge',
    });
    expect(system.getSnapshot()).toMatchObject({
      residentCount: 0,
      loadingCount: 0,
      mixerOwnerCount: 0,
      disposeCount: 1,
      loadCancellationCount: 1,
    });
    expect(system.getSnapshot().lifecycleEvents.at(-1)).toMatchObject({
      state: 'disposed',
      reason: 'load-cancelled',
      mixerOwnerCountBeforeDispose: 0,
    });

    loader.resolveNext();
    await initialization;
    expect(loader.disposed).toBe(1);
    expect(scene.children).toHaveLength(0);
    expect(system.getSnapshot()).toMatchObject({
      residentCount: 0,
      loadingCount: 0,
      mixerOwnerCount: 0,
      loadCancellationCount: 1,
    });
    system.dispose();
    expect(loader.disposed).toBe(1);
  });
});
