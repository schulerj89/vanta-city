import {
  AnimationMixer,
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  LoopOnce,
  LoopRepeat,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Vector3,
} from 'three';
import type { AnimationAction } from 'three';
import type { AnimationClip } from 'three';
import type {
  ActionTargetEvaluation,
  ActionTargetRejectionReason,
  CharacterActionTarget,
  CharacterActionImpact,
} from '../actions/ActionTarget';
import { evaluateActionTarget, isStrikeAction } from '../actions/ActionTarget';
import type { CharacterDefinition } from '../characters/CharacterDefinition';
import type { LoadedCharacter } from '../characters/CharacterLoader';
import {
  calculateCharacterVisualAlignment,
  measureModelBounds,
} from '../characters/CharacterVisualAlignment';
import type { GameSystem } from '../core/lifecycle';
import type { FrameTime } from '../core/time';
import type { GameObject } from '../entities/GameObject';
import type { GameObjectWorld } from '../entities/GameObjectWorld';
import type { PlayerActionEvents } from '../player/PlayerControllerSystem';
import type { WorldPose, WorldPoseSource } from '../world/Spatial';
import type { LevelDefinition } from '../world/LevelDefinition';
import type { EventBus } from '../core/events';
import { CharacterAnimationStateMachine } from '../characters/CharacterAnimationStateMachine';
import type { CharacterAnimationGraphState } from '../characters/CharacterAnimationStateMachine';
import {
  sparringTargetCharacterDefinition,
  sparringTargetConfig,
} from './sparringTarget';

export interface SparringCharacterLoader {
  instantiate(definition: CharacterDefinition): Promise<LoadedCharacter>;
}

export interface SparringPlayer extends WorldPoseSource {
  readonly events: EventBus<PlayerActionEvents>;
}

export interface SparringCameraFocusHandle {
  readonly active: boolean;
  release(): void;
}

export interface SparringCameraFocusSurface {
  requestGameplayFocus(request: {
    readonly owner: string;
    readonly maxDistance: number;
  }): SparringCameraFocusHandle;
}

export interface SparringTargetOptions {
  readonly camera?: SparringCameraFocusSurface;
  readonly gameplayAvailable?: () => boolean;
}

export interface SparringTargetSnapshot {
  readonly id: string;
  readonly enabled: boolean;
  readonly loaded: boolean;
  readonly modelSource: LoadedCharacter['source'] | 'pending';
  readonly animation: string;
  readonly animationGraph: CharacterAnimationGraphState | undefined;
  readonly busy: boolean;
  readonly responseSequence: number;
  readonly ignoredSequence: number;
  readonly lastAction: string | undefined;
  readonly lastIgnoredReason:
    ActionTargetRejectionReason | 'game-state' | undefined;
  readonly feedback:
    | 'inactive'
    | 'ready'
    | 'accepted'
    | 'ignored-disabled'
    | 'ignored-out-of-range'
    | 'ignored-not-facing'
    | 'ignored-target-busy'
    | 'ignored-vertical-miss'
    | 'ignored-game-state';
  readonly feedbackSequence: number;
  readonly impactSequence: number;
  readonly lastImpactNormalizedTime: number | undefined;
  readonly distance: number;
  readonly facingDot: number;
  readonly facing: boolean;
  readonly horizontalContact: boolean;
  readonly verticalContact: boolean;
  readonly horizontalSeparation: number;
  readonly combinedRadius: number;
  readonly verticalOverlap: number;
  readonly rejectionReason: ActionTargetEvaluation['rejectionReason'];
  readonly eligible: boolean;
  readonly attackKind: ActionTargetEvaluation['actionKind'];
  readonly attackStart: ActionTargetEvaluation['attackStart'];
  readonly attackEnd: ActionTargetEvaluation['attackEnd'];
  readonly closestContact: ActionTargetEvaluation['closestContact'];
  readonly engagement: {
    readonly engaged: boolean;
    readonly distance: number;
    readonly inDistance: boolean;
    readonly facing: boolean;
    readonly vertical: boolean;
    readonly gameplayAvailable: boolean;
    readonly cameraRequested: boolean;
    readonly distanceLimit: number;
    readonly cameraDistance: number;
  };
  readonly modelAssetId: string;
  readonly reactionClipName: string;
  readonly reactionDuration: number | undefined;
  readonly visualizationVisible: boolean;
  readonly groundedMinY: number | undefined;
  readonly height: number | undefined;
}

