import type { GameState } from '../core/gameState';
import type { WorldPose, WorldPosition } from '../world/Spatial';

export interface InteractionAvailabilityContext {
  readonly gameState: GameState;
  readonly targetId: string;
}

export interface InteractionContext extends InteractionAvailabilityContext {
  readonly signal: AbortSignal;
}

export type InteractionAvailabilityPredicate = (
  context: InteractionAvailabilityContext,
) => boolean;

export interface Interactable {
  readonly id: string;
  readonly prompt: string;
  readonly location: WorldPosition | (() => WorldPosition);
  readonly range?: number;
  readonly priority?: number;
  readonly enabled?: boolean;
  readonly requiredStates?: readonly GameState[];
  readonly repeatable?: boolean;
  /** World-space height added to the location for the LOS endpoint. */
  readonly lineOfSightHeight?: number;
  /** Colliders belonging to this target, which must not occlude themselves. */
  readonly collisionIgnoreIds?: readonly string[];
  readonly isAvailable?: InteractionAvailabilityPredicate;
  interact(context: InteractionContext): void | Promise<void>;
}

export type InteractionCancelReason =
  | 'disabled'
  | 'game-state'
  | 'handler-error'
  | 'occluded'
  | 'out-of-range'
  | 'replaced'
  | 'system-disposed'
  | 'target-removed'
  | 'unavailable';

export interface InteractionTargetSummary {
  readonly id: string;
  readonly prompt: string;
}

export interface InteractionEvents {
  'interaction:target-changed': {
    readonly target: InteractionTargetSummary | undefined;
  };
  'interaction:started': { readonly target: InteractionTargetSummary };
  'interaction:completed': { readonly target: InteractionTargetSummary };
  'interaction:cancelled': {
    readonly target: InteractionTargetSummary;
    readonly reason: InteractionCancelReason;
    readonly error?: unknown;
  };
  'interaction:enabled': { readonly target: InteractionTargetSummary };
  'interaction:disabled': { readonly target: InteractionTargetSummary };
}

export interface InteractionCandidate {
  readonly target: InteractionTargetSummary;
  readonly location: WorldPosition;
  readonly distance: number;
  readonly facing: number;
  readonly visible: boolean;
  readonly blockerId: string | undefined;
  readonly score: number;
}

export interface InteractionDebugTarget {
  readonly id: string;
  readonly location: WorldPosition;
  readonly range: number;
  readonly available: boolean;
  readonly distance: number | undefined;
  readonly facing: number | undefined;
  readonly lineOfSight: 'clear' | 'blocked' | 'not-tested';
  readonly blockerId: string | undefined;
  readonly score: number | undefined;
  readonly rejectionReason:
    | 'behind'
    | 'completed'
    | 'disabled'
    | 'game-state'
    | 'no-player'
    | 'occluded'
    | 'out-of-range'
    | 'unavailable'
    | undefined;
}

export interface InteractionDebugSnapshot {
  readonly pose: WorldPose | undefined;
  readonly targets: readonly InteractionDebugTarget[];
  readonly candidates: readonly InteractionCandidate[];
  readonly selectedId: string | undefined;
  readonly challengerId: string | undefined;
  readonly selectionDecision:
    'none' | 'selected-best' | 'held-current' | 'switched';
  readonly switchScoreMargin: number;
}
