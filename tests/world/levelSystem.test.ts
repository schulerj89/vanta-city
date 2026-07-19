import { Group, Scene, Texture } from 'three';
import type { GameAssetLoader } from '../../src/assets/AssetLoader';
import { EventBus } from '../../src/core/events';
import { StaticCollisionWorld } from '../../src/physics/CollisionWorld';
import { WorldCollisionSystem } from '../../src/physics/WorldCollisionSystem';
import type { LevelModule } from '../../src/world/LevelDefinition';
import { LevelRegistry } from '../../src/world/LevelRegistry';
import {
  createSplineRoadGeometry,
  LevelSystem,
  StaleLevelPreparationError,
} from '../../src/world/LevelSystem';
import type { WorldEvents } from '../../src/world/WorldEvents';
import { eastQuayCurvedRoad } from '../../src/world/levels/intersectionLayout';
import { testDistrict } from '../../src/world/levels/testDistrict';

const unusedAssets: GameAssetLoader = {
  loadTexture: () => Promise.resolve(new Texture()),
  loadGltf: () =>
    Promise.resolve({ scene: new Group(), animations: [] } as never),
  instantiateModel: (assetId) =>
    Promise.resolve({
      assetId,
      scene: new Group(),
      animations: [],
      dispose: vi.fn(),
    }),
  getStatus: (id) => ({ id, phase: 'idle', progress: 0 }),
  onStatus: () => () => undefined,
  dispose: () => undefined,
};

function travelLevel(
  id: string,
  assetId: string,
  position: readonly [number, number, number],
): LevelModule {
  return {
    assets: { [assetId]: { type: 'model', url: `/assets/${assetId}.glb` } },
    definition: {
      id,
      name: id,
      environment: [
        {
          id: `visual.${id}`,
          kind: 'gltf',
          assetId,
          position: [0, 0, 0],
        },
      ],
      staticCollision: [
        {
          id: `collision.${id}`,
          position: [0, -0.5, 0],
          size: [20, 1, 20],
          tags: ['ground'],
        },
      ],
      spawns: [
        {
          id: 'spawn.player-default',
          kind: 'player',
          default: true,
          position,
          rotation: [0, Math.PI, 0],
        },
        {
          id: 'spawn.named-destination',
          kind: 'player',
          position,
          rotation: [0, Math.PI / 2, 0],
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
            loadDistance: 5,
            unloadDistance: 8,
            alwaysLoaded: true,
            entryIds: [`visual.${id}`, `collision.${id}`],
          },
        ],
      },
    },
  };
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  return {
    promise: new Promise<T>((next) => {
      resolve = next;
    }),
    resolve,
  };
}