export class SparringTargetSystem implements GameSystem {
  public readonly id = 'debug-sparring-target';
  public readonly updateMode = 'always' as const;

  private entity: SparringTargetEntity | undefined;
  private unsubscribePlayer: (() => void) | undefined;
  private ignoredSequence = 0;
  private lastIgnoredReason: SparringTargetSnapshot['lastIgnoredReason'];
  private lastEvaluation: ActionTargetEvaluation | undefined;
  private lastStrike: 'punchLeft' | 'punchRight' | 'kickLeft' | 'kickRight' =
    'punchLeft';
  private cameraFocus: SparringCameraFocusHandle | undefined;
  private visualization: SparringEligibilityVisualization | undefined;
  private feedback: SparringTargetSnapshot['feedback'] = 'inactive';
  private feedbackSequence = 0;
  private impactSequence = 0;
  private lastImpactNormalizedTime: number | undefined;
  private feedbackRemaining = 0;

  public constructor(
    private readonly loader: SparringCharacterLoader,
    private readonly objects: GameObjectWorld,
    private readonly player: SparringPlayer,
    private readonly levels: {
      readonly activeLevel: LevelDefinition | undefined;
    },
    private readonly options: SparringTargetOptions = {},
  ) {}

  public async init(): Promise<void> {
    const level = this.levels.activeLevel;
    if (level?.id !== 'test-district') return;
    const spawn = level.spawns.find(
      ({ id, kind }) => id === sparringTargetConfig.spawnId && kind === 'npc',
    );
    if (!spawn) {
      throw new Error(
        `Debug sparring target requires NPC spawn "${sparringTargetConfig.spawnId}"`,
      );
    }
    const entity = new SparringTargetEntity(
      spawn.position,
      spawn.rotation?.[1] ?? 0,
      this.loader,
    );
    await entity.init();
    this.entity = entity;
    this.objects.add(entity);
    this.visualization = new SparringEligibilityVisualization();
    this.objects.add(this.visualization);
    this.unsubscribePlayer = this.player.events.on(
      'character-action:impact',
      (impact) => this.respond(impact),
    );
  }

  public update(time: FrameTime): void {
    const entity = this.entity;
    const playerPose = this.player.getWorldPose();
    if (!entity || !playerPose) return;
    this.lastEvaluation = this.evaluate(playerPose, this.lastStrike);
    this.feedbackRemaining = Math.max(
      0,
      this.feedbackRemaining - Math.max(0, time.delta),
    );
    if (this.feedbackRemaining === 0) {
      this.feedback = entity.enabled ? 'ready' : 'inactive';
    }
    this.visualization?.sync(
      playerPose,
      entity.getWorldPose(),
      this.lastEvaluation,
      entity.enabled,
      this.feedback,
    );
    this.syncCameraFocus(playerPose, entity.getWorldPose());
  }

  public setEnabled(enabled: boolean): void {
    this.entity?.setEnabled(enabled);
    if (!enabled) this.lastIgnoredReason = undefined;
    this.feedback = enabled ? 'ready' : 'inactive';
    this.feedbackRemaining = 0;
    if (!enabled) this.releaseCameraFocus();
  }

  public reset(): void {
    this.ignoredSequence = 0;
    this.lastIgnoredReason = undefined;
    this.feedbackSequence = 0;
    this.impactSequence = 0;
    this.lastImpactNormalizedTime = undefined;
    this.feedback = this.entity?.enabled ? 'ready' : 'inactive';
    this.feedbackRemaining = 0;
    this.entity?.reset();
  }

