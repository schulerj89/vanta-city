import {
  AnimationMixer,
  Box3,
  Group,
  LoopOnce,
  LoopRepeat,
  Vector3,
} from 'three';
import type { AnimationAction } from 'three';
import type { LoadedCharacter } from '../characters/CharacterLoader';
import type { CharacterDefinition } from '../characters/CharacterDefinition';
import type {
  CharacterActionName,
  CharacterActionRequestState,
  CharacterActionSink,
} from '../characters/CharacterActions';
import { characterActionTimings } from '../characters/CharacterActions';
import { CharacterAnimationStateMachine } from '../characters/CharacterAnimationStateMachine';
import type { CharacterAnimationGraphState } from '../characters/CharacterAnimationStateMachine';
import type { CharacterSelectionReader } from '../characters/CharacterSelection';
import type {
  PlayerMovementSimulation,
  PlayerMovementState,
} from './PlayerMovement';
import type { PlayerVisual } from './PlayerVisual';
import {
  calculateCharacterVisualAlignment,
  measureModelBounds,
} from '../characters/CharacterVisualAlignment';
import type { CharacterAlignmentReport } from '../characters/CharacterVisualAlignment';

export interface CharacterInstanceLoader {
  instantiate(definition: CharacterDefinition): Promise<LoadedCharacter>;
}

export type CharacterVisualLoadStatus =
  'idle' | 'loading' | 'loaded' | 'fallback';

export interface CharacterPlayerVisualDebugSnapshot {
  readonly selectedDefinitionId: string;
  readonly loadedDefinitionId: string | undefined;
  readonly selectedCharacterId: string;
  readonly loadedVisualId: string | undefined;
  readonly source: LoadedCharacter['source'] | 'loading';
  readonly attached: boolean;
  readonly bounds:
    | {
        readonly min: {
          readonly x: number;
          readonly y: number;
          readonly z: number;
        };
        readonly max: {
          readonly x: number;
          readonly y: number;
          readonly z: number;
        };
      }
    | undefined;
  readonly fallbackActive: boolean;
  readonly loadStatus: CharacterVisualLoadStatus;
  readonly animationState: string;
  readonly animationGraph: CharacterAnimationGraphState;
  readonly characterAction: CharacterActionRequestState;
  readonly appliedScale: string;
  readonly appliedRotation: string;
  readonly verticalOffset: number;
}

function formatVector(x: number, y: number, z: number, digits = 2): string {
  return `${x.toFixed(digits)}, ${y.toFixed(digits)}, ${z.toFixed(digits)}`;
}

export interface CharacterVisualDebugSnapshot {
  readonly selectedDefinitionId: string;
  readonly loadedDefinitionId: string | undefined;
  readonly source: LoadedCharacter['source'] | 'loading';
  readonly attached: boolean;
  readonly bounds:
    | {
        readonly min: {
          readonly x: number;
          readonly y: number;
          readonly z: number;
        };
        readonly max: {
          readonly x: number;
          readonly y: number;
          readonly z: number;
        };
      }
    | undefined;
}

