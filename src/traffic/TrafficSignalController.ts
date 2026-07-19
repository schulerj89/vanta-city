export type TrafficSignalGroup = 'north-south' | 'east-west';
export type TrafficSignalIndication = 'red' | 'yellow' | 'green';
export type TrafficSignalPhase =
  | 'north-south-green'
  | 'north-south-yellow'
  | 'all-red-to-east-west'
  | 'east-west-green'
  | 'east-west-yellow'
  | 'all-red-to-north-south';

export interface TrafficSignalConfig {
  readonly greenDuration: number;
  readonly yellowDuration: number;
  readonly allRedDuration: number;
}

export const defaultTrafficSignalConfig: TrafficSignalConfig = {
  greenDuration: 12,
  yellowDuration: 3,
  allRedDuration: 1.5,
};

export interface TrafficSignalSnapshot {
  readonly phase: TrafficSignalPhase;
  readonly remaining: number;
  readonly cycle: number;
  readonly groups: Readonly<
    Record<TrafficSignalGroup, TrafficSignalIndication>
  >;
}

const phases: readonly TrafficSignalPhase[] = [
  'north-south-green',
  'north-south-yellow',
  'all-red-to-east-west',
  'east-west-green',
  'east-west-yellow',
  'all-red-to-north-south',
];

/** Deterministic, fixed-order controller with an all-red clearance interval. */
export class TrafficSignalController {
  private phaseIndex = 0;
  private remaining: number;
  private cycle = 0;

  public constructor(
    public readonly config: TrafficSignalConfig = defaultTrafficSignalConfig,
  ) {
    validateDuration(config.greenDuration, 'greenDuration');
    validateDuration(config.yellowDuration, 'yellowDuration');
    validateDuration(config.allRedDuration, 'allRedDuration');
    this.remaining = this.durationFor(phases[this.phaseIndex]!);
  }

  public update(delta: number): void {
    if (!Number.isFinite(delta) || delta <= 0) return;
    let elapsed = delta;
    while (elapsed + 1e-9 >= this.remaining) {
      elapsed -= this.remaining;
      this.phaseIndex = (this.phaseIndex + 1) % phases.length;
      if (this.phaseIndex === 0) this.cycle += 1;
      this.remaining = this.durationFor(phases[this.phaseIndex]!);
    }
    this.remaining -= elapsed;
  }

  public reset(): void {
    this.phaseIndex = 0;
    this.remaining = this.config.greenDuration;
    this.cycle = 0;
  }

  public indication(group: TrafficSignalGroup): TrafficSignalIndication {
    const phase = phases[this.phaseIndex]!;
    if (phase === `${group}-green`) return 'green';
    if (phase === `${group}-yellow`) return 'yellow';
    return 'red';
  }

  public getSnapshot(): TrafficSignalSnapshot {
    return {
      phase: phases[this.phaseIndex]!,
      remaining: this.remaining,
      cycle: this.cycle,
      groups: {
        'north-south': this.indication('north-south'),
        'east-west': this.indication('east-west'),
      },
    };
  }

  private durationFor(phase: TrafficSignalPhase): number {
    if (phase.endsWith('-green')) return this.config.greenDuration;
    if (phase.endsWith('-yellow')) return this.config.yellowDuration;
    return this.config.allRedDuration;
  }
}

function validateDuration(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Traffic signal ${label} must be positive`);
  }
}
