import type {
  CinematicBlockingRequest,
  CinematicCompletionResult,
  CinematicDestinationRequest,
  CinematicLandingTransaction,
  CinematicPathRequest,
  CinematicPerformanceRequest,
  CinematicShotDefinition,
} from './CinematicDefinition';
import type { WorldPosition } from '../world/Spatial';

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

export interface CinematicResolvedBlocking {
  readonly participantId: string;
  readonly markId: string;
  readonly requestedPosition: WorldPosition;
  readonly resolvedPosition: WorldPosition;
  readonly displacementMetres: number;
  readonly clearanceMetres: number;
  readonly grounded: boolean;
  readonly groundColliderId: string;
  readonly facingParticipantId?: string;
}

export type CinematicBlockingPreflight =
  | {
      readonly ready: true;
      readonly resolved: readonly CinematicResolvedBlocking[];
    }
  | { readonly ready: false; readonly reason: string };

export interface CinematicStagingAdapter {
  preflightBlocking(
    requests: readonly CinematicBlockingRequest[],
  ): CinematicBlockingPreflight;
  stageBlocking(resolved: readonly CinematicResolvedBlocking[]): void;
}

export interface CinematicCompositionSubject {
  readonly participantId: string;
  readonly screenX: number;
  readonly screenY: number;
  readonly headScreenY: number;
  readonly marginPercent: number;
  readonly inFront: boolean;
  readonly occluded: boolean;
  readonly blockerId?: string;
}

export interface CinematicCompositionVisual {
  readonly visualId: string;
  readonly screenX: number;
  readonly screenY: number;
  readonly marginPercent: number;
  readonly inFront: boolean;
  readonly occluded: boolean;
  readonly blockerId?: string;
}

export type CinematicCompositionPreflight =
  | {
      readonly ready: true;
      readonly selectedCameraAnchorId: string;
      readonly selectedFieldOfView: number;
      readonly usedAlternate: boolean;
      readonly subjects: readonly CinematicCompositionSubject[];
      readonly visuals: readonly CinematicCompositionVisual[];
    }
  | { readonly ready: false; readonly reason: string };

export interface CinematicCompositionAdapter {
  preflightShot(
    shot: CinematicShotDefinition,
    resolved: readonly CinematicResolvedBlocking[],
  ): CinematicCompositionPreflight;
  preflightDestinationShot?(
    destination: CinematicDestinationRequest,
    shot: CinematicShotDefinition,
  ): CinematicCompositionPreflight;
}

export interface CinematicPathHandle {
  update(deltaSeconds: number): void;
  pause(): void;
  resume(): void;
  release(reason: CinematicPerformanceReleaseReason): void;
}

export interface CinematicSceneAdapter {
  preflightPath(request: CinematicPathRequest): CinematicPreflightResult;
  requestPath(request: CinematicPathRequest): CinematicPathHandle;
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

export interface CinematicDestinationCommitContext {
  /** Registers external restoration before that owner is mutated. */
  onRollback(operation: () => void | Promise<void>): void;
}

/** Owns travel, level readiness, grounding, and destination-world validation. */
export interface CinematicDestinationAdapter {
  preflightDestination(
    request: CinematicDestinationRequest,
  ): CinematicPreflightResult;
  requestDestination(
    request: CinematicDestinationRequest,
    commitLanding?: (context: CinematicDestinationCommitContext) => void,
  ): CinematicDestinationHandle;
}

export interface CinematicLandingCommitContext {
  readonly cinematicId: string;
  readonly result: Extract<
    CinematicCompletionResult,
    'completed' | 'skipped' | 'failed'
  >;
  /** Present while committing inside an authoritative level transaction. */
  readonly onRollback?: CinematicDestinationCommitContext['onRollback'];
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
  readonly staging?: CinematicStagingAdapter;
  readonly composition?: CinematicCompositionAdapter;
  readonly scene?: CinematicSceneAdapter;
  readonly destination?: CinematicDestinationAdapter;
  readonly landing?: CinematicLandingAdapter;
}
