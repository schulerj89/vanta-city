import type { CharacterDefinition } from '../characters/CharacterDefinition';
import type { CharacterSelectionReader } from '../characters/CharacterSelection';
import type { DialogueSessionController } from '../dialogue/DialogueSessionController';
import type { DialogueUISystem } from '../dialogue/DialogueUISystem';
import type { GameRuntime } from '../game/GameRuntime';
import type { InteractionSystem } from '../interactions/InteractionSystem';
import type { ConversationCoordinator } from '../conversations/ConversationCoordinator';
import type { NpcSystem } from '../npcs/NpcSystem';
import type { PedestrianSystem } from '../pedestrians/PedestrianSystem';
import type { npcDefinitions } from '../npcs/npcs';
import type { StaticCollisionWorld } from '../physics/CollisionWorld';
import type { CharacterPlayerVisual } from '../player/CharacterPlayerVisual';
import type { PlayerControllerSystem } from '../player/PlayerControllerSystem';
import type { ThirdPersonCameraSystem } from '../camera/ThirdPersonCameraSystem';
import type { LevelSystem } from '../world/LevelSystem';
import type { DebugRegistry } from './DebugRegistry';
import type { RuntimeErrorReporter } from './RuntimeErrorReporter';
import type { CharacterPickerSystem } from '../ui/CharacterPickerSystem';
import type { HelpOverlayController } from '../ui/LazyHelpOverlaySystem';
import { defaultBindings, helpControlEntries } from '../input/defaultBindings';
import type { SparringTargetSystem } from './SparringTargetSystem';
import type { RenderSystem } from '../render/RenderSystem';
import type { ThreeAssetLoader } from '../assets/AssetLoader';
import type { LoadingScreen } from '../ui/LoadingScreen';
import type { DevelopmentAssetFaults } from './DevelopmentAssetFaults';
import type { InputOwnershipInspector } from './InputOwnershipInspector';
import type { VirtualGamepadFixture } from '../input/GamepadInput';
import type { DiagnosticRecorder } from './DiagnosticRecorder';
import type { DiagnosticTraceSummary } from './DiagnosticTrace';
import type { HealthHudSystem } from '../ui/HealthHudSystem';
import type { QuickbarSystem } from '../ui/QuickbarSystem';
import type { LocationHudSystem } from '../ui/LocationHudSystem';
import type { MinimapHudSystem } from '../ui/MinimapHudSystem';
import type { FullWorldMapSystem } from '../ui/FullWorldMapSystem';
import type { PlayerMoneyAccount } from '../economy/PlayerMoneyAccount';
import type { MoneyHudSystem } from '../ui/MoneyHudSystem';
import type { DebugCashPickup } from '../economy/DebugCashPickup';
import type { ProximityPickupSystem } from '../pickups/ProximityPickupSystem';
import type { TrafficSystem } from '../traffic/TrafficSystem';
import type { TimeOfDayLightingSystem } from '../world/TimeOfDayLightingSystem';
import type { WeaponAimSystem } from '../combat/WeaponAimSystem';
import type { WeaponCombatSystem } from '../combat/WeaponCombatSystem';
import type { PlayerDeathSystem } from '../ui/PlayerDeathSystem';
import type { VehicleControllerSystem } from '../vehicles/VehicleControllerSystem';
import type { VehicleHudSystem } from '../ui/VehicleHudSystem';
import type { MissionSystem } from '../missions/MissionSystem';
import type { MissionHudSystem } from '../ui/MissionHudSystem';
import type { AudioPlaybackCoordinator } from '../audio/AudioPlaybackCoordinator';
import type {
  AudioPreferences,
  AudioPreferenceStore,
} from '../audio/AudioPreferences';
import type { CinematicCoordinator } from '../cinematics/CinematicCoordinator';
import type {
  CinematicPerformancePreflight,
  CinematicPerformanceRequest,
  CinematicPerformanceRestoreToken,
  PerformanceReleaseReason,
} from '../cinematics/CinematicPerformanceController';

export const browserTestCharacterDefinitions = [
  {
    id: 'test-invalid-asset',
    displayName: 'Invalid asset smoke fixture',
    modelAssetId: 'test.missing-character.model',
    pickerVisible: false,
    fallback: 'placeholder',
  },
] as const satisfies readonly CharacterDefinition[];

