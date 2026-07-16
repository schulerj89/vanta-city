import { AnimationMixer, Group, Vector3 } from 'three';
import type { AnimationAction } from 'three';
import type { LoadedCharacter } from '../characters/CharacterLoader';
import type { CharacterDefinition } from '../characters/CharacterDefinition';
import type { CharacterSelectionReader } from '../characters/CharacterSelection';
import type {
  PlayerMovementSimulation,
  PlayerMovementState,
} from './PlayerMovement';
import type { PlayerVisual } from './PlayerVisual';

export interface CharacterInstanceLoader {
  instantiate(definition: CharacterDefinition): Promise<LoadedCharacter>;
}

export type CharacterVisualLoadStatus =
  'idle' | 'loading' | 'loaded' | 'fallback';

export interface CharacterPlayerVisualDebugSnapshot {
  readonly selectedCharacterId: string;
  readonly loadedVisualId: string | undefined;
  readonly fallbackActive: boolean;
  readonly loadStatus: CharacterVisualLoadStatus;
  readonly animationState: string;
  readonly appliedScale: string;
  readonly appliedRotation: string;
  readonly verticalOffset: number;
}

function logicalAnimationFor(state: PlayerMovementState): string {
  switch (state) {
    case 'walking':
      return 'walk';
    case 'running':
      return 'run';
    case 'idle':
    case 'airborne':
    case 'landing':
      return 'idle';
  }
}

function formatVector(x: number, y: number, z: number, digits = 2): string {
  return `${x.toFixed(digits)}, ${y.toFixed(digits)}, ${z.toFixed(digits)}`;
}

/** Player presentation backed by the selected character with guaranteed fallback. */
export class CharacterPlayerVisual implements PlayerVisual {
  public readonly id = 'player';
  public readonly object3d = new Group();

  private loaded: LoadedCharacter | undefined;
  private unsubscribe: (() => void) | undefined;
  private loadVersion = 0;
  private loadStatus: CharacterVisualLoadStatus = 'idle';
  private mixer: AnimationMixer | undefined;
  private action: AnimationAction | undefined;
  private animationState = 'static';
  private readonly modelOffset = new Vector3();

  public constructor(
    private readonly selection: CharacterSelectionReader,
    private readonly loader: CharacterInstanceLoader,
  ) {
    this.object3d.name = 'Player character';
  }

  public async init(): Promise<void> {
    this.unsubscribe = this.selection.onSelectionChanged((definition) => {
      void this.replace(definition);
    });
    await this.replace(this.selection.getSelectedDefinition());
  }

  public sync(movement: PlayerMovementSimulation, delta = 0): void {
    this.object3d.position.copy(movement.position);
    this.object3d.rotation.y = movement.facingYaw;
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
    return {
      selectedCharacterId: this.selection.getSelectedId(),
      loadedVisualId:
        this.loaded === undefined
          ? undefined
          : this.loaded.source === 'asset'
            ? this.loaded.definition.id
            : 'placeholder',
      fallbackActive: this.loaded?.source === 'placeholder',
      loadStatus: this.loadStatus,
      animationState: this.animationState,
      appliedScale: root
        ? formatVector(root.scale.x, root.scale.y, root.scale.z)
        : 'pending',
      appliedRotation: root
        ? formatVector(root.rotation.x, root.rotation.y, root.rotation.z)
        : 'pending',
      verticalOffset: root?.position.y ?? 0,
    };
  }

  public dispose(): void {
    this.loadVersion += 1;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.disposeLoaded();
    this.loadStatus = 'idle';
  }

  private async replace(definition: CharacterDefinition): Promise<void> {
    const version = ++this.loadVersion;
    this.loadStatus = 'loading';
    const next = await this.loader.instantiate(definition);
    if (version !== this.loadVersion) {
      next.dispose();
      return;
    }
    this.disposeLoaded();
    this.loaded = next;
    this.modelOffset.copy(next.root.position);
    this.object3d.add(next.root);
    this.loadStatus = next.source === 'asset' ? 'loaded' : 'fallback';
    this.animationState = 'static';
    if (next.animationClips.size > 0) {
      this.mixer = new AnimationMixer(next.root);
    }
  }

  private updateAnimation(state: PlayerMovementState, delta: number): void {
    const loaded = this.loaded;
    const mixer = this.mixer;
    if (!loaded || !mixer) return;
    const requested = logicalAnimationFor(state);
    const clip =
      loaded.animationClips.get(requested) ?? loaded.animationClips.get('idle');
    const nextState = clip
      ? loaded.animationClips.has(requested)
        ? requested
        : `idle (fallback for ${requested})`
      : 'static';
    if (nextState !== this.animationState) {
      this.action?.fadeOut(0.12);
      this.action = clip ? mixer.clipAction(clip) : undefined;
      this.action?.reset().fadeIn(0.12).play();
      this.animationState = nextState;
    }
    mixer.update(Math.max(0, delta));
    // Authored root-motion tracks may animate the model root. The simulation
    // container remains authoritative, and the definition offset is restored.
    loaded.root.position.copy(this.modelOffset);
  }

  private disposeLoaded(): void {
    if (this.mixer && this.loaded) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.loaded.root);
    }
    this.mixer = undefined;
    this.action = undefined;
    this.animationState = 'static';
    this.loaded?.dispose();
    this.loaded = undefined;
    this.object3d.clear();
  }
}
