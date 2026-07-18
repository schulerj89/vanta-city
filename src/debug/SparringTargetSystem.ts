import {
  AnimationMixer,
  BufferGeometry,
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  ExtrudeGeometry,
  Line,
  LineBasicMaterial,
  LineSegments,
  LoopOnce,
  LoopRepeat,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  SphereGeometry,
  Shape,
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
import type {
  WorldPose,
  WorldPoseSource,
  WorldPosition,
} from '../world/Spatial';
import type { LevelDefinition } from '../world/LevelDefinition';
import type { EventBus } from '../core/events';
import type { StaticColliderDefinition } from '../physics/StaticCollider';
import { HealthComponent } from '../health/Health';
import type { HealthSnapshot } from '../health/Health';
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
  /** Keeps the combat fixture absent unless explicitly requested by development tooling. */
  readonly fixtureEnabled?: boolean;
  readonly camera?: SparringCameraFocusSurface;
  readonly gameplayAvailable?: () => boolean;
  readonly reportError?: (scope: string, error: unknown) => void;
  readonly collision?: {
    addDefinition(definition: StaticColliderDefinition): void;
    remove(id: string): boolean;
  };
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
  readonly horizontalGap: number;
  readonly verticalOverlap: number;
  readonly rejectionReason: ActionTargetEvaluation['rejectionReason'];
  readonly eligible: boolean;
  readonly attackKind: ActionTargetEvaluation['actionKind'];
  readonly attackStart: ActionTargetEvaluation['attackStart'];
  readonly attackEnd: ActionTargetEvaluation['attackEnd'];
  readonly closestContact: ActionTargetEvaluation['closestContact'];
  readonly latestDecision:
    | {
        readonly action: 'punchLeft' | 'punchRight' | 'kickLeft' | 'kickRight';
        readonly sequence: number;
        readonly accepted: boolean;
        readonly reason: SparringTargetSnapshot['lastIgnoredReason'];
        readonly horizontalGap: number;
        readonly verticalOverlap: number;
        readonly facingDot: number;
      }
    | undefined;
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
  readonly health: HealthSnapshot | undefined;
  readonly position: WorldPosition | undefined;
  readonly collisionActive: boolean;
  readonly listenerCount: number;
}

export class SparringTargetSystem implements GameSystem {
  public readonly id = 'debug-sparring-target';
  public readonly updateMode = 'always' as const;

  private entity: SparringTargetEntity | undefined;
  private unsubscribePlayer: (() => void)[] = [];
  private ignoredSequence = 0;
  private lastIgnoredReason: SparringTargetSnapshot['lastIgnoredReason'];
  private lastEvaluation: ActionTargetEvaluation | undefined;
  private lastStrike: 'punchLeft' | 'punchRight' | 'kickLeft' | 'kickRight' =
    'punchLeft';
  private cameraFocus: SparringCameraFocusHandle | undefined;
  private visualization: SparringEligibilityVisualization | undefined;
  private visualizationRequested = false;
  private feedback: SparringTargetSnapshot['feedback'] = 'inactive';
  private feedbackSequence = 0;
  private impactSequence = 0;
  private lastImpactNormalizedTime: number | undefined;
  private feedbackRemaining = 0;
  private latestDecision: SparringTargetSnapshot['latestDecision'];
  private activation: Promise<void> | undefined;
  private enabledRequested: boolean;
  private collisionActive = false;
  private disposed = false;

  public constructor(
    private readonly loader: SparringCharacterLoader,
    private readonly objects: GameObjectWorld,
    private readonly player: SparringPlayer,
    private readonly levels: {
      readonly activeLevel: LevelDefinition | undefined;
    },
    private readonly options: SparringTargetOptions = {},
  ) {
    this.enabledRequested = options.fixtureEnabled === true;
  }

  public get initiallyEnabled(): boolean {
    return this.enabledRequested;
  }

  public init(): void {
    if (this.enabledRequested) {
      void this.activate().catch((error: unknown) => {
        this.options.reportError?.('sparring target URL activation', error);
      });
    }
  }