  public getSnapshot(): SparringTargetSnapshot {
    const entity = this.entity;
    const presentation = entity?.getSnapshot();
    const playerPose = this.player.getWorldPose();
    const evaluation =
      entity && playerPose
        ? this.evaluate(playerPose, this.lastStrike)
        : this.lastEvaluation;
    const engagement = this.evaluateEngagement(
      playerPose,
      entity?.getWorldPose(),
      entity?.enabled ?? false,
    );
    if (evaluation) this.lastEvaluation = evaluation;
    return {
      id: entity?.id ?? this.id,
      enabled: entity?.enabled ?? false,
      loaded: entity !== undefined,
      modelSource: presentation?.modelSource ?? 'pending',
      animation: presentation?.animation ?? 'unavailable',
      animationGraph: presentation?.animationGraph,
      busy: presentation?.busy ?? false,
      responseSequence: presentation?.responseSequence ?? 0,
      ignoredSequence: this.ignoredSequence,
      lastAction: presentation?.lastAction,
      lastIgnoredReason: this.lastIgnoredReason,
      feedback: this.feedback,
      feedbackSequence: this.feedbackSequence,
      impactSequence: this.impactSequence,
      lastImpactNormalizedTime: this.lastImpactNormalizedTime,
      distance: evaluation?.distance ?? Infinity,
      facingDot: evaluation?.facingDot ?? -1,
      facing: evaluation?.facing ?? false,
      horizontalContact: evaluation?.horizontalContact ?? false,
      verticalContact: evaluation?.verticalContact ?? false,
      horizontalSeparation: evaluation?.horizontalSeparation ?? Infinity,
      combinedRadius: evaluation?.combinedRadius ?? 0,
      verticalOverlap: evaluation?.verticalOverlap ?? 0,
      rejectionReason: evaluation?.rejectionReason,
      eligible: evaluation?.eligible ?? false,
      attackKind: evaluation?.actionKind ?? 'punch',
      attackStart: evaluation?.attackStart ?? { x: 0, y: 0, z: 0 },
      attackEnd: evaluation?.attackEnd ?? { x: 0, y: 0, z: 0 },
      closestContact: evaluation?.closestContact ?? { x: 0, y: 0, z: 0 },
      engagement: {
        ...engagement,
        cameraRequested: this.cameraFocus !== undefined,
        distanceLimit: sparringTargetConfig.engagementDistance,
        cameraDistance: sparringTargetConfig.focusedCameraDistance,
      },
      modelAssetId: sparringTargetCharacterDefinition.modelAssetId,
      reactionClipName: 'CharacterArmature|HitRecieve',
      reactionDuration: presentation?.reactionDuration,
      visualizationVisible: this.visualization?.object3d.visible ?? false,
      groundedMinY: presentation?.groundedMinY,
      height: presentation?.height,
    };
  }

  public dispose(): void {
    this.releaseCameraFocus();
    this.unsubscribePlayer?.();
    this.unsubscribePlayer = undefined;
    if (this.visualization) this.objects.remove(this.visualization.id);
    this.visualization = undefined;
    if (this.entity) this.objects.remove(this.entity.id);
    this.entity = undefined;
  }

  private respond(impact: CharacterActionImpact): void {
    if (!isStrikeAction(impact.action) || !this.entity) return;
    this.impactSequence += 1;
    this.lastImpactNormalizedTime = impact.normalizedTime;
    this.lastStrike = impact.action;
    if (this.options.gameplayAvailable?.() === false) {
      this.ignore('game-state');
      return;
    }
    if (!this.entity.enabled) {
      this.ignore('disabled');
      return;
    }
    const playerPose = this.player.getWorldPose();
    if (!playerPose) {
      this.ignore('out-of-range');
      return;
    }
    const evaluation = this.evaluate(playerPose, impact.action);
    this.lastEvaluation = evaluation;
    if (!evaluation.eligible) {
      this.ignore(evaluation.rejectionReason ?? 'out-of-range');
      return;
    }
    if (!this.entity.receiveActionImpact(impact)) {
      this.ignore('target-busy');
      return;
    }
    this.lastIgnoredReason = undefined;
    this.setFeedback('accepted');
  }

