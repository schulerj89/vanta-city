import type { WebGLRenderer } from 'three';
import type { CharacterDefinition } from '../characters/CharacterDefinition';
import type { CharacterSelectionReader } from '../characters/CharacterSelection';
import type { DialogueSessionController } from '../dialogue/DialogueSessionController';
import type { DialogueUISystem } from '../dialogue/DialogueUISystem';
import type { GameRuntime } from '../game/GameRuntime';
import type { InteractionSystem } from '../interactions/InteractionSystem';
import type { ConversationCoordinator } from '../conversations/ConversationCoordinator';
import type { NpcSystem } from '../npcs/NpcSystem';
import type { npcDefinitions } from '../npcs/npcs';
import type { StaticCollisionWorld } from '../physics/CollisionWorld';
import type { CharacterPlayerVisual } from '../player/CharacterPlayerVisual';
import type { PlayerControllerSystem } from '../player/PlayerControllerSystem';
import type { ThirdPersonCameraSystem } from '../camera/ThirdPersonCameraSystem';
import type { LevelSystem } from '../world/LevelSystem';
import type { DebugRegistry } from './DebugRegistry';
import type { RuntimeErrorReporter } from './RuntimeErrorReporter';
import type { CharacterPickerSystem } from '../ui/CharacterPickerSystem';
import type { HelpOverlaySystem } from '../ui/HelpOverlaySystem';
import { defaultBindings, helpControlEntries } from '../input/defaultBindings';
import type { SparringTargetSystem } from './SparringTargetSystem';

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
    readonly initializedColliderCount: number;
    readonly floorHeight: number;
  };
  readonly player: {
    readonly exists: boolean;
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
    readonly facingYaw: number;
    readonly presentationFacingYaw: number;
    readonly runMode: boolean;
    readonly actionBusy: boolean;
  };
  readonly controls: {
    readonly bindings: typeof defaultBindings;
    readonly helpEntries: typeof helpControlEntries;
    readonly help: ReturnType<HelpOverlaySystem['getSnapshot']>;
  };
  readonly character: ReturnType<CharacterPlayerVisual['getDebugSnapshot']>;
  readonly selectedCharacterId: string;
  readonly picker: ReturnType<CharacterPickerSystem['getSnapshot']>;
  readonly camera: ReturnType<ThirdPersonCameraSystem['getDebugSnapshot']>;
  readonly interaction: {
    readonly activeTargetId: string | undefined;
    readonly completedTargetIds: readonly string[];
  };
  readonly npcs: {
    readonly count: number;
    readonly snapshots: readonly NonNullable<
      ReturnType<NpcSystem['getDebugSnapshot']>
    >[];
  };
  readonly sparringTarget: ReturnType<SparringTargetSystem['getSnapshot']>;
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
}

export interface BrowserTestApi {
  snapshot(): BrowserTestSnapshot;
  executeDebugCommand(id: string, argument?: string): Promise<void>;
  setDebugToggle(id: string, enabled: boolean): void;
}

declare global {
  interface Window {
    __VANTA_TEST__?: BrowserTestApi;
  }
}

export interface BrowserTestBridgeDependencies {
  readonly runtime: GameRuntime;
  readonly renderer: WebGLRenderer;
  readonly level: LevelSystem;
  readonly collision: StaticCollisionWorld;
  readonly player: PlayerControllerSystem;
  readonly camera: ThirdPersonCameraSystem;
  readonly interactions: InteractionSystem;
  readonly npcs: NpcSystem;
  readonly npcDefinitions: typeof npcDefinitions;
  readonly sparringTarget: SparringTargetSystem;
  readonly conversations: ConversationCoordinator;
  readonly characterSelection: CharacterSelectionReader;
  readonly characterVisual: CharacterPlayerVisual;
  readonly characterPicker: CharacterPickerSystem;
  readonly help: HelpOverlaySystem;
  readonly dialogue: DialogueSessionController;
  readonly dialogueUI: DialogueUISystem;
  readonly debug: DebugRegistry;
  readonly errors: RuntimeErrorReporter;
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
    executeDebugCommand: (id, argument) =>
      dependencies.debug.executeCommand(id, argument),
    setDebugToggle: (id, enabled) => dependencies.debug.setToggle(id, enabled),
  };
  target.__VANTA_TEST__ = api;
  return () => {
    unsubscribeInteraction();
    unsubscribeCompleted();
    unsubscribeCancelled();
    if (target.__VANTA_TEST__ === api) delete target.__VANTA_TEST__;
  };
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
  const canvas = dependencies.renderer.domElement;
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
      initialized:
        canvas.isConnected && dependencies.renderer.info.render.frame > 0,
      width: canvas.width,
      height: canvas.height,
      renderedFrames: dependencies.renderer.info.render.frame,
    },
    world: {
      levelId: activeLevel?.id,
      defaultSpawnId,
      declaredColliderCount: activeLevel?.staticCollision.length ?? 0,
      initializedColliderCount: dependencies.collision.getColliderCount(),
      floorHeight: 0,
    },
    player: {
      exists: dependencies.player.visual.object3d.parent !== null,
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
      facingYaw: movement.facingYaw,
      presentationFacingYaw: movement.presentationFacingYaw,
      runMode: movement.runMode,
      actionBusy: movement.actionBusy,
    },
    controls: {
      bindings: defaultBindings,
      helpEntries: helpControlEntries,
      help: dependencies.help.getSnapshot(),
    },
    character,
    selectedCharacterId: dependencies.characterSelection.getSelectedId(),
    picker: dependencies.characterPicker.getSnapshot(),
    camera: dependencies.camera.getDebugSnapshot(),
    interaction: {
      activeTargetId: dependencies.interactions.getActiveTarget()?.id,
      completedTargetIds: [...completedTargetIds],
    },
    npcs: {
      count: dependencies.npcs.count,
      snapshots: dependencies.npcDefinitions.flatMap((definition) => {
        const snapshot = dependencies.npcs.getDebugSnapshot(definition.id);
        return snapshot ? [snapshot] : [];
      }),
    },
    sparringTarget: dependencies.sparringTarget.getSnapshot(),
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
  };
}
