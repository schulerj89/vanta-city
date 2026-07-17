import type { GameSystem } from '../core/lifecycle';
import { GamepadInputAdapter } from './GamepadInput';
import type {
  GamepadInputDebugSnapshot,
  VirtualGamepadFixture,
} from './GamepadInput';

export type ActionName = string;
export type AxisName = 'moveX' | 'moveY' | 'cameraX' | 'cameraY';
export type InputDevice = 'keyboard' | 'mouse' | 'gamepad';
export type ActionBindings<Binding = string> = Readonly<
  Record<ActionName, readonly Binding[]>
>;

export interface InputReader {
  prepareFrame?(): void;
  /** Drops UI-owned pressed/released edges before simulation resumes. */
  consumeTransientActions?(): void;
  isDown(action: ActionName): boolean;
  wasPressed(action: ActionName): boolean;
  wasReleased(action: ActionName): boolean;
  readAxis?(axis: AxisName): number;
  isUiFocused?(): boolean;
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

export interface InputDeviceActionSnapshot {
  readonly down: readonly ActionName[];
  readonly pressed: readonly ActionName[];
  readonly released: readonly ActionName[];
}

export interface RawInputRejection {
  readonly sequence: number;
  readonly device: InputDevice;
  readonly control: string;
  readonly actions: readonly ActionName[];
  readonly reason: 'focused-text-entry';
}

export interface InputSystemDebugSnapshot {
  readonly activeDevice: InputDevice | undefined;
  readonly activeDevices: readonly InputDevice[];
  readonly keyboard: InputDeviceActionSnapshot;
  readonly mouse: InputDeviceActionSnapshot & {
    readonly pointerDelta: PointerDelta;
    readonly pointerLocked: boolean;
  };
  readonly gamepad: GamepadInputDebugSnapshot;
  readonly focusedElement:
    | {
        readonly tag: string;
        readonly label: string | undefined;
        readonly textEntry: boolean;
      }
    | undefined;
  readonly lastRawRejection: RawInputRejection | undefined;
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
  private lastPointerDelta: PointerDelta = { x: 0, y: 0, wheel: 0 };
  private attached = false;
  private activeDevice: InputDevice | undefined;
  private gamepadActivitySequence = 0;
  private rejectionSequence = 0;
  private lastRawRejection: RawInputRejection | undefined;
  private framePrepared = false;

  public constructor(
    private readonly bindings: ActionBindings,
    private readonly target: Window = window,
    private readonly gamepad = new GamepadInputAdapter(),
  ) {
    this.boundCodes = new Set(Object.values(bindings).flat());
  }

  public init(): void {
    if (this.attached) return;
    this.target.addEventListener('keydown', this.onKeyDown);
    this.target.addEventListener('keyup', this.onKeyUp);
    this.target.addEventListener('focusin', this.onFocusIn);
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
    this.lastPointerDelta = delta;
    this.pointerX = 0;
    this.pointerY = 0;
    this.wheelDelta = 0;
    return delta;
  }

  public isPointerLocked(): boolean {
    return Boolean(
      this.pointerTarget && document.pointerLockElement === this.pointerTarget,
    );
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
    return Boolean(
      isTextEntryInput(active) ||
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLSelectElement ||
      (active instanceof HTMLElement && active.isContentEditable),
    );
  }

  public isDown(action: ActionName): boolean {
    this.codesFor(action);
    return (
      (!this.isUiFocused() &&
        this.isGamepadActionAllowed(action) &&
        this.gamepad.isDown(action)) ||
      this.bindings[action]!.some((code) => this.downCodes.has(code))
    );
  }

  public wasPressed(action: ActionName): boolean {
    this.codesFor(action);
    return (
      (!this.isUiFocused() &&
        this.isGamepadActionAllowed(action) &&
        this.gamepad.wasPressed(action)) ||
      this.bindings[action]!.some((code) => this.pressedCodes.has(code))
    );
  }

