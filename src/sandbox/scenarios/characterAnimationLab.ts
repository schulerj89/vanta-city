import './characterAnimationLab.css';
import {
  AmbientLight,
  AnimationMixer,
  AxesHelper,
  Box3,
  Box3Helper,
  BufferGeometry,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  DirectionalLight,
  GridHelper,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  LoopOnce,
  LoopRepeat,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SkeletonHelper,
  SphereGeometry,
  Vector3,
  WireframeGeometry,
} from 'three';
import type { AnimationAction, Bone, Material, Object3D } from 'three';
import { CharacterLoader } from '../../characters/CharacterLoader';
import type {
  LoadedCharacter,
  RootMotionDiagnostic,
} from '../../characters/CharacterLoader';
import type { CharacterDefinition } from '../../characters/CharacterDefinition';
import { characterDefinitions } from '../../characters/characters';
import {
  characterActionTimings,
  isCharacterActionName,
} from '../../characters/CharacterActions';
import { CharacterAnimationStateMachine } from '../../characters/CharacterAnimationStateMachine';
import type { CharacterAnimationGraphState } from '../../characters/CharacterAnimationStateMachine';
import {
  calculateCharacterVisualAlignment,
  measureModelBounds,
} from '../../characters/CharacterVisualAlignment';
import type { GameSystem } from '../../core/lifecycle';
import type { FrameTime } from '../../core/time';
import type { DebugUnregister } from '../../debug/DebugRegistry';
import { debugSections } from '../../debug/DebugRegistry';
import { sparringTargetCharacterDefinition } from '../../debug/sparringTarget';
import { npcCharacterDefinitions } from '../../npcs/npcs';
import { defaultPlayerMovementConfig } from '../../player/PlayerMovement';
import type { PlayerMovementState } from '../../player/PlayerMovement';
import type { SandboxContext, SandboxScenario } from '../SandboxScenario';
import { CharacterEquipment } from '../../equipment/CharacterEquipment';
import { EquipmentPresentation } from '../../equipment/EquipmentPresentation';
import type { EquipmentPresentationSnapshot } from '../../equipment/EquipmentPresentation';
import type { EquipmentId } from '../../equipment/EquipmentDefinition';

type SelectionKind = 'logical' | 'clip';
type CompletionRelease = 'mixer-finished' | 'duration-fallback' | undefined;

export interface CharacterAnimationLabSnapshot {
  readonly ready: boolean;
  readonly modelId: string | undefined;
  readonly modelSource: LoadedCharacter['source'] | 'pending';
  readonly selection: string;
  readonly selectionKind: SelectionKind;
  readonly playing: boolean;
  readonly speed: number;
  readonly loop: boolean;
  readonly normalizedTime: number;
  readonly duration: number;
  readonly actionBusy: boolean;
  readonly impactReached: boolean;
  readonly impactSequence: number;
  readonly completionRelease: CompletionRelease;
  readonly completionSequence: number;
  readonly transitionSequence: number;
  readonly rejectedTransitions: number;
  readonly graph: CharacterAnimationGraphState;
  readonly logicalAnimations: readonly string[];
  readonly authoredClips: readonly string[];
  readonly strippedRootTracks: readonly RootMotionDiagnostic[];
  readonly bounds:
    | { readonly min: readonly number[]; readonly max: readonly number[] }
    | undefined;
  readonly alignment:
    | {
        readonly height: number;
        readonly visualOffset: number;
        readonly footPlane: number;
        readonly simulationOrigin: readonly number[];
        readonly visualRoot: readonly number[];
      }
    | undefined;
  readonly disposalCount: number;
  readonly error: string | undefined;
  readonly equipment: EquipmentPresentationSnapshot;
  readonly equipmentBounds:
    | { readonly min: readonly number[]; readonly max: readonly number[] }
    | undefined;
  readonly socketPosition: readonly number[] | undefined;
}

export interface CharacterAnimationLabBridge {
  snapshot(): CharacterAnimationLabSnapshot;
  selectModel(id: string): Promise<void>;
  selectAnimation(selection: string): boolean;
  selectEquipment(itemId: EquipmentId | 'none'): void;
  setView(view: 'front' | 'right' | 'rear' | 'left'): void;
  setPlaying(playing: boolean): void;
  setLoop(loop: boolean): void;
  setSpeed(speed: number): void;
  setNormalizedTime(time: number): void;
  setOverlay(
    overlay: 'skeleton' | 'bounds' | 'alignment' | 'rootMotion' | 'equipment',
    visible: boolean,
  ): void;
}

declare global {
  interface Window {
    __VANTA_ANIMATION_LAB__?: CharacterAnimationLabBridge;
  }
}

