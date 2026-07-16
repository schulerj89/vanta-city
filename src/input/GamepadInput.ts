import type { ActionBindings, ActionName, AxisName } from './InputSystem';
import { defaultGamepadButtons } from './defaultBindings';

export interface GamepadInputConfig {
  readonly stickDeadzone: number;
  readonly buttonThreshold: number;
}

export const defaultGamepadInputConfig: GamepadInputConfig = {
  stickDeadzone: 0.2,
  buttonThreshold: 0.5,
};

export type GamepadProvider = () => readonly (Gamepad | null)[];

export interface VirtualGamepadFixture {
  readonly connected: boolean;
  readonly axes: readonly number[];
  readonly buttons: readonly number[];
  readonly id?: string;
}

export interface GamepadInputDebugSnapshot {
  readonly connected: boolean;
  readonly id: string | undefined;
  readonly index: number | undefined;
  readonly rawAxes: readonly number[];
  readonly adjustedAxes: Readonly<Record<AxisName, number>>;
  readonly downButtons: readonly number[];
  readonly pressedButtons: readonly number[];
  readonly releasedButtons: readonly number[];
  readonly downActions: readonly ActionName[];
  readonly pressedActions: readonly ActionName[];
  readonly releasedActions: readonly ActionName[];
  readonly stickDeadzone: number;
  readonly buttonThreshold: number;
  readonly activitySequence: number;
  readonly virtual: boolean;
}

interface PolledGamepad {
  readonly id: string;
  readonly index: number;
  readonly axes: readonly number[];
  readonly buttons: readonly {
    readonly pressed: boolean;
    readonly value: number;
  }[];
}

/** Polls one standard-layout controller and exposes named actions and axes. */
export class GamepadInputAdapter {
  private readonly downActions = new Set<ActionName>();
  private readonly pressedActions = new Set<ActionName>();
  private readonly releasedActions = new Set<ActionName>();
  private readonly axes = new Map<AxisName, number>();
  private readonly downButtons = new Set<number>();
  private readonly pressedButtons = new Set<number>();
  private readonly releasedButtons = new Set<number>();
  private rawAxes: readonly number[] = [];
  private connectedId: string | undefined;
  private connectedIndex: number | undefined;
  private virtualFixture: VirtualGamepadFixture | undefined;
  private sequence = 0;

  public constructor(
    private readonly bindings: ActionBindings<number> = defaultGamepadButtons,
    private readonly provider: GamepadProvider = () =>
      typeof navigator === 'undefined' || !navigator.getGamepads
        ? []
        : navigator.getGamepads(),
    public readonly config: GamepadInputConfig = defaultGamepadInputConfig,
  ) {
    if (config.stickDeadzone < 0 || config.stickDeadzone >= 1) {
      throw new Error('Gamepad stickDeadzone must be in [0, 1)');
    }
  }

  public poll(): void {
    const previousRawAxes = this.rawAxes;
    const previousConnectedId = this.connectedId;
    const gamepad = this.selectGamepad();
    const nextDown = new Set<ActionName>();
    const nextButtons = new Set<number>();
    if (gamepad) {
      this.connectedId = gamepad.id;
      this.connectedIndex = gamepad.index;
      this.rawAxes = gamepad.axes.slice(0, 4);
      for (let index = 0; index < gamepad.buttons.length; index += 1) {
        if (this.buttonDown(gamepad, index)) nextButtons.add(index);
      }
      for (const [action, buttons] of Object.entries(this.bindings)) {
        if (buttons.some((index) => nextButtons.has(index))) {
          nextDown.add(action);
        }
      }
      const move = applyRadialDeadzone(
        gamepad.axes[0] ?? 0,
        gamepad.axes[1] ?? 0,
        this.config.stickDeadzone,
      );
      const camera = applyRadialDeadzone(
        gamepad.axes[2] ?? 0,
        gamepad.axes[3] ?? 0,
        this.config.stickDeadzone,
      );
      this.axes.set('moveX', move.x);
      this.axes.set('moveY', -move.y);
      this.axes.set('cameraX', camera.x);
      this.axes.set('cameraY', camera.y);
    } else {
      this.axes.clear();
      this.rawAxes = [];
      this.connectedId = undefined;
      this.connectedIndex = undefined;
    }

    for (const action of nextDown) {
      if (!this.downActions.has(action)) this.pressedActions.add(action);
    }
    for (const action of this.downActions) {
      if (!nextDown.has(action)) this.releasedActions.add(action);
    }
    this.downActions.clear();
    for (const action of nextDown) this.downActions.add(action);
    for (const index of nextButtons) {
      if (!this.downButtons.has(index)) this.pressedButtons.add(index);
    }
    for (const index of this.downButtons) {
      if (!nextButtons.has(index)) this.releasedButtons.add(index);
    }
    const changed =
      this.pressedActions.size > 0 ||
      this.releasedActions.size > 0 ||
      this.pressedButtons.size > 0 ||
      this.releasedButtons.size > 0 ||
      axesChanged(this.rawAxes, previousRawAxes) ||
      this.connectedId !== previousConnectedId;
    this.downButtons.clear();
    for (const index of nextButtons) this.downButtons.add(index);
    if (changed) this.sequence += 1;
  }

