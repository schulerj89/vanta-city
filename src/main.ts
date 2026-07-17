import './styles.css';
import { MathUtils, Vector3 } from 'three';
import { AssetCatalog } from './assets/AssetCatalog';
import { ThreeAssetLoader } from './assets/AssetLoader';
import { assetManifest } from './assets/catalog';
import { CharacterLoader } from './characters/CharacterLoader';
import { CharacterPreviewSystem } from './characters/CharacterPreviewSystem';
import { isCharacterActionName } from './characters/CharacterActions';
import {
  ManifestCharacterAvailabilityProbe,
  resolveCharacterPortrait,
} from './characters/CharacterAvailability';
import { CharacterSelectionStore } from './characters/CharacterSelection';
import { characterDefinitions } from './characters/characters';
import { ConversationCoordinator } from './conversations/ConversationCoordinator';
import { conversationCatalog } from './conversations/conversations';
import type { GameSystem } from './core/lifecycle';
import { EventBus } from './core/events';
import { DialoguePortraitResolver } from './dialogue/DialoguePortraitResolver';
import { DialogueSessionController } from './dialogue/DialogueSessionController';
import { DialogueUISystem } from './dialogue/DialogueUISystem';
import { createDialogueSpeakers } from './dialogue/speakers';
import { GameObjectWorld } from './entities/GameObjectWorld';
import { GameRuntime } from './game/GameRuntime';
import type { GameContext } from './game/GameRuntime';
import { InputSystem } from './input/InputSystem';
import {
  characterControlSummary,
  defaultBindings,
  helpControlEntries,
} from './input/defaultBindings';
import { InteractionSystem } from './interactions/InteractionSystem';
import { NpcSystem } from './npcs/NpcSystem';
import { npcCharacterDefinitions, npcDefinitions } from './npcs/npcs';
import { StaticCollisionWorld } from './physics/CollisionWorld';
import { WorldCollisionSystem } from './physics/WorldCollisionSystem';
import { CharacterPlayerVisual } from './player/CharacterPlayerVisual';
import { PlayerControllerSystem } from './player/PlayerControllerSystem';
import { RenderSystem } from './render/RenderSystem';
import { CameraPreferenceStore } from './camera/CameraPreferences';
import { ThirdPersonCameraSystem } from './camera/ThirdPersonCameraSystem';
import { resolveConversationCameraProfile } from './camera/ConversationCameraProfile';
import { InteractionPromptSystem } from './ui/InteractionPromptSystem';
import { CharacterPickerSystem } from './ui/CharacterPickerSystem';
import { LazyHelpOverlaySystem } from './ui/LazyHelpOverlaySystem';
import type { HelpOverlayController } from './ui/LazyHelpOverlaySystem';
import { LoadingScreen } from './ui/LoadingScreen';
import { HealthHudSystem } from './ui/HealthHudSystem';
import { LocationHudSystem } from './ui/LocationHudSystem';
import type { SparringTargetSystem } from './debug/SparringTargetSystem';
import { LevelRegistry } from './world/LevelRegistry';
import { findSpawn } from './world/LevelQueries';
import { LevelSystem } from './world/LevelSystem';
import type { WorldEvents } from './world/WorldEvents';
import { testDistrict } from './world/levels/testDistrict';
import { AccessibilityPreferenceStore } from './accessibility/AccessibilityPreferences';
import type { DiagnosticRecorder } from './debug/DiagnosticRecorder';
import { CharacterEquipment } from './equipment/CharacterEquipment';
import { isEquipmentId } from './equipment/EquipmentDefinition';
import { QuickbarSystem } from './ui/QuickbarSystem';

let activeLoadingScreen: LoadingScreen | undefined;