const definitions = [
  ...characterDefinitions,
  ...npcCharacterDefinitions,
  sparringTargetCharacterDefinition,
] as readonly CharacterDefinition[];

class CharacterAnimationLabSystem implements GameSystem {
  public readonly id = 'sandbox-character-animation-lab';
  public readonly updateMode = 'always' as const;

  private readonly loader: CharacterLoader;
  private readonly stage = new Group();
  private readonly simulationRoot = new Group();
  private readonly visualRoot = new Group();
  private readonly overlayRoot = new Group();
  private readonly bounds = new Box3();
  private readonly boundsHelper = new Box3Helper(this.bounds, 0x70f0c5);
  private readonly equipmentBounds = new Box3();
  private readonly equipmentBoundsHelper = new Box3Helper(
    this.equipmentBounds,
    0xffb347,
  );
  private readonly socketAxes = new AxesHelper(0.24);
  private readonly simulationAxes = new AxesHelper(0.45);
  private readonly visualAxes = new AxesHelper(0.32);
  private readonly footPlane = new Mesh(
    new CircleGeometry(0.72, 40),
    new MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.65,
      depthTest: false,
    }),
  );
  private readonly impactMarker = new Mesh(
    new SphereGeometry(0.1, 16, 10),
    new MeshBasicMaterial({ color: 0xffd34e, depthTest: false }),
  );
  private readonly panel = document.createElement('aside');
  private readonly status = document.createElement('output');
  private readonly modelSelect = document.createElement('select');
  private readonly animationSelect = document.createElement('select');
  private readonly equipmentSelect = document.createElement('select');
  private readonly viewSelect = document.createElement('select');
  private readonly playButton = document.createElement('button');
  private readonly scrub = document.createElement('input');
  private readonly speed = document.createElement('input');
  private readonly loop = document.createElement('input');
  private readonly fade = document.createElement('input');
  private readonly diagnostics = document.createElement('dl');
  private readonly overlayInputs = new Map<string, HTMLInputElement>();
  private loaded: LoadedCharacter | undefined;
  private mixer: AnimationMixer | undefined;
  private action: AnimationAction | undefined;
  private skeleton: SkeletonHelper | undefined;
  private boneAxes: { readonly bone: Bone; readonly axes: AxesHelper }[] = [];
  private rootTrail: Line | undefined;
  private selected = 'logical:idle';
  private playing = true;
  private loopEnabled = true;
  private playbackSpeed = 1;
  private crossFade = 0.2;
  private normalizedTime = 0;
  private actionBusy = false;
  private actionElapsed = 0;
  private actionDuration = 0;
  private fallbackRemaining = 0;
  private impactReached = false;
  private impactSequence = 0;
  private impactVisibleRemaining = 0;
  private completionRelease: CompletionRelease;
  private completionSequence = 0;
  private transitionSequence = 0;
  private rejectedTransitions = 0;
  private disposalCount = 0;
  private loadVersion = 0;
  private ready = false;
  private cameraConfigured = false;
  private error: string | undefined;
  private unregister: DebugUnregister[] = [];
  private readonly graph = new CharacterAnimationStateMachine();
  private readonly equipment = new CharacterEquipment('animation-lab');
  private readonly equipmentPresentation: EquipmentPresentation;
  private currentGraph = this.graph.getState();
  private alignment:
    { readonly height: number; readonly visualOffset: number } | undefined;

  public constructor(private readonly context: SandboxContext) {
    this.loader = new CharacterLoader(context.assets);
    this.equipmentPresentation = new EquipmentPresentation(
      this.equipment,
      context.assets,
    );
    this.stage.name = 'Character and Animation Lab stage';
    this.simulationRoot.name = 'Authoritative simulation origin';
    this.visualRoot.name = 'Presentation-only visual alignment root';
    this.overlayRoot.name = 'Animation lab visual helpers';
    this.simulationAxes.name = 'Simulation origin axes';
    this.visualAxes.name = 'Visual root axes';
    this.footPlane.name = 'Foot contact plane';
    this.footPlane.rotation.x = -Math.PI / 2;
    this.footPlane.position.y = 0.004;
    this.impactMarker.name = 'Animation impact marker';
    this.impactMarker.position.set(0, 1.1, 0.45);
    this.impactMarker.visible = false;
  }

  public async init(): Promise<void> {
    this.configureScene();
    this.buildPanel();
    this.context.mount.classList.add('character-animation-lab-active');
    this.context.mount.append(this.panel);
    this.context.scene.add(this.stage);
    this.registerDebug();
    this.installBridge();
    await this.selectModel(definitions[0]!.id);
  }

  public update(time: FrameTime): void {
    if (!this.cameraConfigured) {
      // RenderSystem initializes after sandbox systems in the shared harness.
      // Apply the lab composition on the first frame, after that initialization.
      this.setView('right');
    }
    const delta = Math.max(0, time.delta);
    this.equipmentPresentation.update(delta);
    if (this.mixer && this.action && this.loaded) {
      this.action.paused = !this.playing;
      this.action.setEffectiveTimeScale(this.playbackSpeed);
      if (this.playing) {
        this.actionElapsed += delta * this.playbackSpeed;
        this.fallbackRemaining = Math.max(
          0,
          this.fallbackRemaining - delta * this.playbackSpeed,
        );
      }
      this.mixer.update(delta);
      // Presentation animation must never translate its authoritative parent.
      this.simulationRoot.position.set(0, 0, 0);
      this.normalizedTime =
        this.actionDuration > 0
          ? Math.min(1, this.action.time / this.actionDuration)
          : 0;
      this.updateImpact();
      if (this.actionBusy && this.fallbackRemaining === 0) {
        this.releaseAction('duration-fallback');
      }
    }
    this.impactVisibleRemaining = Math.max(
      0,
      this.impactVisibleRemaining - delta,
    );
    this.impactMarker.visible = this.impactVisibleRemaining > 0;
    this.refreshHelpers();
    this.refreshPanel();
  }

  public dispose(): void {
    this.loadVersion += 1;
    delete window.__VANTA_ANIMATION_LAB__;
    for (const unregister of this.unregister) unregister();
    this.unregister = [];
    this.disposeLoaded();
    this.equipmentPresentation.dispose();
    this.equipment.dispose();
    this.context.scene.remove(this.stage);
    this.context.mount.classList.remove('character-animation-lab-active');
    this.panel.remove();
    this.boundsHelper.dispose();
    this.equipmentBoundsHelper.dispose();
    this.socketAxes.dispose();
    disposeObject(this.stage);
    this.stage.clear();
  }

  public getSnapshot(): CharacterAnimationLabSnapshot {
    const modelBounds = this.loaded
      ? new Box3().setFromObject(this.loaded.root)
      : undefined;
    const [selectionKind] = parseSelection(this.selected);
    const attachment = this.equipmentPresentation.getAttachmentDebugObjects();
    const weaponBounds = attachment
      ? new Box3().setFromObject(attachment.root)
      : undefined;
    const socketPosition = attachment
      ? attachment.socket.getWorldPosition(new Vector3()).toArray()
      : undefined;
    return {
      ready: this.ready,
      modelId: this.loaded?.definition.id,
      modelSource: this.loaded?.source ?? 'pending',
      selection: parseSelection(this.selected)[1],
      selectionKind,
      playing: this.playing,
      speed: this.playbackSpeed,
      loop: this.loopEnabled,
      normalizedTime: this.normalizedTime,
      duration: this.actionDuration,
      actionBusy: this.actionBusy,
      impactReached: this.impactReached,
      impactSequence: this.impactSequence,
      completionRelease: this.completionRelease,
      completionSequence: this.completionSequence,
      transitionSequence: this.transitionSequence,
      rejectedTransitions: this.rejectedTransitions,
      graph: { ...this.currentGraph },
      logicalAnimations: [...(this.loaded?.animationClips.keys() ?? [])],
      authoredClips: [...(this.loaded?.availableAnimationClips?.keys() ?? [])],
      strippedRootTracks: [...(this.loaded?.rootMotionDiagnostics ?? [])],
      bounds:
        !modelBounds || modelBounds.isEmpty()
          ? undefined
          : {
              min: modelBounds.min.toArray(),
              max: modelBounds.max.toArray(),
            },
      alignment: this.alignment
        ? {
            height: this.alignment.height,
            visualOffset: this.alignment.visualOffset,
            footPlane: 0,
            simulationOrigin: this.simulationRoot.position.toArray(),
            visualRoot: this.visualRoot.position.toArray(),
          }
        : undefined,
      disposalCount: this.disposalCount,
      error: this.error,
      equipment: this.equipmentPresentation.getSnapshot(),
      equipmentBounds:
        !weaponBounds || weaponBounds.isEmpty()
          ? undefined
          : {
              min: weaponBounds.min.toArray(),
              max: weaponBounds.max.toArray(),
            },
      socketPosition,
    };
  }

  public async selectModel(id: string): Promise<void> {
    const definition = definitions.find((candidate) => candidate.id === id);
    if (!definition) throw new Error(`Unknown lab character: ${id}`);
    const version = ++this.loadVersion;
    this.ready = false;
    this.error = undefined;
    this.status.textContent = `Loading ${definition.displayName}…`;
    const next = await this.loader.instantiate(definition);
    if (version !== this.loadVersion) {
      next.dispose();
      this.disposalCount += 1;
      return;
    }
    this.disposeLoaded();
    this.loaded = next;
    const bounds = measureModelBounds(next.root);
    const alignment = calculateCharacterVisualAlignment(
      { minY: bounds.min.y, maxY: bounds.max.y },
      definition.transform?.verticalOffset,
    );
    this.alignment = {
      height: alignment.computedHeight,
      visualOffset: alignment.appliedVisualOffset,
    };
    this.visualRoot.position.set(0, alignment.appliedVisualOffset, 0);
    this.visualRoot.add(next.root);
    this.equipmentPresentation.bind(next.root, definition.equipmentRigId);
    this.mixer = new AnimationMixer(next.root);
    this.mixer.addEventListener('finished', this.onMixerFinished);
    this.buildSkeleton(next.root);
    this.populateAnimations();
    this.modelSelect.value = id;
    this.graph.reset();
    this.currentGraph = this.graph.getState();
    this.ready = true;
    const preferred = next.animationClips.has('idle')
      ? 'logical:idle'
      : this.animationSelect.options[0]?.value;
    if (preferred) this.selectAnimation(preferred, true);
  }

  public selectAnimation(selection: string, force = false): boolean {
    if (this.actionBusy && !force) {
      this.rejectedTransitions += 1;
      this.animationSelect.value = this.selected;
      return false;
    }
    const clip = this.resolveClip(selection);
    if (!clip || !this.mixer) return false;
    this.action?.fadeOut(this.crossFade);
    this.selected = selection;
    this.action = this.mixer.clipAction(clip).reset();
    this.action
      .setEffectiveTimeScale(this.playbackSpeed)
      .fadeIn(this.crossFade);
    this.action.setLoop(
      this.loopEnabled ? LoopRepeat : LoopOnce,
      this.loopEnabled ? Infinity : 1,
    );
    this.action.clampWhenFinished = !this.loopEnabled;
    this.action.paused = !this.playing;
    this.action.play();
    this.actionDuration = Math.max(0.001, clip.duration);
    this.actionElapsed = 0;
    this.normalizedTime = 0;
    this.actionBusy = !this.loopEnabled;
    this.fallbackRemaining = this.loopEnabled
      ? Number.POSITIVE_INFINITY
      : this.actionDuration + 0.15;
    this.impactReached = false;
    this.completionRelease = undefined;
    this.transitionSequence += 1;
    this.updateGraph(selection);
    this.updateRootTrail(selection);
    this.animationSelect.value = selection;
    return true;
  }

  public selectEquipment(itemId: EquipmentId | 'none'): void {
    if (itemId === 'none') this.equipment.unequip();
    else this.equipment.equip(itemId);
    this.equipmentSelect.value = itemId;
  }

  public setView(view: 'front' | 'right' | 'rear' | 'left'): void {
    const positions = {
      front: [0, 1.45, 3.2],
      right: [3.2, 1.45, 0],
      rear: [0, 1.45, -3.2],
      left: [-3.2, 1.45, 0],
    } as const;
    const position = positions[view];
    this.context.camera.position.set(position[0], position[1], position[2]);
    this.context.camera.lookAt(0, 1.05, 0);
    this.cameraConfigured = true;
  }

  public setPlaying(playing: boolean): void {
    this.playing = playing;
    if (this.action) this.action.paused = !playing;
  }

  public setLoop(loop: boolean): void {
    if (this.actionBusy) {
      this.rejectedTransitions += 1;
      this.loop.checked = this.loopEnabled;
      return;
    }
    this.loopEnabled = loop;
    this.loop.checked = loop;
    this.selectAnimation(this.selected, true);
  }

  public setSpeed(speed: number): void {
    this.playbackSpeed = Math.min(2, Math.max(0.1, speed));
    this.speed.value = String(this.playbackSpeed);
  }

  public setNormalizedTime(value: number): void {
    if (!this.action) return;
    this.normalizedTime = Math.min(1, Math.max(0, value));
    this.action.time = this.normalizedTime * this.actionDuration;
    this.actionElapsed = this.action.time;
    this.setPlaying(false);
    this.mixer?.update(0);
  }

  public setOverlay(name: string, visible: boolean): void {
    const input = this.overlayInputs.get(name);
    if (input) input.checked = visible;
    this.applyOverlayVisibility();
  }

  private configureScene(): void {
    const floor = new Mesh(
      new PlaneGeometry(20, 20),
      new MeshBasicMaterial({ color: 0x071117 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.012;
    const grid = new GridHelper(20, 20, 0x426d68, 0x17312f);
    this.context.scene.background = new Color(0x071117);
    const key = new DirectionalLight(0xffead0, 3.2);
    key.position.set(3, 5, 4);
    const rim = new DirectionalLight(0x60e7c4, 2.4);
    rim.position.set(-4, 3, -3);
    this.visualRoot.add(this.visualAxes);
    this.simulationRoot.add(this.visualRoot);
    this.overlayRoot.add(
      this.boundsHelper,
      this.equipmentBoundsHelper,
      this.socketAxes,
      this.simulationAxes,
      this.footPlane,
      this.impactMarker,
    );
    this.stage.add(
      floor,
      grid,
      new AmbientLight(0xb7d8d0, 1.4),
      key,
      rim,
      this.simulationRoot,
      this.overlayRoot,
    );
  }

  private buildPanel(): void {
    this.panel.className = 'animation-lab';
    this.panel.setAttribute('aria-label', 'Character and Animation Lab');
    const header = document.createElement('header');
    const title = document.createElement('h1');
    title.textContent = 'Character + Animation Lab';
    const note = document.createElement('p');
    note.textContent = 'Development-only presentation sandbox';
    header.append(title, note, this.status);

    for (const definition of definitions) {
      this.modelSelect.add(new Option(definition.displayName, definition.id));
    }
    this.modelSelect.addEventListener('change', () => {
      void this.selectModel(this.modelSelect.value).catch((error: unknown) => {
        this.error = error instanceof Error ? error.message : String(error);
      });
    });
    this.animationSelect.addEventListener('change', () => {
      this.selectAnimation(this.animationSelect.value);
    });
    this.equipmentSelect.add(new Option('None', 'none'));
    this.equipmentSelect.add(new Option('Handgun', 'handgun'));
    this.equipmentSelect.add(new Option('Knife', 'knife'));
    this.equipmentSelect.value = 'none';
    this.equipmentSelect.addEventListener('change', () => {
      this.selectEquipment(this.equipmentSelect.value as EquipmentId | 'none');
    });
    for (const view of ['front', 'right', 'rear', 'left'] as const) {
      this.viewSelect.add(new Option(view, view));
    }
    this.viewSelect.value = 'right';
    this.viewSelect.addEventListener('change', () => {
      this.setView(
        this.viewSelect.value as 'front' | 'right' | 'rear' | 'left',
      );
    });

    this.playButton.type = 'button';
    this.playButton.addEventListener('click', () =>
      this.setPlaying(!this.playing),
    );
    this.scrub.type = 'range';
    this.scrub.min = '0';
    this.scrub.max = '1';
    this.scrub.step = '0.001';
    this.scrub.addEventListener('input', () =>
      this.setNormalizedTime(Number(this.scrub.value)),
    );
    this.speed.type = 'range';
    this.speed.min = '0.1';
    this.speed.max = '2';
    this.speed.step = '0.1';
    this.speed.value = '1';
    this.speed.addEventListener('input', () =>
      this.setSpeed(Number(this.speed.value)),
    );
    this.loop.type = 'checkbox';
    this.loop.checked = true;
    this.loop.addEventListener('change', () => this.setLoop(this.loop.checked));
    this.fade.type = 'range';
    this.fade.min = '0';
    this.fade.max = '1';
    this.fade.step = '0.05';
    this.fade.value = String(this.crossFade);
    this.fade.addEventListener('input', () => {
      this.crossFade = Number(this.fade.value);
    });

    const controls = document.createElement('div');
    controls.className = 'animation-lab__controls';
    controls.append(
      field('Model', this.modelSelect),
      field('Clip / logical state', this.animationSelect),
      field('Equipment', this.equipmentSelect),
      field('View', this.viewSelect),
      field('Playback', this.playButton),
      field('Normalized time', this.scrub),
      field('Speed', this.speed),
      field('Loop', this.loop),
      field('Cross-fade (s)', this.fade),
    );
    const overlays = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = 'Visual diagnostics';
    overlays.append(legend);
    for (const [id, label, checked] of [
      ['skeleton', 'Skeleton + bone axes', false],
      ['bounds', 'Transformed bounds', true],
      ['alignment', 'Origin, visual root, capsule + foot plane', true],
      ['rootMotion', 'Authored root-motion trail', true],
      ['equipment', 'Weapon bounds + socket axes', true],
    ] as const) {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = checked;
      input.addEventListener('change', () => this.applyOverlayVisibility());
      this.overlayInputs.set(id, input);
      const row = document.createElement('label');
      row.append(input, label);
      overlays.append(row);
    }
    this.diagnostics.className = 'animation-lab__diagnostics';
    this.panel.append(header, controls, overlays, this.diagnostics);
  }

  private populateAnimations(): void {
    this.animationSelect.replaceChildren();
    const logical = document.createElement('optgroup');
    logical.label = 'Logical graph states';
    for (const name of this.loaded?.animationClips.keys() ?? []) {
      logical.append(new Option(name, `logical:${name}`));
    }
    const clips = document.createElement('optgroup');
    clips.label = 'Authored clips (root motion stripped)';
    for (const name of this.loaded?.availableAnimationClips?.keys() ?? []) {
      clips.append(new Option(name, `clip:${name}`));
    }
    this.animationSelect.append(logical, clips);
  }

  private resolveClip(selection: string) {
    const [kind, name] = parseSelection(selection);
    return kind === 'logical'
      ? this.loaded?.animationClips.get(name)
      : this.loaded?.availableAnimationClips?.get(name);
  }

  private updateGraph(selection: string): void {
    const [kind, name] = parseSelection(selection);
    if (kind === 'clip') return;
    const movement = movementFor(name);
    const transition = this.graph.transition(
      {
        movement,
        action: isCharacterActionName(name) ? name : undefined,
        reaction:
          !isCharacterActionName(name) && !isMovementState(name)
            ? name
            : undefined,
      },
      (logicalName) => this.loaded?.animationClips.has(logicalName) ?? false,
    );
    this.currentGraph = transition.state;
  }

  private updateImpact(): void {
    if (this.impactReached) return;
    const [kind, name] = parseSelection(this.selected);
    if (kind !== 'logical' || !isCharacterActionName(name)) return;
    const marker = characterActionTimings[name].impactNormalizedTime;
    if (marker === undefined || this.normalizedTime < marker) return;
    this.impactReached = true;
    this.impactSequence += 1;
    this.impactVisibleRemaining = 0.32;
  }

  private readonly onMixerFinished = (event: {
    readonly action: AnimationAction;
  }): void => {
    if (event.action !== this.action || !this.actionBusy) return;
    this.releaseAction('mixer-finished');
  };

  private releaseAction(release: Exclude<CompletionRelease, undefined>): void {
    if (!this.actionBusy) return;
    this.actionBusy = false;
    this.completionRelease = release;
    this.completionSequence += 1;
    this.fallbackRemaining = Number.POSITIVE_INFINITY;
  }

  private buildSkeleton(root: Object3D): void {
    this.skeleton = new SkeletonHelper(root);
    this.skeleton.name = 'Skeleton lines';
    this.overlayRoot.add(this.skeleton);
    root.traverse((object) => {
      if (!isBone(object)) return;
      const axes = new AxesHelper(0.08);
      axes.name = `Bone axes: ${object.name || 'unnamed'}`;
      this.overlayRoot.add(axes);
      this.boneAxes.push({ bone: object, axes });
    });
    this.applyOverlayVisibility();
  }

  private updateRootTrail(selection: string): void {
    this.disposeRootTrail();
    const [, selectedName] = parseSelection(selection);
    const selectedClip = this.resolveClip(selection)?.name;
    const diagnostic = this.loaded?.rootMotionDiagnostics?.find(
      ({ clip }) => clip === selectedName || clip === selectedClip,
    );
    if (!diagnostic || diagnostic.samples.length < 2 || !this.loaded) return;
    const transform = new Matrix4().compose(
      this.loaded.root.position,
      this.loaded.root.quaternion,
      this.loaded.root.scale,
    );
    const points = diagnostic.samples.map((sample) =>
      new Vector3(...sample).applyMatrix4(transform),
    );
    this.rootTrail = new Line(
      new BufferGeometry().setFromPoints(points),
      new LineBasicMaterial({ color: 0xff5ad9 }),
    );
    this.rootTrail.name = 'Stripped authored root-motion trail';
    this.overlayRoot.add(this.rootTrail);
    this.applyOverlayVisibility();
  }

  private refreshHelpers(): void {
    if (!this.loaded) return;
    this.loaded.root.updateWorldMatrix(true, true);
    this.bounds.setFromObject(this.loaded.root);
    this.boundsHelper.updateMatrixWorld(true);
    for (const { bone, axes } of this.boneAxes) {
      bone.getWorldPosition(axes.position);
      bone.getWorldQuaternion(axes.quaternion);
      axes.scale.setScalar(1);
    }
    const attachment = this.equipmentPresentation.getAttachmentDebugObjects();
    const equipmentOverlay =
      this.overlayInputs.get('equipment')?.checked ?? false;
    if (attachment) {
      this.equipmentBounds.setFromObject(attachment.root);
      attachment.socket.getWorldPosition(this.socketAxes.position);
      attachment.socket.getWorldQuaternion(this.socketAxes.quaternion);
    } else {
      this.equipmentBounds.makeEmpty();
    }
    this.equipmentBoundsHelper.visible =
      Boolean(attachment) && equipmentOverlay;
    this.socketAxes.visible = Boolean(attachment) && equipmentOverlay;
    this.equipmentBoundsHelper.updateMatrixWorld(true);
  }

  private refreshPanel(): void {
    this.playButton.textContent = this.playing ? 'Pause' : 'Play';
    this.scrub.value = String(this.normalizedTime);
    const snapshot = this.getSnapshot();
    this.status.textContent = this.error
      ? `Error: ${this.error}`
      : snapshot.ready
        ? `${snapshot.modelSource} · ${snapshot.duration.toFixed(2)} s`
        : 'Loading…';
    const rows: readonly [string, string][] = [
      ['Graph', snapshot.graph.label],
      ['Priority / phase', snapshot.graph.phase],
      ['Fallback', snapshot.graph.fallback],
      [
        'Transition',
        `${snapshot.graph.transitionReason} #${snapshot.graph.transitionSequence}`,
      ],
      ['Action lock', snapshot.actionBusy ? 'busy' : 'released'],
      [
        'Impact',
        snapshot.impactReached
          ? `reached #${snapshot.impactSequence}`
          : 'pending / none',
      ],
      ['Completion', snapshot.completionRelease ?? 'pending / looping'],
      ['Rejected transitions', String(snapshot.rejectedTransitions)],
      ['Root tracks stripped', String(snapshot.strippedRootTracks.length)],
      [
        'Alignment',
        snapshot.alignment
          ? `${snapshot.alignment.height.toFixed(3)} m; visual Y ${snapshot.alignment.visualOffset.toFixed(3)}`
          : 'pending',
      ],
      ['Disposed instances', String(snapshot.disposalCount)],
      [
        'Equipment',
        snapshot.equipment.itemId
          ? `${snapshot.equipment.itemId} · ${snapshot.equipment.source ?? 'loading'} · ${snapshot.equipment.socketName ?? 'no socket'}`
          : 'none',
      ],
      [
        'Weapon bounds',
        snapshot.equipmentBounds
          ? snapshot.equipmentBounds.max
              .map((value, index) =>
                (value - snapshot.equipmentBounds!.min[index]!).toFixed(3),
              )
              .join(' × ')
          : 'none',
      ],
    ];
    this.diagnostics.replaceChildren(
      ...rows.flatMap(([label, value]) => {
        const term = document.createElement('dt');
        term.textContent = label;
        const detail = document.createElement('dd');
        detail.textContent = value;
        return [term, detail];
      }),
    );
  }

  private applyOverlayVisibility(): void {
    const skeleton = this.overlayInputs.get('skeleton')?.checked ?? false;
    if (this.skeleton) this.skeleton.visible = skeleton;
    for (const { axes } of this.boneAxes) axes.visible = skeleton;
    this.boundsHelper.visible =
      this.overlayInputs.get('bounds')?.checked ?? false;
    const alignment = this.overlayInputs.get('alignment')?.checked ?? false;
    this.simulationAxes.visible = alignment;
    this.visualAxes.visible = alignment;
    this.footPlane.visible = alignment;
    const capsule = this.overlayRoot.getObjectByName('Player capsule contract');
    if (capsule) capsule.visible = alignment;
    if (this.rootTrail) {
      this.rootTrail.visible =
        this.overlayInputs.get('rootMotion')?.checked ?? false;
    }
    const equipment = this.overlayInputs.get('equipment')?.checked ?? false;
    const attachment = this.equipmentPresentation.getAttachmentDebugObjects();
    this.equipmentBoundsHelper.visible = equipment && Boolean(attachment);
    this.socketAxes.visible = equipment && Boolean(attachment);
  }

  private registerDebug(): void {
    const capsule = createCapsuleHelper();
    this.overlayRoot.add(capsule);
    this.unregister = [
      this.context.debug.registerValue({
        id: 'animation-lab.state',
        label: 'Lab animation',
        group: debugSections.characters,
        read: () =>
          `${this.getSnapshot().selection} · ${this.currentGraph.label}`,
      }),
      this.context.debug.registerValue({
        id: 'animation-lab.lock',
        label: 'Action lock / completion',
        group: debugSections.characters,
        read: () =>
          `${this.actionBusy ? 'busy' : 'released'} · ${this.completionRelease ?? 'none'}`,
      }),
      this.context.debug.registerValue({
        id: 'animation-lab.impact',
        label: 'Impact marker',
        group: debugSections.characters,
        read: () =>
          `${this.impactReached ? 'reached' : 'pending'} #${this.impactSequence}`,
      }),
      this.context.debug.registerCommand({
        id: 'animation-lab.reset',
        label: 'Reset animation lab',
        group: debugSections.actions,
        run: () => this.selectModel(this.modelSelect.value),
      }),
    ];
    this.applyOverlayVisibility();
  }

  private installBridge(): void {
    window.__VANTA_ANIMATION_LAB__ = {
      snapshot: () => this.getSnapshot(),
      selectModel: (id) => this.selectModel(id),
      selectAnimation: (selection) => this.selectAnimation(selection),
      selectEquipment: (itemId) => this.selectEquipment(itemId),
      setView: (view) => this.setView(view),
      setPlaying: (playing) => this.setPlaying(playing),
      setLoop: (loop) => this.setLoop(loop),
      setSpeed: (speed) => this.setSpeed(speed),
      setNormalizedTime: (time) => this.setNormalizedTime(time),
      setOverlay: (overlay, visible) => this.setOverlay(overlay, visible),
    };
  }

  private disposeLoaded(): void {
    this.equipmentPresentation.unbind();
    this.disposeRootTrail();
    if (this.mixer && this.loaded) {
      this.mixer.removeEventListener('finished', this.onMixerFinished);
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.loaded.root);
    }
    this.skeleton?.dispose();
    this.skeleton?.removeFromParent();
    this.skeleton = undefined;
    for (const { axes } of this.boneAxes) {
      axes.removeFromParent();
      axes.dispose();
    }
    this.boneAxes = [];
    this.action = undefined;
    this.mixer = undefined;
    this.loaded?.dispose();
    if (this.loaded) this.disposalCount += 1;
    this.loaded = undefined;
    this.visualRoot.clear();
    this.visualRoot.add(this.visualAxes);
    this.visualRoot.position.set(0, 0, 0);
    this.actionBusy = false;
    this.ready = false;
    this.alignment = undefined;
  }

  private disposeRootTrail(): void {
    if (!this.rootTrail) return;
    this.rootTrail.geometry.dispose();
    (this.rootTrail.material as Material).dispose();
    this.rootTrail.removeFromParent();
    this.rootTrail = undefined;
  }
}

export const characterAnimationLab: SandboxScenario = {
  id: 'character-animation-lab',
  title: 'Character + Animation Lab',
  create: (context) => new CharacterAnimationLabSystem(context),
};

function parseSelection(selection: string): [SelectionKind, string] {
  const separator = selection.indexOf(':');
  const kind = selection.slice(0, separator);
  if ((kind !== 'logical' && kind !== 'clip') || separator < 0) {
    throw new Error(`Invalid animation selection: ${selection}`);
  }
  return [kind, selection.slice(separator + 1)];
}

function isMovementState(name: string): name is PlayerMovementState {
  return ['idle', 'walk', 'run', 'airborne', 'landing'].includes(name);
}

function movementFor(name: string): PlayerMovementState {
  if (name === 'walk') return 'walking';
  if (name === 'run') return 'running';
  if (name === 'airborne' || name === 'landing' || name === 'idle') return name;
  return 'idle';
}

function isBone(object: Object3D): object is Bone {
  return 'isBone' in object && object.isBone === true;
}

function field(label: string, control: HTMLElement): HTMLLabelElement {
  const element = document.createElement('label');
  const text = document.createElement('span');
  text.textContent = label;
  element.append(text, control);
  return element;
}

function createCapsuleHelper(): Object3D {
  const { radius, height } = defaultPlayerMovementConfig;
  const source = new CapsuleGeometry(
    radius,
    Math.max(0, height - radius * 2),
    8,
    12,
  );
  const geometry = new WireframeGeometry(source);
  source.dispose();
  const capsule = new LineSegments(
    geometry,
    new LineBasicMaterial({ color: 0x45cfff }),
  );
  capsule.name = 'Player capsule contract';
  capsule.position.y = height / 2;
  return capsule;
}

function disposeObject(root: Object3D): void {
  root.traverse((object) => {
    if ('geometry' in object && object.geometry instanceof BufferGeometry) {
      object.geometry.dispose();
    }
    const candidate = (object as unknown as { material?: unknown }).material;
    if (!candidate) return;
    const materials: unknown[] = Array.isArray(candidate)
      ? candidate
      : [candidate];
    for (const material of materials) {
      if (isDisposable(material)) material.dispose();
    }
  });
}

function isDisposable(value: unknown): value is { dispose(): void } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'dispose' in value &&
    typeof value.dispose === 'function'
  );
}
