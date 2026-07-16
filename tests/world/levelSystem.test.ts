import { Scene } from 'three';
import type { GameAssetLoader } from '../../src/assets/AssetLoader';
import { EventBus } from '../../src/core/events';
import { LevelRegistry } from '../../src/world/LevelRegistry';
import { LevelSystem } from '../../src/world/LevelSystem';
import type { WorldEvents } from '../../src/world/WorldEvents';
import { testDistrict } from '../../src/world/levels/testDistrict';

const unusedAssets: GameAssetLoader = {
  loadTexture: () => Promise.reject(new Error('Unexpected texture load')),
  loadGltf: () => Promise.reject(new Error('Unexpected glTF load')),
  instantiateModel: () =>
    Promise.reject(new Error('Unexpected model instantiation')),
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

    system.dispose();

    expect(scene.children).toHaveLength(0);
    expect(system.activeLevel).toBeUndefined();
    expect(unloaded).toHaveBeenCalledWith({ levelId: 'test-district' });
  });
});