  private async activate(): Promise<void> {
    if (this.disposed || !this.enabledRequested || this.entity) return;
    if (this.activation) return this.activation;
    this.activation = this.createFixture();
    try {
      await this.activation;
    } finally {
      this.activation = undefined;
    }
  }

  private async createFixture(): Promise<void> {
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
    if (this.disposed || !this.enabledRequested) {
      entity.dispose();
      return;
    }
    entity.setEnabled(true);
    this.entity = entity;
    this.objects.add(entity);
    this.visualization = new SparringEligibilityVisualization();
    this.visualization.setVisible(this.visualizationRequested);
    this.objects.add(this.visualization);
    this.syncCollision();
    this.unsubscribePlayer = [
      this.player.events.on('character-action:started', (action) =>
        this.onActionStarted(action),
      ),
      this.player.events.on('character-action:impact', (impact) =>
        this.respond(impact),
      ),
      this.player.events.on('character-action:completed', ({ action }) => {
        if (isStrikeAction(action)) this.releaseCameraFocus();
      }),
    ];
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

  public async setEnabled(enabled: boolean): Promise<void> {
    this.enabledRequested = enabled;
    if (enabled) {
      this.feedback = 'ready';
      this.feedbackRemaining = 0;
      await this.activate();
      return;
    }
    this.deactivate();
  }

  public reset(): void {
    this.ignoredSequence = 0;
    this.lastIgnoredReason = undefined;
    this.feedbackSequence = 0;
    this.impactSequence = 0;
    this.lastImpactNormalizedTime = undefined;
    this.latestDecision = undefined;
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
      horizontalGap: evaluation?.horizontalGap ?? Infinity,
      verticalOverlap: evaluation?.verticalOverlap ?? 0,
      rejectionReason: evaluation?.rejectionReason,
      eligible: evaluation?.eligible ?? false,
      attackKind: evaluation?.actionKind ?? 'punch',
      attackStart: evaluation?.attackStart ?? { x: 0, y: 0, z: 0 },
      attackEnd: evaluation?.attackEnd ?? { x: 0, y: 0, z: 0 },
      closestContact: evaluation?.closestContact ?? { x: 0, y: 0, z: 0 },
      latestDecision: this.latestDecision,
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
      health: entity?.health.getSnapshot(),
      position: entity?.getWorldPose().position,
      collisionActive: this.collisionActive,
      listenerCount: this.unsubscribePlayer.length,
    };
  }

  public getHealth(): HealthComponent | undefined {
    return this.entity?.health;
  }

  public getHealthAnchor(): WorldPosition | undefined {
    const entity = this.entity;
    if (!entity?.enabled) return undefined;
    const pose = entity.getWorldPose();
    return {
      x: pose.position.x,
      y: pose.position.y + (entity.getSnapshot().height ?? 1.8) + 0.18,
      z: pose.position.z,
    };
  }

  public getHealthCollisionIgnoreIds(): readonly string[] {
    return this.collisionActive ? [sparringTargetConfig.collisionId] : [];
  }

  public setVisualizationVisible(visible: boolean): void {
    this.visualizationRequested = visible;
    this.visualization?.setVisible(visible);
  }

  public teleport(position: WorldPosition, yaw?: number): void {
    this.entity?.teleport(position, yaw);
    this.syncCollision();
    this.releaseCameraFocus();
  }

  public dispose(): void {
    this.disposed = true;
    this.enabledRequested = false;
    this.deactivate();
  }

  private deactivate(): void {
    this.releaseCameraFocus();
    for (const unsubscribe of this.unsubscribePlayer) unsubscribe();
    this.unsubscribePlayer = [];
    if (this.collisionActive) {
      this.options.collision?.remove(sparringTargetConfig.collisionId);
      this.collisionActive = false;
    }
    if (this.visualization) this.objects.remove(this.visualization.id);
    this.visualization = undefined;
    if (this.entity) this.objects.remove(this.entity.id);
    this.entity = undefined;
    this.clearDebugState();
  }

  private clearDebugState(): void {
    this.ignoredSequence = 0;
    this.lastIgnoredReason = undefined;
    this.lastEvaluation = undefined;
    this.lastStrike = 'punchLeft';
    this.feedback = 'inactive';
    this.feedbackSequence = 0;
    this.impactSequence = 0;
    this.lastImpactNormalizedTime = undefined;
    this.feedbackRemaining = 0;
    this.latestDecision = undefined;
  }

