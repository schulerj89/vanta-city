import { EventBus } from '../core/events';

export const cinematicPerformanceIntents = [
  'neutral-hold',
  'approach',
  'turn-to',
  'listen',
  'speak-restrained',
  'speak-emphatic',
  'indicate',
  'acknowledge',
  'dismiss',
  'react-alert',
  'sit',
  'seated-hold',
  'stand',
  'dance',
  'prop-use',
  'applaud',
] as const;

export type CinematicPerformanceIntent =
  (typeof cinematicPerformanceIntents)[number];
export type CinematicPerformancePriority =
  'ambient' | 'movement' | 'acting' | 'critical';
export type CinematicPerformancePlayback =
  'loop' | 'one-shot' | 'transition-with-hold';
export type PerformanceReleaseReason =
  'completed' | 'superseded' | 'cancelled' | 'skipped' | 'failed' | 'disposed';

export interface CharacterPerformanceBinding {
  readonly animationId: string;
  readonly playback: CinematicPerformancePlayback;
  readonly requiresMovementOwner?: boolean;
  readonly holdAtNormalizedTime?: number;
  readonly releaseAnimationId?: string;
}

export interface CharacterPerformanceProfile {
  readonly profileId: string;
  readonly characterId: string;
  readonly intents: Partial<
    Record<CinematicPerformanceIntent, CharacterPerformanceBinding>
  >;
}

export interface CinematicPerformanceRequest {
  readonly requestId: string;
  readonly cueId: string;
  readonly shotId: string;
  readonly intent: CinematicPerformanceIntent;
  readonly priority?: CinematicPerformancePriority;
  readonly allowNeutralFallback?: boolean;
  readonly movementOwnerAvailable?: boolean;
  readonly targetParticipantId?: string;
  readonly targetMarkId?: string;
  /** Resolved by the participant/blocking owner; never by camera or clip data. */
  readonly targetFacingYaw?: number;
}

export type CinematicPerformanceFailureReason =
  | 'disposed'
  | 'invalid-request'
  | 'missing-performance'
  | 'missing-movement-owner'
  | 'priority-blocked'
  | 'start-failed';

export interface CinematicPerformancePreflight {
  readonly ok: boolean;
  readonly reason?: CinematicPerformanceFailureReason;
  readonly resolvedAnimationId: string | null;
  readonly resolution: 'exact' | 'neutral-fallback' | null;
}

export interface CinematicPerformanceSnapshot {
  readonly participantId: string;
  readonly profileId: string;
  readonly state:
    | 'gameplay'
    | 'starting'
    | 'performing'
    | 'holding'
    | 'restoring'
    | 'disposed';
  readonly requestId: string | null;
  readonly cueId: string | null;
  readonly shotId: string | null;
  readonly requestedIntent: CinematicPerformanceIntent | null;
  readonly resolvedAnimationId: string | null;
  readonly resolution: 'exact' | 'neutral-fallback' | null;
  readonly phase: 'start' | 'hold' | 'release' | null;
  readonly priority: CinematicPerformancePriority | null;
  readonly generation: number;
  readonly targetParticipantId: string | null;
  readonly targetMarkId: string | null;
  readonly releaseReason: PerformanceReleaseReason | null;
  readonly restoreGeneration: number;
  readonly eventSequence: number;
  readonly actionOwnerCount: number;
  readonly mixerOwnerCount: number;
}

export interface CinematicPerformanceRestoreToken {
  readonly participantId: string;
  readonly tokenId: number;
}

export interface CinematicPerformancePort<State> {
  captureGameplayState(): State;
  restoreGameplayState(state: State): void;
  hasAnimation(animationId: string): boolean;
  playAnimation(binding: CharacterPerformanceBinding): boolean;
  holdAnimation(binding: CharacterPerformanceBinding): void;
  releaseAnimation(reason: PerformanceReleaseReason): void;
  setPerformanceFacingTarget(yaw: number | undefined): void;
  getActionOwnerCount(): number;
  getMixerOwnerCount(): number;
}

export interface CinematicPerformanceEvents {
  readonly 'performance:started': CinematicPerformanceSnapshot;
  readonly 'performance:held': CinematicPerformanceSnapshot;
  readonly 'performance:released': CinematicPerformanceSnapshot;
  readonly 'performance:failed': CinematicPerformanceSnapshot & {
    readonly failureReason: CinematicPerformanceFailureReason;
  };
  readonly 'performance:restored': CinematicPerformanceSnapshot;
}

