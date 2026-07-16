import type {
  PerformanceTimingSummary,
  RuntimePerformanceDiagnostics,
} from '../game/GameRuntime';
import type { SystemUpdatePhase } from '../core/lifecycle';
import type { RendererTimingDiagnostics } from '../render/RenderSystem';
import type { RenderSystem } from '../render/RenderSystem';
import type { GameRuntime } from '../game/GameRuntime';
import type { ThreeAssetLoader } from '../assets/AssetLoader';
import type { LoadingScreen } from '../ui/LoadingScreen';
import type { DebugRegistry, DebugUnregister } from './DebugRegistry';
import type { DevelopmentAssetFaults } from './DevelopmentAssetFaults';

export type TimingSummary = PerformanceTimingSummary;

export interface RuntimePerformanceSnapshot {
  readonly enabled: true;
  readonly windowSize: number;
  readonly frame: TimingSummary;
  readonly systems: Readonly<
    Record<string, Partial<Record<SystemUpdatePhase, TimingSummary>>>
  >;
}

export class RollingTimingWindow {
  private readonly values: number[] = [];
  private cursor = 0;

  public constructor(private readonly capacity = 120) {}

  public add(value: number): void {
    if (this.values.length < this.capacity) this.values.push(value);
    else {
      this.values[this.cursor] = value;
      this.cursor = (this.cursor + 1) % this.capacity;
    }
  }

  public snapshot(): TimingSummary {
    if (this.values.length === 0) {
      return { samples: 0, minMs: 0, averageMs: 0, maxMs: 0, p95Ms: 0 };
    }
    const sorted = [...this.values].sort((left, right) => left - right);
    const total = this.values.reduce((sum, value) => sum + value, 0);
    const p95Index = Math.min(
      sorted.length - 1,
      Math.ceil(sorted.length * 0.95) - 1,
    );
    return {
      samples: this.values.length,
      minMs: sorted[0]!,
      averageMs: total / this.values.length,
      maxMs: sorted.at(-1)!,
      p95Ms: sorted[p95Index]!,
    };
  }

  public reset(): void {
    this.values.length = 0;
    this.cursor = 0;
  }
}

export class DevelopmentRuntimeDiagnostics implements RuntimePerformanceDiagnostics {
  private readonly frame: RollingTimingWindow;
  private readonly systems = new Map<
    string,
    Partial<Record<SystemUpdatePhase, RollingTimingWindow>>
  >();

  public constructor(
    private readonly windowSize = 120,
    private readonly clock: () => number = () => performance.now(),
  ) {
    this.frame = new RollingTimingWindow(windowSize);
  }

  public now(): number {
    return this.clock();
  }

  public record(
    systemId: string,
    phase: SystemUpdatePhase,
    durationMs: number,
  ): void {
    const phases = this.systems.get(systemId) ?? {};
    const window = phases[phase] ?? new RollingTimingWindow(this.windowSize);
    window.add(durationMs);
    phases[phase] = window;
    this.systems.set(systemId, phases);
  }

  public recordFrame(durationMs: number): void {
    this.frame.add(durationMs);
  }

  public getSnapshot(): RuntimePerformanceSnapshot {
    return {
      enabled: true,
      windowSize: this.windowSize,
      frame: this.frame.snapshot(),
      systems: Object.fromEntries(
        [...this.systems].map(([id, phases]) => [
          id,
          Object.fromEntries(
            Object.entries(phases).map(([phase, window]) => [
              phase,
              window?.snapshot(),
            ]),
          ),
        ]),
      ),
    };
  }

  public reset(): void {
    this.frame.reset();
    this.systems.clear();
  }
}

export class DevelopmentRendererDiagnostics implements RendererTimingDiagnostics {
  private readonly frames: RollingTimingWindow;

  public constructor(
    windowSize = 120,
    private readonly clock: () => number = () => performance.now(),
  ) {
    this.frames = new RollingTimingWindow(windowSize);
  }

  public now(): number {
    return this.clock();
  }

  public record(durationMs: number): void {
    this.frames.add(durationMs);
  }

  public getSnapshot(): TimingSummary & { readonly enabled: true } {
    return { enabled: true, ...this.frames.snapshot() };
  }

  public reset(): void {
    this.frames.reset();
  }
}

