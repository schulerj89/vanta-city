import { AnimationMixer, Group, LoopOnce, LoopRepeat, Vector3 } from 'three';
import type { AnimationAction } from 'three';
import type { AnimationClip, Object3D } from 'three';
import type {
  CharacterActionTarget,
  CompletedCharacterAction,
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
  readonly busy: boolean;
  readonly responseSequence: number;
  readonly ignoredSequence: number;
  readonly lastAction: string | undefined;
  readonly lastIgnoredReason:
    'disabled' | 'range-or-facing' | 'target-busy' | undefined;
  readonly distance: number;
  readonly facingDot: number;
  readonly eligible: boolean;
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
    eligible: false,
  };

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
    this.unsubscribePlayer = this.player.events.on(
      'character-action:completed',
      (action) => this.respond(action),
    );
  }

  public setEnabled(enabled: boolean): void {
    this.entity?.setEnabled(enabled);
    if (!enabled) this.lastIgnoredReason = undefined;
  }

  public reset(): void {
    this.ignoredSequence = 0;
    this.lastIgnoredReason = undefined;
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
      busy: presentation?.busy ?? false,
      responseSequence: presentation?.responseSequence ?? 0,
      ignoredSequence: this.ignoredSequence,
      lastAction: presentation?.lastAction,
      lastIgnoredReason: this.lastIgnoredReason,
      ...evaluation,
      groundedMinY: presentation?.groundedMinY,
      height: presentation?.height,
    };
  }

  public dispose(): void {
    this.unsubscribePlayer?.();
    this.unsubscribePlayer = undefined;
    if (this.entity) this.objects.remove(this.entity.id);
    this.entity = undefined;
  }

  private respond(action: CompletedCharacterAction): void {
    if (!isStrikeAction(action.action) || !this.entity) return;
    if (!this.entity.enabled) {
      this.ignore('disabled');
      return;
    }
    const playerPose = this.player.getWorldPose();
    if (!playerPose) {
      this.ignore('range-or-facing');
      return;
    }
    const evaluation = evaluateActionTarget(
      playerPose,
      this.entity.getWorldPose(),
      sparringTargetConfig,
    );
    this.lastEvaluation = evaluation;
    if (!evaluation.eligible) {
      this.ignore('range-or-facing');
      return;
    }
    if (!this.entity.receiveAction(action)) this.ignore('target-busy');
  }

  private ignore(
    reason: NonNullable<SparringTargetSnapshot['lastIgnoredReason']>,
  ): void {
    this.ignoredSequence += 1;
    this.lastIgnoredReason = reason;
  }
}

interface SparringPresentationSnapshot {
  readonly modelSource: LoadedCharacter['source'] | 'pending';
  readonly animation: string;
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

  public receiveAction(action: CompletedCharacterAction): boolean {
    if (!this.enabled || this.busy || !isStrikeAction(action.action)) {
      return false;
    }
    const logicalClip = action.action.endsWith('Left')
      ? 'getHitRight'
      : 'getHitLeft';
    const clip = this.clips.get(logicalClip);
    if (!clip || !this.mixer) return false;
    this.action?.fadeOut(0.08);
    this.action = this.mixer.clipAction(clip);
    this.action.reset().setLoop(LoopOnce, 1).fadeIn(0.08).play();
    this.action.clampWhenFinished = true;
    this.animation = logicalClip;
    this.busy = true;
    this.fallbackRemaining = Math.max(0.05, clip.duration + 0.1);
    this.responseSequence += 1;
    this.lastAction = action.action;
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
    this.fallbackRemaining = 0;
    this.playIdle();
  }

  private playIdle(): void {
    this.busy = false;
    this.fallbackRemaining = 0;
    const clip = this.clips.get('idle');
    this.action?.fadeOut(0.08);
    this.action = clip && this.mixer ? this.mixer.clipAction(clip) : undefined;
    this.action?.reset().setLoop(LoopRepeat, Infinity).fadeIn(0.08).play();
    if (this.action) this.action.clampWhenFinished = false;
    this.animation = this.action ? 'idle' : 'static (idle unavailable)';
  }
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