  private syncCollision(): void {
    const collision = this.options.collision;
    const pose = this.entity?.getWorldPose();
    if (!collision || !pose) return;
    if (this.collisionActive)
      collision.remove(sparringTargetConfig.collisionId);
    const [width, height, depth] = sparringTargetConfig.collisionSize;
    collision.addDefinition({
      id: sparringTargetConfig.collisionId,
      position: [
        pose.position.x,
        pose.position.y + height / 2,
        pose.position.z,
      ],
      size: [width, height, depth],
      tags: ['obstacle', 'development-fixture', 'camera-pass-through'],
    });
    this.collisionActive = true;
  }

  private respond(impact: CharacterActionImpact): void {
    if (!isStrikeAction(impact.action) || !this.entity) return;
    this.impactSequence += 1;
    this.lastImpactNormalizedTime = impact.normalizedTime;
    this.lastStrike = impact.action;
    if (this.options.gameplayAvailable?.() === false) {
      this.recordDecision(impact, false, 'game-state');
      this.ignore('game-state');
      return;
    }
    if (!this.entity.enabled) {
      this.recordDecision(impact, false, 'disabled');
      this.ignore('disabled');
      return;
    }
    const playerPose = this.player.getWorldPose();
    if (!playerPose) {
      this.recordDecision(impact, false, 'out-of-range');
      this.ignore('out-of-range');
      return;
    }
    const evaluation = this.evaluate(playerPose, impact.action);
    this.lastEvaluation = evaluation;
    if (!evaluation.eligible) {
      this.recordDecision(
        impact,
        false,
        evaluation.rejectionReason ?? 'out-of-range',
        evaluation,
      );
      this.ignore(evaluation.rejectionReason ?? 'out-of-range');
      return;
    }
    if (!this.entity.receiveActionImpact(impact)) {
      this.recordDecision(impact, false, 'target-busy', evaluation);
      this.ignore('target-busy');
      return;
    }
    this.entity.health.damage(
      sparringTargetConfig.damage[evaluation.actionKind],
      `sparring:${impact.action}`,
    );
    this.recordDecision(impact, true, undefined, evaluation);
    this.lastIgnoredReason = undefined;
    this.setFeedback('accepted');
  }

  private onActionStarted(
    action: PlayerActionEvents['character-action:started'],
  ): void {
    if (!isStrikeAction(action.action) || this.cameraFocus) return;
    const playerPose = this.player.getWorldPose();
    const targetPose = this.entity?.getWorldPose();
    const engagement = this.evaluateEngagement(
      playerPose,
      targetPose,
      this.entity?.enabled ?? false,
    );
    if (!engagement.engaged) return;
    this.cameraFocus = this.options.camera?.requestGameplayFocus({
      owner: this.id,
      maxDistance: sparringTargetConfig.focusedCameraDistance,
    });
  }