export interface BrowserTestSnapshot {
  readonly ready: true;
  readonly gameState: string;
  readonly renderer: {
    readonly initialized: boolean;
    readonly width: number;
    readonly height: number;
    readonly renderedFrames: number;
  };
  readonly world: {
    readonly levelId: string | undefined;
    readonly defaultSpawnId: string | undefined;
    readonly declaredColliderCount: number;
    readonly activeDeclaredColliderCount: number;
    readonly initializedColliderCount: number;
    readonly floorHeight: number;
    readonly collision: ReturnType<StaticCollisionWorld['getDebugSnapshot']>;
    readonly sectors: ReturnType<LevelSystem['getStreamingSnapshot']>;
  };
  readonly player: {
    readonly exists: boolean;
    /** Stable root owned by the one player simulation, not the loaded model. */
    readonly simulationRootUuid: string;
    readonly position: {
      readonly x: number;
      readonly y: number;
      readonly z: number;
    };
    readonly velocity: {
      readonly x: number;
      readonly y: number;
      readonly z: number;
    };
    readonly grounded: boolean;
    readonly groundColliderId: string;
    readonly groundNormal: {
      readonly x: number;
      readonly y: number;
      readonly z: number;
    };
    /** Lowest rendered point relative to the authoritative foot plane. */
    readonly footClearance: number | undefined;
    readonly movementState: string;
    readonly desiredFacingYaw: number;
    readonly facingYaw: number;
    readonly facingError: number;
    readonly facingTurnRate: number;
    readonly facingSmoothingActive: boolean;
    readonly presentationFacingYaw: number;
    readonly runMode: boolean;
    readonly actionBusy: boolean;
    readonly depleted: boolean;
    readonly equipment: ReturnType<
      PlayerControllerSystem['equipment']['getSnapshot']
    >;
    readonly roll: ReturnType<
      PlayerControllerSystem['getDebugSnapshot']
    >['roll'];
    readonly fire: ReturnType<
      PlayerControllerSystem['getDebugSnapshot']
    >['fire'];
    readonly locomotion: ReturnType<
      PlayerControllerSystem['getDebugSnapshot']
    >['locomotion'];
  };
  readonly controls: {
    readonly bindings: typeof defaultBindings;
    readonly helpEntries: typeof helpControlEntries;
    readonly help: ReturnType<HelpOverlayController['getSnapshot']>;
    readonly ownership: ReturnType<InputOwnershipInspector['getDebugSnapshot']>;
  };
  readonly character: ReturnType<CharacterPlayerVisual['getDebugSnapshot']>;
  readonly selectedCharacterId: string;
  readonly picker: ReturnType<CharacterPickerSystem['getSnapshot']>;
  readonly camera: ReturnType<ThirdPersonCameraSystem['getDebugSnapshot']>;
  readonly weaponAim: ReturnType<WeaponAimSystem['getSnapshot']>;
  readonly weaponCombat: ReturnType<WeaponCombatSystem['getSnapshot']>;
  readonly interaction: {
    readonly activeTargetId: string | undefined;
    readonly completedTargetIds: readonly string[];
    readonly diagnostics: ReturnType<InteractionSystem['getDebugSnapshot']>;
  };
  readonly npcs: {
    readonly count: number;
    readonly snapshots: readonly NonNullable<
      ReturnType<NpcSystem['getDebugSnapshot']>
    >[];
  };
  readonly pedestrians: ReturnType<PedestrianSystem['getSnapshot']>;
  readonly sparringTarget: ReturnType<SparringTargetSystem['getSnapshot']>;
  readonly healthHud: ReturnType<HealthHudSystem['getSnapshot']>;
  readonly quickbar: ReturnType<QuickbarSystem['getSnapshot']>;
  readonly money: {
    readonly account: ReturnType<PlayerMoneyAccount['getSnapshot']>;
    readonly hud: ReturnType<MoneyHudSystem['getSnapshot']>;
    readonly cashPickup: ReturnType<DebugCashPickup['getSnapshot']>;
    readonly proximityPickups: ReturnType<ProximityPickupSystem['getSnapshot']>;
  };
  readonly locationHud: ReturnType<LocationHudSystem['getSnapshot']>;
  readonly minimapHud: ReturnType<MinimapHudSystem['getSnapshot']>;
  readonly fullWorldMap: ReturnType<FullWorldMapSystem['getSnapshot']>;
  readonly conversation: {
    readonly npcId: string | undefined;
    readonly conversationId: string | undefined;
  };
  readonly dialogue: {
    readonly session: ReturnType<DialogueSessionController['getSnapshot']>;
    readonly ui: ReturnType<DialogueUISystem['getDebugSnapshot']>;
    readonly completedConversationIds: readonly string[];
    readonly cancelledConversationIds: readonly string[];
  };
  readonly runtimeErrors: ReturnType<RuntimeErrorReporter['getDebugSnapshot']>;
  readonly performance: {
    readonly renderer: ReturnType<RenderSystem['getPerformanceSnapshot']>;
    readonly runtime: ReturnType<GameRuntime['getPerformanceSnapshot']>;
    readonly assets: ReturnType<ThreeAssetLoader['getPerformanceSnapshot']>;
    readonly loading: ReturnType<LoadingScreen['getSnapshot']>;
    readonly assetFaults:
      ReturnType<DevelopmentAssetFaults['getSnapshot']> | undefined;
    readonly browserMemory: {
      readonly supported: boolean;
      readonly usedJsHeapSize: number | undefined;
      readonly totalJsHeapSize: number | undefined;
      readonly jsHeapSizeLimit: number | undefined;
    };
  };
  readonly traffic: ReturnType<TrafficSystem['getSnapshot']>;
  readonly vehicle: {
    readonly controller: ReturnType<VehicleControllerSystem['getSnapshot']>;
    readonly hud: ReturnType<VehicleHudSystem['getSnapshot']>;
  };
  readonly audio: ReturnType<AudioPlaybackCoordinator['getSnapshot']>;
  readonly missions: {
    readonly runtime: ReturnType<MissionSystem['getSnapshot']>;
    readonly persistence: ReturnType<MissionSystem['getPersistenceSnapshot']>;
    readonly hud: ReturnType<MissionHudSystem['getSnapshot']>;
  };
  readonly cinematic: ReturnType<CinematicCoordinator['getSnapshot']>;
  readonly lighting: ReturnType<TimeOfDayLightingSystem['getSnapshot']>;
  readonly playerDeath: ReturnType<PlayerDeathSystem['getSnapshot']>;
}

