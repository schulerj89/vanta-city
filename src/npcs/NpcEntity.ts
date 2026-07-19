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
import { HealthComponent } from '../health/Health';
import { CharacterDeathPresentation } from '../characters/CharacterDeathPresentation';
import type { WeaponDamageTarget } from '../combat/WeaponDamage';
import {
  CinematicPerformanceController,
  type CharacterPerformanceBinding,
  type CinematicPerformanceOwner,
  type CinematicPerformancePreflight,
  type CinematicPerformanceRequest,
  type CinematicPerformanceRestoreToken,
  type CinematicPerformanceSnapshot,
  type PerformanceReleaseReason,
} from '../cinematics/CinematicPerformanceController';
import { getCharacterPerformanceProfile } from '../cinematics/CharacterPerformanceProfiles';

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
  readonly performance: CinematicPerformanceSnapshot | undefined;
  readonly equipment: ReturnType<CharacterEquipment['getSnapshot']>;
  readonly equipmentPresentation: ReturnType<
    EquipmentPresentation['getSnapshot']
  >;
  readonly health: ReturnType<HealthComponent['getSnapshot']>;
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

interface NpcPerformanceGameplayState {
  readonly animationId: string;
  readonly actionTime: number;
  readonly actionPaused: boolean;
  readonly actionTimeScale: number;
  readonly gestureActive: boolean;
  readonly gestureRemaining: number;
  readonly facingYaw: number;
  readonly facingTargetYaw: number | undefined;
  readonly position: WorldPosition;
}

