import '../cameraCompositionLab.css';
import {
  AmbientLight,
  ArrowHelper,
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  DirectionalLight,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  Vector3,
} from 'three';
import type { Material, Object3D } from 'three';
import type { CameraControlHandle } from '../../camera/ThirdPersonCameraSystem';
import {
  ThirdPersonCameraSystem,
  cameraControlPriorities,
} from '../../camera/ThirdPersonCameraSystem';
import { resolveConversationCameraProfile } from '../../camera/ConversationCameraProfile';
import type { GameSystem } from '../../core/lifecycle';
import type { FrameTime } from '../../core/time';
import type { DebugUnregister } from '../../debug/DebugRegistry';
import { debugSections } from '../../debug/DebugRegistry';
import { GameObjectWorld } from '../../entities/GameObjectWorld';
import type { GameContext } from '../../game/GameRuntime';
import { StaticCollisionWorld } from '../../physics/CollisionWorld';
import { PlayerControllerSystem } from '../../player/PlayerControllerSystem';
import type { WorldPose, WorldPoseSource } from '../../world/Spatial';
import {
  cameraLabNpcProfiles,
  createCameraLabPreset,
  positionPlayerForApproach,
} from '../CameraCompositionLabState';
import type {
  CameraCompositionLabState,
  CameraLabApproachSide,
  CameraLabNpcId,
  CameraLabPresetId,
  CameraLabViewportPreset,
} from '../CameraCompositionLabState';
import type { SandboxContext, SandboxScenario } from '../SandboxScenario';

const owner = 'sandbox:camera-composition';
const blockerId = 'camera-lab.obstruction';
const oppositeBlockerId = 'camera-lab.obstruction-opposite';
const colors = {
  player: 0x5ed8ff,
  mack: 0x9ee6ae,
  nox: 0xd59bff,
  raze: 0xffa66f,
  desired: 0xffd55c,
  adjusted: 0x58f3c3,
  target: 0xffffff,
  saved: 0xc98cff,
  blocker: 0xff5c66,
} as const;

export interface CameraCompositionLabSnapshot {
  readonly state: CameraCompositionLabState;
  readonly camera: ReturnType<ThirdPersonCameraSystem['getDebugSnapshot']>;
  readonly collision: ReturnType<StaticCollisionWorld['getDebugSnapshot']>;
  readonly ownerPriority: number;
  readonly savedGameplayCamera:
    { readonly position: WorldPoint; readonly target: WorldPoint } | undefined;
  readonly restorationError: number | undefined;
}

interface WorldPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface CameraCompositionLabApi {
  snapshot(): CameraCompositionLabSnapshot;
  applyPreset(id: CameraLabPresetId): void;
  execute(command: string, value?: string): void;
}

declare global {
  interface Window {
    __VANTA_CAMERA_LAB__?: CameraCompositionLabApi;
  }
}

class CameraCompositionLabSystem implements GameSystem<GameContext> {
  public readonly id = 'sandbox-camera-composition';
  public readonly updateMode = 'always' as const;

  private state: CameraCompositionLabState = createCameraLabPreset();
  private readonly root = new Group();
  private readonly objects: GameObjectWorld;
  private readonly collision = new StaticCollisionWorld();
  private readonly player: PlayerControllerSystem;
  private readonly camera: ThirdPersonCameraSystem;
  private readonly npcRoot = createParticipant(colors.mack);
  private readonly obstruction = new Mesh(
    new BoxGeometry(1, 1, 1),
    new MeshStandardMaterial({
      color: colors.blocker,
      transparent: true,
      opacity: 0.72,
      roughness: 0.8,
    }),
  );
  private readonly oppositeObstruction = new Mesh(
    new BoxGeometry(1, 1, 1),
    new MeshStandardMaterial({
      color: colors.blocker,
      transparent: true,
      opacity: 0.42,
      roughness: 0.8,
    }),
  );
  private readonly desiredMarker = marker(colors.desired, 'Desired camera');
  private readonly adjustedMarker = marker(
    colors.adjusted,
    'Obstruction-adjusted camera',
  );
  private readonly targetMarker = marker(colors.target, 'Participant midpoint');
  private readonly savedMarker = marker(colors.saved, 'Saved gameplay camera');
  private readonly anchorMarker = marker(0xff71d8, 'Authored anchor');
  private readonly sweep = line(colors.desired);
  private readonly restorationPath = line(colors.saved);
  private readonly playerFacing = new ArrowHelper(
    new Vector3(0, 0, 1),
    new Vector3(),
    1.2,
    colors.player,
  );
  private readonly npcFacing = new ArrowHelper(
    new Vector3(0, 0, 1),
    new Vector3(),
    1.2,
    colors.mack,
  );
  private request: CameraControlHandle | undefined;
  private unregister: DebugUnregister[] = [];
  private panel: HTMLElement | undefined;
  private guides: HTMLElement | undefined;
  private status: HTMLElement | undefined;
  private savedGameplayCamera:
    { position: WorldPoint; target: WorldPoint } | undefined;
  private initialized = false;