export interface BrowserTestApi {
  snapshot(): BrowserTestSnapshot;
  startCinematic(id: string): boolean;
  requestCinematicSkip(): boolean;
  confirmCinematicSkip(): boolean;
  cancelCinematicSkip(): boolean;
  cancelCinematic(): boolean;
  advanceCinematic(seconds: number): void;
  setCinematicParticipantAvailable(id: string, available: boolean): void;
  preflightPerformance(
    participantId: string,
    request: CinematicPerformanceRequest,
  ): CinematicPerformancePreflight;
  startPerformance(
    participantId: string,
    request: CinematicPerformanceRequest,
  ): CinematicPerformancePreflight;
  capturePerformanceState(
    participantId: string,
  ): CinematicPerformanceRestoreToken;
  holdPerformance(participantId: string, requestId: string): boolean;
  releasePerformance(
    participantId: string,
    requestId: string,
    reason: PerformanceReleaseReason,
  ): boolean;
  restorePerformance(
    participantId: string,
    token: CinematicPerformanceRestoreToken,
  ): boolean;
  executeDebugCommand(id: string, argument?: string): Promise<void>;
  setDebugToggle(id: string, enabled: boolean): void;
  setDebugNumber(id: string, value: number): Promise<void>;
  setVirtualGamepad(fixture?: VirtualGamepadFixture): void;
  audioPlayTheme(): Promise<void>;
  audioPlayRadio(): Promise<void>;
  audioNextRadio(): Promise<void>;
  audioPause(): void;
  audioResume(): void;
  audioStop(): void;
  setAudioPreferences(update: Partial<AudioPreferences>): AudioPreferences;
  exportDiagnosticTrace(): string;
  readbackDiagnosticTrace(input: string): DiagnosticTraceSummary;
  capturePerformance(
    warmupMs: number,
    measurementMs: number,
  ): Promise<BrowserPerformanceCapture>;
}

