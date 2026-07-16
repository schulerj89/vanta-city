import './styles.css';
import { ThreeAssetLoader } from './assets/AssetLoader';
import { assetCatalog } from './assets/catalog';
import { CharacterLoader } from './characters/CharacterLoader';
import { CharacterPreviewSystem } from './characters/CharacterPreviewSystem';
import { CharacterSelectionStore } from './characters/CharacterSelection';
import { characterDefinitions } from './characters/characters';
import { GameObjectWorld } from './entities/GameObjectWorld';
import { GameRuntime } from './game/GameRuntime';
import { InputSystem } from './input/InputSystem';
import { defaultBindings } from './input/defaultBindings';
import { RenderSystem } from './render/RenderSystem';
import { TestSceneSystem } from './scenes/TestSceneSystem';
import { CharacterSelectorSystem } from './ui/CharacterSelectorSystem';
import { DebugOverlaySystem } from './ui/DebugOverlaySystem';

const mount = document.querySelector<HTMLElement>('#game');
if (!mount) throw new Error('Game mount element was not found');

const input = new InputSystem(defaultBindings);
const render = new RenderSystem(mount);
const assets = new ThreeAssetLoader(assetCatalog);
const characterSelection = new CharacterSelectionStore(
  characterDefinitions,
  'vanta-placeholder',
  window.sessionStorage,
);
const characterLoader = new CharacterLoader(assets);
const characterPreview = new CharacterPreviewSystem(
  render.scene,
  characterSelection,
  characterLoader,
);
const runtime = new GameRuntime(input);

runtime
  .register(input)
  .register(new TestSceneSystem(render.scene))
  .register(characterPreview)
  .register(new GameObjectWorld(render.scene))
  .register(render)
  .register(new DebugOverlaySystem(mount, runtime.state, input))
  .register(
    new CharacterSelectorSystem(
      mount,
      characterSelection,
      assets,
      characterPreview,
    ),
  );

void runtime.init().catch((error: unknown) => {
  console.error('Failed to initialize Vanta City', error);
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    runtime.dispose();
    assets.dispose();
  });
}
