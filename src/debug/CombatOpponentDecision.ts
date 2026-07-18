export type CombatOpponentState =
  'idle' | 'engage' | 'approach' | 'attack' | 'recover' | 'dead';

export interface CombatOpponentConfig {
  readonly engagementDistance: number;
  readonly disengagementDistance: number;
  readonly attackDistance: number;
  readonly stopDistance: number;
  readonly approachSpeed: number;
  readonly attackWindup: number;
  readonly attackDuration: number;
  readonly recoveryDuration: number;
}

export interface CombatOpponentInput {
  readonly delta: number;
  readonly enabled: boolean;
  readonly gameplayAvailable: boolean;
  readonly selfAlive: boolean;
  readonly targetAlive: boolean;
  readonly distance: number;
  readonly facingDot: number;
  readonly pathClear: boolean;
}

export interface CombatOpponentDecisionSnapshot {
  readonly state: CombatOpponentState;
  readonly stateElapsed: number;
  readonly attackSequence: number;
  readonly damageSequence: number;
  readonly shouldMove: boolean;
  readonly shouldFace: boolean;
  readonly shouldDamage: boolean;
  readonly blocked: boolean;
}

const minimumFacingDot = 0.7;

/** Small deterministic debug-opponent policy. It owns no scene or health state. */
export class CombatOpponentDecision {
  private state: CombatOpponentState = 'idle';
  private stateElapsed = 0;
  private attackSequence = 0;
  private damageSequence = 0;
  private damageApplied = false;
  private blocked = false;
  private shouldMove = false;
  private shouldFace = false;
  private shouldDamage = false;

  public constructor(public readonly config: CombatOpponentConfig) {}

  public update(input: CombatOpponentInput): CombatOpponentDecisionSnapshot {
    const delta = Math.max(0, input.delta);
    this.blocked = !input.pathClear;

    if (!input.selfAlive) this.transition('dead');
    else if (
      !input.enabled ||
      !input.gameplayAvailable ||
      !input.targetAlive ||
      input.distance > this.config.disengagementDistance
    ) {
      this.transition('idle');
    } else {
      this.stateElapsed += delta;
      switch (this.state) {
        case 'idle':
          if (input.distance <= this.config.engagementDistance)
            this.transition('engage');
          break;
        case 'engage':
          this.transition(
            input.distance <= this.config.attackDistance &&
              input.facingDot >= minimumFacingDot
              ? 'attack'
              : 'approach',
          );
          break;
        case 'approach':
          if (
            input.distance <= this.config.attackDistance &&
            input.facingDot >= minimumFacingDot
          ) {
            this.transition('attack');
          }
          break;
        case 'attack':
          if (input.distance > this.config.attackDistance * 1.2) {
            this.transition('recover');
          } else if (this.stateElapsed >= this.config.attackDuration) {
            this.transition('recover');
          }
          break;
        case 'recover':
          if (this.stateElapsed >= this.config.recoveryDuration)
            this.transition(
              input.distance <= this.config.attackDistance &&
                input.facingDot >= minimumFacingDot
                ? 'attack'
                : 'approach',
            );
          break;
        case 'dead':
          break;
      }
    }

    this.shouldDamage =
      this.state === 'attack' &&
      !this.damageApplied &&
      this.stateElapsed >= this.config.attackWindup &&
      input.distance <= this.config.attackDistance &&
      input.facingDot >= minimumFacingDot;
    if (this.shouldDamage) {
      this.damageApplied = true;
      this.damageSequence += 1;
    }
    this.shouldMove =
      this.state === 'approach' &&
      input.pathClear &&
      input.distance > this.config.stopDistance;
    this.shouldFace =
      this.state !== 'idle' && this.state !== 'dead' && input.targetAlive;
    return {
      state: this.state,
      stateElapsed: this.stateElapsed,
      attackSequence: this.attackSequence,
      damageSequence: this.damageSequence,
      shouldMove: this.shouldMove,
      shouldFace: this.shouldFace,
      shouldDamage: this.shouldDamage,
      blocked: this.blocked,
    };
  }

  public reset(): void {
    this.state = 'idle';
    this.stateElapsed = 0;
    this.attackSequence = 0;
    this.damageSequence = 0;
    this.damageApplied = false;
    this.blocked = false;
    this.shouldMove = false;
    this.shouldFace = false;
    this.shouldDamage = false;
  }

  public getSnapshot(): CombatOpponentDecisionSnapshot {
    return {
      state: this.state,
      stateElapsed: this.stateElapsed,
      attackSequence: this.attackSequence,
      damageSequence: this.damageSequence,
      shouldMove: this.shouldMove,
      shouldFace: this.shouldFace,
      shouldDamage: this.shouldDamage,
      blocked: this.blocked,
    };
  }

  private transition(next: CombatOpponentState): void {
    if (this.state === next) return;
    this.state = next;
    this.stateElapsed = 0;
    this.damageApplied = false;
    if (next === 'attack') this.attackSequence += 1;
  }
}
