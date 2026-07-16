import type { FrameTime } from './time';

export type UpdateMode = 'simulation' | 'always';

export interface GameSystem<Context = unknown> {
  readonly id: string;
  readonly updateMode?: UpdateMode;
  init?(context: Context): void | Promise<void>;
  update?(time: FrameTime): void;
  lateUpdate?(time: FrameTime): void;
  pause?(): void;
  resume?(): void;
  dispose?(): void;
}

export class SystemRegistry<Context> {
  private readonly systems: GameSystem<Context>[] = [];
  private initialized = false;

  public register(system: GameSystem<Context>): this {
    if (this.initialized)
      throw new Error('Systems cannot be registered after initialization');
    if (this.systems.some(({ id }) => id === system.id)) {
      throw new Error(`A system with id "${system.id}" is already registered`);
    }
    this.systems.push(system);
    return this;
  }

  public async init(context: Context): Promise<void> {
    if (this.initialized)
      throw new Error('System registry is already initialized');
    for (const system of this.systems) await system.init?.(context);
    this.initialized = true;
  }

  public update(time: FrameTime, simulationEnabled: boolean): void {
    for (const system of this.systems) {
      if (simulationEnabled || system.updateMode === 'always')
        system.update?.(time);
    }
    for (const system of this.systems) {
      if (simulationEnabled || system.updateMode === 'always')
        system.lateUpdate?.(time);
    }
  }

  public pause(): void {
    for (const system of this.systems) system.pause?.();
  }

  public resume(): void {
    for (const system of this.systems) system.resume?.();
  }

  public dispose(): void {
    for (const system of [...this.systems].reverse()) system.dispose?.();
    this.systems.length = 0;
    this.initialized = false;
  }
}
