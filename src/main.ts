import './styles.css';
import './cinematics/cinematics.css';
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
import {
  npcCharacterDefinitions,
  npcDefinitions,
  productionNpcDefinitions,
} from './npcs/npcs';
import { StaticCollisionWorld } from './physics/CollisionWorld';
import { WorldCollisionSystem } from './physics/WorldCollisionSystem';
import { CharacterPlayerVisual } from './player/CharacterPlayerVisual';
import { PlayerControllerSystem } from './player/PlayerControllerSystem';
import { RenderSystem } from './render/RenderSystem';
import {
  CameraPreferenceStore,
  defaultCameraPreferences,
} from './camera/CameraPreferences';
import { ThirdPersonCameraSystem } from './camera/ThirdPersonCameraSystem';
import { resolveConversationCameraProfile } from './camera/ConversationCameraProfile';
import { InteractionPromptSystem } from './ui/InteractionPromptSystem';
import { CharacterPickerSystem } from './ui/CharacterPickerSystem';
import { LazyHelpOverlaySystem } from './ui/LazyHelpOverlaySystem';
import type { HelpOverlayController } from './ui/LazyHelpOverlaySystem';
import { LoadingScreen } from './ui/LoadingScreen';
import { HealthHudSystem } from './ui/HealthHudSystem';
import { LocationHudSystem } from './ui/LocationHudSystem';
import { MinimapHudSystem } from './ui/MinimapHudSystem';
import { FullWorldMapSystem } from './ui/FullWorldMapSystem';
import type { SparringTargetSystem } from './debug/SparringTargetSystem';
import { sparringTargetConfig } from './debug/sparringTarget';
import { LevelRegistry } from './world/LevelRegistry';
import { findSpawn } from './world/LevelQueries';
import { LevelSystem } from './world/LevelSystem';
import { TimeOfDayLightingSystem } from './world/TimeOfDayLightingSystem';
import type { WorldEvents } from './world/WorldEvents';
import { testDistrict } from './world/levels/testDistrict';
import { AccessibilityPreferenceStore } from './accessibility/AccessibilityPreferences';
import type { DiagnosticRecorder } from './debug/DiagnosticRecorder';
import { CharacterEquipment } from './equipment/CharacterEquipment';
import { isEquipmentId } from './equipment/EquipmentDefinition';
import { QuickbarSystem } from './ui/QuickbarSystem';
import { PlayerMoneyAccount } from './economy/PlayerMoneyAccount';
import { MoneyHudSystem } from './ui/MoneyHudSystem';
import { PlayerHudClusterSystem } from './ui/PlayerHudClusterSystem';
import { ScreenSpaceLayoutSystem } from './ui/ScreenSpaceLayoutSystem';
import { PlayerDeathSystem } from './ui/PlayerDeathSystem';
import { HandgunPurchase } from './economy/HandgunPurchase';
import type { DebugCashPickup } from './economy/DebugCashPickup';
import { ProximityPickupSystem } from './pickups/ProximityPickupSystem';
import { TrafficSystem } from './traffic/TrafficSystem';
import { defaultTrafficConfig } from './traffic/TrafficSimulation';
import { VehicleControllerSystem } from './vehicles/VehicleControllerSystem';
import { VehicleHudSystem } from './ui/VehicleHudSystem';
import { WeaponAimSystem } from './combat/WeaponAimSystem';
import { WeaponCombatSystem } from './combat/WeaponCombatSystem';
import { MissionSystem } from './missions/MissionSystem';
import {
  ashfallInitialMissionFacts,
  missionDefinitions,
} from './missions/missions';
import { registerMissionDebug } from './missions/MissionDebug';
import { MissionHudSystem } from './ui/MissionHudSystem';
import { audioCatalog } from './audio/AudioCatalog';
import { AudioPreferenceStore } from './audio/AudioPreferences';
import { AudioPlaybackCoordinator } from './audio/AudioPlaybackCoordinator';
import { CinematicCatalog } from './cinematics/CinematicDefinition';
import { cinematicDefinitions } from './cinematics/cinematics';
import { CinematicCoordinator } from './cinematics/CinematicCoordinator';
import { CinematicPresentationSystem } from './cinematics/CinematicPresentationSystem';

let activeLoadingScreen: LoadingScreen | undefined;

