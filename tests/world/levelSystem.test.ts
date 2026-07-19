import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Scene,
  Texture,
  Vector3,
} from 'three';
import type {
  GameAssetLoader,
  ModelInstance,
} from '../../src/assets/AssetLoader';
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
import { AdaptiveSectorStreamingPolicy } from '../../src/world/AdaptiveSectorStreamingPolicy';
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

function concurrencyLevel(): LevelModule {
  const ids = ['zero', 'one', 'two', 'three'] as const;
  return {
    assets: Object.fromEntries(
      ids.map((id) => [`model.${id}`, { type: 'model', url: `/${id}.glb` }]),
    ),
    definition: {
      id: 'concurrency-level',
      name: 'Concurrency level',
      environment: ids.map((id, index) => ({
        id: `visual.${id}`,
        kind: 'gltf' as const,
        assetId: `model.${id}`,
        position: [index * 20, 0, 0] as const,
      })),
      staticCollision: [],
      spawns: [
        {
          id: 'spawn.player-default',
          kind: 'player',
          default: true,
          position: [0, 0, 0],
        },
      ],
      locations: [],
      zones: [],
      landmarks: [],
      triggers: [],
      cinematicAnchors: [],
      streaming: {
        sectors: ids.map((id, index) => ({
          id: `sector.${id}`,
          center: [index * 20, 0] as const,
          loadDistance: 0.5,
          unloadDistance: 1,
          entryIds: [`visual.${id}`],
        })),
      },
    },
  };
}

