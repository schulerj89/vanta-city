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

/** Polls one standard-layout controller and exposes named actions and axes. */
export class GamepadInputAdapter {
  private readonly downActions = new Set<ActionName>();
  private readonly pressedActions = new Set<ActionName>();
  private readonly releasedActions = new Set<ActionName>();
  private readonly axes = new Map<AxisName, number>();

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
    const gamepad = this.provider().find(
      (candidate): candidate is Gamepad =>
        candidate !== null &&
        candidate.connected &&
        candidate.mapping === 'standard',
    );
    const nextDown = new Set<ActionName>();
    if (gamepad) {
      for (const [action, buttons] of Object.entries(this.bindings)) {
        if (buttons.some((index) => this.buttonDown(gamepad, index))) {
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
    }

    for (const action of nextDown) {
      if (!this.downActions.has(action)) this.pressedActions.add(action);
    }
    for (const action of this.downActions) {
      if (!nextDown.has(action)) this.releasedActions.add(action);
    }
    this.downActions.clear();
    for (const action of nextDown) this.downActions.add(action);
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

  public lateUpdate(): void {
    this.pressedActions.clear();
    this.releasedActions.clear();
  }

  public dispose(): void {
    this.downActions.clear();
    this.pressedActions.clear();
    this.releasedActions.clear();
    this.axes.clear();
  }

  private buttonDown(gamepad: Gamepad, index: number): boolean {
    const button = gamepad.buttons[index];
    return Boolean(
      button && (button.pressed || button.value >= this.config.buttonThreshold),
    );
  }
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
