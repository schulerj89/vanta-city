import './styles.css';
import { Vector3 } from 'three';
import { AssetCatalog } from './assets/AssetCatalog';
import { ThreeAssetLoader } from './assets/AssetLoader';
import { assetManifest } from './assets/catalog';
import { CharacterLoader } from './characters/CharacterLoader';
import { ManifestCharacterAvailabilityProbe } from './characters/CharacterAvailability';
import { CharacterSelectionStore } from './characters/CharacterSelection';
import { characterDefinitions } from './characters/characters';
import type { GameSystem } from './core/lifecycle';
import { EventBus } from './core/events';
import { GameObjectWorld } from './entities/GameObjectWorld';
import { GameRuntime } from './game/GameRuntime';
import type { GameContext } from './game/GameRuntime';
import { InputSystem } from './input/InputSystem';
import { defaultBindings } from './input/defaultBindings';
import { InteractionSystem } from './interactions/InteractionSystem';
import { StaticCollisionWorld } from './physics/CollisionWorld';
import { WorldCollisionSystem } from './physics/WorldCollisionSystem';
import { CharacterPlayerVisual } from './player/CharacterPlayerVisual';
import { PlayerControllerSystem } from './player/PlayerControllerSystem';
import { RenderSystem } from './render/RenderSystem';
import { ThirdPersonCameraSystem } from './camera/ThirdPersonCameraSystem';
import { InteractionPromptSystem } from './ui/InteractionPromptSystem';
import { CharacterPickerSystem } from './ui/CharacterPickerSystem';
import { LevelRegistry } from './world/LevelRegistry';
import { findSpawn } from './world/LevelQueries';
import { LevelSystem } from './world/LevelSystem';
import type { WorldEvents } from './world/WorldEvents';
import { testDistrict } from './world/levels/testDistrict';

