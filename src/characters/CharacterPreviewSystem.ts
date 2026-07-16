import {
  AmbientLight,
  AnimationMixer,
  Color,
  DirectionalLight,
  Group,
  LoopOnce,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { Object3D } from 'three';
import type { CharacterDefinition } from './CharacterDefinition';
import type { CharacterInstanceLoader } from '../player/CharacterPlayerVisual';
import type { LoadedCharacter } from './CharacterLoader';
import { measureModelBounds } from './CharacterVisualAlignment';

const previewAnimationOrder = ['previewIdle', 'wave', 'interact'] as const;
const animationHoldSeconds = 0.65;

export type CharacterPreviewLoadStatus =
  'idle' | 'loading' | 'ready' | 'fallback';

export interface CharacterPreviewSnapshot {
  readonly status: CharacterPreviewLoadStatus;
  readonly requestedCharacterId: string | undefined;
  readonly loadedCharacterId: string | undefined;
  readonly source: LoadedCharacter['source'] | 'none';
  readonly animation: string;
  readonly availableAnimations: readonly string[];
  readonly disposalCount: number;
}

export interface CharacterPreviewSurface {
  readonly element: HTMLElement;
  show(definition: CharacterDefinition): Promise<void>;
  update(delta: number): void;
  nextAnimation(): boolean;
  clear(): void;
  getSnapshot(): CharacterPreviewSnapshot;
  dispose(): void;
}

export interface CharacterPreviewRenderer {
  readonly domElement: HTMLCanvasElement;
  outputColorSpace: string;
  setPixelRatio(value: number): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  render(scene: Scene, camera: PerspectiveCamera): void;
  dispose(): void;
  forceContextLoss?(): void;
}

/** Independent live preview: it never reads or mutates player simulation state. */
export class CharacterPreviewSystem implements CharacterPreviewSurface {
  public readonly element = document.createElement('div');

  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(32, 1, 0.1, 30);
  private readonly stage = new Group();
  private readonly alignmentRoot = new Group();
  private loaded: LoadedCharacter | undefined;
  private mixer: AnimationMixer | undefined;
  private currentAction: ReturnType<AnimationMixer['clipAction']> | undefined;
  private loadVersion = 0;
  private requestedCharacterId: string | undefined;
  private status: CharacterPreviewLoadStatus = 'idle';
  private animationNames: string[] = [];
  private animationIndex = 0;
  private animationElapsed = 0;
  private animationDuration = 0;
  private disposalCount = 0;
  private renderedWidth = 0;
  private renderedHeight = 0;
  private readonly modelOffset = new Vector3();

  public constructor(
    private readonly loader: CharacterInstanceLoader,
    private readonly renderer: CharacterPreviewRenderer = new WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'low-power',
    }),
  ) {
    this.element.className = 'character-preview-surface';
    this.renderer.domElement.className = 'character-preview-surface__canvas';
    this.renderer.domElement.dataset.characterPreviewCanvas = '';
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.setAttribute(
      'aria-label',
      'Loading live character preview',
    );
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setPixelRatio(
      Math.min(globalThis.window?.devicePixelRatio ?? 1, 2),
    );
    this.element.append(this.renderer.domElement);

    this.scene.background = new Color(0x081319);
    this.scene.add(new AmbientLight(0xd9fff3, 1.65));
    const key = new DirectionalLight(0xfff1d4, 3.4);
    key.position.set(2.5, 4.5, 3.5);
    this.scene.add(key);
    const rim = new DirectionalLight(0x52d9bb, 2.2);
    rim.position.set(-3, 2.5, -2);
    this.scene.add(rim);
    this.stage.add(this.alignmentRoot);
    this.scene.add(this.stage);
    this.camera.position.set(0, 1.05, 3.15);
    this.camera.lookAt(0, 0.95, 0);
  }

  public async show(definition: CharacterDefinition): Promise<void> {
    const version = ++this.loadVersion;
    this.requestedCharacterId = definition.id;
    this.status = 'loading';
    this.renderer.domElement.setAttribute(
      'aria-label',
      `Loading ${definition.displayName} preview`,
    );
    const next = await this.loader.instantiate(definition);
    if (version !== this.loadVersion) {
      next.dispose();
      this.disposalCount += 1;
      return;
    }

    this.disposeLoaded();
    this.loaded = next;
    this.modelOffset.copy(next.root.position);
    this.align(next.root);
    this.alignmentRoot.add(next.root);
    this.status = next.source === 'asset' ? 'ready' : 'fallback';
    this.animationNames = previewAnimationOrder.filter((name) =>
      next.animationClips.has(name),
    );
    if (this.animationNames.length === 0 && next.animationClips.has('idle')) {
      this.animationNames = ['idle'];
    }
    if (next.animationClips.size > 0) {
      this.mixer = new AnimationMixer(next.root);
      this.playAnimation(0);
    }
    this.renderer.domElement.setAttribute(
      'aria-label',
      `${definition.displayName} live 3D preview`,
    );
    this.render();
  }

  public update(delta: number): void {
    if (this.status === 'idle' || this.status === 'loading') return;
    const safeDelta = Math.max(0, delta);
    if (this.mixer && this.loaded) {
      this.mixer.update(safeDelta);
      // The stage is presentation-only and never consumes authored locomotion.
      this.loaded.root.position.copy(this.modelOffset);
      this.animationElapsed += safeDelta;
      if (
        this.animationNames.length > 1 &&
        this.animationElapsed >= this.animationDuration + animationHoldSeconds
      ) {
        this.nextAnimation();
      }
    }
    this.render();
  }

  public nextAnimation(): boolean {
    if (this.animationNames.length === 0 || !this.mixer) return false;
    this.playAnimation((this.animationIndex + 1) % this.animationNames.length);
    return true;
  }

  public clear(): void {
    this.loadVersion += 1;
    this.requestedCharacterId = undefined;
    this.disposeLoaded();
    this.status = 'idle';
    this.renderer.domElement.setAttribute(
      'aria-label',
      'Character preview inactive',
    );
  }

  public getSnapshot(): CharacterPreviewSnapshot {
    return {
      status: this.status,
      requestedCharacterId: this.requestedCharacterId,
      loadedCharacterId: this.loaded?.definition.id,
      source: this.loaded?.source ?? 'none',
      animation: this.animationNames[this.animationIndex] ?? 'static',
      availableAnimations: [...this.animationNames],
      disposalCount: this.disposalCount,
    };
  }

  public dispose(): void {
    this.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    this.element.remove();
  }

  private align(root: Object3D): void {
    const bounds = measureModelBounds(root);
    const centerX = (bounds.min.x + bounds.max.x) / 2;
    const centerZ = (bounds.min.z + bounds.max.z) / 2;
    this.alignmentRoot.position.set(-centerX, -bounds.min.y, -centerZ);
    const height = Math.max(0.5, bounds.max.y - bounds.min.y);
    this.camera.position.set(0, height * 0.54, Math.max(2.7, height * 1.72));
    this.camera.lookAt(0, height * 0.5, 0);
  }

  private playAnimation(index: number): void {
    const name = this.animationNames[index];
    const clip = name ? this.loaded?.animationClips.get(name) : undefined;
    if (!name || !clip || !this.mixer) return;
    this.currentAction?.fadeOut(0.12);
    this.currentAction = this.mixer.clipAction(clip);
    this.currentAction
      .reset()
      .setLoop(LoopOnce, 1)
      .setEffectiveTimeScale(1)
      .fadeIn(0.12)
      .play();
    this.currentAction.clampWhenFinished = true;
    this.animationIndex = index;
    this.animationElapsed = 0;
    this.animationDuration = Math.max(0.05, clip.duration);
  }

  private render(): void {
    const width = Math.max(1, this.element.clientWidth || 640);
    const height = Math.max(1, this.element.clientHeight || 520);
    if (width !== this.renderedWidth || height !== this.renderedHeight) {
      this.renderedWidth = width;
      this.renderedHeight = height;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height, false);
    }
    this.renderer.render(this.scene, this.camera);
  }

  private disposeLoaded(): void {
    if (this.mixer && this.loaded) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.loaded.root);
    }
    this.mixer = undefined;
    this.currentAction = undefined;
    this.animationNames = [];
    this.animationIndex = 0;
    this.animationElapsed = 0;
    this.animationDuration = 0;
    this.alignmentRoot.clear();
    if (this.loaded) {
      this.loaded.dispose();
      this.disposalCount += 1;
    }
    this.loaded = undefined;
    this.alignmentRoot.position.set(0, 0, 0);
  }
}