const priorityRank: Record<CinematicPerformancePriority, number> = {
  ambient: 0,
  movement: 1,
  acting: 2,
  critical: 3,
};

/**
 * Clip-agnostic cinematic performance authority composed inside one existing
 * participant owner. It never constructs a mixer or exposes an action/root.
 */
export class CinematicPerformanceController<State> {
  public readonly events = new EventBus<CinematicPerformanceEvents>();
  private readonly tokens = new Map<number, State>();
  private nextTokenId = 0;
  private disposed = false;
  private activeBinding: CharacterPerformanceBinding | undefined;
  private snapshot: CinematicPerformanceSnapshot;

  public constructor(
    public readonly participantId: string,
    public readonly profile: CharacterPerformanceProfile,
    private readonly port: CinematicPerformancePort<State>,
  ) {
    this.snapshot = this.makeGameplaySnapshot();
  }

  public preflightPerformance(
    request: CinematicPerformanceRequest,
  ): CinematicPerformancePreflight {
    if (this.disposed) return failure('disposed');
    if (!isValidRequest(request)) return failure('invalid-request');
    const priority = request.priority ?? 'acting';
    if (
      this.snapshot.requestId &&
      this.snapshot.priority &&
      priorityRank[priority] < priorityRank[this.snapshot.priority]
    ) {
      return failure('priority-blocked');
    }
    const exact = this.profile.intents[request.intent];
    const fallbackBinding = request.allowNeutralFallback
      ? this.profile.intents['neutral-hold']
      : undefined;
    const binding = exact ?? fallbackBinding;
    if (!binding || !this.port.hasAnimation(binding.animationId)) {
      return failure('missing-performance');
    }
    if (binding.requiresMovementOwner && !request.movementOwnerAvailable) {
      return failure('missing-movement-owner');
    }
    return {
      ok: true,
      resolvedAnimationId: binding.animationId,
      resolution: exact ? 'exact' : 'neutral-fallback',
    };
  }

  public capturePerformanceState(): CinematicPerformanceRestoreToken {
    if (this.disposed) throw new Error('Performance controller is disposed');
    const tokenId = ++this.nextTokenId;
    this.tokens.set(tokenId, this.port.captureGameplayState());
    return Object.freeze({ participantId: this.participantId, tokenId });
  }

  public startPerformance(
    request: CinematicPerformanceRequest,
  ): CinematicPerformancePreflight {
    const result = this.preflightPerformance(request);
    if (!result.ok) {
      this.emitFailure(result.reason!);
      return result;
    }
    if (this.snapshot.requestId)
      this.releasePerformance(this.snapshot.requestId, 'superseded');
    const exact = this.profile.intents[request.intent];
    const binding = exact ?? this.profile.intents['neutral-hold']!;
    const generation = this.snapshot.generation + 1;
    this.snapshot = {
      ...this.snapshot,
      state: 'starting',
      requestId: request.requestId,
      cueId: request.cueId,
      shotId: request.shotId,
      requestedIntent: request.intent,
      resolvedAnimationId: result.resolvedAnimationId,
      resolution: result.resolution,
      phase: 'start',
      priority: request.priority ?? 'acting',
      generation,
      targetParticipantId: request.targetParticipantId ?? null,
      targetMarkId: request.targetMarkId ?? null,
      releaseReason: null,
    };
    this.port.setPerformanceFacingTarget(request.targetFacingYaw);
    if (!this.port.playAnimation(binding)) {
      this.port.setPerformanceFacingTarget(undefined);
      this.snapshot = { ...this.makeGameplaySnapshot(), generation };
      this.emitFailure('start-failed');
      return failure('start-failed');
    }
    this.activeBinding = binding;
    this.snapshot = this.withEvent({ ...this.snapshot, state: 'performing' });
    this.events.emit('performance:started', this.getPerformanceSnapshot());
    return result;
  }

  public holdPerformance(requestId: string): boolean {
    if (
      this.disposed ||
      requestId !== this.snapshot.requestId ||
      !this.activeBinding
    )
      return false;
    this.port.holdAnimation(this.activeBinding);
    this.snapshot = this.withEvent({
      ...this.snapshot,
      state: 'holding',
      phase: 'hold',
    });
    this.events.emit('performance:held', this.getPerformanceSnapshot());
    return true;
  }