async function bootstrap(): Promise<void> {
  const mount = document.querySelector<HTMLElement>('#game');
  if (!mount) throw new Error('Game mount element was not found');

  const input = new InputSystem(defaultBindings);
  const render = new RenderSystem(mount);
  const levels = new LevelRegistry([testDistrict]);
  const assetCatalog = new AssetCatalog({
    ...assetManifest,
    ...levels.assetManifest,
  });
  const assets = new ThreeAssetLoader(assetCatalog);
  const runtime = new GameRuntime(input);
  const developmentParameters = import.meta.env.DEV
    ? new URLSearchParams(window.location.search)
    : undefined;
  let development:
    import('./debug/setupDevelopmentTools').DevelopmentTools | undefined;
  let browserTestModule: typeof import('./debug/BrowserTestBridge') | undefined;

  if (import.meta.env.DEV) {
    const { setupDevelopmentTools } =
      await import('./debug/setupDevelopmentTools');
    development = setupDevelopmentTools(
      mount,
      runtime,
      input,
      developmentParameters?.get('debug') === '1',
    );

    if (developmentParameters?.get('e2e') === '1') {
      browserTestModule = await import('./debug/BrowserTestBridge');
    }

    const sandboxId = developmentParameters?.get('sandbox');
    if (sandboxId) {
      const { loadSandboxScenario } =
        await import('./sandbox/loadSandboxScenario');
      const sandbox: GameSystem<GameContext> = loadSandboxScenario(sandboxId, {
        scene: render.scene,
        debug: development.debug,
        visualHelpers: development.visualHelpers,
      });
      runtime
        .register(input)
        .register(development.systems[0]!)
        .register(sandbox);
      runtime.register(new GameObjectWorld(render.scene)).register(render);
      for (const system of development.systems.slice(1))
        runtime.register(system);
      await runtime.init();
      installHotDisposal(runtime, assets, development);
      return;
    }
  }

  const worldEvents = new EventBus<WorldEvents>();
  const levelSystem = new LevelSystem(
    render.scene,
    assets,
    levels,
    'test-district',
    worldEvents,
  );
  const collision = new StaticCollisionWorld();
  const worldCollision = new WorldCollisionSystem(collision, worldEvents);
  const spawn = findSpawn(testDistrict.definition);
  const objects = new GameObjectWorld(render.scene);
  const availableCharacters = browserTestModule
    ? [
        ...characterDefinitions,
        ...browserTestModule.browserTestCharacterDefinitions,
      ]
    : characterDefinitions;
  const characterSelection = new CharacterSelectionStore(
    availableCharacters,
    'vanta-placeholder',
    window.localStorage,
  );
  const characterVisual = new CharacterPlayerVisual(
    characterSelection,
    new CharacterLoader(assets),
  );
  const characterPicker = new CharacterPickerSystem(
    mount,
    characterSelection,
    assetCatalog,
    new ManifestCharacterAvailabilityProbe(assetCatalog),
  );
  const cameraReference: { current?: ThirdPersonCameraSystem } = {};
  const player = new PlayerControllerSystem(
    objects,
    collision,
    new Vector3(...spawn.position),
    undefined,
    () => cameraReference.current?.getYaw() ?? 0,
    characterVisual,
  );
  const camera = new ThirdPersonCameraSystem(
    render.camera,
    input,
    player,
    collision,
  );
  cameraReference.current = camera;
  input.setPointerTarget(render.renderer.domElement);
  const interactions = new InteractionSystem(input, runtime.state, player);
  interactions.register({
    id: 'interaction.garage-door',
    prompt: 'Inspect garage door',
    location: () => {
      const [x, y, z] = levelSystem.getLocation(
        'interaction.garage-door',
      ).position;
      return { x, y, z };
    },
    range: 2.75,
    repeatable: false,
    interact: () => undefined,
  });
  let interactionDebug:
    | import('./interactions/InteractionDebugSystem').InteractionDebugSystem
    | undefined;
  let characterAlignmentDebug:
    | import('./debug/CharacterAlignmentDebugSystem').CharacterAlignmentDebugSystem
    | undefined;
  if (development) {
    const { InteractionDebugSystem } =
      await import('./interactions/InteractionDebugSystem');
    interactionDebug = new InteractionDebugSystem(render.scene, interactions);
    const { CharacterAlignmentDebugSystem } =
      await import('./debug/CharacterAlignmentDebugSystem');
    characterAlignmentDebug = new CharacterAlignmentDebugSystem(
      render.scene,
      player,
      characterVisual,
    );
  }

  const debugUnregister = development
    ? registerVerticalSliceDebug(
        development,
        levelSystem,
        player,
        camera,
        interactions,
        characterSelection,
        characterVisual,
        characterPicker,
        interactionDebug,
        characterAlignmentDebug,
      )
    : [];

  runtime.register(input);
  if (development) runtime.register(development.systems[0]!);
  runtime
    .register(worldCollision)
    .register(levelSystem)
    .register(objects)
    .register(player)
    .register(camera)
    .register(interactions)
    .register(new InteractionPromptSystem(mount, interactions))
    .register(characterPicker);
  if (interactionDebug) runtime.register(interactionDebug);
  if (characterAlignmentDebug) runtime.register(characterAlignmentDebug);
  runtime.register(render);
  for (const system of development?.systems.slice(1) ?? []) {
    runtime.register(system);
  }

  try {
    await runtime.init();
  } catch (error) {
    development?.errors.report('runtime initialization', error);
    showFatalError(mount, error);
    throw error;
  }

  if (developmentParameters?.get('e2e') !== '1') characterPicker.open();

  const disposeBrowserTestBridge =
    browserTestModule && development
      ? browserTestModule.installBrowserTestBridge({
          runtime,
          renderer: render.renderer,
          level: levelSystem,
          collision,
          player,
          camera,
          interactions,
          characterSelection,
          characterVisual,
          characterPicker,
          debug: development.debug,
          errors: development.errors,
        })
      : undefined;

  installHotDisposal(runtime, assets, development, () => {
    disposeBrowserTestBridge?.();
    for (const unregister of debugUnregister) unregister();
    worldEvents.clear();
  });
}