export interface BrowserPerformanceCapture {
  readonly warmupMs: number;
  readonly measurementMs: number;
  readonly frames: number;
  readonly averageFps: number;
  readonly onePercentLowFps: number;
  readonly frameTimeP95Ms: number;
  readonly frameTimeMaxMs: number;
  readonly renderer: ReturnType<RenderSystem['getPerformanceSnapshot']>;
  readonly sectors: ReturnType<LevelSystem['getStreamingSnapshot']>;
  readonly assets: ReturnType<ThreeAssetLoader['getPerformanceSnapshot']>;
  readonly browserMemory: BrowserTestSnapshot['performance']['browserMemory'] & {
    readonly peakUsedJsHeapSize: number | undefined;
  };
}

declare global {
  interface Window {
    __VANTA_TEST__?: BrowserTestApi;
  }
}

export interface BrowserTestBridgeDependencies {
  readonly runtime: GameRuntime;
  readonly render: RenderSystem;
  readonly assets: ThreeAssetLoader;
  readonly loading: LoadingScreen;
  readonly assetFaults?: DevelopmentAssetFaults;
  readonly level: LevelSystem;
  readonly collision: StaticCollisionWorld;
  readonly player: PlayerControllerSystem;
  readonly camera: ThirdPersonCameraSystem;
  readonly weaponAim: WeaponAimSystem;
  readonly weaponCombat: WeaponCombatSystem;
  readonly interactions: InteractionSystem;
  readonly npcs: NpcSystem;
  readonly pedestrians: PedestrianSystem;
  readonly npcDefinitions: typeof npcDefinitions;
  readonly sparringTarget: SparringTargetSystem;
  readonly healthHud: HealthHudSystem;
  readonly quickbar: QuickbarSystem;
  readonly account: PlayerMoneyAccount;
  readonly moneyHud: MoneyHudSystem;
  readonly cashPickup: DebugCashPickup;
  readonly proximityPickups: ProximityPickupSystem;
  readonly locationHud: LocationHudSystem;
  readonly minimapHud: MinimapHudSystem;
  readonly fullWorldMap: FullWorldMapSystem;
  readonly conversations: ConversationCoordinator;
  readonly characterSelection: CharacterSelectionReader;
  readonly characterVisual: CharacterPlayerVisual;
  readonly characterPicker: CharacterPickerSystem;
  readonly help: HelpOverlayController;
  readonly dialogue: DialogueSessionController;
  readonly dialogueUI: DialogueUISystem;
  readonly debug: DebugRegistry;
  readonly errors: RuntimeErrorReporter;
  readonly inputInspector: InputOwnershipInspector;
  readonly diagnostics: DiagnosticRecorder;
  readonly traffic: TrafficSystem;
  readonly vehicle: VehicleControllerSystem;
  readonly vehicleHud: VehicleHudSystem;
  readonly audio: AudioPlaybackCoordinator;
  readonly audioPreferences: AudioPreferenceStore;
  readonly missions: MissionSystem;
  readonly missionHud: MissionHudSystem;
  readonly timeOfDay: TimeOfDayLightingSystem;
  readonly playerDeath: PlayerDeathSystem;
  readonly cinematics: CinematicCoordinator;
  readonly setCinematicParticipantAvailable: (
    id: string,
    available: boolean,
  ) => void;
}