  public wasReleased(action: ActionName): boolean {
    this.codesFor(action);
    return (
      (!this.isUiFocused() &&
        this.isGamepadActionAllowed(action) &&
        this.gamepad.wasReleased(action)) ||
      this.bindings[action]!.some((code) => this.releasedCodes.has(code))
    );
  }

  public readAxis(axis: AxisName): number {
    return this.isUiFocused() || this.activeModal()
      ? 0
      : this.gamepad.readAxis(axis);
  }

  public update(): void {
    this.prepareFrame();
  }

  public prepareFrame(): void {
    if (this.framePrepared) return;
    this.framePrepared = true;
    this.gamepad.poll();
    const gamepad = this.gamepad.getDebugSnapshot();
    if (gamepad.activitySequence !== this.gamepadActivitySequence) {
      this.gamepadActivitySequence = gamepad.activitySequence;
      this.activeDevice = 'gamepad';
    }
  }

  public setVirtualGamepadFixture(fixture?: VirtualGamepadFixture): void {
    this.gamepad.setVirtualFixture(fixture);
  }

  public getDebugSnapshot(): InputSystemDebugSnapshot {
    const keyboard = this.actionsForCodes(
      this.downCodes,
      this.pressedCodes,
      this.releasedCodes,
      (code) => !code.startsWith('Mouse'),
    );
    const mouse = this.actionsForCodes(
      this.downCodes,
      this.pressedCodes,
      this.releasedCodes,
      (code) => code.startsWith('Mouse'),
    );
    const gamepad = this.gamepad.getDebugSnapshot();
    const activeDevices: InputDevice[] = [];
    if (hasActionActivity(keyboard)) activeDevices.push('keyboard');
    if (
      hasActionActivity(mouse) ||
      this.lastPointerDelta.x !== 0 ||
      this.lastPointerDelta.y !== 0 ||
      this.lastPointerDelta.wheel !== 0
    ) {
      activeDevices.push('mouse');
    }
    if (
      gamepad.downActions.length > 0 ||
      gamepad.pressedActions.length > 0 ||
      gamepad.releasedActions.length > 0 ||
      Object.values(gamepad.adjustedAxes).some((value) => value !== 0)
    ) {
      activeDevices.push('gamepad');
    }
    const active = document.activeElement;
    const focusedElement =
      active instanceof HTMLElement && active !== document.body
        ? {
            tag: active.tagName.toLowerCase(),
            label:
              (active.getAttribute('aria-label') ??
                active.getAttribute('name') ??
                active.id) ||
              undefined,
            textEntry: isEditableTarget(active),
          }
        : undefined;
    return {
      activeDevice: this.activeDevice,
      activeDevices,
      keyboard,
      mouse: {
        ...mouse,
        pointerDelta: { ...this.lastPointerDelta },
        pointerLocked: this.isPointerLocked(),
      },
      gamepad,
      focusedElement,
      lastRawRejection: this.lastRawRejection
        ? { ...this.lastRawRejection }
        : undefined,
    };
  }

  public lateUpdate(): void {
    this.pressedCodes.clear();
    this.releasedCodes.clear();
    this.gamepad.lateUpdate();
    this.framePrepared = false;
  }

  public consumeTransientActions(): void {
    this.pressedCodes.clear();
    this.releasedCodes.clear();
    this.gamepad.lateUpdate();
  }

  public dispose(): void {
    if (!this.attached) return;
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('focusin', this.onFocusIn);
    this.target.removeEventListener('blur', this.onBlur);
    this.target.removeEventListener('mousemove', this.onMouseMove);
    this.target.removeEventListener('mousedown', this.onMouseDown);
    this.target.removeEventListener('mouseup', this.onMouseUp);
    this.target.removeEventListener('wheel', this.onWheel);
    this.pointerTarget?.removeEventListener('click', this.onPointerTargetClick);
    this.clear();
    this.gamepad.dispose();
    this.attached = false;
  }

  private codesFor(action: ActionName): readonly string[] {
    const codes = this.bindings[action];
    if (!codes) throw new Error(`Unknown input action: ${action}`);
    return codes;
  }