  public isDown(action: ActionName): boolean {
    return this.downActions.has(action);
  }

  public wasPressed(action: ActionName): boolean {
    return this.pressedActions.has(action);
  }

  public wasReleased(action: ActionName): boolean {
    return this.releasedActions.has(action);
  }

  public readAxis(axis: AxisName): number {
    return this.axes.get(axis) ?? 0;
  }

  public setVirtualFixture(fixture?: VirtualGamepadFixture): void {
    this.virtualFixture = fixture
      ? {
          ...fixture,
          axes: [...fixture.axes],
          buttons: [...fixture.buttons],
        }
      : undefined;
  }

  public getDebugSnapshot(): GamepadInputDebugSnapshot {
    return {
      connected: this.connectedId !== undefined,
      id: this.connectedId,
      index: this.connectedIndex,
      rawAxes: [...this.rawAxes],
      adjustedAxes: {
        moveX: this.readAxis('moveX'),
        moveY: this.readAxis('moveY'),
        cameraX: this.readAxis('cameraX'),
        cameraY: this.readAxis('cameraY'),
      },
      downButtons: sortedNumbers(this.downButtons),
      pressedButtons: sortedNumbers(this.pressedButtons),
      releasedButtons: sortedNumbers(this.releasedButtons),
      downActions: sortedStrings(this.downActions),
      pressedActions: sortedStrings(this.pressedActions),
      releasedActions: sortedStrings(this.releasedActions),
      stickDeadzone: this.config.stickDeadzone,
      buttonThreshold: this.config.buttonThreshold,
      activitySequence: this.sequence,
      virtual: this.virtualFixture !== undefined,
    };
  }

  public lateUpdate(): void {
    this.pressedActions.clear();
    this.releasedActions.clear();
    this.pressedButtons.clear();
    this.releasedButtons.clear();
  }

  public dispose(): void {
    this.downActions.clear();
    this.pressedActions.clear();
    this.releasedActions.clear();
    this.axes.clear();
    this.downButtons.clear();
    this.pressedButtons.clear();
    this.releasedButtons.clear();
    this.rawAxes = [];
    this.connectedId = undefined;
    this.connectedIndex = undefined;
    this.virtualFixture = undefined;
  }

  private selectGamepad(): PolledGamepad | undefined {
    if (this.virtualFixture) {
      if (!this.virtualFixture.connected) return undefined;
      return {
        id: this.virtualFixture.id ?? 'Vanta virtual gamepad',
        index: 0,
        axes: this.virtualFixture.axes,
        buttons: this.virtualFixture.buttons.map((value) => ({
          pressed: value >= this.config.buttonThreshold,
          value,
        })),
      };
    }
    return this.provider().find(
      (candidate): candidate is Gamepad =>
        candidate !== null &&
        candidate.connected &&
        candidate.mapping === 'standard',
    );
  }

  private buttonDown(gamepad: PolledGamepad, index: number): boolean {
    const button = gamepad.buttons[index];
    return Boolean(
      button && (button.pressed || button.value >= this.config.buttonThreshold),
    );
  }
}

function sortedStrings(values: ReadonlySet<string>): readonly string[] {
  return [...values].sort();
}

function sortedNumbers(values: ReadonlySet<number>): readonly number[] {
  return [...values].sort((left, right) => left - right);
}

function axesChanged(
  current: readonly number[],
  previous: readonly number[],
): boolean {
  return current.some(
    (value, index) => Math.abs(value - (previous[index] ?? 0)) > 0.001,
  );
}

export function applyRadialDeadzone(
  x: number,
  y: number,
  deadzone: number,
): { readonly x: number; readonly y: number } {
  const magnitude = Math.min(1, Math.hypot(x, y));
  if (!Number.isFinite(magnitude) || magnitude <= deadzone)
    return { x: 0, y: 0 };
  const scaledMagnitude = (magnitude - deadzone) / (1 - deadzone);
  const scale = scaledMagnitude / magnitude;
  return { x: x * scale, y: y * scale };
}