/** Installs the opt-in development bridge used by Playwright smoke tests. */
export function installBrowserTestBridge(
  dependencies: BrowserTestBridgeDependencies,
  target: Window = window,
): () => void {
  if (!import.meta.env.DEV) {
    throw new Error('Browser test instrumentation is development-only');
  }
  const completedTargetIds: string[] = [];
  const completedConversationIds: string[] = [];
  const cancelledConversationIds: string[] = [];
  const unsubscribeInteraction = dependencies.interactions.events.on(
    'interaction:completed',
    ({ target: completedTarget }) =>
      completedTargetIds.push(completedTarget.id),
  );
  const unsubscribeCompleted = dependencies.dialogue.events.on(
    'dialogue:completed',
    ({ conversationId }) => completedConversationIds.push(conversationId),
  );
  const unsubscribeCancelled = dependencies.dialogue.events.on(
    'dialogue:cancelled',
    ({ conversationId }) => cancelledConversationIds.push(conversationId),
  );
  const api: BrowserTestApi = {
    snapshot: () =>
      createSnapshot(
        dependencies,
        completedTargetIds,
        completedConversationIds,
        cancelledConversationIds,
      ),
    startCinematic: (id) => dependencies.cinematics.start(id),
    requestCinematicSkip: () => dependencies.cinematics.requestSkip(),
    confirmCinematicSkip: () => dependencies.cinematics.confirmSkip(),
    cancelCinematicSkip: () => dependencies.cinematics.cancelSkip(),
    cancelCinematic: () => dependencies.cinematics.cancel(),
    advanceCinematic: (seconds) =>
      dependencies.cinematics.update({
        delta: seconds,
        elapsed: seconds,
        frame: 0,
      }),
    setCinematicParticipantAvailable: (id, available) =>
      dependencies.setCinematicParticipantAvailable(id, available),
    preflightPerformance: (participantId, request) =>
      performanceOwner(dependencies, participantId).preflightPerformance(
        request,
      ),
    startPerformance: (participantId, request) =>
      performanceOwner(dependencies, participantId).startPerformance(request),
    capturePerformanceState: (participantId) =>
      performanceOwner(dependencies, participantId).capturePerformanceState(),
    holdPerformance: (participantId, requestId) =>
      performanceOwner(dependencies, participantId).holdPerformance(requestId),
    releasePerformance: (participantId, requestId, reason) =>
      performanceOwner(dependencies, participantId).releasePerformance(
        requestId,
        reason,
      ),
    restorePerformance: (participantId, token) =>
      performanceOwner(dependencies, participantId).restorePerformance(token),
    executeDebugCommand: (id, argument) =>
      dependencies.debug.executeCommand(id, argument),
    setDebugToggle: (id, enabled) => dependencies.debug.setToggle(id, enabled),
    setDebugNumber: (id, value) => dependencies.debug.setNumber(id, value),
    setVirtualGamepad: (fixture) =>
      dependencies.inputInspector.setVirtualGamepad(fixture),
    audioPlayTheme: () => dependencies.audio.playTheme(),
    audioPlayRadio: () => dependencies.audio.playRadio(),
    audioNextRadio: () => dependencies.audio.nextRadio(),
    audioPause: () => dependencies.audio.pause(),
    audioResume: () => dependencies.audio.resume(),
    audioStop: () => dependencies.audio.stop(),
    setAudioPreferences: (update) =>
      dependencies.audioPreferences.update(update),
    exportDiagnosticTrace: () => dependencies.diagnostics.serialize(),
    readbackDiagnosticTrace: (input) =>
      dependencies.diagnostics.readback(input),
    capturePerformance: (warmupMs, measurementMs) =>
      capturePerformance(dependencies, target, warmupMs, measurementMs),
  };
  target.__VANTA_TEST__ = api;
  return () => {
    unsubscribeInteraction();
    unsubscribeCompleted();
    unsubscribeCancelled();
    if (target.__VANTA_TEST__ === api) delete target.__VANTA_TEST__;
  };
}

function performanceOwner(
  dependencies: BrowserTestBridgeDependencies,
  participantId: string,
) {
  const owner =
    participantId === dependencies.characterVisual.participantId
      ? dependencies.characterVisual
      : dependencies.npcs.getPerformanceOwner(participantId);
  if (!owner)
    throw new Error(`Unknown performance participant "${participantId}"`);
  return owner;
}

