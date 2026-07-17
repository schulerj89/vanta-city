import { EventBus } from '../core/events';

export type HealthChangeKind = 'damage' | 'heal' | 'set' | 'reset';

export interface HealthChange {
  readonly ownerId: string;
  readonly kind: HealthChangeKind;
  readonly source: string | undefined;
  readonly previous: number;
  readonly current: number;
  readonly maximum: number;
  readonly delta: number;
  readonly normalized: number;
  readonly alive: boolean;
}

export interface HealthEvents {
  changed: HealthChange;
  depleted: HealthChange;
  restored: HealthChange;
}

export interface HealthSnapshot {
  readonly ownerId: string;
  readonly current: number;
  readonly maximum: number;
  readonly normalized: number;
  readonly alive: boolean;
  readonly depleted: boolean;
  readonly changeSequence: number;
  readonly lastChange: HealthChange | undefined;
}

/** Game-owned health state. Presentation and visuals may observe but never own it. */
export class HealthComponent {
  public readonly events = new EventBus<HealthEvents>();

  private value: number;
  private disposed = false;
  private changeSequence = 0;
  private lastChange: HealthChange | undefined;

  public constructor(
    public readonly ownerId: string,
    public readonly maximum: number,
    initial = maximum,
  ) {
    if (!Number.isFinite(maximum) || maximum <= 0) {
      throw new Error('Health maximum must be a positive finite number');
    }
    if (!Number.isFinite(initial)) {
      throw new Error('Initial health must be finite');
    }
    this.value = clamp(initial, 0, maximum);
  }

  public get current(): number {
    return this.value;
  }

  public get normalized(): number {
    return this.value / this.maximum;
  }

  public get alive(): boolean {
    return this.value > 0;
  }

  public damage(amount: number, source?: string): HealthChange | undefined {
    return this.mutate(this.value - positiveAmount(amount), 'damage', source);
  }

  public heal(amount: number, source?: string): HealthChange | undefined {
    return this.mutate(this.value + positiveAmount(amount), 'heal', source);
  }

  public set(value: number, source?: string): HealthChange | undefined {
    return this.mutate(value, 'set', source);
  }

  public reset(source?: string): HealthChange | undefined {
    return this.mutate(this.maximum, 'reset', source);
  }

  public getSnapshot(): HealthSnapshot {
    return {
      ownerId: this.ownerId,
      current: this.value,
      maximum: this.maximum,
      normalized: this.normalized,
      alive: this.alive,
      depleted: !this.alive,
      changeSequence: this.changeSequence,
      lastChange: this.lastChange,
    };
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.events.clear();
  }

  private mutate(
    requested: number,
    kind: HealthChangeKind,
    source?: string,
  ): HealthChange | undefined {
    this.assertAvailable();
    if (!Number.isFinite(requested)) {
      throw new Error('Health value must be finite');
    }
    const previous = this.value;
    const current = clamp(requested, 0, this.maximum);
    if (current === previous) return undefined;
    const wasAlive = previous > 0;
    this.value = current;
    const change: HealthChange = {
      ownerId: this.ownerId,
      kind,
      source,
      previous,
      current,
      maximum: this.maximum,
      delta: current - previous,
      normalized: this.normalized,
      alive: this.alive,
    };
    this.changeSequence += 1;
    this.lastChange = change;
    this.events.emit('changed', change);
    if (wasAlive && !change.alive) this.events.emit('depleted', change);
    if (!wasAlive && change.alive) this.events.emit('restored', change);
    return change;
  }

  private assertAvailable(): void {
    if (this.disposed) throw new Error(`Health "${this.ownerId}" is disposed`);
  }
}

function positiveAmount(amount: number): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(
      'Health mutation amount must be a non-negative finite number',
    );
  }
  return amount;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