  private evaluate(
    playerPose: WorldPose,
    action: 'punchLeft' | 'punchRight' | 'kickLeft' | 'kickRight',
  ): ActionTargetEvaluation {
    const entity = this.entity;
    return evaluateActionTarget(
      playerPose,
      entity?.getWorldPose() ?? playerPose,
      action,
      sparringTargetConfig.volumes,
      {
        enabled: entity?.enabled ?? false,
        targetBusy: entity?.isBusy ?? false,
      },
    );
  }

  private evaluateEngagement(
    playerPose: WorldPose | undefined,
    targetPose: WorldPose | undefined,
    enabled: boolean,
  ) {
    if (!playerPose || !targetPose) {
      return {
        engaged: false,
        distance: Infinity,
        inDistance: false,
        facing: false,
        vertical: false,
        gameplayAvailable: false,
      };
    }
    const dx = targetPose.position.x - playerPose.position.x;
    const dz = targetPose.position.z - playerPose.position.z;
    const distance = Math.hypot(dx, dz);
    const facingDot =
      distance <= 1e-6
        ? 1
        : (playerPose.forward.x * dx + playerPose.forward.z * dz) / distance;
    const inDistance = distance <= sparringTargetConfig.engagementDistance;
    const facing = facingDot >= sparringTargetConfig.engagementMinimumFacingDot;
    const vertical =
      Math.abs(targetPose.position.y - playerPose.position.y) <=
      sparringTargetConfig.volumes.hurt.height;
    const gameplayAvailable = this.options.gameplayAvailable?.() ?? true;
    return {
      engaged: enabled && inDistance && facing && vertical && gameplayAvailable,
      distance,
      inDistance,
      facing,
      vertical,
      gameplayAvailable,
    };
  }

  private syncCameraFocus(playerPose: WorldPose, targetPose: WorldPose): void {
    const engagement = this.evaluateEngagement(
      playerPose,
      targetPose,
      this.entity?.enabled ?? false,
    );
    if (engagement.engaged && !this.cameraFocus) {
      this.cameraFocus = this.options.camera?.requestGameplayFocus({
        owner: this.id,
        maxDistance: sparringTargetConfig.focusedCameraDistance,
      });
    } else if (!engagement.engaged) {
      this.releaseCameraFocus();
    }
  }

  private releaseCameraFocus(): void {
    this.cameraFocus?.release();
    this.cameraFocus = undefined;
  }

  private ignore(
    reason: NonNullable<SparringTargetSnapshot['lastIgnoredReason']>,
  ): void {
    this.ignoredSequence += 1;
    this.lastIgnoredReason = reason;
    this.setFeedback(`ignored-${reason}`);
  }

  private setFeedback(feedback: SparringTargetSnapshot['feedback']): void {
    this.feedback = feedback;
    this.feedbackSequence += 1;
    this.feedbackRemaining = 1.2;
  }
}

interface SparringPresentationSnapshot {
  readonly modelSource: LoadedCharacter['source'] | 'pending';
  readonly animation: string;
  readonly animationGraph: CharacterAnimationGraphState;
  readonly busy: boolean;
  readonly responseSequence: number;
  readonly lastAction: string | undefined;
  readonly groundedMinY: number | undefined;
  readonly height: number | undefined;
  readonly reactionDuration: number | undefined;
}

class SparringTargetEntity implements GameObject, CharacterActionTarget {
  public readonly id = 'debug.sparring-target';
  public readonly object3d = new Group();
  public enabled = false;