function capturePerformance(
  dependencies: BrowserTestBridgeDependencies,
  target: Window,
  warmupMs: number,
  measurementMs: number,
): Promise<BrowserPerformanceCapture> {
  if (warmupMs < 0 || measurementMs <= 0 || measurementMs > 120_000) {
    throw new Error('Performance capture requires 0–120000 ms durations');
  }
  return new Promise((resolve) => {
    let started: number | undefined;
    let measurementStarted: number | undefined;
    let previous: number | undefined;
    const intervals: number[] = [];
    let peakUsedJsHeapSize: number | undefined;
    const sample = (timestamp: number): void => {
      started ??= timestamp;
      if (timestamp - started < warmupMs) {
        target.requestAnimationFrame(sample);
        return;
      }
      measurementStarted ??= timestamp;
      if (previous !== undefined) intervals.push(timestamp - previous);
      previous = timestamp;
      const used = readBrowserMemory().usedJsHeapSize;
      if (used !== undefined)
        peakUsedJsHeapSize = Math.max(peakUsedJsHeapSize ?? 0, used);
      if (timestamp - measurementStarted < measurementMs) {
        target.requestAnimationFrame(sample);
        return;
      }
      const sorted = [...intervals].sort((left, right) => left - right);
      const average =
        intervals.reduce((sum, value) => sum + value, 0) /
        Math.max(1, intervals.length);
      const percentile = (ratio: number): number =>
        sorted[
          Math.min(
            sorted.length - 1,
            Math.max(0, Math.ceil(sorted.length * ratio) - 1),
          )
        ] ?? 0;
      const p95 = percentile(0.95);
      const p99 = percentile(0.99);
      resolve({
        warmupMs,
        measurementMs,
        frames: intervals.length,
        averageFps: average > 0 ? 1000 / average : 0,
        onePercentLowFps: p99 > 0 ? 1000 / p99 : 0,
        frameTimeP95Ms: p95,
        frameTimeMaxMs: sorted.at(-1) ?? 0,
        renderer: dependencies.render.getPerformanceSnapshot(),
        sectors: dependencies.level.getStreamingSnapshot(),
        assets: dependencies.assets.getPerformanceSnapshot(),
        browserMemory: { ...readBrowserMemory(), peakUsedJsHeapSize },
      });
    };
    target.requestAnimationFrame(sample);
  });
}