  private readonly npcPose: WorldPoseSource = {
    getWorldPose: (): WorldPose => ({
      position: {
        x: this.state.npc.x,
        y: this.state.npc.y,
        z: this.state.npc.z,
      },
      forward: {
        x: Math.sin(this.state.npc.yaw),
        y: 0,
        z: Math.cos(this.state.npc.yaw),
      },
    }),
  };

  public constructor(private readonly context: SandboxContext) {
    this.objects = new GameObjectWorld(context.scene);
    this.player = new PlayerControllerSystem(
      this.objects,
      this.collision,
      new Vector3(-1.5, 0, 0),
      undefined,
      () => this.camera?.getYaw() ?? 0,
    );
    this.player.setControlEnabled(false);
    this.camera = new ThirdPersonCameraSystem(
      context.camera,
      context.input,
      this.player,
      this.collision,
    );
    this.root.name = 'Camera Composition Lab visual helpers';
  }

  public async init(game: GameContext): Promise<void> {
    this.installScene();
    await this.player.init(game);
    this.camera.init(game);
    this.installInterface();
    this.registerDebug();
    this.initialized = true;
    this.applyPreset(this.readInitialPreset());
    window.__VANTA_CAMERA_LAB__ = {
      snapshot: () => this.getSnapshot(),
      applyPreset: (id) => this.applyPreset(id),
      execute: (command, value) => this.execute(command, value),
    };
  }

  public update(time: FrameTime): void {
    this.player.update(time);
    this.camera.update(time);
    this.objects.update(time);
    this.updateVisualizations();
    this.updateStatus();
  }

  public dispose(): void {
    this.request?.release();
    this.request = undefined;
    this.camera.dispose();
    this.player.dispose();
    this.objects.dispose();
    for (const unregister of this.unregister) unregister();
    this.unregister = [];
    delete window.__VANTA_CAMERA_LAB__;
    this.panel?.remove();
    this.guides?.remove();
    delete this.context.mount.dataset.cameraLabViewport;
    this.context.scene.remove(this.root);
    disposeTree(this.root);
  }

  public getSnapshot = (): CameraCompositionLabSnapshot => {
    const camera = this.camera.getDebugSnapshot();
    const restorationError = this.savedGameplayCamera
      ? distance(camera.position, this.savedGameplayCamera.position)
      : undefined;
    return {
      state: structuredClone(this.state),
      camera,
      collision: this.collision.getDebugSnapshot(),
      ownerPriority:
        camera.mode === 'gameplay'
          ? cameraControlPriorities.gameplay
          : cameraControlPriorities.conversation,
      savedGameplayCamera: this.savedGameplayCamera
        ? structuredClone(this.savedGameplayCamera)
        : undefined,
      restorationError,
    };
  };

  public applyPreset(id: CameraLabPresetId): void {
    const next = createCameraLabPreset(id);
    const wasRequested = this.request !== undefined;
    this.state = next;
    this.applyFixture();
    if (next.cameraRequested) this.acquireCamera();
    else if (wasRequested) this.restoreGameplayCamera();
    this.syncControls();
  }