export function registerPerformanceDiagnostics(
  debug: DebugRegistry,
  dependencies: {
    readonly render: RenderSystem;
    readonly runtime: GameRuntime;
    readonly assets: ThreeAssetLoader;
    readonly loading: LoadingScreen;
    readonly faults: DevelopmentAssetFaults;
    readonly rendererTiming: DevelopmentRendererDiagnostics;
    readonly runtimeTiming: DevelopmentRuntimeDiagnostics;
  },
): DebugUnregister[] {
  const summary = (value: TimingSummary): string =>
    `${value.averageMs.toFixed(2)} ms avg · ${value.p95Ms.toFixed(2)} p95 · ${value.minMs.toFixed(2)}–${value.maxMs.toFixed(2)} · n=${value.samples}`;
  return [
    debug.registerValue({
      id: 'performance.renderer-frame',
      label: 'Renderer CPU frame',
      read: () => summary(dependencies.rendererTiming.getSnapshot()),
    }),
    debug.registerValue({
      id: 'performance.renderer-work',
      label: 'Draw calls / triangles',
      read: () => {
        const value = dependencies.render.getPerformanceSnapshot();
        return `${value.drawCalls} / ${value.triangles}`;
      },
    }),
    debug.registerValue({
      id: 'performance.renderer-memory',
      label: 'Geometries / textures',
      read: () => {
        const value = dependencies.render.getPerformanceSnapshot();
        return `${value.geometries} / ${value.textures}`;
      },
    }),
    debug.registerValue({
      id: 'performance.runtime-frame',
      label: 'Runtime update frame',
      read: () => summary(dependencies.runtimeTiming.getSnapshot().frame),
    }),
    debug.registerValue({
      id: 'performance.slowest-system',
      label: 'Slowest system p95',
      read: () => {
        const systems = dependencies.runtimeTiming.getSnapshot().systems;
        const entries = Object.entries(systems).flatMap(([id, phases]) =>
          Object.entries(phases).map(([phase, timing]) => ({
            id: `${id}.${phase}`,
            p95Ms: timing?.p95Ms ?? 0,
          })),
        );
        const slowest = entries.sort((a, b) => b.p95Ms - a.p95Ms)[0];
        return slowest
          ? `${slowest.id} · ${slowest.p95Ms.toFixed(2)} ms`
          : 'collecting';
      },
    }),
    debug.registerValue({
      id: 'performance.assets',
      label: 'Asset cache / active / failed',
      read: () => {
        const value = dependencies.assets.getPerformanceSnapshot();
        return `${value.cacheEntries} / ${value.inFlight} / ${value.failures}`;
      },
    }),
    debug.registerValue({
      id: 'performance.loading',
      label: 'Loading stages',
      read: () => {
        const value = dependencies.loading.getSnapshot().durationsMs;
        return `world ${formatDuration(value.preparingWorld)} · character ${formatDuration(value.preparingCharacter)} · final ${formatDuration(value.finalizing)} · total ${formatDuration(value.total)}`;
      },
    }),
    debug.registerValue({
      id: 'performance.asset-faults',
      label: 'Asset fault harness',
      read: () => {
        const value = dependencies.faults.getSnapshot();
        return `${value.delayMs} ms · fail ${value.failureAssetId ?? 'none'} · active ${value.activeLoads}`;
      },
    }),
    debug.registerCommand({
      id: 'performance.reset-windows',
      label: 'Reset performance windows',
      run: () => {
        dependencies.rendererTiming.reset();
        dependencies.runtimeTiming.reset();
      },
    }),
    debug.registerCommand({
      id: 'loading.fault-reload',
      label: 'Reload with loading fault',
      argumentLabel: 'delay ms, optional logical asset id',
      run: (argument) => reloadWithFault(argument),
    }),
    debug.registerCommand({
      id: 'loading.fault-reset',
      label: 'Reset loading fault and reload',
      run: () => reloadWithFault(),
    }),
  ];
}

function formatDuration(value: number | undefined): string {
  return value === undefined ? 'pending' : `${value.toFixed(1)} ms`;
}

function reloadWithFault(argument?: string): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('loadDelayMs');
  url.searchParams.delete('loadFail');
  if (argument) {
    const [delay, failureAssetId] = argument
      .split(',')
      .map((value) => value.trim());
    const delayMs = Number(delay);
    if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > 10_000) {
      throw new Error('Loading delay must be between 0 and 10000 milliseconds');
    }
    url.searchParams.set('loadDelayMs', String(delayMs));
    if (failureAssetId) url.searchParams.set('loadFail', failureAssetId);
  }
  window.location.assign(url);
}