async function bootstrap(): Promise<void> {
  const mount = document.querySelector<HTMLElement>('#game');
  if (!mount) throw new Error('Game mount element was not found');

  const input = new InputSystem(defaultBindings);
  const render = new RenderSystem(mount);
  const pageParameters = new URLSearchParams(window.location.search);
  let assetFaults:
    import('./debug/DevelopmentAssetFaults').DevelopmentAssetFaults | undefined;
  if (import.meta.env.DEV) {
    const { DevelopmentAssetFaults } =
      await import('./debug/DevelopmentAssetFaults');
    assetFaults = DevelopmentAssetFaults.from(pageParameters);
  }
  const levels = new LevelRegistry([testDistrict]);
  const assetCatalog = new AssetCatalog({
    ...assetManifest,
    ...levels.assetManifest,
  });
  const assets = new ThreeAssetLoader(assetCatalog, undefined, assetFaults);
  const loading = new LoadingScreen(mount, assets);
  activeLoadingScreen = loading;
  const runtime = new GameRuntime(input);
  const prefersReducedMotion =
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const accessibility = new AccessibilityPreferenceStore(window.localStorage, {
    reducedCameraMotion: prefersReducedMotion,
    dialogueTypewriter: !prefersReducedMotion,
  });
  const developmentParameters = import.meta.env.DEV
    ? pageParameters
    : undefined;
  let development:
    import('./debug/setupDevelopmentTools').DevelopmentTools | undefined;
  let browserTestModule: typeof import('./debug/BrowserTestBridge') | undefined;
  let performanceUnregister: (() => void)[] = [];

  if (import.meta.env.DEV) {
    const [{ setupDevelopmentTools }, performance] = await Promise.all([
      import('./debug/setupDevelopmentTools'),
      import('./debug/PerformanceDiagnostics'),
    ]);
    development = setupDevelopmentTools(
      mount,
      runtime,
      input,
      developmentParameters?.get('debug') === '1',
    );
    const runtimeTiming = new performance.DevelopmentRuntimeDiagnostics();
    const rendererTiming = new performance.DevelopmentRendererDiagnostics();
    runtime.setPerformanceDiagnostics(runtimeTiming);
    render.setPerformanceDiagnostics(rendererTiming);
    performanceUnregister = performance.registerPerformanceDiagnostics(
      development.debug,
      {
        render,
        runtime,
        assets,
        loading,
        faults: assetFaults!,
        rendererTiming,
        runtimeTiming,
      },
    );

    if (developmentParameters?.get('e2e') === '1') {
      browserTestModule = await import('./debug/BrowserTestBridge');
    }

    const sandboxId = developmentParameters?.get('sandbox');
    if (sandboxId) {
      const { loadSandboxScenario } =
        await import('./sandbox/loadSandboxScenario');
      const sandbox: GameSystem<GameContext> = loadSandboxScenario(sandboxId, {
        mount,
        scene: render.scene,
        camera: render.camera,
        input,
        assets,
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
      loading.complete();
      installHotDisposal(runtime, assets, development, () => {
        for (const unregister of performanceUnregister) unregister();
        loading.dispose();
      });
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
    'casual',
    window.localStorage,
  );
  const playerEquipment = new CharacterEquipment('player');
  const characterVisual = new CharacterPlayerVisual(
    characterSelection,
    new CharacterLoader(assets),
    playerEquipment,
  );
  const characterPicker = new CharacterPickerSystem(
    mount,
    characterSelection,
    new ManifestCharacterAvailabilityProbe(assetCatalog),
    new CharacterPreviewSystem(new CharacterLoader(assets)),
  );
  const cameraReference: { current?: ThirdPersonCameraSystem } = {};
  const player = new PlayerControllerSystem(
    objects,
    collision,
    new Vector3(...spawn.position),
    undefined,
    () => cameraReference.current?.getYaw() ?? 0,
    characterVisual,
    spawn.rotation?.[1] ?? 0,
    playerEquipment,
  );
  const quickbar = new QuickbarSystem(mount, playerEquipment);
  const camera = new ThirdPersonCameraSystem(
    render.camera,
    input,
    player,
    collision,
    undefined,
    new CameraPreferenceStore(window.localStorage),
    accessibility,
  );
  cameraReference.current = camera;
  input.setPointerTarget(render.renderer.domElement);
  const help = new LazyHelpOverlaySystem(
    mount,
    runtime,
    helpControlEntries,
    accessibility,
  );
  const interactions = new InteractionSystem(
    input,
    runtime.state,
    player,
    collision,
  );
  let interactionScenario:
    | import('./interactions/InteractionReliabilityScenario').InteractionReliabilityScenario
    | undefined;
  if (
    development &&
    developmentParameters?.get('interactionScenario') === '1'
  ) {
    const { InteractionReliabilityScenario } =
      await import('./interactions/InteractionReliabilityScenario');
    interactionScenario = new InteractionReliabilityScenario(
      interactions,
      collision,
      development.debug,
    );
  }
  const conversations = new ConversationCoordinator(
    conversationCatalog,
    runtime.state,
  );
  const npcFixturesEnabled =
    import.meta.env.DEV && developmentParameters?.get('npcFixtures') === '1';
  const activeNpcDefinitions = npcFixturesEnabled ? npcDefinitions : [];
  const npcs = new NpcSystem(
    activeNpcDefinitions,
    npcCharacterDefinitions,
    new CharacterLoader(assets),
    objects,
    interactions,
    conversations,
    player,
    levelSystem,
    worldEvents,
  );
  let sparringTarget: SparringTargetSystem | undefined;
  if (development) {
    const { SparringTargetSystem } =
      await import('./debug/SparringTargetSystem');
    sparringTarget = new SparringTargetSystem(
      new CharacterLoader(assets),
      objects,
      player,
      levelSystem,
      {
        camera,
        fixtureEnabled: developmentParameters?.get('sparringFixture') === '1',
        gameplayAvailable: () =>
          runtime.state.current === 'playing' && !input.isUiFocused(),
      },
    );
  }
  const healthHud = new HealthHudSystem(
    mount,
    player.health,
    sparringTarget ?? {
      getHealth: () => undefined,
      getHealthAnchor: () => undefined,
    },
    render.camera,
    collision,
  );
  const locationHud = new LocationHudSystem(mount, player, levelSystem);
  const unregisterCombatVolumes =
    development && sparringTarget
      ? development.visualHelpers.register('combatVolumes', {
          setVisible: (visible) =>
            sparringTarget?.setVisualizationVisible(visible),
        })
      : undefined;
  let dialogueCamera:
    ReturnType<ThirdPersonCameraSystem['requestConversation']> | undefined;
  const dialogue = new DialogueSessionController(input, conversations, {
    typewriterEnabled:
      pageParameters.get('dialogueTypewriter') === '0'
        ? false
        : accessibility.current.dialogueTypewriter,
    cameraHooks: {
      onDialogueStarted: (session) => {
        dialogueCamera?.release();
        const npcPose = npcs.getWorldPoseSource(session.npcId);
        const npcDefinition = npcs.getDefinition(session.npcId);
        player.setPresentationFacingTarget(npcPose);
        dialogueCamera = camera.requestConversation(
          `dialogue:${session.definition.id}`,
          npcPose,
          undefined,
          resolveConversationCameraProfile(
            npcDefinition?.conversationCameraProfileId,
          ),
        );
      },
      onDialogueEnded: () => {
        dialogueCamera?.release();
        dialogueCamera = undefined;
        player.setPresentationFacingTarget();
      },
    },
  });
  const unsubscribeAccessibility = accessibility.subscribe((preferences) => {
    dialogue.setTypewriterEnabled(preferences.dialogueTypewriter);
  });
  let inputInspector:
    | import('./debug/InputOwnershipInspector').InputOwnershipInspector
    | undefined;
  if (development) {
    const { InputOwnershipInspector } =
      await import('./debug/InputOwnershipInspector');
    inputInspector = new InputOwnershipInspector(
      input,
      runtime.state,
      help,
      characterPicker,
      dialogue,
      accessibility,
      development.debug,
    );
  }
  const dialoguePortraits = new DialoguePortraitResolver(
    await createDialogueSpeakers(activeNpcDefinitions, assetCatalog),
    {
      getSelectedIdentity: () => {
        const definition = characterSelection.getSelectedDefinition();
        const portrait = resolveCharacterPortrait(definition, assetCatalog);
        return {
          displayName: definition.displayName,
          ...(portrait.kind === 'asset' ? { portraitSrc: portrait.url } : {}),
        };
      },
    },
  );
  const dialogueUI = new DialogueUISystem(mount, dialogue, dialoguePortraits);
  interactions.register({
    id: 'interaction.signal-controller',
    prompt: 'Inspect signal controller',
    location: () => {
      const [x, y, z] = levelSystem.getLocation(
        'interaction.signal-controller',
      ).position;
      return { x, y, z };
    },
    rangeProfile: 'inspect',
    repeatable: false,
    collisionIgnoreIds: ['c.signal-controller'],
    interact: () => {
      player.triggerCharacterAction(
        'interact',
        'interaction:signal-controller',
      );
    },
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

  const debugUnregister =
    development && sparringTarget
      ? registerVerticalSliceDebug(
          development,
          levelSystem,
          collision,
          player,
          camera,
          interactions,
          characterSelection,
          characterVisual,
          characterPicker,
          npcs,
          sparringTarget,
          conversations,
          dialogue,
          dialogueUI,
          interactionDebug,
          characterAlignmentDebug,
          help,
          quickbar,
        )
      : [];

  let diagnosticRecorder: DiagnosticRecorder | undefined;
  if (development) {
    const { DiagnosticRecorder } = await import('./debug/DiagnosticRecorder');
    diagnosticRecorder = new DiagnosticRecorder({
      debug: development.debug,
      state: runtime.state,
      stateEvents: runtime.events,
      player,
      character: characterVisual,
      camera,
      interactions,
      conversations,
      dialogue,
      errors: development.errors,
    });
  }

  runtime.register(input);
  if (inputInspector) runtime.register(inputInspector);
  if (development) runtime.register(development.systems[0]!);
  runtime
    .register(worldCollision)
    .register(levelSystem)
    .register(objects)
    .register(help)
    .register(player);
  if (sparringTarget) runtime.register(sparringTarget);
  runtime
    .register(camera)
    .register(healthHud)
    .register(quickbar)
    .register(locationHud)
    .register(interactions)
    .register(conversations)
    .register(npcs);
  if (interactionScenario) runtime.register(interactionScenario);
  runtime
    .register(dialogue)
    .register(dialogueUI)
    .register(new InteractionPromptSystem(mount, interactions))
    .register(characterPicker);
  if (interactionDebug) runtime.register(interactionDebug);
  if (characterAlignmentDebug) runtime.register(characterAlignmentDebug);
  runtime.register(render);
  if (diagnosticRecorder) runtime.register(diagnosticRecorder);
  for (const system of development?.systems.slice(1) ?? []) {
    runtime.register(system);
  }

  try {
    await runtime.init({
      onSystemInitialized: (systemId) => {
        if (systemId === levelSystem.id) loading.markWorldReady();
        if (systemId === player.id) {
          loading.markCharacterReady(
            characterVisual.getDebugSnapshot().fallbackActive,
          );
        }
      },
    });
  } catch (error) {
    development?.errors.report('runtime initialization', error);
    loading.fail(error);
    throw error;
  }

  const disposeBrowserTestBridge =
    browserTestModule &&
    development &&
    sparringTarget &&
    inputInspector &&
    diagnosticRecorder
      ? browserTestModule.installBrowserTestBridge({
          runtime,
          render,
          assets,
          loading,
          assetFaults,
          level: levelSystem,
          collision,
          player,
          camera,
          interactions,
          npcs,
          npcDefinitions: activeNpcDefinitions,
          sparringTarget,
          healthHud,
          quickbar,
          locationHud,
          conversations,
          characterSelection,
          characterVisual,
          characterPicker,
          help,
          dialogue,
          dialogueUI,
          debug: development.debug,
          errors: development.errors,
          inputInspector,
          diagnostics: diagnosticRecorder,
        })
      : undefined;

  // Install opt-in browser observability before opening the initial picker so
  // tests cannot observe the dialog one microtask before the bridge exists.
  loading.complete();
  if (pageParameters.get('skipPicker') !== '1') characterPicker.open();

  installHotDisposal(runtime, assets, development, () => {
    unsubscribeAccessibility();
    disposeBrowserTestBridge?.();
    for (const unregister of debugUnregister) unregister();
    unregisterCombatVolumes?.();
    for (const unregister of performanceUnregister) unregister();
    worldEvents.clear();
    loading.dispose();
  });
}

function registerVerticalSliceDebug(
  development: import('./debug/setupDevelopmentTools').DevelopmentTools,
  level: LevelSystem,
  collision: StaticCollisionWorld,
  player: PlayerControllerSystem,
  camera: ThirdPersonCameraSystem,
  interactions: InteractionSystem,
  characterSelection: CharacterSelectionStore,
  characterVisual: CharacterPlayerVisual,
  characterPicker: CharacterPickerSystem,
  npcs: NpcSystem,
  sparringTarget: SparringTargetSystem,
  conversations: ConversationCoordinator,
  dialogue: DialogueSessionController,
  dialogueUI: DialogueUISystem,
  interactionDebug?: import('./interactions/InteractionDebugSystem').InteractionDebugSystem,
  characterAlignmentDebug?: import('./debug/CharacterAlignmentDebugSystem').CharacterAlignmentDebugSystem,
  help?: HelpOverlayController,
  quickbar?: QuickbarSystem,
): (() => void)[] {
  const { debug, visualHelpers, sections } = development;
  const npcDebug = npcDefinitions.flatMap((definition) => {
    const read = <Value>(
      select: (
        snapshot: NonNullable<ReturnType<NpcSystem['getDebugSnapshot']>>,
      ) => Value,
      fallback: Value,
    ): Value => {
      const snapshot = npcs.getDebugSnapshot(definition.id);
      return snapshot ? select(snapshot) : fallback;
    };
    return [
      debug.registerValue({
        id: `npc.${definition.id}.id`,
        label: `${definition.displayName} · NPC ID`,
        group: sections.characters,
        read: () => read(({ npcId }) => npcId, 'loading'),
      }),
      debug.registerValue({
        id: `npc.${definition.id}.equipment`,
        label: `${definition.displayName} · Equipment`,
        group: sections.characters,
        read: () =>
          read(
            ({ equipment, equipmentPresentation }) =>
              `${equipment.equippedId ?? 'none'} · ${equipmentPresentation.attached ? equipmentPresentation.socketName : equipmentPresentation.compatible ? 'pending' : 'incompatible'}`,
            'none',
          ),
      }),
      debug.registerValue({
        id: `npc.${definition.id}.definition`,
        label: `${definition.displayName} · Definition ID`,
        group: sections.characters,
        read: () => read(({ definitionId }) => definitionId, definition.id),
      }),
      debug.registerValue({
        id: `npc.${definition.id}.spawn`,
        label: `${definition.displayName} · Spawn point`,
        group: sections.world,
        read: () => read(({ spawnId }) => spawnId, definition.spawnId),
      }),
      debug.registerValue({
        id: `npc.${definition.id}.animation`,
        label: `${definition.displayName} · Animation`,
        group: sections.characters,
        read: () => read(({ currentAnimation }) => currentAnimation, 'loading'),
      }),
      debug.registerValue({
        id: `npc.${definition.id}.source`,
        label: 'Model source',
        group: sections.characters,
        read: () => read(({ modelSource }) => modelSource, 'pending'),
      }),
      debug.registerValue({
        id: `npc.${definition.id}.gesture`,
        label: 'Last gesture',
        group: sections.characters,
        read: () =>
          read(
            ({ gestureActive, lastGestureSource }) =>
              lastGestureSource
                ? `${gestureActive ? 'active' : 'complete'} · ${lastGestureSource}`
                : 'none',
            'none',
          ),
      }),
      debug.registerValue({
        id: `npc.${definition.id}.grounding`,
        label: 'Visual ground / height',
        group: sections.collision,
        read: () =>
          read(
            ({ visualBounds }) =>
              visualBounds
                ? `${visualBounds.groundedMinY.toFixed(3)} / ${visualBounds.height.toFixed(3)}`
                : 'pending',
            'pending',
          ),
      }),
      debug.registerValue({
        id: `npc.${definition.id}.interaction`,
        label: `${definition.displayName} · Interaction`,
        group: sections.interactions,
        read: () => read(({ interactionState }) => interactionState, 'loading'),
      }),
      debug.registerValue({
        id: `npc.${definition.id}.conversation`,
        label: `${definition.displayName} · Conversation`,
        group: sections.dialogue,
        read: () => read(({ conversationState }) => conversationState, 'idle'),
      }),
      debug.registerValue({
        id: `npc.${definition.id}.fallback`,
        label: `${definition.displayName} · Model fallback`,
        group: sections.characters,
        read: () => read(({ modelFallback }) => modelFallback, true),
      }),
    ];
  });
  let cameraPreview:
    ReturnType<ThirdPersonCameraSystem['requestCamera']> | undefined;
  return [
    () => cameraPreview?.release(),
    ...npcDebug,
    debug.registerValue({
      id: 'player.run-mode',
      label: 'Run mode',
      group: sections.player,
      read: () => player.getDebugSnapshot().runMode,
    }),
    debug.registerValue({
      id: 'player.health',
      label: 'Player health',
      group: sections.player,
      read: () => {
        const health = player.health.getSnapshot();
        return `${health.current}/${health.maximum} · ${health.alive ? 'alive' : 'depleted'} · ${(health.normalized * 100).toFixed(0)}%`;
      },
    }),
    debug.registerValue({
      id: 'player.equipment',
      label: 'Equipped item',
      group: sections.player,
      read: () => {
        const snapshot = characterVisual.getDebugSnapshot();
        return `${snapshot.equipment.equippedId ?? 'none'} · ${snapshot.equipmentPresentation.attached ? snapshot.equipmentPresentation.socketName : snapshot.equipmentPresentation.compatible ? 'pending' : 'incompatible'}`;
      },
    }),
    debug.registerValue({
      id: 'player.roll',
      label: 'Directional roll',
      group: sections.player,
      read: () => {
        const roll = player.getDebugSnapshot().roll;
        return `${roll.active ? 'active' : 'idle'} · ${roll.actualDistance.toFixed(2)}/${roll.requestedDistance.toFixed(2)} m${roll.blocked ? ` · blocked ${roll.blockedBy ?? ''}` : ''}${roll.latestRejection ? ` · rejected ${roll.latestRejection}` : ''}`;
      },
    }),
    debug.registerValue({
      id: 'player.fire-ammo',
      label: 'Fire / ammunition',
      group: sections.player,
      read: () => {
        const snapshot = player.getDebugSnapshot();
        const ammo = snapshot.equipment.ammunition.handgun;
        return `${snapshot.fire.holding ? 'held' : 'released'} · ${ammo?.current ?? 0}/${ammo?.max ?? 0} · ${snapshot.fire.acceptedShotCount} shots${snapshot.fire.latestRejection ? ` · ${snapshot.fire.latestRejection}` : ''}`;
      },
    }),
    debug.registerValue({
      id: 'player.quickbar',
      label: 'Quickbar',
      group: sections.player,
      read: () => {
        const snapshot = quickbar?.getSnapshot();
        return snapshot
          ? `${snapshot.slotCount} slots · ${snapshot.selectedSlot ?? 'none'} selected`
          : 'unavailable';
      },
    }),
    debug.registerValue({
      id: 'player.death-presentation',
      label: 'Death presentation',
      group: sections.characters,
      read: () => {
        const death = characterVisual.getDebugSnapshot().death;
        return death.depleted
          ? death.nativeClip
            ? 'native clip'
            : `fade fallback · ${death.opacity.toFixed(2)}`
          : 'alive';
      },
    }),
    debug.registerValue({
      id: 'controls.bindings',
      label: 'Bindings',
      group: sections.player,
      read: () => characterControlSummary,
    }),
    debug.registerValue({
      id: 'controls.help-open',
      label: 'Help open',
      group: sections.player,
      read: () => help?.getSnapshot().open ?? false,
    }),
    debug.registerValue({
      id: 'conversation.active-npc',
      label: 'Active NPC',
      group: sections.dialogue,
      read: () => conversations.active?.npcId ?? 'none',
    }),
    debug.registerValue({
      id: 'conversation.active-id',
      label: 'Conversation ID',
      group: sections.dialogue,
      read: () => conversations.active?.definition.id ?? 'none',
    }),
    debug.registerValue({
      id: 'player.character-selected',
      label: 'Selected character',
      group: sections.characters,
      read: () => characterVisual.getDebugSnapshot().selectedCharacterId,
    }),
    debug.registerValue({
      id: 'picker.open',
      label: 'Character picker open',
      group: sections.characters,
      read: () => characterPicker.getSnapshot().open,
    }),
    debug.registerValue({
      id: 'picker.focused',
      label: 'Picker focused',
      group: sections.characters,
      read: () => characterPicker.getSnapshot().focusedCharacterId,
    }),
    debug.registerValue({
      id: 'picker.preview-state',
      label: 'Picker preview',
      group: sections.characters,
      read: () => characterPicker.getSnapshot().previewState,
    }),
    debug.registerValue({
      id: 'player.character-loaded',
      label: 'Loaded visual',
      group: sections.characters,
      read: () => characterVisual.getDebugSnapshot().loadedVisualId ?? 'none',
    }),
    debug.registerValue({
      id: 'player.character-fallback',
      label: 'Fallback active',
      group: sections.characters,
      read: () => characterVisual.getDebugSnapshot().fallbackActive,
    }),
    debug.registerValue({
      id: 'player.character-load-status',
      label: 'Visual load status',
      group: sections.characters,
      read: () => characterVisual.getDebugSnapshot().loadStatus,
    }),
    debug.registerValue({
      id: 'player.character-animation',
      label: 'Animation',
      group: sections.characters,
      read: () => characterVisual.getDebugSnapshot().animationState,
    }),
    debug.registerValue({
      id: 'player.character-animation-graph',
      label: 'Animation graph',
      group: sections.characters,
      read: () => {
        const graph = characterVisual.getDebugSnapshot().animationGraph;
        return `${graph.phase} · ${graph.requestedClip} → ${graph.resolvedClip ?? 'static'} · ${graph.fallback}`;
      },
    }),
    debug.registerValue({
      id: 'player.character-animation-transition',
      label: 'Animation transition',
      group: sections.characters,
      read: () => {
        const graph = characterVisual.getDebugSnapshot().animationGraph;
        return `${graph.previousLabel ?? 'none'} → ${graph.label} · ${graph.transitionReason} · #${graph.transitionSequence}`;
      },
    }),
    debug.registerValue({
      id: 'player.character-action',
      label: 'Character action',
      group: sections.characters,
      read: () => {
        const action = player.getCharacterActionState();
        return action.active ? `${action.active} · busy` : 'none · ready';
      },
    }),
    debug.registerValue({
      id: 'player.character-action-last',
      label: 'Last action request',
      group: sections.characters,
      read: () => {
        const action = player.getCharacterActionState();
        if (!action.lastRequested) return 'none';
        return `${action.lastRequested} · ${action.lastAccepted ? 'accepted' : (action.lastRejection ?? 'rejected')} · ${action.lastSource ?? 'unknown'}`;
      },
    }),
    debug.registerValue({
      id: 'player.character-action-completion',
      label: 'Last action completion',
      group: sections.characters,
      read: () => {
        const action = player.getCharacterActionState();
        return action.lastCompleted
          ? `${action.lastCompleted} · ${action.completionRelease ?? 'unknown'} · #${action.completedSequence}`
          : 'none';
      },
    }),
    debug.registerValue({
      id: 'player.character-action-impact',
      label: 'Last action impact',
      group: sections.characters,
      read: () => {
        const action = player.getCharacterActionState();
        return action.lastImpact
          ? `${action.lastImpact} · ${(action.impactNormalizedTime ?? 0).toFixed(2)} · #${action.impactSequence}`
          : 'none';
      },
    }),
    debug.registerValue({
      id: 'player.character-action-rejections',
      label: 'Busy action rejections',
      group: sections.characters,
      read: () => player.getCharacterActionState().busyRejectionCount,
    }),
    debug.registerValue({
      id: 'sparring-target.status',
      label: 'Sparring target · status',
      group: sections.characters,
      read: () => {
        const target = sparringTarget.getSnapshot();
        return `${target.enabled ? 'active' : 'inactive'} · ${target.animation} · ${target.feedback} · responses ${target.responseSequence}`;
      },
    }),
    debug.registerValue({
      id: 'sparring-target.range',
      label: 'Sparring target · range / facing',
      group: sections.interactions,
      read: () => {
        const target = sparringTarget.getSnapshot();
        return `${target.distance.toFixed(2)}m · gap ${target.horizontalGap.toFixed(2)}m · vertical ${target.verticalOverlap.toFixed(2)}m · facing ${target.facingDot.toFixed(2)} · ${target.eligible ? 'contact' : (target.rejectionReason ?? 'blocked')}`;
      },
    }),
    debug.registerValue({
      id: 'sparring-target.health',
      label: 'Sparring target · health',
      group: sections.characters,
      read: () => {
        const health = sparringTarget.getSnapshot().health;
        return health
          ? `${health.current}/${health.maximum} · ${health.alive ? 'alive' : 'depleted'} · changes ${health.changeSequence}`
          : 'pending';
      },
    }),
    debug.registerValue({
      id: 'sparring-target.engagement',
      label: 'Sparring target · camera engagement',
      group: sections.interactions,
      read: () => {
        const engagement = sparringTarget.getSnapshot().engagement;
        return `${engagement.engaged ? 'engaged' : 'disengaged'} · ${engagement.distance.toFixed(2)}/${engagement.distanceLimit.toFixed(2)}m · focus ${engagement.cameraRequested ? engagement.cameraDistance.toFixed(2) : 'off'}`;
      },
    }),
    debug.registerValue({
      id: 'sparring-target.feedback',
      label: 'Sparring target · impact feedback',
      group: sections.interactions,
      read: () => {
        const target = sparringTarget.getSnapshot();
        return `${target.feedback} · impacts ${target.impactSequence} · ignored ${target.ignoredSequence}${target.lastIgnoredReason ? ` (${target.lastIgnoredReason})` : ''}`;
      },
    }),
    debug.registerValue({
      id: 'sparring-target.grounding',
      label: 'Sparring target · ground / height',
      group: sections.collision,
      read: () => {
        const target = sparringTarget.getSnapshot();
        return target.groundedMinY === undefined || target.height === undefined
          ? 'pending'
          : `${target.groundedMinY.toFixed(3)} / ${target.height.toFixed(3)}`;
      },
    }),
    debug.registerToggle({
      id: 'sparring-target.active',
      label: 'Activate debug sparring target',
      group: sections.actions,
      initialValue: false,
      onChange: (enabled) => sparringTarget.setEnabled(enabled),
    }),
    debug.registerCommand({
      id: 'sparring-target.reset',
      label: 'Reset debug sparring target',
      group: sections.actions,
      run: () => sparringTarget.reset(),
    }),
    debug.registerCommand({
      id: 'sparring-target.teleport-position',
      label: 'Teleport sparring target',
      group: sections.actions,
      argumentLabel: 'x,y,z,yaw',
      run: (value) => {
        const [rawX = '', rawY = '', rawZ = '', rawYaw] = (value ?? '').split(
          ',',
        );
        const x = Number(rawX);
        const y = Number(rawY);
        const z = Number(rawZ);
        const yaw = Number(rawYaw);
        if (![x, y, z].every(Number.isFinite)) {
          throw new Error('Expected x,y,z and optional yaw');
        }
        sparringTarget.teleport(
          { x, y, z },
          Number.isFinite(yaw) ? yaw : undefined,
        );
      },
    }),
    debug.registerCommand({
      id: 'player.health-damage',
      label: 'Damage player health (10)',
      group: sections.actions,
      run: () => {
        player.health.damage(10, 'debug-command');
      },
    }),
    debug.registerCommand({
      id: 'player.health-heal',
      label: 'Heal player health (10)',
      group: sections.actions,
      run: () => {
        player.health.heal(10, 'debug-command');
      },
    }),
    debug.registerCommand({
      id: 'player.health-reset',
      label: 'Reset player health',
      group: sections.actions,
      run: () => {
        player.health.reset('debug-command');
      },
    }),
    debug.registerCommand({
      id: 'player.health-deplete',
      label: 'Deplete player health',
      group: sections.actions,
      run: () => {
        player.health.set(0, 'debug-command');
      },
    }),
    debug.registerCommand({
      id: 'sparring-target.health-damage',
      label: 'Damage sparring target health (10)',
      group: sections.actions,
      run: () => {
        sparringTarget.getHealth()?.damage(10, 'debug-command');
      },
    }),
    debug.registerCommand({
      id: 'sparring-target.health-heal',
      label: 'Heal sparring target health (10)',
      group: sections.actions,
      run: () => {
        sparringTarget.getHealth()?.heal(10, 'debug-command');
      },
    }),
    debug.registerCommand({
      id: 'sparring-target.health-deplete',
      label: 'Deplete sparring target health',
      group: sections.actions,
      run: () => {
        sparringTarget.getHealth()?.set(0, 'debug-command');
      },
    }),
    debug.registerValue({
      id: 'player.character-scale',
      label: 'Applied scale',
      group: sections.characters,
      read: () => characterVisual.getDebugSnapshot().appliedScale,
    }),
    debug.registerValue({
      id: 'player.character-rotation',
      label: 'Applied rotation',
      group: sections.characters,
      read: () => characterVisual.getDebugSnapshot().appliedRotation,
    }),
    debug.registerValue({
      id: 'player.character-offset-y',
      label: 'Vertical offset',
      group: sections.characters,
      read: () => characterVisual.getDebugSnapshot().verticalOffset,
    }),
    debug.registerValue({
      id: 'player.character-height',
      label: 'Character height',
      group: sections.characters,
      read: () =>
        formatOptionalNumber(
          characterVisual.getAlignmentReport()?.computedHeight,
        ),
    }),
    debug.registerValue({
      id: 'player.character-min-y',
      label: 'Character minimum Y',
      group: sections.characters,
      read: () =>
        formatOptionalNumber(
          characterVisual.getAlignmentReport()?.computedMinimumY,
        ),
    }),
    debug.registerValue({
      id: 'player.character-visual-offset',
      label: 'Applied visual offset',
      group: sections.characters,
      read: () =>
        formatOptionalNumber(
          characterVisual.getAlignmentReport()?.appliedVisualOffset,
        ),
    }),
    debug.registerValue({
      id: 'player.position',
      label: 'Position',
      group: sections.player,
      read: () => formatVector(player.getPlayerPosition()),
    }),
    debug.registerValue({
      id: 'player.movement',
      label: 'Movement',
      group: sections.player,
      read: () => player.getDebugSnapshot().movementState,
    }),
    debug.registerValue({
      id: 'player.heading-desired',
      label: 'Desired heading',
      group: sections.player,
      read: () =>
        `${MathUtils.radToDeg(player.getDebugSnapshot().desiredFacingYaw).toFixed(1)}°`,
    }),
    debug.registerValue({
      id: 'player.heading-current',
      label: 'Current heading',
      group: sections.player,
      read: () =>
        `${MathUtils.radToDeg(player.getDebugSnapshot().facingYaw).toFixed(1)}°`,
    }),
    debug.registerValue({
      id: 'player.heading-error',
      label: 'Signed heading error',
      group: sections.player,
      read: () =>
        `${MathUtils.radToDeg(player.getDebugSnapshot().facingError).toFixed(1)}°`,
    }),
    debug.registerValue({
      id: 'player.heading-turn-rate',
      label: 'Heading turn rate',
      group: sections.player,
      read: () =>
        `${MathUtils.radToDeg(player.getDebugSnapshot().facingTurnRate).toFixed(1)}°/s`,
    }),
    debug.registerValue({
      id: 'player.heading-smoothing',
      label: 'Heading smoothing',
      group: sections.player,
      read: () => player.getDebugSnapshot().facingSmoothingActive,
    }),
    debug.registerValue({
      id: 'player.grounded',
      label: 'Grounded',
      group: sections.player,
      read: () => player.getDebugSnapshot().grounded,
    }),
    debug.registerValue({
      id: 'camera.mode',
      label: 'Mode',
      group: sections.camera,
      read: () => camera.getDebugSnapshot().mode,
    }),
    debug.registerValue({
      id: 'camera.owner',
      label: 'Owner',
      group: sections.camera,
      read: () => camera.getDebugSnapshot().owner,
    }),
    debug.registerValue({
      id: 'camera.yaw-pitch',
      label: 'Yaw / pitch',
      group: sections.camera,
      read: () => {
        const { yaw, pitch } = camera.getDebugSnapshot();
        return `${MathUtils.radToDeg(yaw).toFixed(1)}° / ${MathUtils.radToDeg(pitch).toFixed(1)}°`;
      },
    }),
    debug.registerValue({
      id: 'camera.distance',
      label: 'Desired / actual distance',
      group: sections.camera,
      read: () => {
        const snapshot = camera.getDebugSnapshot();
        return `${snapshot.desiredDistance.toFixed(2)} / ${snapshot.actualDistance.toFixed(2)}`;
      },
    }),
    debug.registerValue({
      id: 'camera.shoulder',
      label: 'Shoulder',
      group: sections.camera,
      read: () => camera.getDebugSnapshot().shoulderSide,
    }),
    debug.registerValue({
      id: 'camera.target',
      label: 'Target',
      group: sections.camera,
      read: () => formatVector(camera.getDebugSnapshot().target),
    }),
    debug.registerValue({
      id: 'camera.anchor',
      label: 'Anchor',
      group: sections.camera,
      read: () => camera.getDebugSnapshot().activeAnchorId ?? 'none',
    }),
    debug.registerValue({
      id: 'camera.transition',
      label: 'Transition',
      group: sections.camera,
      read: () => camera.getDebugSnapshot().transitionProgress.toFixed(2),
    }),
    debug.registerValue({
      id: 'camera.obstructed',
      label: 'Obstructed',
      group: sections.camera,
      read: () => camera.getDebugSnapshot().obstructed,
    }),
    debug.registerValue({
      id: 'camera.horizontal-sensitivity',
      label: 'Horizontal sensitivity',
      group: sections.camera,
      read: () => camera.preferences.current.horizontalSensitivity,
    }),
    debug.registerValue({
      id: 'camera.vertical-sensitivity',
      label: 'Vertical sensitivity',
      group: sections.camera,
      read: () => camera.preferences.current.verticalSensitivity,
    }),
    debug.registerToggle({
      id: 'camera.invert-y',
      label: 'Invert Y',
      group: sections.actions,
      initialValue: camera.preferences.current.invertY,
      onChange: (enabled) => camera.setPreferences({ invertY: enabled }),
    }),
    debug.registerToggle({
      id: 'camera.automatic-recenter',
      label: 'Automatic recenter',
      group: sections.actions,
      initialValue: camera.preferences.current.automaticRecenter,
      onChange: (enabled) =>
        camera.setPreferences({ automaticRecenter: enabled }),
    }),
    debug.registerCommand({
      id: 'camera.set-horizontal-sensitivity',
      label: 'Set horizontal sensitivity',
      group: sections.actions,
      argumentLabel: '0.0005–0.01',
      run: (value) => {
        camera.setPreferences({
          horizontalSensitivity: parseCameraSetting(value),
        });
      },
    }),
    debug.registerCommand({
      id: 'camera.set-vertical-sensitivity',
      label: 'Set vertical sensitivity',
      group: sections.actions,
      argumentLabel: '0.0005–0.01',
      run: (value) => {
        camera.setPreferences({
          verticalSensitivity: parseCameraSetting(value),
        });
      },
    }),
    debug.registerCommand({
      id: 'camera.set-follow-distance',
      label: 'Set follow distance',
      group: sections.actions,
      argumentLabel: `${camera.config.minDistance}–${camera.config.maxDistance}`,
      run: (value) => {
        camera.setPreferences({ followDistance: parseCameraSetting(value) });
      },
    }),
    debug.registerCommand({
      id: 'camera.set-shoulder',
      label: 'Set shoulder',
      group: sections.actions,
      argumentLabel: 'left or right',
      run: (value) => {
        if (value !== 'left' && value !== 'right') {
          throw new Error('Shoulder must be "left" or "right"');
        }
        camera.setPreferences({ shoulderSide: value });
      },
    }),
    debug.registerValue({
      id: 'interaction.selected',
      label: 'Interaction',
      group: sections.interactions,
      read: () => interactions.getActiveTarget()?.id ?? 'none',
    }),
    debug.registerValue({
      id: 'interaction.candidates',
      label: 'Candidates',
      group: sections.interactions,
      read: () => interactions.getDebugSnapshot().candidates.length,
    }),
    debug.registerValue({
      id: 'interaction.scoring',
      label: 'Current / challenger / decision',
      group: sections.interactions,
      read: () => {
        const snapshot = interactions.getDebugSnapshot();
        const current = snapshot.candidates.find(
          ({ target }) => target.id === snapshot.selectedId,
        );
        const challenger = snapshot.candidates.find(
          ({ target }) => target.id === snapshot.challengerId,
        );
        return `${snapshot.selectedId ?? 'none'} ${current?.score.toFixed(2) ?? '-'} / ${snapshot.challengerId ?? 'none'} ${challenger?.score.toFixed(2) ?? '-'} / ${snapshot.selectionDecision}`;
      },
    }),
    debug.registerValue({
      id: 'interaction.rejections',
      label: 'LOS / rejected targets',
      group: sections.interactions,
      read: () =>
        interactions
          .getDebugSnapshot()
          .targets.filter(({ rejectionReason }) => rejectionReason)
          .map(
            ({ id, rejectionReason, blockerId }) =>
              `${id}: ${rejectionReason}${blockerId ? ` (${blockerId})` : ''}`,
          )
          .join(', ') || 'none',
    }),
    debug.registerValue({
      id: 'interaction.measurements',
      label: 'Distance / allowed / profile / LOS / facing',
      group: sections.interactions,
      read: () =>
        interactions
          .getDebugSnapshot()
          .targets.map(
            ({
              id,
              distance,
              range,
              rangeProfile,
              rangeSource,
              lineOfSight,
              facing,
              rejectionReason,
            }) =>
              `${id}: ${distance?.toFixed(2) ?? '-'} / ${range.toFixed(2)} ${rangeProfile}:${rangeSource} LOS=${lineOfSight} face=${facing?.toFixed(2) ?? '-'} ${rejectionReason ?? 'accepted'}`,
          )
          .join(', '),
    }),
    debug.registerValue({
      id: 'level.current',
      label: 'Level',
      group: sections.world,
      read: () => level.activeLevel?.id ?? 'loading',
    }),
    debug.registerValue({
      id: 'level.colliders',
      label: 'Colliders',
      group: sections.collision,
      read: () => level.activeLevel?.staticCollision.length,
    }),
    debug.registerValue({
      id: 'collision.oriented-boxes',
      label: 'Rotated boxes',
      group: sections.collision,
      read: () => collision.getDebugSnapshot().orientedBoxCount,
    }),
    debug.registerValue({
      id: 'collision.last-ground',
      label: 'Ground shape',
      group: sections.collision,
      read: () => collision.getDebugSnapshot().lastGroundColliderId,
    }),
    debug.registerValue({
      id: 'collision.last-blocks',
      label: 'Movement contacts',
      group: sections.collision,
      read: () =>
        collision.getDebugSnapshot().lastCharacterBlockIds.join(', ') || 'none',
    }),
    debug.registerValue({
      id: 'collision.camera-hit',
      label: 'Camera obstruction',
      group: sections.collision,
      read: () => collision.getDebugSnapshot().lastCameraHitId ?? 'none',
    }),
    debug.registerValue({
      id: 'level.spawns',
      label: 'Spawns',
      group: sections.world,
      read: () => level.activeLevel?.spawns.length,
    }),
    debug.registerValue({
      id: 'dialogue.conversation',
      label: 'Active conversation',
      group: sections.dialogue,
      read: () => dialogue.getSnapshot().conversationId ?? 'none',
    }),
    debug.registerValue({
      id: 'dialogue.line-index',
      label: 'Line index',
      group: sections.dialogue,
      read: () => dialogue.getSnapshot().lineIndex ?? 'none',
    }),
    debug.registerValue({
      id: 'dialogue.speaker',
      label: 'Speaker',
      group: sections.dialogue,
      read: () => dialogue.getSnapshot().speakerId ?? 'none',
    }),
    debug.registerValue({
      id: 'dialogue.portrait',
      label: 'Portrait',
      group: sections.dialogue,
      read: () => dialogueUI.getDebugSnapshot().portraitResolution,
    }),
    debug.registerValue({
      id: 'dialogue.state',
      label: 'Dialogue state',
      group: sections.dialogue,
      read: () => dialogue.getSnapshot().state,
    }),
    debug.registerCommand({
      id: 'player.reset',
      label: 'Reset player',
      group: sections.actions,
      run: () => player.reset(),
    }),
    debug.registerCommand({
      id: 'player.play-character-action',
      label: 'Play character action',
      group: sections.actions,
      argumentLabel:
        'wave, interact, punchLeft, punchRight, kickLeft, kickRight, roll, gunFire, or knifeSlash',
      run: (action) => {
        if (!isCharacterActionName(action)) {
          throw new Error(
            'Expected character action: wave, interact, punchLeft, punchRight, kickLeft, kickRight, roll, gunFire, or knifeSlash',
          );
        }
        if (!player.triggerCharacterAction(action, 'debug-command')) {
          const reason = player.getCharacterActionState().lastRejection;
          throw new Error(
            `Character action "${action}" was rejected: ${reason ?? 'unavailable'}`,
          );
        }
      },
    }),
    debug.registerCommand({
      id: 'player.equip-item',
      label: 'Equip player item',
      group: sections.actions,
      argumentLabel: 'handgun, knife, or none',
      run: (value) => {
        if (value === 'none') {
          player.equipment.unequip();
          return;
        }
        if (!isEquipmentId(value))
          throw new Error('Expected handgun, knife, or none');
        player.equipment.equip(value);
      },
    }),
    debug.registerCommand({
      id: 'player.use-equipment',
      label: 'Use equipped player item',
      group: sections.actions,
      run: () => {
        if (!player.useEquippedItem('debug-command')) {
          throw new Error('Equipped item use was rejected');
        }
      },
    }),
    debug.registerCommand({
      id: 'player.reload-equipment',
      label: 'Reload equipped player item',
      group: sections.actions,
      run: () => {
        if (!player.reloadEquippedItem('debug-command')) {
          throw new Error('Equipped item reload was rejected');
        }
      },
    }),
    debug.registerCommand({
      id: 'npc.equip-item',
      label: 'Equip NPC item',
      group: sections.actions,
      argumentLabel: 'npc id,item id',
      run: (value) => {
        const [npcId, itemId] = (value ?? '').split(',');
        if (!npcId || !isEquipmentId(itemId)) {
          throw new Error('Expected npc id and handgun or knife');
        }
        if (!npcs.equip(npcId, itemId))
          throw new Error('NPC equipment rejected');
      },
    }),
    debug.registerCommand({
      id: 'npc.use-equipment',
      label: 'Use NPC equipment',
      group: sections.actions,
      argumentLabel: 'npc id',
      run: (value) => {
        if (!value || !npcs.useEquipment(value, 'debug-command')) {
          throw new Error('NPC equipment use rejected');
        }
      },
    }),
    debug.registerCommand({
      id: 'ui.open-character-picker',
      label: 'Open character picker',
      group: sections.actions,
      run: () => characterPicker.open(),
    }),
    debug.registerCommand({
      id: 'dialogue.start-mack',
      label: 'Start Mack dialogue',
      group: sections.actions,
      run: () => {
        conversations.start('conversation.mack.introduction', 'mack');
      },
    }),
    debug.registerCommand({
      id: 'dialogue.advance',
      label: 'Advance dialogue',
      group: sections.actions,
      run: () => dialogue.advance(),
    }),
    debug.registerCommand({
      id: 'dialogue.set-typewriter',
      label: 'Set typewriter',
      group: sections.actions,
      argumentLabel: 'on / off',
      run: (value) => {
        if (value !== 'on' && value !== 'off') {
          throw new Error('Expected "on" or "off"');
        }
        dialogue.setTypewriterEnabled(value === 'on');
      },
    }),
    debug.registerCommand({
      id: 'player.select-character',
      label: 'Select character',
      group: sections.actions,
      argumentLabel: 'character id',
      run: (id) => {
        if (!id) throw new Error('A character id is required');
        characterSelection.select(id);
      },
    }),
    debug.registerCommand({
      id: 'player.cycle-character',
      label: 'Cycle character',
      group: sections.actions,
      run: () => {
        characterSelection.cycle();
      },
    }),
    debug.registerCommand({
      id: 'player.reload-character',
      label: 'Reload character',
      group: sections.actions,
      run: () => characterVisual.reload(),
    }),
    debug.registerCommand({
      id: 'conversation.end',
      label: 'End conversation',
      group: sections.actions,
      run: () => {
        conversations.end();
      },
    }),
    debug.registerCommand({
      id: 'level.reload',
      label: 'Reload level',
      group: sections.actions,
      run: async () => {
        const id = level.activeLevel?.id;
        if (!id) throw new Error('No level is loaded');
        await level.load(id);
      },
    }),
    debug.registerCommand({
      id: 'player.teleport',
      label: 'Teleport to spawn',
      group: sections.actions,
      argumentLabel: 'spawn id',
      run: (id) => {
        const spawn = level.getSpawn(id || undefined);
        player.teleport(new Vector3(...spawn.position), spawn.rotation?.[1]);
      },
    }),
    debug.registerCommand({
      id: 'player.teleport-position',
      label: 'Teleport to position',
      group: sections.actions,
      argumentLabel: 'x,y,z,yaw',
      run: (value) => {
        const [x, y, z, yaw] = (value ?? '').split(',').map(Number);
        if (![x, y, z].every(Number.isFinite)) {
          throw new Error('Expected x,y,z and optional yaw');
        }
        player.teleport(
          new Vector3(x, y, z),
          Number.isFinite(yaw) ? yaw : undefined,
        );
      },
    }),
    debug.registerCommand({
      id: 'camera.preview-anchor',
      label: 'Preview camera anchor',
      group: sections.actions,
      argumentLabel: 'camera anchor id',
      run: (id) => {
        if (!id) throw new Error('A camera anchor id is required');
        const anchor = level.getCinematicAnchor(id);
        cameraPreview?.release();
        cameraPreview = camera.requestCamera({
          owner: 'debug:camera-anchor-preview',
          mode: 'cinematic',
          anchor: {
            id: anchor.id,
            position: {
              x: anchor.position[0],
              y: anchor.position[1],
              z: anchor.position[2],
            },
            lookAt: {
              x: anchor.lookAt[0],
              y: anchor.lookAt[1],
              z: anchor.lookAt[2],
            },
            fieldOfView: anchor.fieldOfView,
          },
        });
      },
    }),
    debug.registerCommand({
      id: 'camera.release-preview',
      label: 'Release camera anchor preview',
      group: sections.actions,
      run: () => {
        cameraPreview?.release();
        cameraPreview = undefined;
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

function parseCameraSetting(value: string | undefined): number {
  const parsed = Number(value);
  if (!value || !Number.isFinite(parsed)) {
    throw new Error('A finite numeric camera setting is required');
  }
  return parsed;
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

void bootstrap().catch((error: unknown) => {
  activeLoadingScreen?.fail(error);
  console.error('Failed to initialize Vanta City', error);
});
