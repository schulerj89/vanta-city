import type { GameSystem } from '../core/lifecycle';

export type ActionName = string;
export type ActionBindings = Readonly<Record<ActionName, readonly string[]>>;

export interface InputReader {
  isDown(action: ActionName): boolean;
  wasPressed(action: ActionName): boolean;
  wasReleased(action: ActionName): boolean;
}

export class InputSystem implements GameSystem, InputReader {
  public readonly id = 'input';
  public readonly updateMode = 'always' as const;

  private readonly downCodes = new Set<string>();
  private readonly pressedCodes = new Set<string>();
  private readonly releasedCodes = new Set<string>();
  private attached = false;

  public constructor(
    private readonly bindings: ActionBindings,
    private readonly target: Window = window,
  ) {}

  public init(): void {
    if (this.attached) return;
    this.target.addEventListener('keydown', this.onKeyDown);
    this.target.addEventListener('keyup', this.onKeyUp);
    this.target.addEventListener('blur', this.onBlur);
    this.attached = true;
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
    this.clear();
    this.attached = false;
  }

  private codesFor(action: ActionName): readonly string[] {
    const codes = this.bindings[action];
    if (!codes) throw new Error(`Unknown input action: ${action}`);
    return codes;
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.downCodes.has(event.code)) this.pressedCodes.add(event.code);
    this.downCodes.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (this.downCodes.delete(event.code)) this.releasedCodes.add(event.code);
  };

  private readonly onBlur = (): void => this.clear();

  private clear(): void {
    this.downCodes.clear();
    this.pressedCodes.clear();
    this.releasedCodes.clear();
  }
}