  private recordDecision(
    impact: CharacterActionImpact,
    accepted: boolean,
    reason: SparringTargetSnapshot['lastIgnoredReason'],
    evaluation = this.lastEvaluation,
  ): void {
    if (!isStrikeAction(impact.action)) return;
    this.latestDecision = {
      action: impact.action,
      sequence: impact.sequence,
      accepted,
      reason,
      horizontalGap: evaluation?.horizontalGap ?? Infinity,
      verticalOverlap: evaluation?.verticalOverlap ?? 0,
      facingDot: evaluation?.facingDot ?? -1,
    };
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
    if (!engagement.engaged) {
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
  public readonly health = new HealthComponent('debug.sparring-target', 100);

  private readonly visualRoot = new Group();
  private readonly fixtureMarker = createFixtureMarker();
  private loaded: LoadedCharacter | undefined;
  private mixer: AnimationMixer | undefined;
  private action: AnimationAction | undefined;
  private animation = 'loading';
  private busy = false;
  private fallbackRemaining = 0;
  private responseSequence = 0;
  private lastAction: string | undefined;
  private groundedMinY: number | undefined;
  private groundedOffset: number | undefined;
  private height: number | undefined;
  private readonly modelOffset = new Vector3();
  private readonly clips = new Map<string, AnimationClip>();
  private readonly animationGraph = new CharacterAnimationStateMachine();
  private activeReaction: string | undefined;
  private readonly unsubscribeHealth: (() => void)[] = [];

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
    this.object3d.add(this.fixtureMarker);
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
    this.groundedOffset = bounds.min.y + alignment.appliedVisualOffset;
    this.groundedMinY = this.object3d.position.y + this.groundedOffset;
    this.height = bounds.max.y - bounds.min.y;
    this.visualRoot.add(loaded.root);
    for (const [name, clip] of loaded.animationClips) {
      this.clips.set(name, clip);
    }
    if (loaded.animationClips.size > 0) {
      this.mixer = new AnimationMixer(loaded.root);
      this.mixer.addEventListener('finished', this.onMixerFinished);
    }
    this.unsubscribeHealth.push(
      this.health.events.on('depleted', () => {
        this.busy = false;
        this.activeReaction = undefined;
        this.fallbackRemaining = 0;
        this.applyGraphTransition();
      }),
      this.health.events.on('restored', () => this.playIdle()),
    );
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
    if (
      !this.enabled ||
      !this.health.alive ||
      this.busy ||
      !isStrikeAction(impact.action)
    ) {
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
    this.health.reset('sparring:reset');
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

  public teleport(position: WorldPosition, yaw?: number): void {
    this.object3d.position.set(position.x, position.y, position.z);
    if (yaw !== undefined) this.object3d.rotation.y = yaw;
    this.groundedMinY =
      this.groundedOffset === undefined
        ? undefined
        : this.object3d.position.y + this.groundedOffset;
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
    for (const unsubscribe of this.unsubscribeHealth.splice(0)) unsubscribe();
    this.mixer = undefined;
    this.loaded?.dispose();
    this.loaded = undefined;
    this.clips.clear();
    this.animationGraph.reset();
    this.health.dispose();
    this.activeReaction = undefined;
    this.visualRoot.clear();
    for (const child of this.fixtureMarker.children) {
      if (!(child instanceof Mesh)) continue;
      const mesh = child as Mesh<BufferGeometry, MeshBasicMaterial>;
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.object3d.clear();
  }

  private readonly onMixerFinished = (event: {
    readonly action: AnimationAction;
  }): void => {
    if (event.action === this.action && this.busy && this.health.alive) {
      this.finishResponse();
    }
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
      {
        movement: 'idle',
        reaction: this.activeReaction,
        depleted: !this.health.alive,
      },
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
    if (
      transition.state.phase === 'reaction' ||
      transition.state.phase === 'death'
    ) {
      this.action.setLoop(LoopOnce, 1);
      this.action.clampWhenFinished = true;
    } else {
      this.action.setLoop(LoopRepeat, Infinity);
      this.action.clampWhenFinished = false;
    }
    this.action.play();
  }
}

function createFixtureMarker(): Group {
  const marker = new Group();
  marker.name = 'Ashfall sparring pad marker';
  const padMaterial = new MeshBasicMaterial({
    color: 0x10252a,
    transparent: true,
    opacity: 0.72,
    side: DoubleSide,
    depthWrite: false,
  });
  const lineMaterial = new MeshBasicMaterial({
    color: 0x35c8ff,
    transparent: true,
    opacity: 0.85,
    side: DoubleSide,
    depthWrite: false,
  });
  const pad = new Mesh(new RingGeometry(0.58, 1.55, 48), padMaterial);
  const target = new Mesh(new RingGeometry(0.43, 0.5, 32), lineMaterial);
  const approach = new Mesh(new BoxGeometry(0.08, 0.025, 1.35), lineMaterial);
  pad.rotation.x = -Math.PI / 2;
  target.rotation.x = -Math.PI / 2;
  pad.position.y = 0.025;
  target.position.y = 0.035;
  approach.position.set(0, 0.035, 1.15);
  marker.add(pad, target, approach);
  return marker;
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
    createStrikeVolumeGeometry('punch'),
    new MeshBasicMaterial({
      color: 0x35c8ff,
      transparent: true,
      opacity: 0.12,
      wireframe: true,
      depthTest: false,
    }),
  );
  private readonly impactMarker = new Mesh(
    new SphereGeometry(0.08, 12, 8),
    new MeshBasicMaterial({
      color: 0xff9f43,
      transparent: true,
      opacity: 0.95,
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
  private requestedVisible = false;
  private targetEnabled = false;
  private attackKind: ActionTargetEvaluation['actionKind'] = 'punch';

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
      this.impactMarker,
    );
  }

  public setVisible(visible: boolean): void {
    this.requestedVisible = visible;
    this.object3d.visible = visible && this.targetEnabled;
  }

  public sync(
    actor: WorldPose,
    target: WorldPose,
    evaluation: ActionTargetEvaluation,
    enabled: boolean,
    feedback: SparringTargetSnapshot['feedback'],
  ): void {
    this.targetEnabled = enabled;
    this.object3d.visible = enabled && this.requestedVisible;
    if (!enabled) return;
    const actorY = actor.position.y + 0.04;
    const targetY = target.position.y + 0.04;
    this.engagementRing.position.set(
      target.position.x,
      targetY,
      target.position.z,
    );
    this.facingLines.position.set(actor.position.x, actorY, actor.position.z);
    this.facingLines.rotation.y = Math.atan2(actor.forward.x, actor.forward.z);
    this.targetRing.position.set(target.position.x, targetY, target.position.z);
    if (this.attackKind !== evaluation.actionKind) {
      this.attackVolume.geometry.dispose();
      this.attackVolume.geometry = createStrikeVolumeGeometry(
        evaluation.actionKind,
      );
      this.attackKind = evaluation.actionKind;
    }
    const start = evaluation.attackStart;
    const end = evaluation.attackEnd;
    this.attackVolume.position.set(
      (start.x + end.x) / 2,
      (evaluation.attackMinimumY + evaluation.attackMaximumY) / 2,
      (start.z + end.z) / 2,
    );
    this.attackVolume.rotation.y = Math.atan2(actor.forward.x, actor.forward.z);
    this.hurtVolume.position.set(
      target.position.x,
      target.position.y + sparringTargetConfig.volumes.hurt.height / 2,
      target.position.z,
    );
    this.targetLine.geometry.setFromPoints([
      new Vector3(actor.position.x, actorY, actor.position.z),
      new Vector3(target.position.x, targetY, target.position.z),
    ]);
    this.impactMarker.position.set(
      evaluation.closestContact.x,
      evaluation.closestContact.y + evaluation.verticalOverlap / 2,
      evaluation.closestContact.z,
    );
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
    this.impactMarker.material.color.setHex(color);
  }

  public dispose(): void {
    this.engagementRing.geometry.dispose();
    this.attackVolume.geometry.dispose();
    this.hurtVolume.geometry.dispose();
    this.targetRing.geometry.dispose();
    this.facingLines.geometry.dispose();
    this.targetLine.geometry.dispose();
    this.impactMarker.geometry.dispose();
    this.rangeMaterial.dispose();
    this.statusMaterial.dispose();
    this.targetMaterial.dispose();
    this.attackVolume.material.dispose();
    this.hurtVolume.material.dispose();
    this.impactMarker.material.dispose();
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

/** Exact extrusion of the authoritative horizontal swept circle and Y range. */
function createStrikeVolumeGeometry(
  kind: ActionTargetEvaluation['actionKind'],
): ExtrudeGeometry {
  const strike = sparringTargetConfig.volumes[kind];
  const radius = strike.radius;
  const halfReach = strike.horizontalReach / 2;
  const shape = new Shape();
  shape.moveTo(-radius, -halfReach);
  shape.lineTo(-radius, halfReach);
  shape.absarc(0, halfReach, radius, Math.PI, 0, true);
  shape.lineTo(radius, -halfReach);
  shape.absarc(0, -halfReach, radius, 0, Math.PI, true);
  const height = strike.maximumY - strike.minimumY;
  const geometry = new ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: 16,
  });
  geometry.translate(0, 0, -height / 2);
  geometry.rotateX(Math.PI / 2);
  return geometry;
}
