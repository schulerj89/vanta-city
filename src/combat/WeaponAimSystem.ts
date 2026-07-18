import { Vector3 } from 'three';
import type { Camera } from 'three';
import type { GameSystem } from '../core/lifecycle';
import type { CharacterEquipment } from '../equipment/CharacterEquipment';
import type { GameContext } from '../game/GameRuntime';
import type { PointerAimInputReader } from '../input/InputSystem';
import type { AimRay } from './WeaponDamage';

export interface WeaponAimCameraInputGate {
  setWeaponAimActive(active: boolean): void;
}

export interface WeaponAimSnapshot {
  readonly active: boolean;
  readonly visible: boolean;
  readonly itemId: string | undefined;
  readonly screen: { readonly x: number; readonly y: number };
  readonly normalizedDevice: { readonly x: number; readonly y: number };
  readonly ray: {
    readonly origin: readonly number[];
    readonly direction: readonly number[];
    readonly target: readonly number[];
  };
  readonly pointerLocked: boolean;
  readonly releaseReason: string | undefined;
}

/** Weapon-only HUD projection. It reads InputSystem state and never owns listeners. */
export class WeaponAimSystem implements GameSystem {
  public readonly id = 'weapon-aim';
  public readonly updateMode = 'always' as const;

  private readonly element = document.createElement('div');
  private readonly dot = document.createElement('span');
  private state: GameContext['state'] | undefined;
  private x = 0;
  private y = 0;
  private initializedPosition = false;
  private active = false;
  private releaseReason: string | undefined = 'no-equipment';

  public constructor(
    private readonly mount: HTMLElement,
    private readonly camera: Camera,
    private readonly input: PointerAimInputReader,
    private readonly equipment: CharacterEquipment,
    private readonly cameraInput?: WeaponAimCameraInputGate,
    private readonly range = 35,
  ) {
    this.element.className = 'weapon-reticle';
    this.element.setAttribute('role', 'img');
    this.element.setAttribute('aria-label', 'Weapon aim reticle');
    this.element.hidden = true;
    this.dot.className = 'weapon-reticle__dot';
    this.element.append(this.dot);
  }

  public init(context: GameContext): void {
    this.state = context.state;
    this.mount.append(this.element);
    this.center();
  }

  public update(): void {
    const reason = this.inactiveReason();
    const nextActive = reason === undefined;
    this.active = nextActive;
    this.releaseReason = reason;
    this.cameraInput?.setWeaponAimActive(nextActive);
    if (!nextActive) {
      this.element.hidden = true;
      this.input.releasePointerLock?.();
      return;
    }
    const pointer = this.input.getPointerAimSnapshot();
    const bounds = this.mount.getBoundingClientRect();
    if (!this.initializedPosition) this.center();
    if (pointer.locked) {
      this.x += pointer.delta.x;
      this.y += pointer.delta.y;
    } else if (pointer.hasPosition) {
      this.x = pointer.clientX - bounds.left;
      this.y = pointer.clientY - bounds.top;
    }
    const margin = 24;
    this.x = clamp(this.x, margin, Math.max(margin, bounds.width - margin));
    this.y = clamp(this.y, margin, Math.max(margin, bounds.height - margin));
    this.element.style.transform = `translate3d(${this.x}px, ${this.y}px, 0)`;
    this.element.hidden = false;
  }

  public getAimRay(): AimRay {
    const bounds = this.mount.getBoundingClientRect();
    const width = Math.max(1, bounds.width);
    const height = Math.max(1, bounds.height);
    const ndcX = (this.x / width) * 2 - 1;
    const ndcY = 1 - (this.y / height) * 2;
    const origin = new Vector3().setFromMatrixPosition(this.camera.matrixWorld);
    const target = new Vector3(ndcX, ndcY, 0.5).unproject(this.camera);
    return { origin, direction: target.sub(origin).normalize() };
  }

  public setScreenPoint(x: number, y: number): void {
    const bounds = this.mount.getBoundingClientRect();
    this.x = clamp(x, 24, Math.max(24, bounds.width - 24));
    this.y = clamp(y, 24, Math.max(24, bounds.height - 24));
    this.initializedPosition = true;
  }

  public getSnapshot(): WeaponAimSnapshot {
    const bounds = this.mount.getBoundingClientRect();
    const ray = this.getAimRay();
    const target = ray.origin
      .clone()
      .addScaledVector(ray.direction, this.range);
    return {
      active: this.active,
      visible: !this.element.hidden,
      itemId: this.equipment.equipped?.id,
      screen: { x: this.x, y: this.y },
      normalizedDevice: {
        x: (this.x / Math.max(1, bounds.width)) * 2 - 1,
        y: 1 - (this.y / Math.max(1, bounds.height)) * 2,
      },
      ray: {
        origin: ray.origin.toArray(),
        direction: ray.direction.toArray(),
        target: target.toArray(),
      },
      pointerLocked: this.input.getPointerAimSnapshot().locked,
      releaseReason: this.releaseReason,
    };
  }

  public dispose(): void {
    this.cameraInput?.setWeaponAimActive(false);
    this.input.releasePointerLock?.();
    this.element.remove();
    this.state = undefined;
  }

  private center(): void {
    const bounds = this.mount.getBoundingClientRect();
    this.x = bounds.width / 2;
    this.y = bounds.height / 2;
    this.initializedPosition = true;
  }

  private inactiveReason(): string | undefined {
    if (!this.equipment.equipped) return 'no-equipment';
    if (this.state?.current !== 'playing')
      return `state:${this.state?.current ?? 'uninitialized'}`;
    if (this.input.isUiFocused?.()) return 'ui-focused';
    return undefined;
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
