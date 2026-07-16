import './styles.css';
import { Vector3 } from 'three';
import { AssetCatalog } from './assets/AssetCatalog';
import { ThreeAssetLoader } from './assets/AssetLoader';
import { assetManifest } from './assets/catalog';
import { CharacterLoader } from './characters/CharacterLoader';
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
  const assets = new ThreeAssetLoader(
    new AssetCatalog({ ...assetManifest, ...levels.assetManifest }),
  );
  const runtime = new GameRuntime(input);
  let development:
    import('./debug/setupDevelopmentTools').DevelopmentTools | undefined;

  if (import.meta.env.DEV) {
    const { setupDevelopmentTools } =
      await import('./debug/setupDevelopmentTools');
    const parameters = new URLSearchParams(window.location.search);
    development = setupDevelopmentTools(
      mount,
      runtime,
      input,
      parameters.get('debug') === '1',
    );

    const sandboxId = parameters.get('sandbox');
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
  const characterSelection = new CharacterSelectionStore(
    characterDefinitions,
    'vanta-placeholder',
    window.sessionStorage,
  );
  const characterVisual = new CharacterPlayerVisual(
    characterSelection,
    new CharacterLoader(assets),
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
  if (development) {
    const { InteractionDebugSystem } =
      await import('./interactions/InteractionDebugSystem');
    interactionDebug = new InteractionDebugSystem(render.scene, interactions);
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
        interactionDebug,
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
    .register(new InteractionPromptSystem(mount, interactions));
  if (interactionDebug) runtime.register(interactionDebug);
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

  installHotDisposal(runtime, assets, development, () => {
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
  interactionDebug?: import('./interactions/InteractionDebugSystem').InteractionDebugSystem,
): (() => void)[] {
  const { debug, visualHelpers } = development;
  return [
    debug.registerValue({
      id: 'player.character',
      label: 'Character',
      group: 'Player',
      read: () => characterSelection.getSelectedId(),
    }),
    debug.registerValue({
      id: 'player.character-source',
      label: 'Character source',
      group: 'Player',
      read: () => characterVisual.source,
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
  ];
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