  public releasePerformance(
    requestId: string,
    reason: PerformanceReleaseReason,
  ): boolean {
    if (this.disposed || requestId !== this.snapshot.requestId) return false;
    this.port.releaseAnimation(reason);
    this.port.setPerformanceFacingTarget(undefined);
    this.activeBinding = undefined;
    this.snapshot = this.withEvent({
      ...this.snapshot,
      state: 'gameplay',
      phase: 'release',
      releaseReason: reason,
    });
    const released = this.getPerformanceSnapshot();
    this.events.emit('performance:released', released);
    this.snapshot = {
      ...this.makeGameplaySnapshot(),
      generation: released.generation,
      eventSequence: released.eventSequence,
      releaseReason: reason,
    };
    return true;
  }

  public restorePerformance(token: CinematicPerformanceRestoreToken): boolean {
    if (this.disposed || token.participantId !== this.participantId)
      return false;
    const state = this.tokens.get(token.tokenId);
    if (state === undefined) return false;
    this.tokens.delete(token.tokenId);
    this.snapshot = { ...this.snapshot, state: 'restoring' };
    this.port.restoreGameplayState(state);
    this.activeBinding = undefined;
    this.snapshot = this.withEvent({
      ...this.makeGameplaySnapshot(),
      generation: this.snapshot.generation,
      restoreGeneration: this.snapshot.restoreGeneration + 1,
    });
    this.events.emit('performance:restored', this.getPerformanceSnapshot());
    return true;
  }

  public getPerformanceSnapshot(): CinematicPerformanceSnapshot {
    return { ...this.snapshot };
  }

  public dispose(): void {
    if (this.disposed) return;
    const activeRequest = this.snapshot.requestId;
    if (activeRequest) this.releasePerformance(activeRequest, 'disposed');
    this.disposed = true;
    this.tokens.clear();
    this.activeBinding = undefined;
    this.events.clear();
    this.snapshot = { ...this.makeGameplaySnapshot(), state: 'disposed' };
  }

  private makeGameplaySnapshot(): CinematicPerformanceSnapshot {
    return {
      participantId: this.participantId,
      profileId: this.profile.profileId,
      state: 'gameplay',
      requestId: null,
      cueId: null,
      shotId: null,
      requestedIntent: null,
      resolvedAnimationId: null,
      resolution: null,
      phase: null,
      priority: null,
      generation: this.snapshot?.generation ?? 0,
      targetParticipantId: null,
      targetMarkId: null,
      releaseReason: null,
      restoreGeneration: this.snapshot?.restoreGeneration ?? 0,
      eventSequence: this.snapshot?.eventSequence ?? 0,
      actionOwnerCount: this.port.getActionOwnerCount(),
      mixerOwnerCount: this.port.getMixerOwnerCount(),
    };
  }

  private withEvent(
    snapshot: CinematicPerformanceSnapshot,
  ): CinematicPerformanceSnapshot {
    return {
      ...snapshot,
      eventSequence: snapshot.eventSequence + 1,
      actionOwnerCount: this.port.getActionOwnerCount(),
      mixerOwnerCount: this.port.getMixerOwnerCount(),
    };
  }

  private emitFailure(reason: CinematicPerformanceFailureReason): void {
    this.snapshot = this.withEvent(this.snapshot);
    this.events.emit('performance:failed', {
      ...this.getPerformanceSnapshot(),
      failureReason: reason,
    });
  }
}

function failure(
  reason: CinematicPerformanceFailureReason,
): CinematicPerformancePreflight {
  return {
    ok: false,
    reason,
    resolvedAnimationId: null,
    resolution: null,
  };
}

function isValidRequest(request: CinematicPerformanceRequest): boolean {
  return Boolean(
    request.requestId.trim() &&
    request.cueId.trim() &&
    request.shotId.trim() &&
    cinematicPerformanceIntents.includes(request.intent) &&
    (request.targetFacingYaw === undefined ||
      Number.isFinite(request.targetFacingYaw)),
  );
}

export interface CinematicPerformanceOwner {
  readonly participantId: string;
  readonly performanceEvents: EventBus<CinematicPerformanceEvents>;
  preflightPerformance(
    request: CinematicPerformanceRequest,
  ): CinematicPerformancePreflight;
  capturePerformanceState(): CinematicPerformanceRestoreToken;
  startPerformance(
    request: CinematicPerformanceRequest,
  ): CinematicPerformancePreflight;
  holdPerformance(requestId: string): boolean;
  releasePerformance(
    requestId: string,
    reason: PerformanceReleaseReason,
  ): boolean;
  restorePerformance(token: CinematicPerformanceRestoreToken): boolean;
  getPerformanceSnapshot(): CinematicPerformanceSnapshot;
}
