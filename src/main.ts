import './styles.css';
import { AssetCatalog } from './assets/AssetCatalog';
import { ThreeAssetLoader } from './assets/AssetLoader';
import { assetManifest } from './assets/catalog';
import { CharacterLoader } from './characters/CharacterLoader';
import { CharacterPreviewSystem } from './characters/CharacterPreviewSystem';
import { CharacterSelectionStore } from './characters/CharacterSelection';
import { characterDefinitions } from './characters/characters';
import { EventBus } from './core/events';
import { GameObjectWorld } from './entities/GameObjectWorld';
import { GameRuntime } from './game/GameRuntime';
import { InputSystem } from './input/InputSystem';
import { defaultBindings } from './input/defaultBindings';
import { RenderSystem } from './render/RenderSystem';
import { CharacterSelectorSystem } from './ui/CharacterSelectorSystem';
import { DebugOverlaySystem } from './ui/DebugOverlaySystem';
import { LevelRegistry } from './world/LevelRegistry';
import { LevelSystem } from './world/LevelSystem';
import type { WorldEvents } from './world/WorldEvents';
import { testDistrict } from './world/levels/testDistrict';

const mount = document.querySelector<HTMLElement>('#game');
if (!mount) throw new Error('Game mount element was not found');

const input = new InputSystem(defaultBindings);
const render = new RenderSystem(mount);
const levels = new LevelRegistry([testDistrict]);
const assets = new ThreeAssetLoader(
  new AssetCatalog({ ...assetManifest, ...levels.assetManifest }),
);
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
const worldEvents = new EventBus<WorldEvents>();
const levelSystem = new LevelSystem(
  render.scene,
  assets,
  levels,
  'test-district',
  worldEvents,
  input,
);
const runtime = new GameRuntime(input);

runtime
  .register(input)
  .register(levelSystem)
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
    worldEvents.clear();
    assets.dispose();
  });
}
