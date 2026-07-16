import type { GameState } from '../core/gameState';

export interface WorldLocation {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface InteractionPose {
  readonly position: WorldLocation;
  readonly forward: WorldLocation;
}

export interface PlayerInteractionQuery {
  getInteractionPose(): InteractionPose | undefined;
}

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
  readonly location: WorldLocation | (() => WorldLocation);
  readonly range?: number;
  readonly priority?: number;
  readonly enabled?: boolean;
  readonly requiredStates?: readonly GameState[];
  readonly repeatable?: boolean;
  readonly isAvailable?: InteractionAvailabilityPredicate;
  interact(context: InteractionContext): void | Promise<void>;
}

export type InteractionCancelReason =
  | 'disabled'
  | 'game-state'
  | 'handler-error'
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

export interface InteractionVisibilityQuery {
  isVisible(
    from: WorldLocation,
    to: WorldLocation,
    target: Interactable,
  ): boolean;
}

export interface InteractionCandidate {
  readonly target: InteractionTargetSummary;
  readonly location: WorldLocation;
  readonly distance: number;
  readonly facing: number;
  readonly visible: boolean;
  readonly score: number;
}

export interface InteractionDebugTarget {
  readonly id: string;
  readonly location: WorldLocation;
  readonly range: number;
  readonly available: boolean;
}

export interface InteractionDebugSnapshot {
  readonly pose: InteractionPose | undefined;
  readonly targets: readonly InteractionDebugTarget[];
  readonly candidates: readonly InteractionCandidate[];
  readonly selectedId: string | undefined;
}