  private readonly visualRoot = new Group();
  private loaded: LoadedCharacter | undefined;
  private mixer: AnimationMixer | undefined;
  private action: AnimationAction | undefined;
  private animation = 'loading';
  private busy = false;
  private fallbackRemaining = 0;
  private responseSequence = 0;
  private lastAction: string | undefined;
  private groundedMinY: number | undefined;
  private height: number | undefined;
  private readonly modelOffset = new Vector3();
  private readonly clips = new Map<string, AnimationClip>();
  private readonly animationGraph = new CharacterAnimationStateMachine();
  private activeReaction: string | undefined;

  public get isBusy(): boolean {
    return this.busy;
  }

  public constructor(
    position: readonly [number, number, number],
    yaw: number,
    private readonly loader: SparringCharacterLoader,
  ) {
    this.object3d.name = 'Debug sparring target transform';
    this.object3d.position.set(...position);
    this.object3d.rotation.y = yaw;
    this.object3d.visible = false;
    this.visualRoot.name = 'Debug sparring target visual alignment';
    this.object3d.add(this.visualRoot);
  }

  public async init(): Promise<void> {
    const loaded = await this.loader.instantiate(
      sparringTargetCharacterDefinition,
    );
    this.loaded = loaded;
    const bounds = measureModelBounds(loaded.root);
    const alignment = calculateCharacterVisualAlignment({
      minY: bounds.min.y,
      maxY: bounds.max.y,
    });
    this.modelOffset.copy(loaded.root.position);
    this.visualRoot.position.y = alignment.appliedVisualOffset;
    this.groundedMinY =
      this.object3d.position.y + bounds.min.y + alignment.appliedVisualOffset;
    this.height = bounds.max.y - bounds.min.y;
    this.visualRoot.add(loaded.root);
    for (const [name, clip] of loaded.animationClips) {
      this.clips.set(name, clip);
    }
    if (loaded.animationClips.size > 0) {
      this.mixer = new AnimationMixer(loaded.root);
      this.mixer.addEventListener('finished', this.onMixerFinished);
    }
    this.playIdle();
  }

  public update(time: FrameTime): void {
    const delta = Math.max(0, time.delta);
    this.mixer?.update(delta);
    if (this.loaded) this.loaded.root.position.copy(this.modelOffset);
    if (!this.busy) return;
    this.fallbackRemaining = Math.max(0, this.fallbackRemaining - delta);
    if (this.fallbackRemaining === 0) this.finishResponse();
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.object3d.visible = enabled;
    if (!enabled) this.playIdle();
  }

  public receiveActionImpact(impact: CharacterActionImpact): boolean {
    if (!this.enabled || this.busy || !isStrikeAction(impact.action)) {
      return false;
    }
    const logicalClip = 'getHit';
    const clip = this.clips.get(logicalClip);
    if (!clip || !this.mixer) return false;
    this.activeReaction = logicalClip;
    this.busy = true;
    this.fallbackRemaining = Math.max(0.05, clip.duration + 0.1);
    this.responseSequence += 1;
    this.lastAction = impact.action;
    this.applyGraphTransition();
    return true;
  }

  public reset(): void {
    this.responseSequence = 0;
    this.lastAction = undefined;
    this.playIdle();
  }

  public getWorldPose(): WorldPose {
    return {
      position: {
        x: this.object3d.position.x,
        y: this.object3d.position.y,
        z: this.object3d.position.z,
      },
      forward: {
        x: Math.sin(this.object3d.rotation.y),
        y: 0,
        z: Math.cos(this.object3d.rotation.y),
      },
    };
  }

  public getSnapshot(): SparringPresentationSnapshot {
    return {
      modelSource: this.loaded?.source ?? 'pending',
      animation: this.animation,
      animationGraph: this.animationGraph.getState(),
      busy: this.busy,
      responseSequence: this.responseSequence,
      lastAction: this.lastAction,
      groundedMinY: this.groundedMinY,
      height: this.height,
      reactionDuration: this.clips.get('getHit')?.duration,
    };
  }