/** Player presentation backed by the selected character with guaranteed fallback. */
export class CharacterPlayerVisual
  implements PlayerVisual, CharacterActionSink
{
  public readonly id = 'player';
  public readonly object3d = new Group();
  public readonly visualRoot = new Group();
  public readonly loadedModelRoot = new Group();

  private loaded: LoadedCharacter | undefined;
  private alignment: CharacterAlignmentReport | undefined;
  private unsubscribe: (() => void) | undefined;
  private loadVersion = 0;
  private loadStatus: CharacterVisualLoadStatus = 'idle';
  private mixer: AnimationMixer | undefined;
  private action: AnimationAction | undefined;
  private animationState = 'static';
  private activeActionRemaining = 0;
  private characterAction: CharacterActionRequestState = {
    active: undefined,
    busy: false,
    lastRequested: undefined,
    lastSource: undefined,
    lastAccepted: false,
    lastRejection: undefined,
    busyRejectionCount: 0,
    sequence: 0,
    activeNormalizedTime: 0,
    lastImpact: undefined,
    lastImpactSource: undefined,
    impactSequence: 0,
    impactNormalizedTime: undefined,
    completedSequenceAtImpact: undefined,
    lastCompleted: undefined,
    lastCompletedSource: undefined,
    completedSequence: 0,
    completionRelease: undefined,
  };
  private activeActionSource: string | undefined;
  private activeActionElapsed = 0;
  private activeActionDuration = 0;
  private activeActionImpacted = false;
  private movementState: PlayerMovementState = 'idle';
  private readonly animationGraph = new CharacterAnimationStateMachine();
  private readonly modelOffset = new Vector3();

  public constructor(
    private readonly selection: CharacterSelectionReader,
    private readonly loader: CharacterInstanceLoader,
  ) {
    this.object3d.name = 'Player simulation transform';
    this.visualRoot.name = 'Player visual root';
    this.loadedModelRoot.name = 'Loaded character alignment root';
    this.visualRoot.add(this.loadedModelRoot);
    this.object3d.add(this.visualRoot);
  }

  public async init(): Promise<void> {
    this.unsubscribe = this.selection.onSelectionChanged((definition) => {
      void this.replace(definition);
    });
    await this.replace(this.selection.getSelectedDefinition());
  }

  public sync(movement: PlayerMovementSimulation, delta = 0): void {
    this.object3d.position.copy(movement.position);
    this.visualRoot.rotation.y = movement.facingYaw;
    this.updateAnimation(movement.state, delta);
  }

  public reload(): Promise<void> {
    return this.replace(this.selection.getSelectedDefinition());
  }

  public get source(): LoadedCharacter['source'] | 'loading' {
    return this.loaded?.source ?? 'loading';
  }

  public getDebugSnapshot(): CharacterPlayerVisualDebugSnapshot {
    const root = this.loaded?.root;
    this.object3d.updateWorldMatrix(true, true);
    const bounds = new Box3().setFromObject(this.object3d);
    return {
      selectedDefinitionId: this.selection.getSelectedId(),
      loadedDefinitionId: this.loaded?.definition.id,
      selectedCharacterId: this.selection.getSelectedId(),
      loadedVisualId:
        this.loaded === undefined
          ? undefined
          : this.loaded.source === 'asset'
            ? this.loaded.definition.id
            : 'placeholder',
      source: this.source,
      attached: root?.parent === this.loadedModelRoot,
      bounds: bounds.isEmpty()
        ? undefined
        : {
            min: { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z },
            max: { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z },
          },
      fallbackActive: this.loaded?.source === 'placeholder',
      loadStatus: this.loadStatus,
      animationState: this.animationState,
      animationGraph: this.animationGraph.getState(),
      characterAction: this.getCharacterActionState(),
      appliedScale: root
        ? formatVector(root.scale.x, root.scale.y, root.scale.z)
        : 'pending',
      appliedRotation: root
        ? formatVector(root.rotation.x, root.rotation.y, root.rotation.z)
        : 'pending',
      verticalOffset: this.loadedModelRoot.position.y + (root?.position.y ?? 0),
    };
  }

  public getAlignmentReport(): CharacterAlignmentReport | undefined {
    return this.alignment;
  }

  public triggerCharacterAction(
    action: CharacterActionName,
    source = 'runtime',
  ): boolean {
    if (this.characterAction.busy) {
      this.characterAction = {
        ...this.characterAction,
        lastRequested: action,
        lastSource: source,
        lastAccepted: false,
        lastRejection: 'busy',
        busyRejectionCount: this.characterAction.busyRejectionCount + 1,
      };
      return false;
    }
    const clip = this.loaded?.animationClips.get(action);
    const accepted = Boolean(this.mixer && clip);
    this.characterAction = {
      ...this.characterAction,
      active: accepted ? action : this.characterAction.active,
      busy: accepted,
      lastRequested: action,
      lastSource: source,
      lastAccepted: accepted,
      lastRejection: accepted ? undefined : 'unavailable',
      sequence: this.characterAction.sequence + (accepted ? 1 : 0),
      activeNormalizedTime: accepted
        ? 0
        : this.characterAction.activeNormalizedTime,
    };
    if (!accepted || !this.mixer || !clip) return false;

    this.activeActionRemaining = Math.max(0.05, clip.duration + 0.1);
    this.activeActionElapsed = 0;
    this.activeActionDuration = Math.max(0.05, clip.duration);
    this.activeActionImpacted = false;
    this.activeActionSource = source;
    this.applyGraphTransition();
    return true;
  }

  public getCharacterActionState(): CharacterActionRequestState {
    return { ...this.characterAction };
  }

  public dispose(): void {
    this.loadVersion += 1;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.disposeLoaded();
    this.loadStatus = 'idle';
    this.alignment = undefined;
    this.object3d.clear();
  }

  private async replace(definition: CharacterDefinition): Promise<void> {
    const version = ++this.loadVersion;
    this.loadStatus = 'loading';
    const next = await this.loader.instantiate(definition);
    if (version !== this.loadVersion) {
      next.dispose();
      return;
    }
    const bounds = measureModelBounds(next.root);
    const calculated = calculateCharacterVisualAlignment(
      { minY: bounds.min.y, maxY: bounds.max.y },
      definition.transform?.verticalOffset,
    );
    this.disposeLoaded();
    this.loaded = next;
    this.modelOffset.copy(next.root.position);
    this.loadedModelRoot.position.set(0, calculated.appliedVisualOffset, 0);
    this.alignment = {
      characterId: definition.id,
      modelBounds: bounds,
      ...calculated,
    };
    this.loadedModelRoot.add(next.root);
    this.loadStatus = next.source === 'asset' ? 'loaded' : 'fallback';
    this.animationState = 'static';
    this.animationGraph.reset();
    if (next.animationClips.size > 0) {
      this.mixer = new AnimationMixer(next.root);
      this.mixer.addEventListener('finished', this.onMixerFinished);
    }
  }

  private updateAnimation(state: PlayerMovementState, delta: number): void {
    const loaded = this.loaded;
    const mixer = this.mixer;
    if (!loaded || !mixer) return;
    this.movementState = state;
    const frameDelta = Math.max(0, delta);
    if (this.characterAction.active) {
      this.updateActiveActionTiming(frameDelta);
    }
    this.applyGraphTransition();
    mixer.update(frameDelta);
    loaded.root.position.copy(this.modelOffset);

    if (this.characterAction.active) {
      this.activeActionRemaining = Math.max(
        0,
        this.activeActionRemaining - frameDelta,
      );
      if (this.activeActionRemaining === 0) {
        this.finishActiveAction('duration-fallback');
      }
    }
    // Mixer completion is authoritative. Re-evaluate after its finished event
    // so locomotion is restored in the same release frame.
    this.applyGraphTransition();
    // Authored root-motion tracks may animate the model root. The simulation
    // container remains authoritative, and the definition offset is restored.
    loaded.root.position.copy(this.modelOffset);
  }

  private disposeLoaded(): void {
    if (this.mixer && this.loaded) {
      this.mixer.removeEventListener('finished', this.onMixerFinished);
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.loaded.root);
    }
    this.mixer = undefined;
    this.action = undefined;
    this.animationState = 'static';
    this.activeActionRemaining = 0;
    this.activeActionElapsed = 0;
    this.activeActionDuration = 0;
    this.activeActionImpacted = false;
    this.activeActionSource = undefined;
    this.animationGraph.reset();
    this.characterAction = {
      ...this.characterAction,
      active: undefined,
      busy: false,
      activeNormalizedTime: 0,
    };
    this.loaded?.dispose();
    this.loaded = undefined;
    this.loadedModelRoot.clear();
    this.loadedModelRoot.position.set(0, 0, 0);
    this.alignment = undefined;
  }

  private readonly onMixerFinished = (event: {
    readonly action: AnimationAction;
  }): void => {
    if (event.action !== this.action || !this.characterAction.active) return;
    this.finishActiveAction('mixer-finished');
  };

  private finishActiveAction(
    release: NonNullable<CharacterActionRequestState['completionRelease']>,
  ): void {
    const completed = this.characterAction.active;
    if (!completed) return;
    this.action?.fadeOut(0.1);
    this.action = undefined;
    this.activeActionRemaining = 0;
    this.activeActionElapsed = 0;
    this.activeActionDuration = 0;
    this.activeActionImpacted = false;
    this.animationState = 'static';
    this.characterAction = {
      ...this.characterAction,
      active: undefined,
      busy: false,
      activeNormalizedTime: 0,
      lastCompleted: completed,
      lastCompletedSource: this.activeActionSource,
      completedSequence: this.characterAction.completedSequence + 1,
      completionRelease: release,
    };
    this.activeActionSource = undefined;
  }

  private updateActiveActionTiming(delta: number): void {
    const active = this.characterAction.active;
    if (!active) return;
    this.activeActionElapsed = Math.min(
      this.activeActionDuration,
      this.activeActionElapsed + delta,
    );
    const normalized = Math.min(
      1,
      this.activeActionElapsed / this.activeActionDuration,
    );
    const impactTime = characterActionTimings[active].impactNormalizedTime;
    const reachedImpact =
      impactTime !== undefined &&
      !this.activeActionImpacted &&
      normalized >= impactTime;
    if (reachedImpact) this.activeActionImpacted = true;
    this.characterAction = {
      ...this.characterAction,
      activeNormalizedTime: normalized,
      lastImpact: reachedImpact ? active : this.characterAction.lastImpact,
      lastImpactSource: reachedImpact
        ? this.activeActionSource
        : this.characterAction.lastImpactSource,
      impactSequence:
        this.characterAction.impactSequence + (reachedImpact ? 1 : 0),
      impactNormalizedTime: reachedImpact
        ? impactTime
        : this.characterAction.impactNormalizedTime,
      completedSequenceAtImpact: reachedImpact
        ? this.characterAction.completedSequence
        : this.characterAction.completedSequenceAtImpact,
    };
  }

  private applyGraphTransition(): void {
    const loaded = this.loaded;
    const mixer = this.mixer;
    if (!loaded || !mixer) return;
    const transition = this.animationGraph.transition(
      {
        movement: this.movementState,
        action: this.characterAction.active,
      },
      (logicalName) => loaded.animationClips.has(logicalName),
    );
    this.animationState = transition.state.label;
    if (!transition.changed) return;

    this.action?.fadeOut(0.12);
    const clip = transition.state.resolvedClip
      ? loaded.animationClips.get(transition.state.resolvedClip)
      : undefined;
    this.action = clip ? mixer.clipAction(clip) : undefined;
    if (!this.action) return;
    this.action.reset().setEffectiveTimeScale(1).fadeIn(0.12);
    if (transition.state.phase === 'action') {
      this.action.setLoop(LoopOnce, 1);
      this.action.clampWhenFinished = true;
    } else {
      this.action.setLoop(LoopRepeat, Infinity);
      this.action.clampWhenFinished = false;
    }
    this.action.play();
  }
}
