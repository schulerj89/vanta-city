import {
  AnimationMixer,
  BufferGeometry,
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
import type { AnimationClip, Object3D } from 'three';
import type {
  ActionTargetEvaluation,
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
    'disabled' | 'out-of-range' | 'not-facing' | 'target-busy' | undefined;
  readonly feedback:
    | 'inactive'
    | 'ready'
    | 'accepted'
    | 'ignored-disabled'
    | 'ignored-out-of-range'
    | 'ignored-not-facing'
    | 'ignored-target-busy';
  readonly feedbackSequence: number;
  readonly impactSequence: number;
  readonly lastImpactNormalizedTime: number | undefined;
  readonly distance: number;
  readonly facingDot: number;
  readonly inRange: boolean;
  readonly facing: boolean;
  readonly eligible: boolean;
  readonly visualizationVisible: boolean;
  readonly groundedMinY: number | undefined;
  readonly height: number | undefined;
}

export class SparringTargetSystem implements GameSystem {
  public readonly id = 'debug-sparring-target';

  private entity: SparringTargetEntity | undefined;
  private unsubscribePlayer: (() => void) | undefined;
  private ignoredSequence = 0;
  private lastIgnoredReason: SparringTargetSnapshot['lastIgnoredReason'];
  private lastEvaluation = {
    distance: Infinity,
    facingDot: -1,
    inRange: false,
    facing: false,
    eligible: false,
  };
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
    this.lastEvaluation = evaluateActionTarget(
      playerPose,
      entity.getWorldPose(),
      sparringTargetConfig,
    );
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
  }

  public setEnabled(enabled: boolean): void {
    this.entity?.setEnabled(enabled);
    if (!enabled) this.lastIgnoredReason = undefined;
    this.feedback = enabled ? 'ready' : 'inactive';
    this.feedbackRemaining = 0;
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
        ? evaluateActionTarget(
            playerPose,
            entity.getWorldPose(),
            sparringTargetConfig,
          )
        : this.lastEvaluation;
    this.lastEvaluation = evaluation;
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
      ...evaluation,
      visualizationVisible: this.visualization?.object3d.visible ?? false,
      groundedMinY: presentation?.groundedMinY,
      height: presentation?.height,
    };
  }

  public dispose(): void {
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
    if (!this.entity.enabled) {
      this.ignore('disabled');
      return;
    }
    const playerPose = this.player.getWorldPose();
    if (!playerPose) {
      this.ignore('out-of-range');
      return;
    }
    const evaluation = evaluateActionTarget(
      playerPose,
      this.entity.getWorldPose(),
      sparringTargetConfig,
    );
    this.lastEvaluation = evaluation;
    if (!evaluation.inRange) {
      this.ignore('out-of-range');
      return;
    }
    if (!evaluation.facing) {
      this.ignore('not-facing');
      return;
    }
    if (!this.entity.receiveActionImpact(impact)) {
      this.ignore('target-busy');
      return;
    }
    this.lastIgnoredReason = undefined;
    this.setFeedback('accepted');
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
    this.feedbackRemaining = 0.45;
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
      this.clips.set(name, filterClipToHierarchy(clip, loaded.root));
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
    const logicalClip = impact.action.endsWith('Left')
      ? 'getHitRight'
      : 'getHitLeft';
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
  private readonly rangeRing = new Mesh(
    new RingGeometry(
      sparringTargetConfig.maxDistance - 0.025,
      sparringTargetConfig.maxDistance,
      64,
    ),
    this.rangeMaterial,
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
    this.rangeRing.rotation.x = -Math.PI / 2;
    this.targetRing.rotation.x = -Math.PI / 2;
    this.rangeRing.renderOrder = 20;
    this.targetRing.renderOrder = 21;
    this.facingLines.renderOrder = 22;
    this.targetLine.renderOrder = 22;
    this.object3d.add(
      this.rangeRing,
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
    this.rangeRing.position.set(actor.position.x, actorY, actor.position.z);
    this.facingLines.position.set(actor.position.x, actorY, actor.position.z);
    this.facingLines.rotation.y = Math.atan2(actor.forward.x, actor.forward.z);
    this.targetRing.position.set(target.position.x, targetY, target.position.z);
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
    this.rangeRing.geometry.dispose();
    this.targetRing.geometry.dispose();
    this.facingLines.geometry.dispose();
    this.targetLine.geometry.dispose();
    this.rangeMaterial.dispose();
    this.statusMaterial.dispose();
    this.targetMaterial.dispose();
    this.object3d.clear();
  }
}

function createFacingGeometry(): BufferGeometry {
  const angle = Math.acos(sparringTargetConfig.minimumFacingDot);
  const distance = sparringTargetConfig.maxDistance;
  return new BufferGeometry().setFromPoints([
    new Vector3(0, 0.01, 0),
    new Vector3(Math.sin(-angle) * distance, 0.01, Math.cos(angle) * distance),
    new Vector3(0, 0.01, 0),
    new Vector3(Math.sin(angle) * distance, 0.01, Math.cos(angle) * distance),
  ]);
}

function filterClipToHierarchy(
  source: AnimationClip,
  root: Object3D,
): AnimationClip {
  const tracks = source.tracks.filter((track) => {
    const nodeName = track.name.split('.', 1)[0];
    return (
      !nodeName || nodeName === root.name || root.getObjectByName(nodeName)
    );
  });
  if (tracks.length === source.tracks.length) return source;
  const clip = source.clone();
  clip.tracks = tracks.map((track) => track.clone());
  clip.resetDuration();
  return clip;
}