  private actionsForCodes(
    down: ReadonlySet<string>,
    pressed: ReadonlySet<string>,
    released: ReadonlySet<string>,
    include: (code: string) => boolean,
  ): InputDeviceActionSnapshot {
    const actions = Object.entries(this.bindings);
    const matching = (codes: ReadonlySet<string>): readonly ActionName[] =>
      actions
        .filter(([, bindings]) =>
          bindings.some((code) => include(code) && codes.has(code)),
        )
        .map(([action]) => action)
        .sort();
    return {
      down: matching(down),
      pressed: matching(pressed),
      released: matching(released),
    };
  }

  private recordRawRejection(device: InputDevice, control: string): void {
    const actions = Object.entries(this.bindings)
      .filter(([, codes]) => codes.includes(control))
      .map(([action]) => action)
      .sort();
    this.lastRawRejection = {
      sequence: ++this.rejectionSequence,
      device,
      control,
      actions,
      reason: 'focused-text-entry',
    };
  }

  private isGamepadActionAllowed(action: ActionName): boolean {
    const modal = this.activeModal();
    if (!modal) return true;
    if (modal.id === 'controls-help') {
      return action === 'closeHelp' || action === 'toggleHelp';
    }
    if (modal.classList.contains('character-picker')) {
      return action.startsWith('picker');
    }
    return false;
  }

  private activeModal(): HTMLElement | undefined {
    return (
      document.querySelector<HTMLElement>(
        '[aria-modal="true"]:not([hidden])',
      ) ?? undefined
    );
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    // Text entered into developer tools and other UI must never become player,
    // camera, dialogue, or pause input. Backquote remains a panel hotkey so a
    // focused command field cannot trap keyboard-only users in the overlay.
    if (isEditableTarget(event.target) && event.code !== 'Backquote') {
      this.recordRawRejection('keyboard', event.code);
      return;
    }
    if (event.code.startsWith('Arrow') && this.boundCodes.has(event.code)) {
      event.preventDefault();
    }
    if (!this.downCodes.has(event.code)) this.pressedCodes.add(event.code);
    this.downCodes.add(event.code);
    this.activeDevice = 'keyboard';
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (isEditableTarget(event.target) && event.code !== 'Backquote') {
      this.downCodes.delete(event.code);
      return;
    }
    if (this.downCodes.delete(event.code)) this.releasedCodes.add(event.code);
    this.activeDevice = 'keyboard';
  };

  private readonly onFocusIn = (event: FocusEvent): void => {
    if (!isEditableTarget(event.target)) return;
    for (const code of [...this.downCodes]) {
      if (!code.startsWith('Mouse')) this.downCodes.delete(code);
    }
  };

  private readonly onBlur = (): void => this.clear();

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.isPointerLocked() && !this.downCodes.has('Mouse0')) return;
    this.pointerX += event.movementX;
    this.pointerY += event.movementY;
    this.activeDevice = 'mouse';
  };

  private readonly onMouseDown = (event: MouseEvent): void => {
    const code = `Mouse${event.button}`;
    if (!this.downCodes.has(code)) this.pressedCodes.add(code);
    this.downCodes.add(code);
    this.activeDevice = 'mouse';
  };

  private readonly onMouseUp = (event: MouseEvent): void => {
    const code = `Mouse${event.button}`;
    if (this.downCodes.delete(code)) this.releasedCodes.add(code);
  };

  private readonly onWheel = (event: WheelEvent): void => {
    this.wheelDelta += event.deltaY;
    this.activeDevice = 'mouse';
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

function hasActionActivity(snapshot: InputDeviceActionSnapshot): boolean {
  return (
    snapshot.down.length > 0 ||
    snapshot.pressed.length > 0 ||
    snapshot.released.length > 0
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    isTextEntryInput(target) ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function isTextEntryInput(target: unknown): target is HTMLInputElement {
  return (
    target instanceof HTMLInputElement &&
    ![
      'button',
      'checkbox',
      'color',
      'file',
      'hidden',
      'image',
      'radio',
      'range',
      'reset',
      'submit',
    ].includes(target.type)
  );
}
