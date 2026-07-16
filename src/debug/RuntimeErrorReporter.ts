import type { GameSystem } from '../core/lifecycle';
import type { DebugUnregister } from './DebugRegistry';
import { DebugRegistry } from './DebugRegistry';

export class RuntimeErrorReporter implements GameSystem {
  public readonly id = 'runtime-error-reporter';
  public readonly updateMode = 'always' as const;

  private errorCount = 0;
  private lastError = 'none';
  private unregisterValues: DebugUnregister[] = [];

  public constructor(
    private readonly registry: DebugRegistry,
    private readonly target: Window = window,
  ) {}

  public init(): void {
    this.unregisterValues = [
      this.registry.registerValue({
        id: 'errors.count',
        label: 'Errors',
        group: 'Diagnostics',
        read: () => this.errorCount,
      }),
      this.registry.registerValue({
        id: 'errors.last',
        label: 'Last error',
        group: 'Diagnostics',
        read: () => this.lastError,
      }),
    ];
    this.target.addEventListener('error', this.onError);
    this.target.addEventListener('unhandledrejection', this.onRejection);
  }

  public report(scope: string, error: unknown): void {
    this.errorCount += 1;
    const detail = error instanceof Error ? error.message : String(error);
    this.lastError = `${scope}: ${detail}`;
    console.error(`[Vanta City] ${scope}`, error);
  }

  public dispose(): void {
    this.target.removeEventListener('error', this.onError);
    this.target.removeEventListener('unhandledrejection', this.onRejection);
    for (const unregister of this.unregisterValues) unregister();
    this.unregisterValues = [];
  }

  private readonly onError = (event: ErrorEvent): void => {
    this.report(
      `uncaught error at ${event.filename || 'unknown source'}:${event.lineno || 0}`,
      event.error ?? event.message,
    );
  };

  private readonly onRejection = (event: PromiseRejectionEvent): void => {
    this.report('unhandled promise rejection', event.reason);
  };
}