  public dispose(): void {
    if (this.mixer) {
      this.mixer.removeEventListener('finished', this.onMixerFinished);
      this.mixer.stopAllAction();
      if (this.loaded) this.mixer.uncacheRoot(this.loaded.root);
    }
    this.action = undefined;
    this.mixer = undefined;
    this.loaded?.dispose();
    this.loaded = undefined;
    this.clips.clear();
    this.animationGraph.reset();
    this.activeReaction = undefined;
    this.visualRoot.clear();
    this.object3d.clear();
  }

  private readonly onMixerFinished = (event: {
    readonly action: AnimationAction;
  }): void => {
    if (event.action === this.action && this.busy) this.finishResponse();
  };

  private finishResponse(): void {
    this.busy = false;
    this.activeReaction = undefined;
    this.fallbackRemaining = 0;
    this.playIdle();
  }

  private playIdle(): void {
    this.busy = false;
    this.activeReaction = undefined;
    this.fallbackRemaining = 0;
    this.applyGraphTransition();
  }

  private applyGraphTransition(): void {
    const mixer = this.mixer;
    if (!mixer) return;
    const transition = this.animationGraph.transition(
      { movement: 'idle', reaction: this.activeReaction },
      (logicalName) => this.clips.has(logicalName),
    );
    this.animation = transition.state.label;
    if (!transition.changed) return;
    this.action?.fadeOut(0.08);
    const clip = transition.state.resolvedClip
      ? this.clips.get(transition.state.resolvedClip)
      : undefined;
    this.action = clip ? mixer.clipAction(clip) : undefined;
    if (!this.action) return;
    this.action.reset().fadeIn(0.08);
    if (transition.state.phase === 'reaction') {
      this.action.setLoop(LoopOnce, 1);
      this.action.clampWhenFinished = true;
    } else {
      this.action.setLoop(LoopRepeat, Infinity);
      this.action.clampWhenFinished = false;
    }
    this.action.play();
  }
}

class SparringEligibilityVisualization implements GameObject {
  public readonly id = 'debug.sparring-eligibility';
  public readonly object3d = new Group();

  private readonly rangeMaterial = new MeshBasicMaterial({
    color: 0x35c8ff,
    transparent: true,
    opacity: 0.28,
    side: DoubleSide,
    depthWrite: false,
  });
  private readonly statusMaterial = new LineBasicMaterial({
    color: 0xff9f43,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
  });
  private readonly targetMaterial = new MeshBasicMaterial({
    color: 0xff9f43,
    transparent: true,
    opacity: 0.7,
    side: DoubleSide,
    depthWrite: false,
  });
  private readonly engagementRing = new Mesh(
    new RingGeometry(
      sparringTargetConfig.engagementDistance - 0.025,
      sparringTargetConfig.engagementDistance,
      64,
    ),
    this.rangeMaterial,
  );
  private readonly attackVolume = new Mesh(
    new BoxGeometry(1, 1, 1),
    new MeshBasicMaterial({
      color: 0x35c8ff,
      transparent: true,
      opacity: 0.12,
      wireframe: true,
      depthTest: false,
    }),
  );
  private readonly hurtVolume = new Mesh(
    new CylinderGeometry(
      sparringTargetConfig.volumes.hurt.radius,
      sparringTargetConfig.volumes.hurt.radius,
      sparringTargetConfig.volumes.hurt.height,
      24,
      1,
      true,
    ),
    new MeshBasicMaterial({
      color: 0xff9f43,
      transparent: true,
      opacity: 0.2,
      wireframe: true,
      depthTest: false,
    }),
  );
  private readonly targetRing = new Mesh(
    new RingGeometry(0.42, 0.48, 32),
    this.targetMaterial,
  );
  private readonly facingLines = new LineSegments(
    createFacingGeometry(),
    this.statusMaterial,
  );
  private readonly targetLine = new Line(
    new BufferGeometry(),
    this.statusMaterial,
  );