export class NpcEntity
  implements GameObject, WeaponDamageTarget, CinematicPerformanceOwner
{
  public readonly id: string;
  public readonly object3d = new Group();
  public readonly equipment: CharacterEquipment;
  public readonly health: HealthComponent;

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
  private readonly deathPresentation = new CharacterDeathPresentation();
  private readonly unsubscribeHealth: (() => void)[] = [];
  private performance:
    CinematicPerformanceController<NpcPerformanceGameplayState> | undefined;
  private performanceFacingYaw: number | undefined;

  public get participantId(): string {
    return this.definition.id;
  }

  public get performanceEvents() {
    return this.requirePerformance().events;
  }

  public get ownerId(): string {
    return this.id;
  }

  public get enabled(): boolean {
    return this.health.alive;
  }

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
    this.health = new HealthComponent(this.id, 100);
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
      this.deathPresentation.bind(loaded.root);
      this.equipmentPresentation.bind(
        loaded.root,
        this.character.equipmentRigId,
      );

      if (loaded.animationClips.size > 0) {
        this.mixer = new AnimationMixer(loaded.root);
        this.mixer.addEventListener('finished', this.onMixerFinished);
      }
      this.playIdle();
      const profile = getCharacterPerformanceProfile(this.character.id);
      if (profile) {
        this.performance = new CinematicPerformanceController(
          this.participantId,
          profile,
          {
            captureGameplayState: () => this.captureGameplayPerformanceState(),
            restoreGameplayState: (state) =>
              this.restoreGameplayPerformanceState(state),
            hasAnimation: (animationId) =>
              this.loaded?.animationClips.has(animationId) ?? false,
            playAnimation: (binding) => this.playPerformanceAnimation(binding),
            holdAnimation: () => {
              if (this.action) this.action.paused = true;
            },
            releaseAnimation: () => this.action?.fadeOut(0.1),
            setPerformanceFacingTarget: (yaw) => {
              this.performanceFacingYaw = yaw;
            },
            getActionOwnerCount: () => (this.action ? 1 : 0),
            getMixerOwnerCount: () => (this.mixer ? 1 : 0),
          },
        );
      }
      this.unsubscribeHealth.push(
        this.health.events.on('depleted', () => {
          this.gestureActive = false;
          const nativeDeath = this.triggerOneShot('death', 'health:depleted');
          this.deathPresentation.setDepleted(true, nativeDeath);
        }),
        this.health.events.on('restored', () => {
          this.deathPresentation.setDepleted(false, false);
          this.playIdle();
        }),
      );
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
    if (this.performanceFacingYaw !== undefined) {
      targetYaw = this.performanceFacingYaw;
    } else if (isActiveConversation && playerPose) {
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
    // The character definition owns a stable authored-axis correction. The
    // visual alignment root therefore never changes yaw at conversation entry.
    this.visualRoot.rotation.y = 0;
    const delta = Math.max(0, time.delta);
    this.mixer?.update(delta);
    this.equipmentPresentation.update(delta);
    this.deathPresentation.update(delta);
    if (this.loaded) this.loaded.root.position.copy(this.modelOffset);
    if (this.gestureActive) {
      this.gestureRemaining = Math.max(0, this.gestureRemaining - delta);
      if (this.gestureRemaining === 0) {
        this.gestureActive = false;
        const requestId = this.performance?.getPerformanceSnapshot().requestId;
        if (requestId)
          this.performance?.releasePerformance(requestId, 'completed');
        else if (this.health.alive) this.playIdle();
      }
    }
  }

  public triggerApplause(source = 'explicit-applause'): boolean {
    const animation = this.definition.applauseAnimation;
    return animation ? this.triggerOneShot(animation, source) : false;
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

  public getHurtVolume(): { readonly radius: number; readonly height: number } {
    return { radius: 0.38, height: this.visualBounds?.height ?? 1.8 };
  }

  public getCollisionIgnoreIds(): readonly string[] {
    return [`c.npc-${this.definition.id}`];
  }

  public receiveWeaponDamage(): boolean {
    if (!this.health.alive) return false;
    this.triggerOneShot('getHit', 'weapon-impact');
    return true;
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

  /** Participant-owner staging seam; cinematic data supplies authored marks. */
  public setPerformancePosition(position: WorldPosition): void {
    this.object3d.position.set(position.x, position.y, position.z);
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
      performance: this.performance?.getPerformanceSnapshot(),
      equipment: this.equipment.getSnapshot(),
      equipmentPresentation: this.equipmentPresentation.getSnapshot(),
      health: this.health.getSnapshot(),
    };
  }

  public dispose(): void {
    this.performance?.dispose();
    this.performance = undefined;
    this.action?.stop();
    this.equipmentPresentation.dispose();
    this.equipment.dispose();
    for (const unsubscribe of this.unsubscribeHealth.splice(0)) unsubscribe();
    this.deathPresentation.dispose();
    this.health.dispose();
    if (this.mixer && this.loaded) {
      this.mixer.removeEventListener('finished', this.onMixerFinished);
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

  public preflightPerformance(
    request: CinematicPerformanceRequest,
  ): CinematicPerformancePreflight {
    return this.requirePerformance().preflightPerformance(request);
  }

  public capturePerformanceState(): CinematicPerformanceRestoreToken {
    return this.requirePerformance().capturePerformanceState();
  }

  public startPerformance(
    request: CinematicPerformanceRequest,
  ): CinematicPerformancePreflight {
    return this.requirePerformance().startPerformance(request);
  }

  public holdPerformance(requestId: string): boolean {
    return this.performance?.holdPerformance(requestId) ?? false;
  }

  public releasePerformance(
    requestId: string,
    reason: PerformanceReleaseReason,
  ): boolean {
    return this.performance?.releasePerformance(requestId, reason) ?? false;
  }

  public restorePerformance(token: CinematicPerformanceRestoreToken): boolean {
    return this.performance?.restorePerformance(token) ?? false;
  }

  public getPerformanceSnapshot(): CinematicPerformanceSnapshot {
    return this.requirePerformance().getPerformanceSnapshot();
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

  private requirePerformance(): CinematicPerformanceController<NpcPerformanceGameplayState> {
    if (!this.performance)
      throw new Error(`NPC "${this.definition.id}" performance is unavailable`);
    return this.performance;
  }

  private captureGameplayPerformanceState(): NpcPerformanceGameplayState {
    return {
      animationId: this.currentAnimation,
      actionTime: this.action?.time ?? 0,
      actionPaused: this.action?.paused ?? false,
      actionTimeScale: this.action?.timeScale ?? 1,
      gestureActive: this.gestureActive,
      gestureRemaining: this.gestureRemaining,
      facingYaw: this.object3d.rotation.y,
      facingTargetYaw: this.performanceFacingYaw,
      position: this.getWorldPosition(),
    };
  }

  private restoreGameplayPerformanceState(
    state: NpcPerformanceGameplayState,
  ): void {
    this.action?.stop();
    const clip = this.loaded?.animationClips.get(state.animationId);
    if (clip && this.mixer) {
      this.action = this.mixer.clipAction(clip).reset();
      this.action
        .setLoop(
          state.gestureActive ? LoopOnce : LoopRepeat,
          state.gestureActive ? 1 : Infinity,
        )
        .setEffectiveTimeScale(state.actionTimeScale)
        .play();
      this.action.time = state.actionTime;
      this.action.paused = state.actionPaused;
      this.action.clampWhenFinished = state.gestureActive;
    } else {
      this.action = undefined;
    }
    this.currentAnimation = state.animationId;
    this.gestureActive = state.gestureActive;
    this.gestureRemaining = state.gestureRemaining;
    this.object3d.rotation.y = state.facingYaw;
    this.performanceFacingYaw = state.facingTargetYaw;
    this.setPerformancePosition(state.position);
  }

  private playPerformanceAnimation(
    binding: CharacterPerformanceBinding,
  ): boolean {
    const clip = this.loaded?.animationClips.get(binding.animationId);
    if (!clip || !this.mixer) return false;
    this.action?.fadeOut(0.12);
    this.action = this.mixer.clipAction(clip).reset();
    const oneShot = binding.playback !== 'loop';
    this.action
      .setLoop(oneShot ? LoopOnce : LoopRepeat, oneShot ? 1 : Infinity)
      .setEffectiveTimeScale(1)
      .fadeIn(0.12)
      .play();
    this.action.clampWhenFinished = oneShot;
    this.currentAnimation = binding.animationId;
    this.gestureActive = oneShot;
    this.gestureRemaining = oneShot ? Math.max(0.05, clip.duration + 0.1) : 0;
    return true;
  }

  private readonly onMixerFinished = (event: {
    readonly action: AnimationAction;
  }): void => {
    if (event.action !== this.action) return;
    const snapshot = this.performance?.getPerformanceSnapshot();
    if (snapshot?.requestId) {
      this.performance?.releasePerformance(snapshot.requestId, 'completed');
      return;
    }
    if (this.gestureActive) {
      this.gestureActive = false;
      if (this.health.alive) this.playIdle();
    }
  };
}
