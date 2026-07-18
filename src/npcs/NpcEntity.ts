import { AnimationMixer, Group, LoopOnce, LoopRepeat, Vector3 } from 'three';
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
import type {
  WorldPose,
  WorldPoseSource,
  WorldPosition,
} from '../world/Spatial';
import type { SpawnPointDefinition } from '../world/LevelDefinition';
import type { NpcDefinition } from './NpcDefinition';
import { CharacterEquipment } from '../equipment/CharacterEquipment';
import { EquipmentPresentation } from '../equipment/EquipmentPresentation';
import type { GameAssetLoader } from '../assets/AssetLoader';
import type { EquipmentId } from '../equipment/EquipmentDefinition';

export interface NpcCharacterLoader {
  instantiate(definition: CharacterDefinition): Promise<LoadedCharacter>;
}

export type NpcInteractionState = 'available' | 'blocked' | 'conversation';
export type NpcConversationState = 'idle' | 'other-active' | 'active';

export interface NpcDebugSnapshot {
  readonly npcId: string;
  readonly definitionId: string;
  readonly characterId: string;
  readonly spawnId: string;
  readonly currentAnimation: string;
  readonly modelSource: LoadedCharacter['source'] | 'pending';
  readonly visualBounds:
    | {
        readonly minY: number;
        readonly maxY: number;
        readonly height: number;
        readonly groundedMinY: number;
      }
    | undefined;
  readonly appliedVisualOffset: number | undefined;
  readonly gestureActive: boolean;
  readonly lastGestureSource: string | undefined;
  readonly lastGestureAccepted: boolean;
  readonly gestureSequence: number;
  readonly interactionState: NpcInteractionState;
  readonly conversationState: NpcConversationState;
  readonly modelFallback: boolean;
  readonly facingYaw: number;
  readonly equipment: ReturnType<CharacterEquipment['getSnapshot']>;
  readonly equipmentPresentation: ReturnType<
    EquipmentPresentation['getSnapshot']
  >;
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
  public readonly equipment: CharacterEquipment;

  private readonly visualRoot = new Group();
  private readonly idleYaw: number;
  private loaded: LoadedCharacter | undefined;
  private mixer: AnimationMixer | undefined;
  private action: AnimationAction | undefined;
  private currentAnimation = 'loading';
  private visualBounds: NpcDebugSnapshot['visualBounds'];
  private appliedVisualOffset: number | undefined;
  private gestureActive = false;
  private gestureRemaining = 0;
  private lastGestureSource: string | undefined;
  private lastGestureAccepted = false;
  private gestureSequence = 0;
  private elapsed = 0;
  private readonly modelOffset = new Vector3();
  private readonly equipmentPresentation: EquipmentPresentation;

