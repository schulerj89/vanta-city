import type { GameSystem } from '../core/lifecycle';

export type ActionName = string;
export type ActionBindings = Readonly<Record<ActionName, readonly string[]>>;

export interface InputReader {
  isDown(action: ActionName): boolean;
  wasPressed(action: ActionName): boolean;
  wasReleased(action: ActionName): boolean;
}

export interface PointerDelta {
  readonly x: number;
  readonly y: number;
  readonly wheel: number;
}

export interface PointerInputReader {
  consumePointerDelta(): PointerDelta;
  isPointerLocked(): boolean;
  requestPointerLock(): void;
  releasePointerLock?(): void;
  isUiFocused?(): boolean;
}

export class InputSystem
  implements GameSystem, InputReader, PointerInputReader
{
  public readonly id = 'input';
  public readonly updateMode = 'always' as const;

  private readonly downCodes = new Set<string>();
  private readonly pressedCodes = new Set<string>();
  private readonly releasedCodes = new Set<string>();
  private readonly boundCodes: ReadonlySet<string>;
  private pointerTarget: HTMLElement | undefined;
  private pointerX = 0;
  private pointerY = 0;
  private wheelDelta = 0;
  private attached = false;

  public constructor(
    private readonly bindings: ActionBindings,
    private readonly target: Window = window,
  ) {
    this.boundCodes = new Set(Object.values(bindings).flat());
  }

  public init(): void {
    if (this.attached) return;
    this.target.addEventListener('keydown', this.onKeyDown);
    this.target.addEventListener('keyup', this.onKeyUp);
    this.target.addEventListener('blur', this.onBlur);
    this.target.addEventListener('mousemove', this.onMouseMove);
    this.target.addEventListener('mousedown', this.onMouseDown);
    this.target.addEventListener('mouseup', this.onMouseUp);
    this.target.addEventListener('wheel', this.onWheel, { passive: true });
    this.pointerTarget?.addEventListener('click', this.onPointerTargetClick);
    this.attached = true;
  }

  public setPointerTarget(target: HTMLElement): void {
    if (this.attached) {
      this.pointerTarget?.removeEventListener(
        'click',
        this.onPointerTargetClick,
      );
      target.addEventListener('click', this.onPointerTargetClick);
    }
    this.pointerTarget = target;
  }

  public consumePointerDelta(): PointerDelta {
    const delta = {
      x: this.pointerX,
      y: this.pointerY,
      wheel: this.wheelDelta,
    };
    this.pointerX = 0;
    this.pointerY = 0;
    this.wheelDelta = 0;
    return delta;
  }

  public isPointerLocked(): boolean {
    return document.pointerLockElement === this.pointerTarget;
  }

  public requestPointerLock(): void {
    // Browsers may reject pointer lock in automation, embedded views, or when
    // the document loses focus between mouseup and click. Orbit-drag still
    // works through Mouse0 deltas, so a rejected lock request is non-fatal.
    void this.pointerTarget?.requestPointerLock?.().catch(() => undefined);
  }

  public releasePointerLock(): void {
    if (this.isPointerLocked()) void document.exitPointerLock?.();
  }

  public isUiFocused(): boolean {
    const active = document.activeElement;
    return (
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLSelectElement ||
      active instanceof HTMLButtonElement ||
      (active instanceof HTMLElement && active.isContentEditable)
    );
  }

  public isDown(action: ActionName): boolean {
    return this.codesFor(action).some((code) => this.downCodes.has(code));
  }

  public wasPressed(action: ActionName): boolean {
    return this.codesFor(action).some((code) => this.pressedCodes.has(code));
  }

  public wasReleased(action: ActionName): boolean {
    return this.codesFor(action).some((code) => this.releasedCodes.has(code));
  }

  public lateUpdate(): void {
    this.pressedCodes.clear();
    this.releasedCodes.clear();
  }

  public dispose(): void {
    if (!this.attached) return;
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
    this.target.removeEventListener('mousemove', this.onMouseMove);
    this.target.removeEventListener('mousedown', this.onMouseDown);
    this.target.removeEventListener('mouseup', this.onMouseUp);
    this.target.removeEventListener('wheel', this.onWheel);
    this.pointerTarget?.removeEventListener('click', this.onPointerTargetClick);
    this.clear();
    this.attached = false;
  }

  private codesFor(action: ActionName): readonly string[] {
    const codes = this.bindings[action];
    if (!codes) throw new Error(`Unknown input action: ${action}`);
    return codes;
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    // Text entered into developer tools and other UI must never become player,
    // camera, dialogue, or pause input. Backquote remains a panel hotkey so a
    // focused command field cannot trap keyboard-only users in the overlay.
    if (isEditableTarget(event.target) && event.code !== 'Backquote') return;
    if (event.code.startsWith('Arrow') && this.boundCodes.has(event.code)) {
      event.preventDefault();
    }
    if (!this.downCodes.has(event.code)) this.pressedCodes.add(event.code);
    this.downCodes.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (isEditableTarget(event.target) && event.code !== 'Backquote') {
      this.downCodes.delete(event.code);
      return;
    }
    if (this.downCodes.delete(event.code)) this.releasedCodes.add(event.code);
  };

  private readonly onBlur = (): void => this.clear();

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.isPointerLocked() && !this.downCodes.has('Mouse0')) return;
    this.pointerX += event.movementX;
    this.pointerY += event.movementY;
  };

  private readonly onMouseDown = (event: MouseEvent): void => {
    const code = `Mouse${event.button}`;
    if (!this.downCodes.has(code)) this.pressedCodes.add(code);
    this.downCodes.add(code);
  };

  private readonly onMouseUp = (event: MouseEvent): void => {
    const code = `Mouse${event.button}`;
    if (this.downCodes.delete(code)) this.releasedCodes.add(code);
  };

  private readonly onWheel = (event: WheelEvent): void => {
    this.wheelDelta += event.deltaY;
  };

  private readonly onPointerTargetClick = (): void => this.requestPointerLock();

  private clear(): void {
    this.downCodes.clear();
    this.pressedCodes.clear();
    this.releasedCodes.clear();
    this.pointerX = 0;
    this.pointerY = 0;
    this.wheelDelta = 0;
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