  public execute(command: string, value = ''): void {
    switch (command) {
      case 'preset':
        this.applyPreset(value as CameraLabPresetId);
        return;
      case 'npc':
        this.patchState({
          npcId: value as CameraLabNpcId,
          profileId: cameraLabNpcProfiles[value as CameraLabNpcId],
        });
        return;
      case 'profile':
        this.patchState({
          profileId: value as CameraCompositionLabState['profileId'],
        });
        return;
      case 'shoulder':
        this.patchState({
          shoulder: value as CameraCompositionLabState['shoulder'],
        });
        return;
      case 'viewport':
        this.patchState({ viewport: value as CameraLabViewportPreset });
        return;
      case 'approach': {
        const approachSide = value as CameraLabApproachSide;
        this.patchState({
          approachSide,
          player: positionPlayerForApproach(
            this.state.npc,
            this.state.spacing,
            approachSide,
          ),
        });
        return;
      }
      case 'spacing': {
        const spacing = finite(value, this.state.spacing);
        this.patchState({
          spacing,
          player: positionPlayerForApproach(
            this.state.npc,
            spacing,
            this.state.approachSide,
          ),
        });
        return;
      }
      case 'anchor':
        this.patchState({ authoredAnchor: value === 'true' });
        return;
      case 'obstruction':
        this.patchState({
          obstruction: {
            ...this.state.obstruction,
            enabled: value === 'true',
          },
        });
        return;
      case 'player-pose':
        this.patchState({ player: parsePose(value, this.state.player) });
        return;
      case 'npc-pose':
        this.patchState({ npc: parsePose(value, this.state.npc) });
        return;
      case 'obstruction-pose': {
        const values = parseNumbers(value, 3);
        const x = values[0]!;
        const z = values[1]!;
        const yaw = values[2]!;
        this.patchState({
          obstruction: {
            ...this.state.obstruction,
            enabled: true,
            position: [x, this.state.obstruction.position[1], z],
            yaw,
          },
        });
        return;
      }
      case 'restore':
        this.restoreGameplayCamera();
        return;
      case 'acquire':
        this.acquireCamera();
        return;
      default:
        throw new Error(`Unknown camera lab command: ${command}`);
    }
  }

  private patchState(update: Partial<CameraCompositionLabState>): void {
    this.state = { ...this.state, ...update, preset: this.state.preset };
    this.applyFixture();
    if (this.request) this.acquireCamera();
    this.syncControls();
  }

