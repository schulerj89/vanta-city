import type { GameSystem } from '../core/lifecycle';
import type { FrameTime } from '../core/time';
import type { GameStateMachine } from '../core/gameState';
import type { InputReader } from '../input/InputSystem';

export interface Position3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface DebugDataSource {
  getPlayerPosition(): Position3 | undefined;
}

export class DebugOverlaySystem implements GameSystem {
  public readonly id = 'debug-overlay';
  public readonly updateMode = 'always' as const;

  private readonly element = document.createElement('aside');
  private visible: boolean;
  private smoothedFps = 0;

  public constructor(
    private readonly mount: HTMLElement,
    private readonly state: GameStateMachine,
    private readonly input: InputReader,
    private readonly data?: DebugDataSource,
    initiallyVisible = true,
  ) {
    this.visible = initiallyVisible;
  }

  public init(): void {
    this.element.className = 'debug-overlay';
    this.element.setAttribute('aria-live', 'polite');
    this.mount.append(this.element);
    this.applyVisibility();
  }

  public update(time: FrameTime): void {
    if (this.input.wasPressed('toggleDebug')) {
      this.visible = !this.visible;
      this.applyVisibility();
    }
    if (!this.visible) return;

    const fps = time.delta > 0 ? 1 / time.delta : 0;
    this.smoothedFps =
      this.smoothedFps === 0 ? fps : this.smoothedFps * 0.9 + fps * 0.1;
    const position = this.data?.getPlayerPosition();
    const player = position
      ? `${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)}`
      : 'not available';
    this.element.textContent = `FPS ${this.smoothedFps.toFixed(0)}\nState ${this.state.current}\nPlayer ${player}`;
  }

  public dispose(): void {
    this.element.remove();
  }

  private applyVisibility(): void {
    this.element.hidden = !this.visible;
  }
}
