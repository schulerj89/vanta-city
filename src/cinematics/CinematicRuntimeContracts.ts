import type {
  CinematicCompletionResult,
  CinematicDestinationRequest,
  CinematicLandingTransaction,
  CinematicPerformanceRequest,
} from './CinematicDefinition';

export type CinematicPreflightResult =
  { readonly ready: true } | { readonly ready: false; readonly reason: string };

export interface CinematicPerformancePreflight {
  readonly ready: boolean;
  readonly reason?: string;
  readonly resolution?: 'exact' | 'neutral-fallback';
}

/** Opaque participant-owner state. It must never contain public Three.js objects. */
export type CinematicPerformanceRestoreToken = unknown;

export interface CinematicPerformanceHandle {
  readonly requestId: string;
  pause(): void;
  resume(): void;
  release(reason: CinematicPerformanceReleaseReason): void;
}

export type CinematicPerformanceReleaseReason =
  'shot-completed' | 'landing' | 'cancelled' | 'failed' | 'disposed';

/**
 * Public adapter implemented by participant owners. The coordinator never owns
 * mixers, clips, facing roots, movement, props, or loaded participant objects.
 */
export interface CinematicPerformanceAdapter {
  preflightPerformance(
    request: CinematicPerformanceRequest,
  ): CinematicPerformancePreflight;
  capturePerformanceState(
    participantId: string,
  ): CinematicPerformanceRestoreToken;
  requestPerformance(
    request: CinematicPerformanceRequest,
  ): CinematicPerformanceHandle;
  restorePerformance(
    participantId: string,
    token: CinematicPerformanceRestoreToken,
  ): void;
}

export type CinematicDestinationReadiness =
  | { readonly state: 'pending' }
  | { readonly state: 'ready' }
  | { readonly state: 'failed'; readonly reason: string };

export interface CinematicDestinationHandle {
  getReadiness(): CinematicDestinationReadiness;
  pause(): void;
  resume(): void;
  cancel(): void;
  dispose(): void;
}

/** Owns travel, level readiness, grounding, and destination-world validation. */
export interface CinematicDestinationAdapter {
  preflightDestination(
    request: CinematicDestinationRequest,
  ): CinematicPreflightResult;
  requestDestination(
    request: CinematicDestinationRequest,
  ): CinematicDestinationHandle;
}

export interface CinematicLandingCommitContext {
  readonly cinematicId: string;
  readonly result: Extract<
    CinematicCompletionResult,
    'completed' | 'skipped' | 'failed'
  >;
}

export interface CinematicLandingCommitResult {
  readonly committed: boolean;
  readonly reason?: string;
}

/** Sole cinematic seam to story-fact and mission-objective authorities. */
export interface CinematicLandingAdapter {
  preflightLanding(
    transaction: CinematicLandingTransaction,
  ): CinematicPreflightResult;
  commitLanding(
    transaction: CinematicLandingTransaction,
    context: CinematicLandingCommitContext,
  ): CinematicLandingCommitResult;
}

export interface CinematicRuntimeAdapters {
  readonly performances?: CinematicPerformanceAdapter;
  readonly destination?: CinematicDestinationAdapter;
  readonly landing?: CinematicLandingAdapter;
}