function createSnapshot(
  dependencies: BrowserTestBridgeDependencies,
  completedTargetIds: readonly string[],
  completedConversationIds: readonly string[],
  cancelledConversationIds: readonly string[],
): BrowserTestSnapshot {
  const activeLevel = dependencies.level.activeLevel;
  const movement = dependencies.player.getDebugSnapshot();
  const position = dependencies.player.getPlayerPosition();
  const character = dependencies.characterVisual.getDebugSnapshot();
  const renderer = dependencies.render.renderer;
  const canvas = renderer.domElement;
  let defaultSpawnId: string | undefined;
  try {
    defaultSpawnId = dependencies.level.getSpawn().id;
  } catch {
    defaultSpawnId = undefined;
  }
  return {
    ready: true,
    gameState: dependencies.runtime.state.current,
    renderer: {
      initialized: canvas.isConnected && renderer.info.render.frame > 0,
      width: canvas.width,
      height: canvas.height,
      renderedFrames: renderer.info.render.frame,
    },
    world: {
      levelId: activeLevel?.id,
      defaultSpawnId,
      declaredColliderCount: activeLevel?.staticCollision.length ?? 0,
      activeDeclaredColliderCount:
        dependencies.level.getStreamingSnapshot().colliders,
      initializedColliderCount: dependencies.collision.getColliderCount(),
      floorHeight: 0,
      collision: dependencies.collision.getDebugSnapshot(),
      sectors: dependencies.level.getStreamingSnapshot(),
    },
    player: {
      exists: dependencies.player.visual.object3d.parent !== null,
      simulationRootUuid: dependencies.player.visual.object3d.uuid,
      position,
      velocity: movement.velocity,
      grounded: movement.grounded,
      groundColliderId: movement.groundColliderId,
      groundNormal: movement.groundNormal,
      footClearance:
        character.bounds?.min.y === undefined
          ? undefined
          : character.bounds.min.y - position.y,
      movementState: movement.movementState,
      desiredFacingYaw: movement.desiredFacingYaw,
      facingYaw: movement.facingYaw,
      facingError: movement.facingError,
      facingTurnRate: movement.facingTurnRate,
      facingSmoothingActive: movement.facingSmoothingActive,
      presentationFacingYaw: movement.presentationFacingYaw,
      runMode: movement.runMode,
      actionBusy: movement.actionBusy,
      depleted: movement.depleted,
      equipment: movement.equipment,
      roll: movement.roll,
      fire: movement.fire,
      locomotion: movement.locomotion,
    },
    controls: {
      bindings: defaultBindings,
      helpEntries: helpControlEntries,
      help: dependencies.help.getSnapshot(),
      ownership: dependencies.inputInspector.getDebugSnapshot(),
    },
    character,
    selectedCharacterId: dependencies.characterSelection.getSelectedId(),
    picker: dependencies.characterPicker.getSnapshot(),
    camera: dependencies.camera.getDebugSnapshot(),
    weaponAim: dependencies.weaponAim.getSnapshot(),
    weaponCombat: dependencies.weaponCombat.getSnapshot(),
    interaction: {
      activeTargetId: dependencies.interactions.getActiveTarget()?.id,
      completedTargetIds: [...completedTargetIds],
      diagnostics: dependencies.interactions.getDebugSnapshot(),
    },
    npcs: {
      count: dependencies.npcs.count,
      snapshots: dependencies.npcDefinitions.flatMap((definition) => {
        const snapshot = dependencies.npcs.getDebugSnapshot(definition.id);
        return snapshot ? [snapshot] : [];
      }),
    },
    pedestrians: dependencies.pedestrians.getSnapshot(),
    sparringTarget: dependencies.sparringTarget.getSnapshot(),
    healthHud: dependencies.healthHud.getSnapshot(),
    quickbar: dependencies.quickbar.getSnapshot(),
    money: {
      account: dependencies.account.getSnapshot(),
      hud: dependencies.moneyHud.getSnapshot(),
      cashPickup: dependencies.cashPickup.getSnapshot(),
      proximityPickups: dependencies.proximityPickups.getSnapshot(),
    },
    locationHud: dependencies.locationHud.getSnapshot(),
    minimapHud: dependencies.minimapHud.getSnapshot(),
    fullWorldMap: dependencies.fullWorldMap.getSnapshot(),
    conversation: {
      npcId: dependencies.conversations.active?.npcId,
      conversationId: dependencies.conversations.active?.definition.id,
    },
    dialogue: {
      session: dependencies.dialogue.getSnapshot(),
      ui: dependencies.dialogueUI.getDebugSnapshot(),
      completedConversationIds: [...completedConversationIds],
      cancelledConversationIds: [...cancelledConversationIds],
    },
    runtimeErrors: dependencies.errors.getDebugSnapshot(),
    traffic: dependencies.traffic.getSnapshot(),
    vehicle: {
      controller: dependencies.vehicle.getSnapshot(),
      hud: dependencies.vehicleHud.getSnapshot(),
    },
    audio: dependencies.audio.getSnapshot(),
    missions: {
      runtime: dependencies.missions.getSnapshot(),
      persistence: dependencies.missions.getPersistenceSnapshot(),
      hud: dependencies.missionHud.getSnapshot(),
    },
    cinematic: dependencies.cinematics.getSnapshot(),
    lighting: dependencies.timeOfDay.getSnapshot(),
    playerDeath: dependencies.playerDeath.getSnapshot(),
    performance: {
      renderer: dependencies.render.getPerformanceSnapshot(),
      runtime: dependencies.runtime.getPerformanceSnapshot(),
      assets: dependencies.assets.getPerformanceSnapshot(),
      loading: dependencies.loading.getSnapshot(),
      assetFaults: dependencies.assetFaults?.getSnapshot(),
      browserMemory: readBrowserMemory(),
    },
  };
}

function readBrowserMemory(): BrowserTestSnapshot['performance']['browserMemory'] {
  const memory = (
    performance as Performance & {
      readonly memory?: {
        readonly usedJSHeapSize: number;
        readonly totalJSHeapSize: number;
        readonly jsHeapSizeLimit: number;
      };
    }
  ).memory;
  return {
    supported: memory !== undefined,
    usedJsHeapSize: memory?.usedJSHeapSize,
    totalJsHeapSize: memory?.totalJSHeapSize,
    jsHeapSizeLimit: memory?.jsHeapSizeLimit,
  };
}
