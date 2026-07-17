import { EventBus } from '../core/events';
import { GameStateMachine } from '../core/gameState';
import type { StateEvents } from '../core/gameState';
import { SystemRegistry } from '../core/lifecycle';
import type { GameSystem } from '../core/lifecycle';
import type { SystemInitializationObserver } from '../core/lifecycle';
import type { SystemTimingSink } from '../core/lifecycle';
import { GameClock } from '../core/time';
import type { InputReader } from '../input/InputSystem';

export interface GameContext {
  readonly events: EventBus<StateEvents>;
  readonly state: GameStateMachine;
  readonly input: InputReader;
}

export interface PerformanceTimingSummary {
  readonly samples: number;
  readonly minMs: number;
  readonly averageMs: number;
  readonly maxMs: number;
  readonly p95Ms: number;
}

export type RuntimePerformanceSnapshot =
  | { readonly enabled: false }
  | {
      readonly enabled: true;
      readonly windowSize: number;
      readonly frame: PerformanceTimingSummary;
      readonly systems: Readonly<
        Record<
          string,
          Partial<Record<'update' | 'lateUpdate', PerformanceTimingSummary>>
        >
      >;
    };

export interface RuntimePerformanceDiagnostics extends SystemTimingSink {
  recordFrame(durationMs: number): void;
  getSnapshot(): RuntimePerformanceSnapshot;
  reset(): void;
}

export class GameRuntime {
  public readonly events = new EventBus<StateEvents>();
  public readonly state = new GameStateMachine(this.events);

  private readonly systems = new SystemRegistry<GameContext>();
  private readonly clock = new GameClock(0.1);
  private animationFrame: number | undefined;
  private running = false;
  private diagnostics: RuntimePerformanceDiagnostics | undefined;

  public constructor(private readonly input: InputReader) {}

  public register(system: GameSystem<GameContext>): this {
    this.systems.register(system);
    return this;
  }

  public setPerformanceDiagnostics(
    diagnostics?: RuntimePerformanceDiagnostics,
  ): void {
    this.diagnostics = diagnostics;
    this.systems.setTimingSink(diagnostics);
  }

  public getPerformanceSnapshot(): RuntimePerformanceSnapshot {
    return this.diagnostics?.getSnapshot() ?? { enabled: false };
  }

  public async init(observer?: SystemInitializationObserver): Promise<void> {
    if (this.running) return;
    await this.systems.init(
      {
        events: this.events,
        state: this.state,
        input: this.input,
      },
      observer,
    );
    this.running = true;
    this.state.transition('playing');
    this.clock.resetFrameDelta();
    this.animationFrame = requestAnimationFrame(this.frame);
  }

  public pause(): void {
    if (this.state.current !== 'playing') return;
    this.state.transition('paused');
    this.systems.pause();
  }

  public resume(): void {
    if (this.state.current !== 'paused') return;
    this.input.consumeTransientActions?.();
    this.state.transition('playing');
    this.clock.resetFrameDelta();
    this.systems.resume();
  }

  public dispose(): void {
    this.running = false;
    if (this.animationFrame !== undefined)
      cancelAnimationFrame(this.animationFrame);
    this.animationFrame = undefined;
    this.systems.dispose();
    this.events.clear();
  }

  private readonly frame = (timestamp: number): void => {
    if (!this.running) return;
    const time = this.clock.tick(timestamp);

    this.input.prepareFrame?.();
    if (this.input.wasPressed('pause')) {
      if (this.state.current === 'paused') this.resume();
      else if (this.state.current === 'playing') this.pause();
    }

    const started = this.diagnostics?.now();
    this.systems.update(
      time,
      this.state.current !== 'paused' &&
        this.state.current !== 'character-select',
    );
    if (started !== undefined && this.diagnostics) {
      this.diagnostics.recordFrame(this.diagnostics.now() - started);
    }
    this.animationFrame = requestAnimationFrame(this.frame);
  };
}