function textureOwnershipLevel(): LevelModule {
  return {
    assets: {
      'model.shared': { type: 'model', url: '/shared.glb' },
      'texture.surface': { type: 'texture', url: '/surface.webp' },
    },
    definition: {
      id: 'texture-ownership-level',
      name: 'Texture ownership level',
      environment: [
        {
          id: 'visual.core',
          kind: 'box',
          position: [0, 0, 0],
          size: [1, 1, 1],
          color: 0xffffff,
        },
        {
          id: 'visual.shared-model',
          kind: 'gltf',
          assetId: 'model.shared',
          position: [0, 0, 0],
        },
        {
          id: 'visual.streamed-surface',
          kind: 'box',
          position: [100, 0, 0],
          size: [2, 2, 2],
          color: 0xffffff,
          textureAssetId: 'texture.surface',
          uvMetersPerRepeat: 2,
        },
      ],
      staticCollision: [],
      spawns: [
        {
          id: 'spawn.player-default',
          kind: 'player',
          default: true,
          position: [0, 0, 0],
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
            id: 'sector.core',
            center: [0, 0],
            loadDistance: 1,
            unloadDistance: 2,
            alwaysLoaded: true,
            entryIds: ['visual.core'],
          },
          {
            id: 'sector.home',
            center: [0, 0],
            loadDistance: 2,
            unloadDistance: 4,
            entryIds: ['visual.shared-model'],
          },
          {
            id: 'sector.streamed',
            center: [100, 0],
            loadDistance: 2,
            unloadDistance: 4,
            entryIds: ['visual.streamed-surface'],
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
  it('chooses initial streaming residency around a restored pose', async () => {
    const system = new LevelSystem(
      new Scene(),
      unusedAssets,
      new LevelRegistry([textureOwnershipLevel()]),
      'texture-ownership-level',
      new EventBus<WorldEvents>(),
    );
    system.setStreamingPositionSource(() => ({ x: 100, y: 0, z: 0 }));

    await system.init();

    expect(system.getStreamingSnapshot().active).toEqual(
      expect.arrayContaining(['sector.core', 'sector.streamed']),
    );
    expect(system.getStreamingSnapshot().active).not.toContain('sector.home');
    system.dispose();
  });

  it('disposes only sector-owned texture clones across repeated reloads', async () => {
    const sourceTexture = new Texture();
    const sourceDispose = vi.spyOn(sourceTexture, 'dispose');
    const ownedTextures: Texture[] = [];
    const cloneSourceTexture = sourceTexture.clone.bind(sourceTexture);
    vi.spyOn(sourceTexture, 'clone').mockImplementation(() => {
      const clone = cloneSourceTexture();
      vi.spyOn(clone, 'dispose');
      ownedTextures.push(clone);
      return clone;
    });
    const sharedGltfTexture = new Texture();
    const sharedGltfDispose = vi.spyOn(sharedGltfTexture, 'dispose');
    const assets: GameAssetLoader = {
      loadTexture: () => Promise.resolve(sourceTexture),
      loadGltf: () => Promise.reject(new Error('Unexpected GLTF load')),
      instantiateModel: (assetId) => {
        const scene = new Group();
        scene.add(
          new Mesh(
            new BoxGeometry(1, 1, 1),
            new MeshStandardMaterial({ map: sharedGltfTexture }),
          ),
        );
        return Promise.resolve({
          assetId,
          scene,
          animations: [],
          dispose: vi.fn(),
        });
      },
      getStatus: (id) => ({ id, phase: 'idle', progress: 0 }),
      onStatus: () => () => undefined,
      dispose: () => undefined,
    };
    const system = new LevelSystem(
      new Scene(),
      assets,
      new LevelRegistry([textureOwnershipLevel()]),
      'texture-ownership-level',
      new EventBus<WorldEvents>(),
    );

    await system.init();
    for (let cycle = 0; cycle < 3; cycle += 1) {
      await system.refreshStreaming({ x: 100, y: 0, z: 0 });
      expect(ownedTextures).toHaveLength(cycle + 1);
      expect(ownedTextures.at(-1)!.source).toBe(sourceTexture.source);
      expect(
        ownedTextures.filter(
          (texture) => vi.mocked(texture.dispose).mock.calls.length === 0,
        ),
      ).toHaveLength(1);
      await system.refreshStreaming({ x: 0, y: 0, z: 0 });
      expect(system.getStreamingSnapshot().active).not.toContain(
        'sector.streamed',
      );
      expect(
        ownedTextures.map(
          (texture) => vi.mocked(texture.dispose).mock.calls.length,
        ),
      ).toEqual(Array(cycle + 1).fill(1));
    }
    system.dispose();

    expect(sourceDispose).not.toHaveBeenCalled();
    expect(sharedGltfDispose).not.toHaveBeenCalled();
  });

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
      authored: 22,
      active: [
        'sector.core',
        'sector.north-rim-west',
        'sector.northeast',
        'sector.northwest',
      ],
      loadCount: 4,
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
    await system.refreshStreaming({ x: 0, y: 0, z: 60 });
    expect(system.getStreamingSnapshot()).toMatchObject({
      states: { 'sector.southeast': 'inactive' },
      lastError: undefined,
    });
    system.dispose();
  });

  it('retries a transient desired-sector failure on a bounded evaluation cadence', async () => {
    let trashAttempts = 0;
    const assets: GameAssetLoader = {
      ...unusedAssets,
      instantiateModel: async (assetId) => {
        if (assetId.endsWith('trash-bags') && trashAttempts++ === 0) {
          throw new Error('transient sector failure');
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
      new LevelRegistry([testDistrict]),
      'test-district',
      new EventBus<WorldEvents>(),
      undefined,
      false,
      true,
      new AdaptiveSectorStreamingPolicy({ retryAfterEvaluations: 1 }),
    );
    await system.init();

    await system.refreshStreaming({ x: 0, y: 0, z: -21 });
    expect(system.getStreamingSnapshot()).toMatchObject({
      states: { 'sector.southeast': 'failed' },
      attempts: { 'sector.southeast': 1 },
    });
    await system.refreshStreaming({ x: 0, y: 0, z: -21 });
    expect(system.getStreamingSnapshot()).toMatchObject({
      states: { 'sector.southeast': 'active' },
      attempts: {},
      lastError: undefined,
    });
    expect(trashAttempts).toBe(2);
    system.dispose();
  });

  it('preserves an exhausted load error while evicting unrelated stale sectors', async () => {
    const assets: GameAssetLoader = {
      ...unusedAssets,
      instantiateModel: async (assetId) => {
        if (assetId.endsWith('trash-bags'))
          throw new Error('exhausted sector failure');
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
      new LevelRegistry([testDistrict]),
      'test-district',
      new EventBus<WorldEvents>(),
      undefined,
      false,
      true,
      new AdaptiveSectorStreamingPolicy({ maxLoadAttempts: 1 }),
    );
    await system.init();
    expect(system.getStreamingSnapshot().active).toContain('sector.northwest');
    system.setStreamingMemorySource(() => ({
      renderer: { geometries: 0, textures: 0 },
      assets: {
        sourceReferences: 950,
        instanceReferences: 0,
        inFlight: 0,
      },
    }));

    await system.refreshStreaming({ x: 0, y: 0, z: -21 });

    expect(system.getStreamingSnapshot()).toMatchObject({
      states: { 'sector.southeast': 'failed' },
      attempts: { 'sector.southeast': 1 },
      lastError: 'exhausted sector failure',
    });
    expect(system.getStreamingSnapshot().active).not.toContain(
      'sector.northwest',
    );
    system.dispose();
  });

  it('keeps expanded corner and west-road geometry active at hard memory pressure', async () => {
    const scene = new Scene();
    const events = new EventBus<WorldEvents>();
    const collision = new StaticCollisionWorld();
    const collisionSystem = new WorldCollisionSystem(collision, events);
    collisionSystem.init();
    const system = new LevelSystem(
      scene,
      unusedAssets,
      new LevelRegistry([testDistrict]),
      testDistrict.definition.id,
      events,
      undefined,
      false,
      true,
    );
    system.setStreamingMemorySource(() => ({
      renderer: { geometries: 0, textures: 0 },
      assets: {
        sourceReferences: 500,
        instanceReferences: 0,
        inFlight: 0,
      },
    }));
    await system.init();

    const cases = [
      {
        position: { x: -46, y: 0.2, z: -42 },
        owner: 'sector.world-004-west-south',
        visualId: 'v.boundary-west-south',
        cast: [
          [-46, 1, -42],
          [-49, 1, -42],
        ],
        colliderId: 'c.boundary-west-south',
      },
      {
        position: { x: -46, y: 0.2, z: -42 },
        owner: 'sector.world-004-west-south',
        visualId: 'v.boundary-south-west-edge',
        cast: [
          [-46, 1, -42],
          [-46, 1, -45],
        ],
        colliderId: 'c.boundary-south-west-edge',
      },
      {
        position: { x: 60, y: 0.2, z: -42 },
        owner: 'sector.world-004-east-south',
        visualId: 'v.boundary-east-south',
        cast: [
          [60, 1, -42],
          [63, 1, -42],
        ],
        colliderId: 'c.boundary-east-south',
      },
      {
        position: { x: 60, y: 0.2, z: 42 },
        owner: 'sector.world-004-east-north',
        visualId: 'v.boundary-north-east-edge',
        cast: [
          [60, 1, 42],
          [60, 1, 45],
        ],
        colliderId: 'c.boundary-north-east-edge',
      },
      {
        position: { x: -45, y: 0.2, z: -5.5 },
        owner: 'sector.west-rim-north',
        visualId: 'v.road-world-004-west',
        cast: [
          [-45, 1, -5.5],
          [-45, -1, -5.5],
        ],
        colliderId: 'c.road-world-004-west',
      },
    ] as const;

    for (const sample of cases) {
      await system.refreshStreaming(sample.position);
      const streaming = system.getStreamingSnapshot();
      expect(streaming.policy.memory.overHardCeiling).toBe(true);
      expect(streaming.active, sample.visualId).toContain(sample.owner);
      expect(streaming.policy.decisions[sample.owner]).toMatchObject({
        protected: true,
      });
      expect(
        scene.getObjectByName(`visual:${sample.visualId}`),
        sample.visualId,
      ).toBeDefined();
      expect(
        collision.castSegment(
          new Vector3(...sample.cast[0]),
          new Vector3(...sample.cast[1]),
          { ignoreColliderTags: ['building'] },
        ).colliderId,
        sample.colliderId,
      ).toBe(sample.colliderId);
    }

    system.dispose();
    collisionSystem.dispose();
  });

  it('loads sectors with bounded concurrency and deterministic batches', async () => {
    const level = concurrencyLevel();
    const pending = new Map<
      string,
      ReturnType<typeof deferred<ModelInstance>>
    >();
    let activeLoads = 0;
    let peakLoads = 0;
    const assets: GameAssetLoader = {
      ...unusedAssets,
      instantiateModel: async (assetId) => {
        if (assetId === 'model.zero') {
          return {
            assetId,
            scene: new Group(),
            animations: [],
            dispose: vi.fn(),
          };
        }
        activeLoads += 1;
        peakLoads = Math.max(peakLoads, activeLoads);
        const load = deferred<ModelInstance>();
        pending.set(assetId, load);
        const instance = await load.promise;
        activeLoads -= 1;
        return instance;
      },
    };
    const system = new LevelSystem(
      new Scene(),
      assets,
      new LevelRegistry([level]),
      level.definition.id,
      new EventBus<WorldEvents>(),
      undefined,
      false,
      true,
      new AdaptiveSectorStreamingPolicy({
        hardNearRadius: 1,
        criticalAdjacencyDistance: 0,
        lowPressurePrefetchRadius: 100,
        fallbackBaseMb: 0,
        maxConcurrentLoads: 2,
      }),
    );
    await system.init();

    const refresh = system.refreshStreaming({ x: 0, y: 0, z: 0 });
    await Promise.resolve();
    expect([...pending.keys()].sort()).toEqual(['model.one', 'model.two']);
    for (const assetId of ['model.one', 'model.two']) {
      pending.get(assetId)!.resolve({
        assetId,
        scene: new Group(),
        animations: [],
        dispose: vi.fn(),
      });
    }
    for (let turn = 0; turn < 10 && !pending.has('model.three'); turn += 1) {
      await Promise.resolve();
    }
    expect(pending.has('model.three')).toBe(true);
    pending.get('model.three')!.resolve({
      assetId: 'model.three',
      scene: new Group(),
      animations: [],
      dispose: vi.fn(),
    });
    await refresh;

    expect(peakLoads).toBe(2);
    expect(system.getStreamingSnapshot().active).toEqual([
      'sector.one',
      'sector.three',
      'sector.two',
      'sector.zero',
    ]);
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
    const unloadVisualAttached: boolean[] = [];
    events.on('sector:unloaded', ({ levelId }) => {
      order.push(`sector:unloaded:${levelId}:${collision.getColliderCount()}`);
      unloadVisualAttached.push(
        scene.getObjectByName(`visual:visual.${levelId}`) !== undefined,
      );
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
    expect(unloadVisualAttached).toEqual([true]);
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

  it('aborts during an awaited landing and rolls back before source disposal', async () => {
    const source = travelLevel('source-level', 'model.source', [0, 0, 0]);
    const destination = travelLevel(
      'destination-level',
      'model.destination',
      [7, 0.02, 9],
    );
    const system = new LevelSystem(
      new Scene(),
      unusedAssets,
      new LevelRegistry([source, destination]),
      source.definition.id,
      new EventBus<WorldEvents>(),
    );
    await system.init();
    const prepared = await system.prepare(destination.definition.id);
    const landingGate = deferred<void>();
    const abort = new AbortController();
    let playerPosition = 'source';
    const commit = prepared.commit(async ({ onRollback }) => {
      onRollback(() => {
        playerPosition = 'source';
      });
      playerPosition = 'destination';
      await landingGate.promise;
    }, abort.signal);
    await vi.waitFor(() => expect(playerPosition).toBe('destination'));
    abort.abort();
    landingGate.resolve(undefined);
    await expect(commit).rejects.toThrow('cancelled');
    expect(playerPosition).toBe('source');
    expect(system.activeLevel?.id).toBe(source.definition.id);
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
