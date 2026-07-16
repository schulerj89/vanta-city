import { AnimationMixer, Group, Vector3 } from 'three';
import type { AnimationAction } from 'three';
import type { CharacterDefinition } from '../characters/CharacterDefinition';
import type { LoadedCharacter } from '../characters/CharacterLoader';
import {
  calculateCharacterVisualAlignment,
  measureModelBounds,
} from '../characters/CharacterVisualAlignment';
import type { FrameTime } from '../core/time';
import type { GameObject } from '../entities/GameObject';
import type { ConversationCoordinator } from '../conversations/ConversationCoordinator';
import type { WorldPoseSource, WorldPosition } from '../world/Spatial';
import type { SpawnPointDefinition } from '../world/LevelDefinition';
import type { NpcDefinition } from './NpcDefinition';

export interface NpcCharacterLoader {
  instantiate(definition: CharacterDefinition): Promise<LoadedCharacter>;
}

export type NpcInteractionState = 'available' | 'blocked' | 'conversation';
export type NpcConversationState = 'idle' | 'other-active' | 'active';

export interface NpcDebugSnapshot {
  readonly npcId: string;
  readonly definitionId: string;
  readonly spawnId: string;
  readonly currentAnimation: string;
  readonly interactionState: NpcInteractionState;
  readonly conversationState: NpcConversationState;
  readonly modelFallback: boolean;
}

export function calculateFacingYaw(
  from: WorldPosition,
  to: WorldPosition,
  fallback = 0,
): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  return Math.hypot(dx, dz) < 1e-6 ? fallback : Math.atan2(dx, dz);
}

export function smoothFacingYaw(
  current: number,
  target: number,
  delta: number,
  sharpness = 8,
): number {
  const difference = Math.atan2(
    Math.sin(target - current),
    Math.cos(target - current),
  );
  return current + difference * (1 - Math.exp(-sharpness * Math.max(0, delta)));
}

export class NpcEntity implements GameObject {
  public readonly id: string;
  public readonly object3d = new Group();

  private readonly visualRoot = new Group();
  private readonly idleYaw: number;
  private loaded: LoadedCharacter | undefined;
  private mixer: AnimationMixer | undefined;
  private action: AnimationAction | undefined;
  private currentAnimation = 'loading';
  private elapsed = 0;
  private readonly modelOffset = new Vector3();

  public constructor(
    public readonly definition: NpcDefinition,
    public readonly spawn: SpawnPointDefinition,
    private readonly character: CharacterDefinition,
    private readonly loader: NpcCharacterLoader,
    private readonly conversations: ConversationCoordinator,
    private readonly player: WorldPoseSource,
  ) {
    this.id = `npc.${definition.id}`;
    this.idleYaw = definition.idleYaw ?? spawn.rotation?.[1] ?? 0;
    this.object3d.name = `${definition.displayName} NPC`;
    this.object3d.position.set(...spawn.position);
    this.object3d.rotation.y = this.idleYaw;
    this.visualRoot.name = `${definition.displayName} visual alignment`;
    this.object3d.add(this.visualRoot);
  }

  public async init(): Promise<void> {
    const loaded = await this.loader.instantiate(this.character);
    this.loaded = loaded;
    try {
      const bounds = measureModelBounds(loaded.root);
      const alignment = calculateCharacterVisualAlignment(
        { minY: bounds.min.y, maxY: bounds.max.y },
        this.character.transform?.verticalOffset,
      );
      this.modelOffset.copy(loaded.root.position);
      this.visualRoot.position.y = alignment.appliedVisualOffset;
      this.visualRoot.add(loaded.root);

      const clip = loaded.animationClips.get(this.definition.defaultAnimation);
      if (clip) {
        this.mixer = new AnimationMixer(loaded.root);
        this.action = this.mixer.clipAction(clip);
        this.action.play();
        this.currentAnimation = this.definition.defaultAnimation;
      } else {
        this.currentAnimation = 'static (idle unavailable)';
      }
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  public update(time: FrameTime): void {
    this.elapsed += time.delta;
    const playerPose = this.player.getWorldPose();
    let targetYaw = this.idleYaw;
    if (this.conversations.active?.npcId === this.definition.id && playerPose) {
      targetYaw = calculateFacingYaw(
        this.getWorldPosition(),
        playerPose.position,
        this.object3d.rotation.y,
      );
    } else {
      targetYaw +=
        Math.sin(this.elapsed * 0.45) * (this.definition.ambientYaw ?? 0);
    }
    this.object3d.rotation.y = smoothFacingYaw(
      this.object3d.rotation.y,
      targetYaw,
      time.delta,
    );
    this.mixer?.update(Math.max(0, time.delta));
    if (this.loaded) this.loaded.root.position.copy(this.modelOffset);
  }

  public getWorldPosition(): WorldPosition {
    return {
      x: this.object3d.position.x,
      y: this.object3d.position.y,
      z: this.object3d.position.z,
    };
  }

  public getDebugSnapshot(): NpcDebugSnapshot {
    const activeNpcId = this.conversations.active?.npcId;
    const conversationState: NpcConversationState =
      activeNpcId === this.definition.id
        ? 'active'
        : activeNpcId
          ? 'other-active'
          : 'idle';
    return {
      npcId: this.id,
      definitionId: this.definition.id,
      spawnId: this.spawn.id,
      currentAnimation: this.currentAnimation,
      interactionState:
        conversationState === 'active'
          ? 'conversation'
          : conversationState === 'other-active'
            ? 'blocked'
            : 'available',
      conversationState,
      modelFallback: this.loaded?.source !== 'asset',
    };
  }

  public dispose(): void {
    this.action?.stop();
    if (this.mixer && this.loaded) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.loaded.root);
    }
    this.action = undefined;
    this.mixer = undefined;
    this.loaded?.dispose();
    this.loaded = undefined;
    this.visualRoot.clear();
    this.object3d.clear();
    this.currentAnimation = 'disposed';
  }
}