  public constructor(
    public readonly definition: NpcDefinition,
    public readonly spawn: SpawnPointDefinition,
    private readonly character: CharacterDefinition,
    private readonly loader: NpcCharacterLoader,
    private readonly conversations: ConversationCoordinator,
    private readonly player: WorldPoseSource,
    assets?: Pick<GameAssetLoader, 'instantiateModel'>,
  ) {
    this.id = `npc.${definition.id}`;
    this.equipment = new CharacterEquipment(this.id);
    this.equipmentPresentation = new EquipmentPresentation(
      this.equipment,
      assets,
    );
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
      this.appliedVisualOffset = alignment.appliedVisualOffset;
      this.visualBounds = {
        minY: bounds.min.y,
        maxY: bounds.max.y,
        height: bounds.max.y - bounds.min.y,
        groundedMinY: bounds.min.y + alignment.appliedVisualOffset,
      };
      this.visualRoot.add(loaded.root);
      this.equipmentPresentation.bind(
        loaded.root,
        this.character.equipmentRigId,
      );

      if (loaded.animationClips.size > 0) {
        this.mixer = new AnimationMixer(loaded.root);
      }
      this.playIdle();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  public update(time: FrameTime): void {
    this.elapsed += time.delta;
    const playerPose = this.player.getWorldPose();
    let targetYaw = this.idleYaw;
    const isActiveConversation =
      this.conversations.active?.npcId === this.definition.id;
    if (isActiveConversation && playerPose) {
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
    // Character assets retain their authored model yaw for idle presentation.
    // Cancel it only for the live two-person presentation so the rendered body
    // follows the NPC's authoritative conversational forward direction.
    this.visualRoot.rotation.y = isActiveConversation
      ? -(this.character.transform?.rotation?.[1] ?? 0)
      : 0;
    const delta = Math.max(0, time.delta);
    this.mixer?.update(delta);
    this.equipmentPresentation.update(delta);
    if (this.loaded) this.loaded.root.position.copy(this.modelOffset);
    if (this.gestureActive) {
      this.gestureRemaining = Math.max(0, this.gestureRemaining - delta);
      if (this.gestureRemaining === 0) {
        this.gestureActive = false;
        this.playIdle();
      }
    }
  }

  public triggerGesture(source = 'interaction'): boolean {
    return this.triggerOneShot(this.definition.gestureAnimation, source);
  }

  public equip(itemId: EquipmentId): boolean {
    return this.equipment.equip(itemId);
  }

  public useEquipment(source = 'npc-equipment'): boolean {
    return this.equipment.useWithTrigger(
      (action, requestSource) => this.triggerOneShot(action, requestSource),
      source,
    );
  }

  private triggerOneShot(logicalClip: string, source: string): boolean {
    const clip = this.loaded?.animationClips.get(logicalClip);
    const accepted = Boolean(this.mixer && clip);
    this.lastGestureSource = source;
    this.lastGestureAccepted = accepted;
    if (!accepted || !this.mixer || !clip) return false;

    this.action?.fadeOut(0.12);
    this.action = this.mixer.clipAction(clip);
    this.action
      .reset()
      .setLoop(LoopOnce, 1)
      .setEffectiveTimeScale(1)
      .fadeIn(0.12)
      .play();
    this.action.clampWhenFinished = true;
    this.gestureActive = true;
    this.gestureRemaining = Math.max(0.05, clip.duration);
    this.gestureSequence += 1;
    this.currentAnimation = logicalClip;
    return true;
  }

  public getWorldPosition(): WorldPosition {
    return {
      x: this.object3d.position.x,
      y: this.object3d.position.y,
      z: this.object3d.position.z,
    };
  }

  public getWorldPose(): WorldPose {
    return {
      position: this.getWorldPosition(),
      forward: {
        x: Math.sin(this.object3d.rotation.y),
        y: 0,
        z: Math.cos(this.object3d.rotation.y),
      },
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
      characterId: this.character.id,
      spawnId: this.spawn.id,
      currentAnimation: this.currentAnimation,
      modelSource: this.loaded?.source ?? 'pending',
      visualBounds: this.visualBounds,
      appliedVisualOffset: this.appliedVisualOffset,
      gestureActive: this.gestureActive,
      lastGestureSource: this.lastGestureSource,
      lastGestureAccepted: this.lastGestureAccepted,
      gestureSequence: this.gestureSequence,
      interactionState:
        conversationState === 'active'
          ? 'conversation'
          : conversationState === 'other-active'
            ? 'blocked'
            : 'available',
      conversationState,
      modelFallback: this.loaded?.source !== 'asset',
      facingYaw: this.object3d.rotation.y,
      equipment: this.equipment.getSnapshot(),
      equipmentPresentation: this.equipmentPresentation.getSnapshot(),
    };
  }

  public dispose(): void {
    this.action?.stop();
    this.equipmentPresentation.dispose();
    this.equipment.dispose();
    if (this.mixer && this.loaded) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.loaded.root);
    }
    this.action = undefined;
    this.mixer = undefined;
    this.gestureActive = false;
    this.gestureRemaining = 0;
    this.loaded?.dispose();
    this.loaded = undefined;
    this.visualRoot.clear();
    this.object3d.clear();
    this.currentAnimation = 'disposed';
  }

  private playIdle(): void {
    const clip = this.loaded?.animationClips.get(
      this.definition.defaultAnimation,
    );
    if (!clip || !this.mixer) {
      this.action = undefined;
      this.currentAnimation = 'static (idle unavailable)';
      return;
    }
    this.action?.fadeOut(0.12);
    this.action = this.mixer.clipAction(clip);
    this.action
      .reset()
      .setLoop(LoopRepeat, Infinity)
      .setEffectiveTimeScale(1)
      .fadeIn(0.12)
      .play();
    this.action.clampWhenFinished = false;
    this.currentAnimation = this.definition.defaultAnimation;
  }
}
