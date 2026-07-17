import { Vector3 } from 'three';
import type { PerspectiveCamera } from 'three';
import type { GameSystem } from '../core/lifecycle';
import type { HealthComponent, HealthSnapshot } from '../health/Health';
import type { CollisionWorld } from '../physics/CollisionWorld';
import type { WorldPosition } from '../world/Spatial';

export interface HealthHudSnapshot {
  readonly player: HealthSnapshot;
  readonly playerHudVisible: boolean;
  readonly targetHudVisible: boolean;
  readonly targetOccluded: boolean;
  readonly targetScreen: { readonly x: number; readonly y: number } | undefined;
}

/** Gameplay HUD observer. Health remains owned by game entities, never DOM nodes. */
export class HealthHudSystem implements GameSystem {
  public readonly id = 'health-hud';
  public readonly updateMode = 'always' as const;

  private readonly root = document.createElement('div');
  private readonly playerBar = createHealthBar(
    'Player health',
    'health-hud__player',
  );
  private readonly targetBar = createHealthBar(
    'Sparring target health',
    'health-hud__target',
  );
  private unsubscribePlayer: (() => void) | undefined;
  private targetHudVisible = false;
  private targetOccluded = false;
  private targetScreen: { x: number; y: number } | undefined;

  public constructor(
    private readonly mount: HTMLElement,
    private readonly playerHealth: HealthComponent,
    private readonly target: {
      getHealth(): HealthComponent | undefined;
      getHealthAnchor(): WorldPosition | undefined;
    },
    private readonly camera: PerspectiveCamera,
    private readonly collision: CollisionWorld,
    private readonly playerMount: HTMLElement = mount,
  ) {
    this.root.className = 'health-hud';
    this.root.setAttribute('aria-label', 'World health indicators');
    this.root.append(this.targetBar.root);
    this.targetBar.root.hidden = true;
  }

  public init(): void {
    this.mount.append(this.root);
    this.playerMount.append(this.playerBar.root);
    this.unsubscribePlayer = this.playerHealth.events.on('changed', () =>
      syncHealthBar(this.playerBar, this.playerHealth.getSnapshot()),
    );
    syncHealthBar(this.playerBar, this.playerHealth.getSnapshot());
  }

  public update(): void {
    const health = this.target.getHealth();
    const anchor = this.target.getHealthAnchor();
    if (!health || !anchor) {
      this.targetOccluded = false;
      this.hideTarget();
      return;
    }
    const world = new Vector3(anchor.x, anchor.y, anchor.z);
    // Camera owns its transform; projection only refreshes derived matrices
    // after that system's update and before the renderer runs.
    this.camera.updateMatrixWorld(true);
    const cameraPosition = this.camera.getWorldPosition(new Vector3());
    const occlusion = this.collision.castSegment(cameraPosition, world, {
      radius: 0.025,
    });
    this.targetOccluded = occlusion.obstructed && occlusion.fraction < 0.98;
    const projected = world.clone().project(this.camera);
    const onScreen =
      projected.z >= -1 &&
      projected.z <= 1 &&
      Math.abs(projected.x) <= 1.08 &&
      Math.abs(projected.y) <= 1.08;
    if (!onScreen || this.targetOccluded) {
      this.hideTarget();
      return;
    }
    const x = ((projected.x + 1) / 2) * this.mount.clientWidth;
    const y = ((1 - projected.y) / 2) * this.mount.clientHeight;
    this.targetScreen = { x, y };
    this.targetHudVisible = true;
    this.targetBar.root.hidden = false;
    this.targetBar.root.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%)`;
    syncHealthBar(this.targetBar, health.getSnapshot());
  }

  public getSnapshot(): HealthHudSnapshot {
    return {
      player: this.playerHealth.getSnapshot(),
      playerHudVisible:
        this.playerBar.root.isConnected && !this.playerBar.root.hidden,
      targetHudVisible: this.targetHudVisible,
      targetOccluded: this.targetOccluded,
      targetScreen: this.targetScreen,
    };
  }

  public dispose(): void {
    this.unsubscribePlayer?.();
    this.unsubscribePlayer = undefined;
    this.playerBar.root.remove();
    this.root.remove();
  }

  private hideTarget(): void {
    this.targetHudVisible = false;
    this.targetScreen = undefined;
    this.targetBar.root.hidden = true;
  }
}

interface HealthBarElements {
  readonly root: HTMLDivElement;
  readonly fill: HTMLDivElement;
  readonly value: HTMLSpanElement;
}

function createHealthBar(label: string, className: string): HealthBarElements {
  const root = document.createElement('div');
  root.className = `health-hud__bar ${className}`;
  root.setAttribute('role', 'progressbar');
  root.setAttribute('aria-label', label);
  root.setAttribute('aria-valuemin', '0');
  const track = document.createElement('div');
  track.className = 'health-hud__track';
  const fill = document.createElement('div');
  fill.className = 'health-hud__fill';
  track.append(fill);
  const value = document.createElement('span');
  value.className = 'health-hud__value';
  root.append(value, track);
  return { root, fill, value };
}

function syncHealthBar(
  elements: HealthBarElements,
  health: HealthSnapshot,
): void {
  elements.root.setAttribute('aria-valuemax', String(health.maximum));
  elements.root.setAttribute('aria-valuenow', String(health.current));
  elements.fill.style.transform = `scaleX(${health.normalized})`;
  elements.value.textContent = `${Math.round(health.current)} / ${Math.round(health.maximum)}`;
  elements.root.dataset.depleted = String(health.depleted);
}