describe('LevelSystem', () => {
  it('builds the spline road with upward-facing render normals', () => {
    const geometry = createSplineRoadGeometry(eastQuayCurvedRoad);
    const normals = geometry.getAttribute('normal');
    for (let index = 0; index < normals.count; index += 1) {
      expect(normals.getY(index)).toBeGreaterThan(0.99);
    }
    geometry.dispose();
  });

  it('loads through the registry, exposes debug groups, and unloads cleanly', async () => {
    const scene = new Scene();
    const events = new EventBus<WorldEvents>();
    const loaded = vi.fn();
    const unloaded = vi.fn();
    events.on('level:loaded', loaded);
    events.on('level:unloaded', unloaded);
    const system = new LevelSystem(
      scene,
      unusedAssets,
      new LevelRegistry([testDistrict]),
      'test-district',
      events,
      undefined,
      true,
    );

    await system.init();

    expect(system.activeLevel?.id).toBe('test-district');
    expect(system.getSpawn().id).toBe('spawn.player-default');
    expect(scene.getObjectByName('rendered-geometry')).toBeDefined();
    expect(scene.getObjectByName('collision-geometry')).toBeDefined();
    expect(scene.getObjectByName('spawn-points')).toBeDefined();
    expect(scene.getObjectByName('trigger-volumes')).toBeDefined();
    expect(scene.getObjectByName('cinematic-anchors')).toBeDefined();
    expect(scene.getObjectByName('debug-helpers')?.visible).toBe(true);
    system.setDebugVisible(false);
    system.setDebugGroupVisible('spawns', true);
    expect(scene.getObjectByName('debug-helpers')?.visible).toBe(true);
    expect(scene.getObjectByName('spawn-points')?.visible).toBe(true);
    expect(scene.getObjectByName('collision-geometry')?.visible).toBe(false);
    expect(loaded).toHaveBeenCalledOnce();
    expect(system.getStreamingSnapshot()).toMatchObject({
      authored: 6,
      active: ['sector.core', 'sector.northeast', 'sector.northwest'],
      loadCount: 3,
      unloadCount: 0,
      transitionsPending: false,
    });
    await system.refreshStreaming({ x: 0, y: 0, z: -21 });
    await system.refreshStreaming({ x: 0, y: 0, z: 21 });
    const baseline = system.getStreamingSnapshot();
    for (let cycle = 0; cycle < 3; cycle += 1) {
      await system.refreshStreaming({ x: 0, y: 0, z: -21 });
      await system.refreshStreaming({ x: 0, y: 0, z: 21 });
      expect(system.getStreamingSnapshot()).toMatchObject({
        active: baseline.active,
        sceneObjects: baseline.sceneObjects,
        ownedResources: baseline.ownedResources,
        modelInstances: baseline.modelInstances,
      });
    }

    system.dispose();

    expect(scene.children).toHaveLength(0);
    expect(system.activeLevel).toBeUndefined();
    expect(unloaded).toHaveBeenCalledWith({ levelId: 'test-district' });
  });

  it('retains active coverage after a later sector failure without retrying every frame', async () => {
    const scene = new Scene();
    const attempts: string[] = [];
    const assets: GameAssetLoader = {
      ...unusedAssets,
      instantiateModel: async (assetId) => {
        attempts.push(assetId);
        if (assetId.endsWith('trash-bags'))
          throw new Error('sector fixture failure');
        return {
          assetId,
          scene: new Group(),
          animations: [],
          dispose: vi.fn(),
        };
      },
    };
    const system = new LevelSystem(
      scene,
      assets,
      new LevelRegistry([testDistrict]),
      'test-district',
      new EventBus<WorldEvents>(),
    );
    await system.init();

    await system.refreshStreaming({ x: 0, y: 0, z: -21 });
    const failed = system.getStreamingSnapshot();
    expect(failed.active).toEqual(
      expect.arrayContaining([
        'sector.core',
        'sector.northwest',
        'sector.northeast',
        'sector.southwest',
      ]),
    );
    expect(failed).toMatchObject({
      states: { 'sector.southeast': 'failed' },
      lastError: 'sector fixture failure',
    });
    const failureAttempts = attempts.filter((id) => id.endsWith('trash-bags'));
    await system.refreshStreaming({ x: 0, y: 0, z: -21 });
    expect(attempts.filter((id) => id.endsWith('trash-bags'))).toEqual(
      failureAttempts,
    );
    expect(system.getStreamingSnapshot().active).toEqual(failed.active);
    await system.refreshStreaming({ x: 0, y: 0, z: 21 });
    expect(system.getStreamingSnapshot()).toMatchObject({
      states: { 'sector.southeast': 'inactive' },
      lastError: undefined,
    });
    system.dispose();
  });

  it('stages without publishing mixed collision, commits in deterministic order, and resolves a named spawn', async () => {
    const source = travelLevel('source-level', 'model.source', [0, 0, 0]);
    const destination = travelLevel(
      'destination-level',
      'model.destination',
      [7, 0.02, 9],
    );
    const scene = new Scene();
    const events = new EventBus<WorldEvents>();
    const collision = new StaticCollisionWorld();
    const collisionSystem = new WorldCollisionSystem(collision, events);
    collisionSystem.init();
    const order: string[] = [];
    events.on('sector:unloaded', ({ levelId }) => {
      order.push(`sector:unloaded:${levelId}:${collision.getColliderCount()}`);
    });
    events.on('level:unloaded', ({ levelId }) => {
      order.push(`level:unloaded:${levelId}:${collision.getColliderCount()}`);
    });
    events.on('sector:loaded', ({ levelId }) => {
      order.push(`sector:loaded:${levelId}:${collision.getColliderCount()}`);
    });
    events.on('level:loaded', ({ level }) => {
      order.push(`level:loaded:${level.id}:${collision.getColliderCount()}`);
    });
    const system = new LevelSystem(
      scene,
      unusedAssets,
      new LevelRegistry([source, destination]),
      source.definition.id,
      events,
    );
    await system.init();
    order.length = 0;

    const prepared = await system.prepare(
      destination.definition.id,
      'spawn.named-destination',
    );
    expect(system.activeLevel?.id).toBe(source.definition.id);
    expect(collision.getColliderCount()).toBe(1);
    expect(
      scene.children.filter(({ name }) => name.startsWith('level:')),
    ).toHaveLength(1);
    expect(prepared.spawn).toMatchObject({
      id: 'spawn.named-destination',
      position: [7, 0.02, 9],
      rotation: [0, Math.PI / 2, 0],
    });
    expect(system.getPreparationSnapshot()).toEqual({
      generation: 2,
      state: 'ready',
      sourceLevelId: source.definition.id,
      destinationLevelId: destination.definition.id,
      spawnId: 'spawn.named-destination',
      initialSectorIds: ['sector.destination-level'],
      error: undefined,
    });

    const landed = vi.fn();
    await prepared.commit(({ level, spawn }) => {
      landed(level.id, spawn);
    });

    expect(landed).toHaveBeenCalledWith(
      destination.definition.id,
      prepared.spawn,
    );
    expect(system.activeLevel?.id).toBe(destination.definition.id);
    expect(collision.getColliderCount()).toBe(1);
    expect(
      scene.children.filter(({ name }) => name.startsWith('level:')),
    ).toHaveLength(1);
    expect(order).toEqual([
      'sector:unloaded:source-level:0',
      'level:unloaded:source-level:0',
      'sector:loaded:destination-level:1',
      'level:loaded:destination-level:1',
    ]);
    expect(system.getPreparationSnapshot().state).toBe('idle');
    system.dispose();
    collisionSystem.dispose();
  });

  it('cancels staged ownership and restores the source after landing failure', async () => {
    const source = travelLevel('source-level', 'model.source', [0, 0, 0]);
    const destination = travelLevel(
      'destination-level',
      'model.destination',
      [7, 0.02, 9],
    );
    const disposals: string[] = [];
    const assets: GameAssetLoader = {
      ...unusedAssets,
      instantiateModel: async (assetId) => ({
        assetId,
        scene: new Group(),
        animations: [],
        dispose: () => disposals.push(assetId),
      }),
    };
    const scene = new Scene();
    const system = new LevelSystem(
      scene,
      assets,
      new LevelRegistry([source, destination]),
      source.definition.id,
      new EventBus<WorldEvents>(),
    );
    await system.init();

    const cancelled = await system.prepare(destination.definition.id);
    cancelled.cancel();
    expect(system.activeLevel?.id).toBe(source.definition.id);
    expect(disposals).toEqual(['model.destination']);
    expect(system.getPreparationSnapshot().state).toBe('idle');

    const failed = await system.prepare(destination.definition.id);
    let playerPosition = 'source';
    const restorationOrder: string[] = [];
    await expect(
      failed.commit(({ onRollback }) => {
        onRollback(() => {
          playerPosition = 'source';
          restorationOrder.push('player');
        });
        onRollback(() => {
          restorationOrder.push('camera');
        });
        playerPosition = 'destination';
        throw new Error('player grounding failed');
      }),
    ).rejects.toThrow('player grounding failed');
    expect(system.activeLevel?.id).toBe(source.definition.id);
    expect(playerPosition).toBe('source');
    expect(restorationOrder).toEqual(['camera', 'player']);
    expect(
      scene.children.filter(({ name }) => name.startsWith('level:')),
    ).toHaveLength(1);
    expect(system.getPreparationSnapshot()).toMatchObject({
      state: 'failed',
      error: 'player grounding failed',
    });
    expect(disposals).toEqual(['model.destination', 'model.destination']);
    system.dispose();
  });

  it('retains the source after prepare failure, rejects stale async work, and retries', async () => {
    const source = travelLevel('source-level', 'model.source', [0, 0, 0]);
    const slow = travelLevel('slow-level', 'model.slow', [1, 0, 1]);
    const destination = travelLevel(
      'destination-level',
      'model.destination',
      [7, 0.02, 9],
    );
    const slowLoad = deferred<{
      assetId: string;
      scene: Group;
      animations: never[];
      dispose: () => void;
    }>();
    let destinationAttempts = 0;
    const staleDispose = vi.fn();
    const assets: GameAssetLoader = {
      ...unusedAssets,
      instantiateModel: async (assetId) => {
        if (assetId === 'model.slow') return slowLoad.promise;
        if (assetId === 'model.destination' && destinationAttempts++ === 0) {
          throw new Error('destination asset failed');
        }
        return {
          assetId,
          scene: new Group(),
          animations: [],
          dispose: vi.fn(),
        };
      },
    };
    const system = new LevelSystem(
      new Scene(),
      assets,
      new LevelRegistry([source, slow, destination]),
      source.definition.id,
      new EventBus<WorldEvents>(),
    );
    await system.init();

    await expect(system.prepare('missing-level')).rejects.toThrow(
      'Unknown level id: missing-level',
    );
    expect(system.getPreparationSnapshot()).toMatchObject({
      state: 'failed',
      destinationLevelId: 'missing-level',
      error: 'Unknown level id: missing-level',
    });
    expect(system.activeLevel?.id).toBe(source.definition.id);

    await expect(system.prepare(destination.definition.id)).rejects.toThrow(
      'destination asset failed',
    );
    expect(system.activeLevel?.id).toBe(source.definition.id);
    expect(system.getPreparationSnapshot().state).toBe('failed');

    const stale = system.prepare(slow.definition.id);
    const retry = await system.prepare(destination.definition.id);
    slowLoad.resolve({
      assetId: 'model.slow',
      scene: new Group(),
      animations: [],
      dispose: staleDispose,
    });
    await expect(stale).rejects.toBeInstanceOf(StaleLevelPreparationError);
    expect(staleDispose).toHaveBeenCalledOnce();
    await retry.commit();
    expect(system.activeLevel?.id).toBe(destination.definition.id);
    system.dispose();
  });

  it('keeps one root and one live model through three finalized travel cycles', async () => {
    const first = travelLevel('first-level', 'model.first', [0, 0, 0]);
    const second = travelLevel('second-level', 'model.second', [2, 0, 2]);
    let liveModels = 0;
    const assets: GameAssetLoader = {
      ...unusedAssets,
      instantiateModel: async (assetId) => {
        liveModels += 1;
        let disposed = false;
        return {
          assetId,
          scene: new Group(),
          animations: [],
          dispose: () => {
            if (!disposed) liveModels -= 1;
            disposed = true;
          },
        };
      },
    };
    const scene = new Scene();
    const system = new LevelSystem(
      scene,
      assets,
      new LevelRegistry([first, second]),
      first.definition.id,
      new EventBus<WorldEvents>(),
    );
    await system.init();
    for (let cycle = 0; cycle < 3; cycle += 1) {
      await (await system.prepare(second.definition.id)).commit();
      await (await system.prepare(first.definition.id)).commit();
      expect(liveModels).toBe(1);
      expect(
        scene.children.filter(({ name }) => name.startsWith('level:')),
      ).toHaveLength(1);
      expect(system.getStreamingSnapshot()).toMatchObject({
        active: ['sector.first-level'],
        modelInstances: 1,
      });
    }
    system.dispose();
    expect(liveModels).toBe(0);
  });
});
