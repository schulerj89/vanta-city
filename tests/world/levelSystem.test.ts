import { Group, Scene, Texture } from 'three';
import type { GameAssetLoader } from '../../src/assets/AssetLoader';
import { EventBus } from '../../src/core/events';
import { LevelRegistry } from '../../src/world/LevelRegistry';
import { LevelSystem } from '../../src/world/LevelSystem';
import type { WorldEvents } from '../../src/world/WorldEvents';
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

describe('LevelSystem', () => {
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
      authored: 5,
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
    await system.refreshStreaming({ x: 0, y: 0, z: 21 });
    expect(system.getStreamingSnapshot().states['sector.southeast']).toBe(
      'inactive',
    );
    system.dispose();
  });
});