function registerVerticalSliceDebug(
  development: import('./debug/setupDevelopmentTools').DevelopmentTools,
  level: LevelSystem,
  player: PlayerControllerSystem,
  camera: ThirdPersonCameraSystem,
  interactions: InteractionSystem,
  characterSelection: CharacterSelectionStore,
  characterVisual: CharacterPlayerVisual,
  characterPicker: CharacterPickerSystem,
  interactionDebug?: import('./interactions/InteractionDebugSystem').InteractionDebugSystem,
  characterAlignmentDebug?: import('./debug/CharacterAlignmentDebugSystem').CharacterAlignmentDebugSystem,
): (() => void)[] {
  const { debug, visualHelpers } = development;
  return [
    debug.registerValue({
      id: 'player.character-selected',
      label: 'Selected character',
      group: 'Player',
      read: () => characterVisual.getDebugSnapshot().selectedCharacterId,
    }),
    debug.registerValue({
      id: 'picker.open',
      label: 'Character picker open',
      group: 'Player',
      read: () => characterPicker.getSnapshot().open,
    }),
    debug.registerValue({
      id: 'picker.focused',
      label: 'Picker focused',
      group: 'Player',
      read: () => characterPicker.getSnapshot().focusedCharacterId,
    }),
    debug.registerValue({
      id: 'picker.preview-state',
      label: 'Picker preview',
      group: 'Player',
      read: () => characterPicker.getSnapshot().previewState,
    }),
    debug.registerValue({
      id: 'player.character-loaded',
      label: 'Loaded visual',
      group: 'Player',
      read: () => characterVisual.getDebugSnapshot().loadedVisualId ?? 'none',
    }),
    debug.registerValue({
      id: 'player.character-fallback',
      label: 'Fallback active',
      group: 'Player',
      read: () => characterVisual.getDebugSnapshot().fallbackActive,
    }),
    debug.registerValue({
      id: 'player.character-load-status',
      label: 'Visual load status',
      group: 'Player',
      read: () => characterVisual.getDebugSnapshot().loadStatus,
    }),
    debug.registerValue({
      id: 'player.character-animation',
      label: 'Animation',
      group: 'Player',
      read: () => characterVisual.getDebugSnapshot().animationState,
    }),
    debug.registerValue({
      id: 'player.character-scale',
      label: 'Applied scale',
      group: 'Player',
      read: () => characterVisual.getDebugSnapshot().appliedScale,
    }),
    debug.registerValue({
      id: 'player.character-rotation',
      label: 'Applied rotation',
      group: 'Player',
      read: () => characterVisual.getDebugSnapshot().appliedRotation,
    }),
    debug.registerValue({
      id: 'player.character-offset-y',
      label: 'Vertical offset',
      group: 'Player',
      read: () => characterVisual.getDebugSnapshot().verticalOffset,
    }),
    debug.registerValue({
      id: 'player.character-height',
      label: 'Character height',
      group: 'Player',
      read: () =>
        formatOptionalNumber(
          characterVisual.getAlignmentReport()?.computedHeight,
        ),
    }),
    debug.registerValue({
      id: 'player.character-min-y',
      label: 'Character minimum Y',
      group: 'Player',
      read: () =>
        formatOptionalNumber(
          characterVisual.getAlignmentReport()?.computedMinimumY,
        ),
    }),
    debug.registerValue({
      id: 'player.character-visual-offset',
      label: 'Applied visual offset',
      group: 'Player',
      read: () =>
        formatOptionalNumber(
          characterVisual.getAlignmentReport()?.appliedVisualOffset,
        ),
    }),
    debug.registerValue({
      id: 'player.position',
      label: 'Position',
      group: 'Player',
      read: () => formatVector(player.getPlayerPosition()),
    }),
    debug.registerValue({
      id: 'player.movement',
      label: 'Movement',
      group: 'Player',
      read: () => player.getDebugSnapshot().movementState,
    }),
    debug.registerValue({
      id: 'player.grounded',
      label: 'Grounded',
      group: 'Player',
      read: () => player.getDebugSnapshot().grounded,
    }),
    debug.registerValue({
      id: 'camera.obstructed',
      label: 'Camera obstructed',
      group: 'Player',
      read: () => camera.obstructed,
    }),
    debug.registerValue({
      id: 'interaction.selected',
      label: 'Interaction',
      group: 'Interactions',
      read: () => interactions.getActiveTarget()?.id ?? 'none',
    }),
    debug.registerValue({
      id: 'interaction.candidates',
      label: 'Candidates',
      group: 'Interactions',
      read: () => interactions.getDebugSnapshot().candidates.length,
    }),
    debug.registerValue({
      id: 'level.current',
      label: 'Level',
      group: 'World',
      read: () => level.activeLevel?.id ?? 'loading',
    }),
    debug.registerValue({
      id: 'level.colliders',
      label: 'Colliders',
      group: 'World',
      read: () => level.activeLevel?.staticCollision.length,
    }),
    debug.registerValue({
      id: 'level.spawns',
      label: 'Spawns',
      group: 'World',
      read: () => level.activeLevel?.spawns.length,
    }),
    debug.registerCommand({
      id: 'player.reset',
      label: 'Reset player',
      group: 'Actions',
      run: () => player.reset(),
    }),
    debug.registerCommand({
      id: 'ui.open-character-picker',
      label: 'Open character picker',
      group: 'Actions',
      run: () => characterPicker.open(),
    }),
    debug.registerCommand({
      id: 'player.select-character',
      label: 'Select character',
      group: 'Actions',
      argumentLabel: 'character id',
      run: (id) => {
        if (!id) throw new Error('A character id is required');
        characterSelection.select(id);
      },
    }),
    debug.registerCommand({
      id: 'player.cycle-character',
      label: 'Cycle character',
      group: 'Actions',
      run: () => {
        characterSelection.cycle();
      },
    }),
    debug.registerCommand({
      id: 'player.reload-character',
      label: 'Reload character',
      group: 'Actions',
      run: () => characterVisual.reload(),
    }),
    debug.registerCommand({
      id: 'level.reload',
      label: 'Reload level',
      group: 'Actions',
      run: async () => {
        const id = level.activeLevel?.id;
        if (!id) throw new Error('No level is loaded');
        await level.load(id);
      },
    }),
    debug.registerCommand({
      id: 'player.teleport',
      label: 'Teleport to spawn',
      group: 'Actions',
      argumentLabel: 'spawn id',
      run: (id) => {
        const spawn = level.getSpawn(id || undefined);
        player.teleport(new Vector3(...spawn.position), spawn.rotation?.[1]);
      },
    }),
    visualHelpers.register('collision', {
      setVisible: (visible) => level.setDebugGroupVisible('collision', visible),
    }),
    visualHelpers.register('spawnPoints', {
      setVisible: (visible) => level.setDebugGroupVisible('spawns', visible),
    }),
    visualHelpers.register('triggers', {
      setVisible: (visible) => level.setDebugGroupVisible('triggers', visible),
    }),
    ...(interactionDebug
      ? [visualHelpers.register('interactionRanges', interactionDebug)]
      : []),
    ...(characterAlignmentDebug
      ? [visualHelpers.register('characterAlignment', characterAlignmentDebug)]
      : []),
  ];
}

function formatOptionalNumber(value: number | undefined): string {
  return value === undefined ? 'loading' : value.toFixed(3);
}

function formatVector(value: {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}): string {
  return `${value.x.toFixed(2)}, ${value.y.toFixed(2)}, ${value.z.toFixed(2)}`;
}

function installHotDisposal(
  runtime: GameRuntime,
  assets: ThreeAssetLoader,
  development?: import('./debug/setupDevelopmentTools').DevelopmentTools,
  dispose?: () => void,
): void {
  if (!import.meta.hot) return;
  import.meta.hot.dispose(() => {
    dispose?.();
    runtime.dispose();
    development?.dispose();
    assets.dispose();
  });
}

function showFatalError(mount: HTMLElement, error: unknown): void {
  const message = document.createElement('div');
  message.className = 'fatal-error';
  message.textContent = `Vanta City could not start: ${
    error instanceof Error ? error.message : String(error)
  }`;
  mount.append(message);
}

void bootstrap().catch((error: unknown) => {
  console.error('Failed to initialize Vanta City', error);
});
