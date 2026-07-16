import './styles.css';
import { Vector3 } from 'three';
import { AssetCatalog } from './assets/AssetCatalog';
import { ThreeAssetLoader } from './assets/AssetLoader';
import { assetManifest } from './assets/catalog';
import { EventBus } from './core/events';
import { GameObjectWorld } from './entities/GameObjectWorld';
import { GameRuntime } from './game/GameRuntime';
import { InputSystem } from './input/InputSystem';
import { defaultBindings } from './input/defaultBindings';
import { StaticCollisionWorld } from './physics/CollisionWorld';
import { PlayerControllerSystem } from './player/PlayerControllerSystem';
import { RenderSystem } from './render/RenderSystem';
import { ThirdPersonCameraSystem } from './camera/ThirdPersonCameraSystem';
import { DebugOverlaySystem } from './ui/DebugOverlaySystem';
import { LevelRegistry } from './world/LevelRegistry';
import { LevelSystem } from './world/LevelSystem';
import type { WorldEvents } from './world/WorldEvents';
import { findSpawn } from './world/LevelQueries';
import { testDistrict } from './world/levels/testDistrict';

const mount = document.querySelector<HTMLElement>('#game');
if (!mount) throw new Error('Game mount element was not found');

const input = new InputSystem(defaultBindings);
const render = new RenderSystem(mount);
const levels = new LevelRegistry([testDistrict]);
const assets = new ThreeAssetLoader(
  new AssetCatalog({ ...assetManifest, ...levels.assetManifest }),
);
const worldEvents = new EventBus<WorldEvents>();
const levelSystem = new LevelSystem(
  render.scene,
  assets,
  levels,
  'test-district',
  worldEvents,
  input,
);
const collision = new StaticCollisionWorld();
for (const collider of testDistrict.definition.staticCollision) {
  const [x, y, z] = collider.position;
  const [width, height, depth] = collider.size;
  if (collider.tags?.includes('ramp')) {
    const run = depth * Math.cos(collider.rotation?.[0] ?? 0);
    const rise = depth * Math.sin(collider.rotation?.[0] ?? 0);
    collision.addRamp({
      id: collider.id,
      minX: x - width / 2,
      maxX: x + width / 2,
      minZ: z - run / 2,
      maxZ: z + run / 2,
      baseHeight: y + rise / 2,
      slopeX: 0,
      slopeZ: -rise / run,
    });
  } else {
    collision.addBox({
      id: collider.id,
      min: new Vector3(x - width / 2, y - height / 2, z - depth / 2),
      max: new Vector3(x + width / 2, y + height / 2, z + depth / 2),
    });
  }
}

const spawn = findSpawn(testDistrict.definition, undefined, 'player');
const objects = new GameObjectWorld(render.scene);
const cameraReference: { current?: ThirdPersonCameraSystem } = {};
const player = new PlayerControllerSystem(
  objects,
  collision,
  new Vector3(...spawn.position),
  undefined,
  () => cameraReference.current?.getYaw() ?? 0,
);
const camera = new ThirdPersonCameraSystem(
  render.camera,
  input,
  player,
  collision,
);
cameraReference.current = camera;
input.setPointerTarget(render.renderer.domElement);
const runtime = new GameRuntime(input);
const debugData = {
  getPlayerPosition: (): ReturnType<typeof player.getPlayerPosition> =>
    player.getPlayerPosition(),
  getDebugSnapshot: (): ReturnType<typeof player.getDebugSnapshot> =>
    player.getDebugSnapshot(),
  get cameraObstructed(): boolean {
    return camera.obstructed;
  },
};

runtime
  .register(input)
  .register(levelSystem)
  .register(objects)
  .register(player)
  .register(camera)
  .register(render)
  .register(new DebugOverlaySystem(mount, runtime.state, input, debugData));

void runtime.init().catch((error: unknown) => {
  console.error('Failed to initialize Vanta City', error);
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    runtime.dispose();
    worldEvents.clear();
    assets.dispose();
  });
}
