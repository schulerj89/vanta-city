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
});
