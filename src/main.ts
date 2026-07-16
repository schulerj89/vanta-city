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
import { InteractionPromptSystem } from './ui/InteractionPromptSystem';
import { CharacterPickerSystem } from './ui/CharacterPickerSystem';
import { HelpOverlaySystem } from './ui/HelpOverlaySystem';
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
  const pageParameters = new URLSearchParams(window.location.search);
  const developmentParameters = import.meta.env.DEV
    ? pageParameters
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
    'casual',
    window.localStorage,
  );
  const characterVisual = new CharacterPlayerVisual(
    characterSelection,
    new CharacterLoader(assets),
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
  );
  const camera = new ThirdPersonCameraSystem(
    render.camera,
    input,
    player,
    collision,
    undefined,
    new CameraPreferenceStore(window.localStorage),
  );
  cameraReference.current = camera;
  input.setPointerTarget(render.renderer.domElement);
  const help = new HelpOverlaySystem(mount, runtime, helpControlEntries);
  const interactions = new InteractionSystem(input, runtime.state, player);
  const conversations = new ConversationCoordinator(
    conversationCatalog,
    runtime.state,
  );
  const npcs = new NpcSystem(
    npcDefinitions,
    npcCharacterDefinitions,
    new CharacterLoader(assets),
    objects,
    interactions,
    conversations,
    player,
    levelSystem,
    worldEvents,
  );
  let dialogueCamera:
    ReturnType<ThirdPersonCameraSystem['requestConversation']> | undefined;
  const dialogue = new DialogueSessionController(input, conversations, {
    typewriterEnabled:
      pageParameters.get('dialogueTypewriter') !== '0' &&
      !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    cameraHooks: {
      onDialogueStarted: (session) => {
        dialogueCamera?.release();
        dialogueCamera = camera.requestConversation(
          `dialogue:${session.definition.id}`,
          npcs.getWorldPoseSource(session.npcId),
        );
      },
      onDialogueEnded: () => {
        dialogueCamera?.release();
        dialogueCamera = undefined;
      },
    },
  });
  const dialoguePortraits = new DialoguePortraitResolver(
    await createDialogueSpeakers(npcDefinitions, assetCatalog),
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
    interact: () => {
      player.triggerCharacterAction('interact', 'interaction:garage-door');
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
        npcs,
        conversations,
        dialogue,
        dialogueUI,
        interactionDebug,
        characterAlignmentDebug,
        help,
      )
    : [];

  runtime.register(input);
  if (development) runtime.register(development.systems[0]!);
  runtime
    .register(worldCollision)
    .register(levelSystem)
    .register(objects)
    .register(help)
    .register(player)
    .register(camera)
    .register(interactions)
    .register(conversations)
    .register(npcs)
    .register(dialogue)
    .register(dialogueUI)
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
          npcs,
          npcDefinitions,
          conversations,
          characterSelection,
          characterVisual,
          characterPicker,
          help,
          dialogue,
          dialogueUI,
          debug: development.debug,
          errors: development.errors,
        })
      : undefined;

  // Install opt-in browser observability before opening the initial picker so
  // tests cannot observe the dialog one microtask before the bridge exists.
  if (pageParameters.get('skipPicker') !== '1') characterPicker.open();

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
  npcs: NpcSystem,
  conversations: ConversationCoordinator,
  dialogue: DialogueSessionController,
  dialogueUI: DialogueUISystem,
  interactionDebug?: import('./interactions/InteractionDebugSystem').InteractionDebugSystem,
  characterAlignmentDebug?: import('./debug/CharacterAlignmentDebugSystem').CharacterAlignmentDebugSystem,
  help?: HelpOverlaySystem,
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
        group,
        read: () => read(({ modelSource }) => modelSource, 'pending'),
      }),
      debug.registerValue({
        id: `npc.${definition.id}.gesture`,
        label: 'Last gesture',
        group,
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
        group,
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
  return [
    ...npcDebug,
    debug.registerValue({
      id: 'player.run-mode',
      label: 'Run mode',
      group: 'Player',
      read: () => player.getDebugSnapshot().runMode,
    }),
    debug.registerValue({
      id: 'controls.bindings',
      label: 'Bindings',
      group: 'Player',
      read: () => characterControlSummary,
    }),
    debug.registerValue({
      id: 'controls.help-open',
      label: 'Help open',
      group: 'Player',
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
      id: 'player.character-action',
      label: 'Character action',
      group: sections.characters,
      read: () => player.getCharacterActionState().active ?? 'none',
    }),
    debug.registerValue({
      id: 'player.character-action-last',
      label: 'Last action request',
      group: sections.characters,
      read: () => {
        const action = player.getCharacterActionState();
        if (!action.lastRequested) return 'none';
        return `${action.lastRequested} · ${action.lastAccepted ? 'accepted' : 'unavailable'} · ${action.lastSource ?? 'unknown'}`;
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
        'wave, interact, punchLeft, punchRight, kickLeft, or kickRight',
      run: (action) => {
        if (!isCharacterActionName(action)) {
          throw new Error(
            'Expected character action: wave, interact, punchLeft, punchRight, kickLeft, or kickRight',
          );
        }
        if (!player.triggerCharacterAction(action, 'debug-command')) {
          throw new Error(`Character action "${action}" is unavailable`);
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