  private installScene(): void {
    const floor = new Mesh(
      new PlaneGeometry(28, 22),
      new MeshStandardMaterial({ color: 0x17272b, roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.name = 'Deterministic camera lab floor';
    const gridMaterial = new MeshBasicMaterial({
      color: 0x35535a,
      transparent: true,
      opacity: 0.45,
      wireframe: true,
    });
    const grid = new Mesh(new PlaneGeometry(28, 22, 14, 11), gridMaterial);
    grid.rotation.x = -Math.PI / 2;
    grid.position.y = 0.006;
    this.obstruction.name = blockerId;
    this.oppositeObstruction.name = oppositeBlockerId;
    this.root.add(
      floor,
      grid,
      new AmbientLight(0xc8e5ff, 1.7),
      new DirectionalLight(0xfff1d0, 3.2),
      this.npcRoot,
      this.obstruction,
      this.oppositeObstruction,
      this.desiredMarker,
      this.adjustedMarker,
      this.targetMarker,
      this.savedMarker,
      this.anchorMarker,
      this.sweep,
      this.restorationPath,
      this.playerFacing,
      this.npcFacing,
    );
    this.context.scene.background = new Color(0x77909b);
    this.context.scene.add(this.root);
  }

  private installInterface(): void {
    const panel = document.createElement('section');
    panel.className = 'camera-lab-panel';
    panel.setAttribute('aria-label', 'Camera Composition Lab controls');
    panel.innerHTML = `
      <header><strong>Camera Composition Lab</strong><span>dev-only sandbox</span></header>
      <div class="camera-lab-panel__grid">
        ${select('preset', 'Preset', ['default', 'close-minimum', 'normal', 'obstructed', 'nox-alley', 'narrow-mobile', 'restoration'])}
        ${select('npc', 'NPC', ['mack', 'nox', 'raze'])}
        ${select('profile', 'Profile', ['default', 'close', 'wide'])}
        ${select('shoulder', 'Shoulder', ['right', 'left'])}
        ${select('approach', 'Approach', ['left', 'right', 'front', 'back'])}
        ${select('viewport', 'Viewport', ['responsive', 'desktop', 'mobile', 'short'])}
        ${number('spacing', 'Spacing', 0.5, 8, 0.25)}
        ${number('player-x', 'Player X', -10, 10, 0.25)}
        ${number('player-z', 'Player Z', -10, 10, 0.25)}
        ${number('player-yaw', 'Player yaw', -3.14, 3.14, 0.1)}
        ${number('npc-x', 'NPC X', -10, 10, 0.25)}
        ${number('npc-z', 'NPC Z', -10, 10, 0.25)}
        ${number('npc-yaw', 'NPC yaw', -3.14, 3.14, 0.1)}
        ${number('blocker-x', 'Blocker X', -8, 8, 0.25)}
        ${number('blocker-z', 'Blocker Z', -8, 8, 0.25)}
        ${number('blocker-yaw', 'Blocker yaw', -3.14, 3.14, 0.1)}
        <label><input data-lab-control="anchor" type="checkbox">Authored anchor</label>
        <label><input data-lab-control="obstruction" type="checkbox">Obstruction</label>
      </div>
      <footer><button data-lab-action="acquire">Frame participants</button><button data-lab-action="restore">Restore gameplay</button></footer>
    `;
    panel.addEventListener('change', (event) => this.handleControl(event));
    panel.addEventListener('click', (event) => this.handleAction(event));
    const guides = document.createElement('div');
    guides.className = 'camera-lab-guides';
    guides.setAttribute('aria-hidden', 'true');
    guides.innerHTML = `
      <div class="camera-lab-guides__safe"></div>
      <div class="camera-lab-guides__thirds"></div>
      <div class="camera-lab-guides__center"></div>
      <svg class="camera-lab-map" viewBox="0 0 180 140" role="img" aria-label="Top-down camera composition map">
        <rect class="camera-lab-map__field" x="1" y="1" width="178" height="138" rx="5"></rect>
        <line data-map="sweep"></line>
        <line data-map="return"></line>
        <rect data-map="blocker"></rect>
        <rect data-map="blocker-opposite"></rect>
        <circle data-map="player" r="5"></circle>
        <circle data-map="npc" r="5"></circle>
        <circle data-map="target" r="3"></circle>
        <circle data-map="desired" r="4"></circle>
        <circle data-map="adjusted" r="4"></circle>
        <circle data-map="saved" r="4"></circle>
        <text x="8" y="16">TOP-DOWN SWEEP</text>
      </svg>
      <div class="camera-lab-legend"><span class="is-desired">Desired</span><span class="is-adjusted">Adjusted</span><span class="is-target">Midpoint / look</span><span class="is-saved">Saved / return</span></div>
      <output class="camera-lab-status" aria-live="polite"></output>
    `;
    this.panel = panel;
    this.guides = guides;
    this.status =
      guides.querySelector<HTMLElement>('.camera-lab-status') ?? undefined;
    this.context.mount.append(guides, panel);
  }

  private registerDebug(): void {
    const registerCommand = (
      id: string,
      label: string,
      argumentLabel?: string,
    ): DebugUnregister =>
      this.context.debug.registerCommand({
        id: `camera-lab.${id}`,
        label,
        group: debugSections.camera,
        ...(argumentLabel ? { argumentLabel } : {}),
        run: (argument) => this.execute(id, argument),
      });
    this.unregister = [
      this.context.debug.registerValue({
        id: 'camera-lab.owner',
        label: 'Lab owner / priority',
        group: debugSections.camera,
        read: () => {
          const mode = this.camera.mode;
          const priority =
            mode === 'gameplay'
              ? cameraControlPriorities.gameplay
              : cameraControlPriorities.conversation;
          return `${this.camera.owner} / ${priority}`;
        },
      }),
      this.context.debug.registerValue({
        id: 'camera-lab.blocker',
        label: 'Lab blocker',
        group: debugSections.camera,
        read: () =>
          this.camera.getDebugSnapshot().obstructionColliderId ?? 'clear',
      }),
      this.context.debug.registerValue({
        id: 'camera-lab.saved-gameplay',
        label: 'Saved gameplay camera',
        group: debugSections.camera,
        read: () =>
          this.savedGameplayCamera
            ? point(this.savedGameplayCamera.position)
            : 'none',
      }),
      registerCommand(
        'preset',
        'Apply composition preset',
        'default, close-minimum, normal, obstructed, nox-alley, narrow-mobile, restoration',
      ),
      registerCommand('npc', 'Set active NPC', 'mack, nox, raze'),
      registerCommand('profile', 'Set profile', 'default, close, wide'),
      registerCommand(
        'approach',
        'Set approach side',
        'left, right, front, back',
      ),
      registerCommand('spacing', 'Set participant spacing', 'metres'),
      registerCommand('player-pose', 'Set player pose', 'x,z,yaw'),
      registerCommand('npc-pose', 'Set NPC pose', 'x,z,yaw'),
      registerCommand(
        'obstruction-pose',
        'Move / rotate obstruction',
        'x,z,yaw',
      ),
      registerCommand(
        'viewport',
        'Set viewport preset',
        'responsive, desktop, mobile, short',
      ),
      registerCommand('anchor', 'Use authored anchor', 'true, false'),
      registerCommand('restore', 'Restore saved gameplay camera'),
      registerCommand('acquire', 'Frame participants'),
    ];
  }

  private applyFixture(): void {
    if (!this.initialized) return;
    this.player.teleport(
      new Vector3(
        this.state.player.x,
        this.state.player.y,
        this.state.player.z,
      ),
      this.state.player.yaw,
    );
    this.player.setPresentationFacingTarget(this.npcPose);
    this.npcRoot.position.set(
      this.state.npc.x,
      this.state.npc.y,
      this.state.npc.z,
    );
    this.npcRoot.rotation.y = this.state.npc.yaw;
    tintParticipant(this.npcRoot, colors[this.state.npcId]);
    this.camera.setPreferences({ shoulderSide: this.state.shoulder });
    this.collision.remove(blockerId);
    this.collision.remove(oppositeBlockerId);
    const obstruction = this.state.obstruction;
    this.obstruction.visible = obstruction.enabled;
    this.oppositeObstruction.visible = obstruction.enabled;
    this.obstruction.position.set(...obstruction.position);
    this.obstruction.scale.set(...obstruction.size);
    this.obstruction.rotation.y = obstruction.yaw;
    this.oppositeObstruction.position.set(
      obstruction.position[0],
      obstruction.position[1],
      -obstruction.position[2],
    );
    this.oppositeObstruction.scale.set(...obstruction.size);
    this.oppositeObstruction.rotation.y = -obstruction.yaw;
    if (obstruction.enabled) {
      this.collision.addDefinition({
        id: blockerId,
        position: obstruction.position,
        size: obstruction.size,
        rotation: [0, obstruction.yaw, 0],
        tags: ['camera-lab', 'obstruction'],
      });
      this.collision.addDefinition({
        id: oppositeBlockerId,
        position: [
          obstruction.position[0],
          obstruction.position[1],
          -obstruction.position[2],
        ],
        size: obstruction.size,
        rotation: [0, -obstruction.yaw, 0],
        tags: ['camera-lab', 'obstruction'],
      });
    }
    this.applyViewport(this.state.viewport);
    this.updateFacingHelpers();
  }

  private acquireCamera(): void {
    const anchor = this.state.authoredAnchor
      ? this.authoredAnchor()
      : undefined;
    this.request = this.camera.requestConversation(
      owner,
      this.npcPose,
      anchor,
      resolveConversationCameraProfile(this.state.profileId),
    );
    const snapshot = this.camera.getDebugSnapshot();
    if (snapshot.gameplayReturnPosition && snapshot.gameplayReturnTarget) {
      this.savedGameplayCamera = {
        position: snapshot.gameplayReturnPosition,
        target: snapshot.gameplayReturnTarget,
      };
    }
    this.state = { ...this.state, cameraRequested: true };
  }

  private restoreGameplayCamera(): void {
    const snapshot = this.camera.getDebugSnapshot();
    if (snapshot.gameplayReturnPosition && snapshot.gameplayReturnTarget) {
      this.savedGameplayCamera = {
        position: snapshot.gameplayReturnPosition,
        target: snapshot.gameplayReturnTarget,
      };
    }
    this.request?.release();
    this.request = undefined;
    this.player.setPresentationFacingTarget();
    this.state = { ...this.state, cameraRequested: false };
  }

  private authoredAnchor() {
    const midpoint = new Vector3(
      (this.state.player.x + this.state.npc.x) / 2,
      (this.state.player.y + this.state.npc.y) / 2,
      (this.state.player.z + this.state.npc.z) / 2,
    );
    return {
      id: 'camera-lab.authored-anchor',
      position: { x: midpoint.x, y: midpoint.y + 3.1, z: midpoint.z + 5.4 },
      lookAt: { x: midpoint.x, y: midpoint.y + 1.35, z: midpoint.z },
      fieldOfView: 48,
    };
  }

  private updateVisualizations(): void {
    const snapshot = this.camera.getDebugSnapshot();
    setPosition(this.desiredMarker, snapshot.unobstructedPosition);
    setPosition(this.adjustedMarker, snapshot.adjustedPosition);
    setPosition(this.targetMarker, snapshot.sweepStart);
    this.savedMarker.visible = this.savedGameplayCamera !== undefined;
    this.restorationPath.visible = this.savedGameplayCamera !== undefined;
    if (this.savedGameplayCamera) {
      setPosition(this.savedMarker, this.savedGameplayCamera.position);
      updateLine(this.restorationPath, [
        asVector(snapshot.position),
        asVector(this.savedGameplayCamera.position),
      ]);
    }
    updateLine(this.sweep, [
      asVector(snapshot.sweepStart),
      asVector(snapshot.unobstructedPosition),
    ]);
    const anchor = this.authoredAnchor();
    this.anchorMarker.visible = this.state.authoredAnchor;
    setPosition(this.anchorMarker, anchor.position);
    const material = this.obstruction.material;
    if (material instanceof MeshStandardMaterial) {
      material.emissive.setHex(snapshot.obstructionColliderId ? 0x551018 : 0);
    }
    const oppositeMaterial = this.oppositeObstruction.material;
    if (oppositeMaterial instanceof MeshStandardMaterial) {
      oppositeMaterial.emissive.setHex(
        snapshot.obstructionColliderId === oppositeBlockerId ? 0x551018 : 0,
      );
    }
    this.updateMap(snapshot);
  }

  private updateMap(
    snapshot: ReturnType<ThirdPersonCameraSystem['getDebugSnapshot']>,
  ): void {
    if (!this.guides) return;
    const mapPoint = (value: WorldPoint): readonly [number, number] => [
      90 + value.x * 10,
      70 - value.z * 10,
    ];
    const setCircle = (id: string, value: WorldPoint, visible = true) => {
      const element = this.guides?.querySelector<SVGCircleElement>(
        `[data-map="${id}"]`,
      );
      if (!element) return;
      const [x, y] = mapPoint(value);
      element.setAttribute('cx', String(x));
      element.setAttribute('cy', String(y));
      element.style.display = visible ? '' : 'none';
    };
    const setLine = (
      id: string,
      start: WorldPoint,
      end: WorldPoint,
      visible = true,
    ) => {
      const element = this.guides?.querySelector<SVGLineElement>(
        `[data-map="${id}"]`,
      );
      if (!element) return;
      const [x1, y1] = mapPoint(start);
      const [x2, y2] = mapPoint(end);
      element.setAttribute('x1', String(x1));
      element.setAttribute('y1', String(y1));
      element.setAttribute('x2', String(x2));
      element.setAttribute('y2', String(y2));
      element.style.display = visible ? '' : 'none';
    };
    const setBlocker = (id: string, z: number, yaw: number) => {
      const element = this.guides?.querySelector<SVGRectElement>(
        `[data-map="${id}"]`,
      );
      if (!element) return;
      const obstruction = this.state.obstruction;
      const [x, y] = mapPoint({
        x: obstruction.position[0],
        y: 0,
        z,
      });
      const width = obstruction.size[0] * 10;
      const height = Math.max(5, obstruction.size[2] * 10);
      element.setAttribute('x', String(x - width / 2));
      element.setAttribute('y', String(y - height / 2));
      element.setAttribute('width', String(width));
      element.setAttribute('height', String(height));
      element.setAttribute(
        'transform',
        `rotate(${(-yaw * 180) / Math.PI} ${x} ${y})`,
      );
      element.style.display = obstruction.enabled ? '' : 'none';
    };
    setCircle('player', this.state.player);
    setCircle('npc', this.state.npc);
    setCircle('target', snapshot.sweepStart);
    setCircle('desired', snapshot.unobstructedPosition);
    setCircle('adjusted', snapshot.adjustedPosition);
    setCircle(
      'saved',
      this.savedGameplayCamera?.position ?? snapshot.position,
      this.savedGameplayCamera !== undefined,
    );
    setLine('sweep', snapshot.sweepStart, snapshot.unobstructedPosition);
    setLine(
      'return',
      snapshot.position,
      this.savedGameplayCamera?.position ?? snapshot.position,
      this.savedGameplayCamera !== undefined,
    );
    setBlocker(
      'blocker',
      this.state.obstruction.position[2],
      this.state.obstruction.yaw,
    );
    setBlocker(
      'blocker-opposite',
      -this.state.obstruction.position[2],
      -this.state.obstruction.yaw,
    );
  }

  private updateFacingHelpers(): void {
    this.playerFacing.position.set(
      this.state.player.x,
      this.state.player.y + 0.12,
      this.state.player.z,
    );
    this.playerFacing.setDirection(
      new Vector3(
        Math.sin(this.state.player.yaw),
        0,
        Math.cos(this.state.player.yaw),
      ),
    );
    this.npcFacing.position.set(
      this.state.npc.x,
      this.state.npc.y + 0.12,
      this.state.npc.z,
    );
    this.npcFacing.setDirection(
      new Vector3(
        Math.sin(this.state.npc.yaw),
        0,
        Math.cos(this.state.npc.yaw),
      ),
    );
    this.npcFacing.setColor(new Color(colors[this.state.npcId]));
  }

  private updateStatus(): void {
    if (!this.status) return;
    const snapshot = this.getSnapshot();
    this.status.textContent = [
      `${snapshot.camera.owner} · priority ${snapshot.ownerPriority}`,
      `${snapshot.state.npcId} / ${snapshot.state.profileId} · ${snapshot.camera.shoulderSide} shoulder`,
      snapshot.camera.participantSeparation === undefined
        ? ''
        : `separation ${snapshot.camera.participantSeparation.toFixed(2)}m · chosen ${snapshot.camera.conversationChosenSide} · safe-frame ${snapshot.camera.conversationSafeFrameStatus}`,
      snapshot.camera.conversationFallbackReason &&
      snapshot.camera.conversationFallbackReason !== 'none'
        ? `fallback ${snapshot.camera.conversationFallbackReason}`
        : 'relative participant axis',
      `desired ${point(snapshot.camera.unobstructedPosition)} · adjusted ${point(snapshot.camera.adjustedPosition)}`,
      snapshot.camera.obstructionColliderId
        ? `blocked by ${snapshot.camera.obstructionColliderId}`
        : 'sweep clear',
      snapshot.savedGameplayCamera
        ? `saved ${point(snapshot.savedGameplayCamera.position)}`
        : 'saved gameplay camera: pending',
      !snapshot.state.cameraRequested && snapshot.restorationError !== undefined
        ? `restoration error ${snapshot.restorationError.toFixed(3)}m`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private handleControl(event: Event): void {
    const input = event.target;
    if (!(
      input instanceof HTMLInputElement || input instanceof HTMLSelectElement
    ))
      return;
    const control = input.dataset.labControl;
    if (!control) return;
    if (control === 'preset')
      return this.applyPreset(input.value as CameraLabPresetId);
    if (control === 'anchor' || control === 'obstruction') {
      return this.execute(control, String((input as HTMLInputElement).checked));
    }
    if (
      [
        'npc',
        'profile',
        'shoulder',
        'approach',
        'viewport',
        'spacing',
      ].includes(control)
    ) {
      return this.execute(control, input.value);
    }
    const numeric = Number(input.value);
    const player = { ...this.state.player };
    const npc = { ...this.state.npc };
    const obstruction = { ...this.state.obstruction };
    if (control === 'player-x') player.x = numeric;
    if (control === 'player-z') player.z = numeric;
    if (control === 'player-yaw') player.yaw = numeric;
    if (control === 'npc-x') npc.x = numeric;
    if (control === 'npc-z') npc.z = numeric;
    if (control === 'npc-yaw') npc.yaw = numeric;
    const obstructionPosition = [...obstruction.position] as [
      number,
      number,
      number,
    ];
    if (control === 'blocker-x') obstructionPosition[0] = numeric;
    if (control === 'blocker-z') obstructionPosition[2] = numeric;
    if (control === 'blocker-yaw') obstruction.yaw = numeric;
    obstruction.position = obstructionPosition;
    this.patchState({ player, npc, obstruction });
  }

  private handleAction(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const action = target.dataset.labAction;
    if (action) this.execute(action);
  }

  private syncControls(): void {
    if (!this.panel) return;
    const values: Record<string, string | number | boolean> = {
      preset: this.state.preset,
      npc: this.state.npcId,
      profile: this.state.profileId,
      shoulder: this.state.shoulder,
      approach: this.state.approachSide,
      viewport: this.state.viewport,
      spacing: this.state.spacing,
      'player-x': this.state.player.x,
      'player-z': this.state.player.z,
      'player-yaw': this.state.player.yaw,
      'npc-x': this.state.npc.x,
      'npc-z': this.state.npc.z,
      'npc-yaw': this.state.npc.yaw,
      'blocker-x': this.state.obstruction.position[0],
      'blocker-z': this.state.obstruction.position[2],
      'blocker-yaw': this.state.obstruction.yaw,
      anchor: this.state.authoredAnchor,
      obstruction: this.state.obstruction.enabled,
    };
    for (const input of Array.from(
      this.panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
        '[data-lab-control]',
      ),
    )) {
      const value = values[input.dataset.labControl ?? ''];
      if (input instanceof HTMLInputElement && input.type === 'checkbox') {
        input.checked = Boolean(value);
      } else if (value !== undefined) input.value = String(value);
    }
  }

  private applyViewport(viewport: CameraLabViewportPreset): void {
    if (viewport === 'responsive') {
      delete this.context.mount.dataset.cameraLabViewport;
    } else {
      this.context.mount.dataset.cameraLabViewport = viewport;
    }
  }

  private readInitialPreset(): CameraLabPresetId {
    const value = new URLSearchParams(window.location.search).get(
      'cameraPreset',
    );
    return value === 'close-minimum' ||
      value === 'normal' ||
      value === 'obstructed' ||
      value === 'nox-alley' ||
      value === 'narrow-mobile' ||
      value === 'restoration'
      ? value
      : 'default';
  }
}

function createParticipant(color: number): Group {
  const root = new Group();
  root.name = 'NPC composition fixture';
  const material = new MeshStandardMaterial({ color, roughness: 0.75 });
  const body = new Mesh(new BoxGeometry(0.7, 1.15, 0.42), material);
  body.position.y = 1.05;
  const head = new Mesh(new SphereGeometry(0.28, 16, 12), material.clone());
  head.position.y = 1.82;
  const nose = new Mesh(new ConeGeometry(0.08, 0.22, 8), material.clone());
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 1.82, 0.3);
  root.add(body, head, nose);
  return root;
}

function tintParticipant(root: Group, color: number): void {
  root.traverse((object) => {
    if (
      object instanceof Mesh &&
      object.material instanceof MeshStandardMaterial
    ) {
      object.material.color.setHex(color);
    }
  });
}

function marker(color: number, name: string): Mesh {
  const mesh = new Mesh(
    new SphereGeometry(0.18, 14, 10),
    new MeshBasicMaterial({
      color,
      depthTest: false,
      transparent: true,
      opacity: 0.95,
    }),
  );
  mesh.name = name;
  mesh.renderOrder = 20;
  return mesh;
}

function line(color: number): Line {
  const result = new Line(
    new BufferGeometry().setFromPoints([new Vector3(), new Vector3()]),
    new LineBasicMaterial({
      color,
      depthTest: false,
      transparent: true,
      opacity: 0.9,
    }),
  );
  result.renderOrder = 19;
  return result;
}

function updateLine(target: Line, points: readonly Vector3[]): void {
  target.geometry.dispose();
  target.geometry = new BufferGeometry().setFromPoints([...points]);
}

function setPosition(target: Object3D, point: WorldPoint): void {
  target.position.set(point.x, point.y, point.z);
}

function asVector(point: WorldPoint): Vector3 {
  return new Vector3(point.x, point.y, point.z);
}

function distance(left: WorldPoint, right: WorldPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

function point(value: WorldPoint): string {
  return `${value.x.toFixed(2)}, ${value.y.toFixed(2)}, ${value.z.toFixed(2)}`;
}

function parsePose(
  value: string,
  fallback: CameraCompositionLabState['player'],
) {
  const values = parseNumbers(value, 3);
  return {
    x: values[0]!,
    y: fallback.y,
    z: values[1]!,
    yaw: values[2]!,
  };
}

function parseNumbers(value: string, count: number): number[] {
  const values = value.split(',').map(Number);
  if (
    values.length !== count ||
    values.some((entry) => !Number.isFinite(entry))
  ) {
    throw new Error(`Expected ${count} comma-separated finite numbers`);
  }
  return values;
}

function finite(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function select(id: string, label: string, values: readonly string[]): string {
  return `<label>${label}<select data-lab-control="${id}">${values.map((value) => `<option value="${value}">${value}</option>`).join('')}</select></label>`;
}

function number(
  id: string,
  label: string,
  min: number,
  max: number,
  step: number,
): string {
  return `<label>${label}<input data-lab-control="${id}" type="number" min="${min}" max="${max}" step="${step}"></label>`;
}

function disposeTree(root: Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh || object instanceof Line)) return;
    const renderable = object as
      | Mesh<BufferGeometry, Material | Material[]>
      | Line<BufferGeometry, Material | Material[]>;
    renderable.geometry.dispose();
    const materials = Array.isArray(renderable.material)
      ? renderable.material
      : [renderable.material];
    for (const material of materials) material.dispose();
  });
  root.clear();
}

export const cameraCompositionLab: SandboxScenario = {
  id: 'camera-composition',
  title: 'Camera Composition Lab',
  create: (context) => new CameraCompositionLabSystem(context),
};
