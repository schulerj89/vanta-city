import type { WebGLRenderer } from 'three';
import type { CharacterDefinition } from '../characters/CharacterDefinition';
import type { CharacterSelectionReader } from '../characters/CharacterSelection';
import type { GameRuntime } from '../game/GameRuntime';
import type { InteractionSystem } from '../interactions/InteractionSystem';
import type { StaticCollisionWorld } from '../physics/CollisionWorld';
import type { CharacterPlayerVisual } from '../player/CharacterPlayerVisual';
import type { PlayerControllerSystem } from '../player/PlayerControllerSystem';
import type { ThirdPersonCameraSystem } from '../camera/ThirdPersonCameraSystem';
import type { LevelSystem } from '../world/LevelSystem';
import type { DebugRegistry } from './DebugRegistry';
import type { RuntimeErrorReporter } from './RuntimeErrorReporter';
import type { CharacterPickerSystem } from '../ui/CharacterPickerSystem';

export const browserTestCharacterDefinitions = [
  {
    id: 'test-invalid-asset',
    displayName: 'Invalid asset smoke fixture',
    modelAssetId: 'test.missing-character.model',
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
    readonly movementState: string;
  };
  readonly character: ReturnType<CharacterPlayerVisual['getDebugSnapshot']>;
  readonly selectedCharacterId: string;
  readonly picker: ReturnType<CharacterPickerSystem['getSnapshot']>;
  readonly camera: ReturnType<ThirdPersonCameraSystem['getDebugSnapshot']>;
  readonly interaction: {
    readonly activeTargetId: string | undefined;
    readonly completedTargetIds: readonly string[];
  };
  readonly runtimeErrors: ReturnType<RuntimeErrorReporter['getDebugSnapshot']>;
}

export interface BrowserTestApi {
  snapshot(): BrowserTestSnapshot;
  executeDebugCommand(id: string, argument?: string): Promise<void>;
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
  readonly characterSelection: CharacterSelectionReader;
  readonly characterVisual: CharacterPlayerVisual;
  readonly characterPicker: CharacterPickerSystem;
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
  const unsubscribe = dependencies.interactions.events.on(
    'interaction:completed',
    ({ target: completedTarget }) =>
      completedTargetIds.push(completedTarget.id),
  );
  const api: BrowserTestApi = {
    snapshot: () => createSnapshot(dependencies, completedTargetIds),
    executeDebugCommand: (id, argument) =>
      dependencies.debug.executeCommand(id, argument),
  };
  target.__VANTA_TEST__ = api;
  return () => {
    unsubscribe();
    if (target.__VANTA_TEST__ === api) delete target.__VANTA_TEST__;
  };
}

function createSnapshot(
  dependencies: BrowserTestBridgeDependencies,
  completedTargetIds: readonly string[],
): BrowserTestSnapshot {
  const activeLevel = dependencies.level.activeLevel;
  const movement = dependencies.player.getDebugSnapshot();
  const position = dependencies.player.getPlayerPosition();
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
      movementState: movement.movementState,
    },
    character: dependencies.characterVisual.getDebugSnapshot(),
    selectedCharacterId: dependencies.characterSelection.getSelectedId(),
    picker: dependencies.characterPicker.getSnapshot(),
    camera: dependencies.camera.getDebugSnapshot(),
    interaction: {
      activeTargetId: dependencies.interactions.getActiveTarget()?.id,
      completedTargetIds: [...completedTargetIds],
    },
    runtimeErrors: dependencies.errors.getDebugSnapshot(),
  };
}