  public constructor() {
    this.object3d.name = 'Debug sparring eligibility visualization';
    this.object3d.visible = false;
    this.engagementRing.rotation.x = -Math.PI / 2;
    this.targetRing.rotation.x = -Math.PI / 2;
    this.engagementRing.renderOrder = 20;
    this.attackVolume.renderOrder = 21;
    this.hurtVolume.renderOrder = 21;
    this.targetRing.renderOrder = 21;
    this.facingLines.renderOrder = 22;
    this.targetLine.renderOrder = 22;
    this.object3d.add(
      this.engagementRing,
      this.attackVolume,
      this.hurtVolume,
      this.targetRing,
      this.facingLines,
      this.targetLine,
    );
  }

  public sync(
    actor: WorldPose,
    target: WorldPose,
    evaluation: ActionTargetEvaluation,
    enabled: boolean,
    feedback: SparringTargetSnapshot['feedback'],
  ): void {
    this.object3d.visible = enabled;
    if (!enabled) return;
    const actorY = actor.position.y + 0.04;
    const targetY = target.position.y + 0.04;
    this.engagementRing.position.set(
      actor.position.x,
      actorY,
      actor.position.z,
    );
    this.facingLines.position.set(actor.position.x, actorY, actor.position.z);
    this.facingLines.rotation.y = Math.atan2(actor.forward.x, actor.forward.z);
    this.targetRing.position.set(target.position.x, targetY, target.position.z);
    const attack = sparringTargetConfig.volumes[evaluation.actionKind];
    const start = evaluation.attackStart;
    const end = evaluation.attackEnd;
    this.attackVolume.position.set(
      (start.x + end.x) / 2,
      (evaluation.attackMinimumY + evaluation.attackMaximumY) / 2,
      (start.z + end.z) / 2,
    );
    this.attackVolume.rotation.y = Math.atan2(actor.forward.x, actor.forward.z);
    this.attackVolume.scale.set(
      attack.radius * 2,
      evaluation.attackMaximumY - evaluation.attackMinimumY,
      attack.horizontalReach + attack.radius * 2,
    );
    this.hurtVolume.position.set(
      target.position.x,
      target.position.y + sparringTargetConfig.volumes.hurt.height / 2,
      target.position.z,
    );
    this.targetLine.geometry.setFromPoints([
      new Vector3(actor.position.x, actorY, actor.position.z),
      new Vector3(target.position.x, targetY, target.position.z),
    ]);
    const color =
      feedback === 'accepted'
        ? 0xffd447
        : feedback.startsWith('ignored-')
          ? 0xff3355
          : evaluation.eligible
            ? 0x35ff7a
            : 0xff9f43;
    this.statusMaterial.color.setHex(color);
    this.targetMaterial.color.setHex(color);
  }

  public dispose(): void {
    this.engagementRing.geometry.dispose();
    this.attackVolume.geometry.dispose();
    this.hurtVolume.geometry.dispose();
    this.targetRing.geometry.dispose();
    this.facingLines.geometry.dispose();
    this.targetLine.geometry.dispose();
    this.rangeMaterial.dispose();
    this.statusMaterial.dispose();
    this.targetMaterial.dispose();
    this.attackVolume.material.dispose();
    this.hurtVolume.material.dispose();
    this.object3d.clear();
  }
}

function createFacingGeometry(): BufferGeometry {
  const angle = Math.acos(sparringTargetConfig.volumes.minimumFacingDot);
  const distance = sparringTargetConfig.engagementDistance;
  return new BufferGeometry().setFromPoints([
    new Vector3(0, 0.01, 0),
    new Vector3(Math.sin(-angle) * distance, 0.01, Math.cos(angle) * distance),
    new Vector3(0, 0.01, 0),
    new Vector3(Math.sin(angle) * distance, 0.01, Math.cos(angle) * distance),
  ]);
}
