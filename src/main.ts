import './styles.css';
import { ThreeAssetLoader } from './assets/AssetLoader';
import { GameObjectWorld } from './entities/GameObjectWorld';
import { GameRuntime } from './game/GameRuntime';
import { InputSystem } from './input/InputSystem';
import { defaultBindings } from './input/defaultBindings';
import { RenderSystem } from './render/RenderSystem';
import { TestSceneSystem } from './scenes/TestSceneSystem';
import { DebugOverlaySystem } from './ui/DebugOverlaySystem';

const mount = document.querySelector<HTMLElement>('#game');
if (!mount) throw new Error('Game mount element was not found');

const input = new InputSystem(defaultBindings);
const render = new RenderSystem(mount);
const assets = new ThreeAssetLoader({});
const runtime = new GameRuntime(input);

runtime
  .register(input)
  .register(new TestSceneSystem(render.scene))
  .register(new GameObjectWorld(render.scene))
  .register(render)
  .register(new DebugOverlaySystem(mount, runtime.state, input));

void runtime.init().catch((error: unknown) => {
  console.error('Failed to initialize Vanta City', error);
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    runtime.dispose();
    assets.dispose();
  });
}