async function bootstrap(): Promise<void> {
  const mount = document.querySelector<HTMLElement>('#game');
  if (!mount) throw new Error('Game mount element was not found');

  const input = new InputSystem(defaultBindings);
  const render = new RenderSystem(mount);
  const uiLayout = new ScreenSpaceLayoutSystem(mount);
  const pageParameters = new URLSearchParams(window.location.search);
  let assetFaults:
    import('./debug/DevelopmentAssetFaults').DevelopmentAssetFaults | undefined;
  if (import.meta.env.DEV) {
    const { DevelopmentAssetFaults } =
      await import('./debug/DevelopmentAssetFaults');
    assetFaults = DevelopmentAssetFaults.from(pageParameters);
  }
  const levels = new LevelRegistry([testDistrict]);
  const initialLevelId = 'test-district';
  const initialLevel = levels.get(initialLevelId);
  const assetCatalog = new AssetCatalog({
    ...assetManifest,
    ...levels.assetManifest,
  });
  const assets = new ThreeAssetLoader(assetCatalog, undefined, assetFaults);
  const loading = new LoadingScreen(uiLayout.zone('presentation'), assets);
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
        uiLayout,
        assets,
        debug: development.debug,
        visualHelpers: development.visualHelpers,
      });
      runtime
        .register(input)
        .register(development.systems[0]!)
        .register(uiLayout)
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
    initialLevelId,
    worldEvents,
    undefined,
    false,
    developmentParameters?.get('streaming') !== '0',
  );
  const requestedHour = Number(pageParameters.get('time'));
  const timeOfDay = new TimeOfDayLightingSystem(
    render.scene,
    levelSystem,
    worldEvents,
    accessibility,
    development?.debug,
    pageParameters.has('time') && Number.isFinite(requestedHour)
      ? requestedHour
      : 13,
  );
  const collision = new StaticCollisionWorld();
  const worldCollision = new WorldCollisionSystem(collision, worldEvents);
  const spawn = findSpawn(initialLevel);
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
  // Product boot always starts from the registered Casual definition. The
  // selection store remains authoritative so picker and debug changes continue
  // to replace only the visual attached to the existing player simulation.
  characterSelection.select('casual');
  const playerEquipment = new CharacterEquipment('player', ['knife']);
  const playerAccount = new PlayerMoneyAccount('player');
  const characterVisual = new CharacterPlayerVisual(
    characterSelection,
    new CharacterLoader(assets),
    playerEquipment,
    assets,
  );
  const characterPicker = new CharacterPickerSystem(
    uiLayout.zone('modal'),
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
  levelSystem.setStreamingPositionSource(() => player.getPlayerPosition());
  if (development) {
    const { registerSectorStreamingDiagnostics } =
      await import('./debug/PerformanceDiagnostics');
    performanceUnregister.push(
      ...registerSectorStreamingDiagnostics(development.debug, levelSystem),
    );
  }
  const playerHudCluster = new PlayerHudClusterSystem(
    uiLayout.zone('player-status'),
  );
  const trafficSeed = Number(pageParameters.get('trafficSeed'));
  const trafficCadence = Number(pageParameters.get('trafficCadence'));
  const trafficMaximum = Number(pageParameters.get('trafficMax'));
  const trafficSpeed = Number(pageParameters.get('trafficSpeed'));
  const trafficE2EInactive =
    pageParameters.get('e2e') === '1' && pageParameters.get('traffic') !== '1';
  const traffic = new TrafficSystem(
    render.scene,
    assets,
    collision,
    development?.debug,
    {
      ...defaultTrafficConfig,
      enabled: !trafficE2EInactive && pageParameters.get('traffic') !== '0',
      seed:
        pageParameters.has('trafficSeed') && Number.isFinite(trafficSeed)
          ? trafficSeed
          : defaultTrafficConfig.seed,
      spawnCadence:
        pageParameters.has('trafficCadence') &&
        Number.isFinite(trafficCadence) &&
        trafficCadence >= 0
          ? trafficCadence
          : defaultTrafficConfig.spawnCadence,
      maxPopulation: trafficE2EInactive
        ? 0
        : pageParameters.has('trafficMax') &&
            Number.isInteger(trafficMaximum) &&
            trafficMaximum >= 0
          ? Math.min(12, trafficMaximum)
          : defaultTrafficConfig.maxPopulation,
      speed:
        pageParameters.has('trafficSpeed') &&
        Number.isFinite(trafficSpeed) &&
        trafficSpeed > 0
          ? Math.min(30, trafficSpeed)
          : defaultTrafficConfig.speed,
    },
  );
  const quickbar = new QuickbarSystem(
    uiLayout.zone('loadout'),
    playerEquipment,
  );
  const moneyHud = new MoneyHudSystem(
    playerHudCluster.element,
    playerAccount,
    prefersReducedMotion,
  );
  const handgunPurchase = new HandgunPurchase(playerAccount, playerEquipment);
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
  const weaponAim = new WeaponAimSystem(
    uiLayout.zone('world-indicator'),
    render.camera,
    input,
    playerEquipment,
    camera,
  );
  const help = new LazyHelpOverlaySystem(
    uiLayout.zone('modal'),
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
  const vehicle = new VehicleControllerSystem(
    render.scene,
    assets,
    collision,
    player,
    interactions,
    traffic,
    camera,
  );
  const vehicleHud = new VehicleHudSystem(
    uiLayout.zone('loadout'),
    vehicle,
    quickbar,
  );
  const audioPreferences = new AudioPreferenceStore(window.localStorage);
  const failedAudioUrl =
    import.meta.env.DEV && pageParameters.get('audioFail') === '1'
      ? audioCatalog.first('theme')?.url
      : undefined;
  const audio = new AudioPlaybackCoordinator(
    audioCatalog,
    audioPreferences,
    vehicle,
    undefined,
    failedAudioUrl
      ? async (input) =>
          audioRequestUrl(input) === failedAudioUrl
            ? {
                ok: false,
                status: 503,
                arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
              }
            : fetch(input)
      : undefined,
  );
  const proximityPickups = new ProximityPickupSystem(player);
  render.scene.add(proximityPickups.getVisualization());
  let cashPickup: DebugCashPickup | undefined;
  if (development) {
    const { DebugCashPickup } = await import('./economy/DebugCashPickup');
    cashPickup = new DebugCashPickup(
      playerAccount,
      proximityPickups,
      objects,
      player,
    );
  }
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
  const activeNpcDefinitions = npcFixturesEnabled
    ? npcDefinitions
    : productionNpcDefinitions;
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
    assets,
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
        collision,
        fixtureEnabled: developmentParameters?.get('sparringFixture') === '1',
        opponentEnabled: developmentParameters?.get('hostileOpponent') === '1',
        reportError: (scope, error) => development.errors.report(scope, error),
        gameplayAvailable: () =>
          runtime.state.current === 'playing' && !input.isUiFocused(),
      },
    );
  }
  const weaponCombat = new WeaponCombatSystem(
    player,
    playerEquipment,
    weaponAim,
    collision,
    () => {
      const sparringDamageTarget = sparringTarget?.getWeaponDamageTarget();
      return [
        ...npcs.getWeaponDamageTargets(),
        ...(sparringDamageTarget ? [sparringDamageTarget] : []),
      ];
    },
  );
  const playerDeath = new PlayerDeathSystem(
    uiLayout.zone('modal'),
    player,
    camera,
    prefersReducedMotion,
    () => sparringTarget?.reset(),
  );
  const healthHud = new HealthHudSystem(
    uiLayout.zone('world-indicator'),
    player.health,
    sparringTarget ?? {
      getHealth: () => undefined,
      getHealthAnchor: () => undefined,
    },
    render.camera,
    collision,
    playerHudCluster.element,
  );
  const locationHud = new LocationHudSystem(
    uiLayout.zone('navigation'),
    player,
    levelSystem,
  );
  const minimapHud = new MinimapHudSystem(
    uiLayout.zone('navigation'),
    player,
    levelSystem,
  );
  const unregisterCombatVolumes =
    development && sparringTarget
      ? development.visualHelpers.register('combatVolumes', {
          setVisible: (visible) =>
            sparringTarget?.setVisualizationVisible(visible),
        })
      : undefined;
  const unregisterPickupVolumes = development
    ? development.visualHelpers.register('triggers', {
        setVisible: (visible) =>
          proximityPickups.setVisualizationVisible(visible),
      })
    : undefined;
  const unregisterTrafficVisualization = development?.visualHelpers.register(
    'navigation',
    { setVisible: (visible) => traffic.setVisualizationVisible(visible) },
  );
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
  const missions = new MissionSystem(
    missionDefinitions,
    ashfallInitialMissionFacts,
    {
      state: runtime.state,
      player,
      level: levelSystem,
      interactions: interactions.events,
      dialogue: dialogue.events,
      health: player.health.events,
      money: playerAccount,
      equipment: {
        owns: (itemId) => isEquipmentId(itemId) && playerEquipment.owns(itemId),
        acquire: (itemId) =>
          isEquipmentId(itemId) && playerEquipment.acquire(itemId),
      },
    },
  );
  const fullWorldMap = new FullWorldMapSystem(
    uiLayout.zone('modal'),
    runtime,
    input,
    player,
    levelSystem,
    missions,
  );
  const missionHud = new MissionHudSystem(
    uiLayout,
    missions,
    levelSystem,
    render.camera,
    collision,
  );
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
  const dialogueUI = new DialogueUISystem(
    uiLayout.zone('conversation'),
    dialogue,
    dialoguePortraits,
  );
  const cinematicUnavailableParticipants = new Set<string>();
  const cinematics = new CinematicCoordinator(
    new CinematicCatalog(cinematicDefinitions),
    runtime.state,
    runtime.events,
    input,
    input,
    camera,
    levelSystem,
    {
      hasParticipant: (id) =>
        !cinematicUnavailableParticipants.has(id) &&
        (id === 'casual' || npcs.getWorldPoseSource(id) !== undefined),
    },
    player,
  );
  const cinematicPresentation = new CinematicPresentationSystem(
    uiLayout.zone('presentation'),
    uiLayout.zone('modal'),
    cinematics,
    (speakerId) => dialoguePortraits.getSpeakerName(speakerId),
  );
  const unsubscribeMissionCinematics = missions.events.on(
    'mission:content-requested',
    (request) => {
      if (request.kind !== 'cinematic') return;
      const started = cinematics.start(request.referenceId);
      if (!started && !request.optional) {
        development?.errors.report(
          'required cinematic request',
          new Error(
            `Unable to start required cinematic "${request.referenceId}"`,
          ),
        );
      }
    },
  );
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
          playerAccount,
          moneyHud,
          handgunPurchase,
          cashPickup,
          minimapHud,
          weaponAim,
          weaponCombat,
          playerDeath,
        )
      : [];
  const missionDebugUnregister = development
    ? registerMissionDebug(development.debug, missions)
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
    .register(timeOfDay)
    .register(objects)
    .register(uiLayout)
    .register(help)
    .register(fullWorldMap)
    .register(player)
    .register(weaponAim)
    .register(playerDeath)
    .register(proximityPickups)
    .register(traffic)
    .register(vehicle)
    .register(audio);
  if (sparringTarget) runtime.register(sparringTarget);
  runtime
    .register(camera)
    .register(playerHudCluster)
    .register(moneyHud)
    .register(healthHud)
    .register(quickbar)
    .register(vehicleHud)
    .register(minimapHud)
    .register(locationHud)
    .register(interactions)
    .register(conversations)
    .register(npcs)
    .register(missions)
    .register(cinematics)
    .register(cinematicPresentation)
    .register(missionHud)
    .register(weaponCombat);
  if (interactionScenario) runtime.register(interactionScenario);
  runtime
    .register(dialogue)
    .register(dialogueUI)
    .register(
      new InteractionPromptSystem(uiLayout.zone('interaction'), interactions),
    )
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
          weaponAim,
          weaponCombat,
          interactions,
          npcs,
          npcDefinitions: activeNpcDefinitions,
          sparringTarget,
          healthHud,
          quickbar,
          account: playerAccount,
          moneyHud,
          cashPickup: cashPickup!,
          proximityPickups,
          locationHud,
          minimapHud,
          fullWorldMap,
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
          traffic,
          vehicle,
          vehicleHud,
          audio,
          audioPreferences,
          missions,
          missionHud,
          timeOfDay,
          playerDeath,
          cinematics,
          setCinematicParticipantAvailable: (id, available) => {
            if (available) cinematicUnavailableParticipants.delete(id);
            else cinematicUnavailableParticipants.add(id);
          },
        })
      : undefined;

  loading.complete();

  installHotDisposal(runtime, assets, development, () => {
    unsubscribeAccessibility();
    unsubscribeMissionCinematics();
    cashPickup?.dispose();
    playerAccount.dispose();
    disposeBrowserTestBridge?.();
    for (const unregister of debugUnregister) unregister();
    for (const unregister of missionDebugUnregister) unregister();
    unregisterCombatVolumes?.();
    unregisterPickupVolumes?.();
    unregisterTrafficVisualization?.();
    for (const unregister of performanceUnregister) unregister();
    worldEvents.clear();
    loading.dispose();
  });
}

function audioRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
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
  account?: PlayerMoneyAccount,
  moneyHud?: MoneyHudSystem,
  handgunPurchase?: HandgunPurchase,
  cashPickup?: DebugCashPickup,
  minimapHud?: MinimapHudSystem,
  weaponAim?: WeaponAimSystem,
  weaponCombat?: WeaponCombatSystem,
  playerDeath?: PlayerDeathSystem,
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
  const ensureSparringTarget = async (): Promise<void> => {
    debug.setToggle('sparring-target.active', true);
    await sparringTarget.setEnabled(true);
  };
  return [
    () => cameraPreview?.release(),
    ...npcDebug,
    debug.registerValue({
      id: 'world.minimap',
      label: 'Minimap',
      group: sections.world,
      read: () => {
        const snapshot = minimapHud?.getSnapshot();
        return snapshot
          ? `${snapshot.orientation} · ${snapshot.locationName ?? 'pending'}`
          : 'unavailable';
      },
    }),
    ...(
      ['roads', 'structures', 'landmarks', 'interactions', 'spawns'] as const
    ).map((layer) =>
      debug.registerToggle({
        id: `minimap.layer.${layer}`,
        label: `Minimap · ${layer}`,
        group: sections.world,
        initialValue: minimapHud?.getSnapshot().layers[layer] ?? false,
        onChange: (enabled) => minimapHud?.setLayerVisible(layer, enabled),
      }),
    ),
    debug.registerValue({
      id: 'player.run-mode',
      label: 'Run mode',
      group: sections.player,
      read: () => player.getDebugSnapshot().runMode,
    }),
    debug.registerValue({
      id: 'weapon.aim',
      label: 'Weapon aim / reticle',
      group: sections.player,
      read: () => {
        const aim = weaponAim?.getSnapshot();
        return aim
          ? `${aim.visible ? 'visible' : 'hidden'} · ${aim.itemId ?? 'none'} · ${aim.screen.x.toFixed(0)},${aim.screen.y.toFixed(0)} · ${aim.releaseReason ?? 'active'}`
          : 'unavailable';
      },
    }),
    debug.registerValue({
      id: 'weapon.damage',
      label: 'Weapon damage result',
      group: sections.player,
      read: () => {
        const combat = weaponCombat?.getSnapshot();
        const result = combat?.lastResult;
        return combat
          ? `${combat.attackSequence} attacks · ${combat.hitCount} hits · ${result?.outcome ?? 'none'} · ${result?.targetId ?? 'no target'} · ${result?.damage ?? 0} damage`
          : 'unavailable';
      },
    }),
    debug.registerValue({
      id: 'player.health',
      label: 'Player health',
      group: sections.combat,
      read: () => {
        const health = player.health.getSnapshot();
        return `${health.current}/${health.maximum} · ${health.alive ? 'alive' : 'depleted'} · ${(health.normalized * 100).toFixed(0)}%`;
      },
    }),
    debug.registerValue({
      id: 'player.money',
      label: 'Money balance',
      group: sections.player,
      read: () => account?.balance ?? 'unavailable',
    }),
    debug.registerValue({
      id: 'player.money-last-transaction',
      label: 'Last money transaction',
      group: sections.player,
      read: () => {
        const transaction = account?.getSnapshot().lastTransaction;
        return transaction
          ? `${transaction.delta > 0 ? '+' : ''}${transaction.delta} · ${transaction.reason} · ${transaction.source ?? 'unknown'}`
          : 'none';
      },
    }),
    debug.registerValue({
      id: 'player.money-hud',
      label: 'Money HUD',
      group: sections.player,
      read: () => moneyHud?.getSnapshot().formattedBalance ?? 'unavailable',
    }),
    debug.registerValue({
      id: 'player.cash-pickup',
      label: 'Cash pickup',
      group: sections.interactions,
      read: () => {
        const pickup = cashPickup?.getSnapshot();
        return pickup
          ? `${pickup.spawned ? 'spawned' : 'absent'} · ${pickup.collected ? 'collected' : 'available'}`
          : 'unavailable';
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
      group: sections.combat,
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
      group: sections.combat,
      read: () => {
        const action = player.getCharacterActionState();
        return action.active ? `${action.active} · busy` : 'none · ready';
      },
    }),
    debug.registerValue({
      id: 'player.character-action-last',
      label: 'Last action request',
      group: sections.combat,
      read: () => {
        const action = player.getCharacterActionState();
        if (!action.lastRequested) return 'none';
        return `${action.lastRequested} · ${action.lastAccepted ? 'accepted' : (action.lastRejection ?? 'rejected')} · ${action.lastSource ?? 'unknown'}`;
      },
    }),
    debug.registerValue({
      id: 'player.character-action-completion',
      label: 'Last action completion',
      group: sections.combat,
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
      group: sections.combat,
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
      group: sections.combat,
      read: () => player.getCharacterActionState().busyRejectionCount,
    }),
    debug.registerValue({
      id: 'sparring-target.status',
      label: 'Sparring target · status',
      group: sections.combat,
      read: () => {
        const target = sparringTarget.getSnapshot();
        return `${target.enabled ? 'active' : target.loaded ? 'loaded' : 'absent'} · ${target.animation} · ${target.feedback} · collision ${target.collisionActive ? 'on' : 'off'} · listeners ${target.listenerCount}`;
      },
    }),
    debug.registerValue({
      id: 'sparring-target.range',
      label: 'Sparring target · range / facing',
      group: sections.combat,
      read: () => {
        const target = sparringTarget.getSnapshot();
        return `${target.distance.toFixed(2)}m · gap ${target.horizontalGap.toFixed(2)}m · vertical ${target.verticalOverlap.toFixed(2)}m · facing ${target.facingDot.toFixed(2)} · ${target.eligible ? 'contact' : (target.rejectionReason ?? 'blocked')}`;
      },
    }),
    debug.registerValue({
      id: 'sparring-target.health',
      label: 'Sparring target · health',
      group: sections.combat,
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
      group: sections.combat,
      read: () => {
        const engagement = sparringTarget.getSnapshot().engagement;
        const cameraState = camera.getDebugSnapshot();
        return `${engagement.engaged ? 'engaged' : 'disengaged'} · ${engagement.distance.toFixed(2)}/${engagement.distanceLimit.toFixed(2)}m · owner ${cameraState.gameplayFocusOwner ?? 'none'} · zoom ${cameraState.actualDistance.toFixed(2)}/${cameraState.desiredDistance.toFixed(2)}m`;
      },
    }),
    debug.registerValue({
      id: 'sparring-target.feedback',
      label: 'Sparring target · impact feedback',
      group: sections.combat,
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
      group: sections.combat,
      initialValue: sparringTarget.initiallyEnabled,
      onChange: (enabled) => {
        void sparringTarget
          .setEnabled(enabled)
          .catch((error) =>
            development.errors.report('sparring target activation', error),
          );
      },
    }),
    debug.registerToggle({
      id: 'sparring-target.hostile',
      label: 'Enable hostile debug opponent',
      group: sections.combat,
      initialValue: sparringTarget.getSnapshot().opponent.active,
      onChange: (enabled) => sparringTarget.setOpponentEnabled(enabled),
    }),
    debug.registerCommand({
      id: 'sparring-target.reset',
      label: 'Reset / revive sparring target',
      group: sections.combat,
      run: async () => {
        await ensureSparringTarget();
        sparringTarget.reset();
      },
    }),
    debug.registerCommand({
      id: 'sparring-target.teleport-player',
      label: 'Teleport player to sparring pad',
      group: sections.combat,
      run: async () => {
        await ensureSparringTarget();
        const spawn = level.getSpawn('spawn.player-sparring');
        player.teleport(new Vector3(...spawn.position), spawn.rotation?.[1]);
      },
    }),
    debug.registerCommand({
      id: 'sparring-target.teleport-to-player',
      label: 'Move sparring target in front of player',
      group: sections.combat,
      run: async () => {
        await ensureSparringTarget();
        const pose = player.getWorldPose();
        sparringTarget.teleport(
          {
            x: pose.position.x + pose.forward.x * 0.9,
            y: pose.position.y,
            z: pose.position.z + pose.forward.z * 0.9,
          },
          Math.atan2(-pose.forward.x, -pose.forward.z),
        );
      },
    }),
    debug.registerCommand({
      id: 'weapon.target-at-aim',
      label: 'Move sparring target onto aim ray',
      group: sections.combat,
      argumentLabel: 'distance (default 6)',
      run: async (value) => {
        await ensureSparringTarget();
        const requested = Number(value);
        const distance =
          Number.isFinite(requested) && requested > 0 ? requested : 6;
        const ray = weaponAim?.getAimRay();
        if (!ray) throw new Error('Weapon aim is unavailable');
        const center = ray.origin
          .clone()
          .addScaledVector(ray.direction, distance);
        sparringTarget.teleport({
          x: center.x,
          y: center.y - sparringTargetConfig.volumes.hurt.height / 2,
          z: center.z,
        });
        sparringTarget.reset();
      },
    }),
    debug.registerCommand({
      id: 'sparring-target.teleport-position',
      label: 'Teleport sparring target',
      group: sections.combat,
      argumentLabel: 'x,y,z,yaw',
      run: (value) => {
        const [rawX = '', rawY = '', rawZ = '', rawYaw] = (value ?? '').split(
          ',',
        );
        const x = Number(rawX);
        const y = Number(rawY);
        const z = Number(rawZ);
        const yaw = Number(rawYaw);
        if (
          x === undefined ||
          y === undefined ||
          z === undefined ||
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          !Number.isFinite(z)
        ) {
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
      group: sections.combat,
      run: () => {
        player.health.damage(10, 'debug-command');
      },
    }),
    debug.registerCommand({
      id: 'weapon.aim-center',
      label: 'Center weapon aim point',
      group: sections.combat,
      run: () =>
        weaponAim?.setScreenPoint(
          window.innerWidth / 2,
          window.innerHeight / 2,
        ),
    }),
    debug.registerCommand({
      id: 'player.money-credit',
      label: 'Credit player money',
      group: sections.player,
      argumentLabel: 'positive integer (default 100)',
      run: (value) => {
        account?.credit(parsePositiveInteger(value, 100), {
          reason: 'debug-credit',
          source: 'debug-command',
        });
      },
    }),
    debug.registerCommand({
      id: 'player.money-spend',
      label: 'Spend player money',
      group: sections.player,
      argumentLabel: 'positive integer (default 100)',
      run: (value) => {
        account?.debit(parsePositiveInteger(value, 100), {
          reason: 'debug-spend',
          source: 'debug-command',
        });
      },
    }),
    debug.registerCommand({
      id: 'player.money-reset',
      label: 'Reset player money',
      group: sections.player,
      run: () => {
        account?.reset(undefined, {
          reason: 'debug-reset',
          source: 'debug-command',
        });
      },
    }),
    debug.registerCommand({
      id: 'player.cash-pickup-spawn',
      label: 'Spawn cash pickup',
      group: sections.interactions,
      run: () => {
        cashPickup?.spawn();
      },
    }),
    debug.registerCommand({
      id: 'player.cash-pickup-remove',
      label: 'Remove cash pickup',
      group: sections.interactions,
      run: () => {
        cashPickup?.remove();
      },
    }),
    debug.registerCommand({
      id: 'player.handgun-purchase',
      label: 'Purchase and equip handgun',
      group: sections.player,
      run: () => {
        handgunPurchase?.purchase();
      },
    }),
    debug.registerCommand({
      id: 'player.health-heal',
      label: 'Heal player health (10)',
      group: sections.combat,
      run: () => {
        player.health.heal(10, 'debug-command');
      },
    }),
    debug.registerCommand({
      id: 'player.health-reset',
      label: 'Reset player health',
      group: sections.combat,
      run: () => {
        player.health.reset('debug-command');
      },
    }),
    debug.registerCommand({
      id: 'player.health-deplete',
      label: 'Deplete player health',
      group: sections.combat,
      run: () => {
        player.health.set(0, 'debug-command');
      },
    }),
    debug.registerCommand({
      id: 'player.revive',
      label: 'Revive player and restart debug combat',
      group: sections.combat,
      run: () => playerDeath?.reviveNow(),
    }),
    debug.registerCommand({
      id: 'sparring-target.health-damage',
      label: 'Damage sparring target health (10)',
      group: sections.combat,
      run: () => {
        sparringTarget.getHealth()?.damage(10, 'debug-command');
      },
    }),
    debug.registerCommand({
      id: 'sparring-target.health-heal',
      label: 'Heal sparring target health (10)',
      group: sections.combat,
      run: () => {
        sparringTarget.getHealth()?.heal(10, 'debug-command');
      },
    }),
    debug.registerCommand({
      id: 'sparring-target.health-deplete',
      label: 'Deplete sparring target health',
      group: sections.combat,
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
      label: 'Current / desired distance',
      group: sections.camera,
      read: () => {
        const snapshot = camera.getDebugSnapshot();
        return `${snapshot.actualDistance.toFixed(2)} / ${snapshot.desiredDistance.toFixed(2)} m`;
      },
    }),
    debug.registerValue({
      id: 'camera.saved-follow-distance',
      label: 'Saved preference distance',
      group: sections.camera,
      read: () => {
        const snapshot = camera.getDebugSnapshot();
        return `${snapshot.savedPreferenceDistance.toFixed(2)} m${snapshot.followDistanceOverride === undefined ? '' : ' · live override active'}`;
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
      group: sections.camera,
      initialValue: camera.preferences.current.invertY,
      onChange: (enabled) => camera.setPreferences({ invertY: enabled }),
    }),
    debug.registerToggle({
      id: 'camera.automatic-recenter',
      label: 'Automatic recenter',
      group: sections.camera,
      initialValue: camera.preferences.current.automaticRecenter,
      onChange: (enabled) =>
        camera.setPreferences({ automaticRecenter: enabled }),
    }),
    debug.registerCommand({
      id: 'camera.set-horizontal-sensitivity',
      label: 'Set horizontal sensitivity',
      group: sections.camera,
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
      group: sections.camera,
      argumentLabel: '0.0005–0.01',
      run: (value) => {
        camera.setPreferences({
          verticalSensitivity: parseCameraSetting(value),
        });
      },
    }),
    debug.registerNumber({
      id: 'camera.set-follow-distance',
      label: 'Live follow distance (m)',
      group: sections.camera,
      min: camera.config.minDistance,
      max: camera.config.maxDistance,
      step: 0.1,
      read: () => camera.getDebugSnapshot().desiredDistance,
      onChange: (value) => {
        camera.setFollowDistanceOverride(value);
      },
    }),
    debug.registerCommand({
      id: 'camera.reset-follow-distance',
      label: 'Reset live distance to default',
      group: sections.camera,
      run: () => {
        camera.setFollowDistanceOverride(
          defaultCameraPreferences.followDistance,
        );
      },
    }),
    debug.registerCommand({
      id: 'camera.persist-follow-distance',
      label: 'Save live distance as preference',
      group: sections.camera,
      run: () => {
        camera.setPreferences({
          followDistance: camera.getDebugSnapshot().desiredDistance,
        });
      },
    }),
    debug.registerCommand({
      id: 'camera.set-shoulder',
      label: 'Set shoulder',
      group: sections.camera,
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
      group: sections.player,
      run: () => player.reset(),
    }),
    debug.registerCommand({
      id: 'player.play-character-action',
      label: 'Play character action',
      group: sections.player,
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
      group: sections.player,
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
      group: sections.player,
      run: () => {
        if (!player.useEquippedItem('debug-command')) {
          throw new Error('Equipped item use was rejected');
        }
      },
    }),
    debug.registerCommand({
      id: 'player.reload-equipment',
      label: 'Reload equipped player item',
      group: sections.player,
      run: () => {
        if (!player.reloadEquippedItem('debug-command')) {
          throw new Error('Equipped item reload was rejected');
        }
      },
    }),
    debug.registerCommand({
      id: 'npc.equip-item',
      label: 'Equip NPC item',
      group: sections.assets,
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
      group: sections.assets,
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
      group: sections.assets,
      run: () => characterPicker.open(),
    }),
    debug.registerCommand({
      id: 'dialogue.start-mack',
      label: 'Start Mack dialogue',
      group: sections.dialogue,
      run: () => {
        conversations.start('conversation.mack.introduction', 'mack');
      },
    }),
    debug.registerCommand({
      id: 'dialogue.advance',
      label: 'Advance dialogue',
      group: sections.dialogue,
      run: () => dialogue.advance(),
    }),
    debug.registerCommand({
      id: 'dialogue.set-typewriter',
      label: 'Set typewriter',
      group: sections.dialogue,
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
      group: sections.assets,
      argumentLabel: 'character id',
      run: (id) => {
        if (!id) throw new Error('A character id is required');
        characterSelection.select(id);
      },
    }),
    debug.registerCommand({
      id: 'player.cycle-character',
      label: 'Cycle character',
      group: sections.assets,
      run: () => {
        characterSelection.cycle();
      },
    }),
    debug.registerCommand({
      id: 'player.reload-character',
      label: 'Reload character',
      group: sections.assets,
      run: () => characterVisual.reload(),
    }),
    debug.registerCommand({
      id: 'conversation.end',
      label: 'End conversation',
      group: sections.dialogue,
      run: () => {
        conversations.end();
      },
    }),
    debug.registerCommand({
      id: 'level.reload',
      label: 'Reload level',
      group: sections.world,
      run: async () => {
        const id = level.activeLevel?.id;
        if (!id) throw new Error('No level is loaded');
        await level.load(id);
      },
    }),
    debug.registerCommand({
      id: 'player.teleport',
      label: 'Teleport to spawn',
      group: sections.player,
      argumentLabel: 'spawn id',
      run: async (id) => {
        const spawn = level.getSpawn(id || undefined);
        await level.refreshStreaming({
          x: spawn.position[0],
          y: spawn.position[1],
          z: spawn.position[2],
        });
        player.teleport(new Vector3(...spawn.position), spawn.rotation?.[1]);
      },
    }),
    debug.registerCommand({
      id: 'player.teleport-position',
      label: 'Teleport to position',
      group: sections.player,
      argumentLabel: 'x,y,z,yaw',
      run: async (value) => {
        const [rawX, rawY, rawZ, yaw] = (value ?? '').split(',').map(Number);
        if (
          rawX === undefined ||
          rawY === undefined ||
          rawZ === undefined ||
          !Number.isFinite(rawX) ||
          !Number.isFinite(rawY) ||
          !Number.isFinite(rawZ)
        ) {
          throw new Error('Expected x,y,z and optional yaw');
        }
        const destination = { x: rawX, y: rawY, z: rawZ };
        await level.refreshStreaming(destination);
        player.teleport(
          new Vector3(destination.x, destination.y, destination.z),
          Number.isFinite(yaw) ? yaw : undefined,
        );
      },
    }),
    debug.registerCommand({
      id: 'camera.preview-anchor',
      label: 'Preview camera anchor',
      group: sections.camera,
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
      group: sections.camera,
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

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  const parsed =
    value === undefined || value.trim() === '' ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error('Expected a positive integer');
  }
  return parsed;
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
