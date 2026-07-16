import type { AssetLoadInterceptor } from '../assets/AssetLoader';

export interface DevelopmentAssetFaultSnapshot {
  readonly delayMs: number;
  readonly failureAssetId: string | undefined;
  readonly activeLoads: number;
  readonly simulatedLoads: number;
  readonly disposed: boolean;
}

export class SimulatedAssetFailure extends Error {
  public constructor(public readonly assetId: string) {
    super(`Development fault simulated for logical asset "${assetId}"`);
    this.name = 'SimulatedAssetFailure';
  }
}

interface PendingDelay {
  readonly interval: ReturnType<typeof setInterval>;
  readonly timeout: ReturnType<typeof setTimeout>;
  readonly reject: (error: Error) => void;
}

/** Development-only logical asset delay/failure harness. */
export class DevelopmentAssetFaults implements AssetLoadInterceptor {
  private delayMs = 0;
  private failureAssetId: string | undefined;
  private activeLoads = 0;
  private simulatedLoads = 0;
  private disposed = false;
  private readonly pending = new Set<PendingDelay>();

  public static from(search: URLSearchParams): DevelopmentAssetFaults {
    const faults = new DevelopmentAssetFaults();
    faults.configure({
      delayMs: Number(search.get('loadDelayMs') ?? 0),
      failureAssetId: search.get('loadFail') ?? undefined,
    });
    return faults;
  }

  public configure(configuration: {
    readonly delayMs?: number;
    readonly failureAssetId?: string;
  }): void {
    this.delayMs = Number.isFinite(configuration.delayMs)
      ? Math.min(10_000, Math.max(0, configuration.delayMs ?? 0))
      : 0;
    this.failureAssetId = configuration.failureAssetId || undefined;
  }

  public async run<Value>(
    id: string,
    load: () => Promise<Value>,
    onProgress: (progress: number) => void,
  ): Promise<Value> {
    if (this.disposed) throw new Error('Development asset faults disposed');
    const simulated = this.delayMs > 0 || this.failureAssetId === id;
    if (!simulated) return load();
    this.activeLoads += 1;
    this.simulatedLoads += 1;
    try {
      if (this.delayMs > 0) await this.waitWithProgress(onProgress);
      if (this.failureAssetId === id) throw new SimulatedAssetFailure(id);
      return await load();
    } finally {
      this.activeLoads -= 1;
    }
  }

  public getSnapshot(): DevelopmentAssetFaultSnapshot {
    return {
      delayMs: this.delayMs,
      failureAssetId: this.failureAssetId,
      activeLoads: this.activeLoads,
      simulatedLoads: this.simulatedLoads,
      disposed: this.disposed,
    };
  }

  public reset(): void {
    this.configure({ delayMs: 0 });
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const pending of this.pending) {
      clearInterval(pending.interval);
      clearTimeout(pending.timeout);
      pending.reject(new Error('Development asset fault delay disposed'));
    }
    this.pending.clear();
  }

  private waitWithProgress(
    onProgress: (progress: number) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const started = performance.now();
      const interval = setInterval(
        () => {
          const elapsed = performance.now() - started;
          onProgress(Math.min(0.9, (elapsed / this.delayMs) * 0.9));
        },
        Math.min(100, Math.max(20, this.delayMs / 10)),
      );
      const timeout = setTimeout(() => {
        clearInterval(interval);
        this.pending.delete(pending);
        onProgress(0.9);
        resolve();
      }, this.delayMs);
      const pending: PendingDelay = { interval, timeout, reject };
      this.pending.add(pending);
    });
  }
}
