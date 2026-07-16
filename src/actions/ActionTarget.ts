import type { CharacterActionName } from '../characters/CharacterActions';
import type { WorldPose } from '../world/Spatial';

export interface CompletedCharacterAction {
  readonly action: CharacterActionName;
  readonly source: string | undefined;
  readonly sequence: number;
}

export interface ActionTargetRange {
  readonly maxDistance: number;
  readonly minimumFacingDot: number;
}

export interface ActionTargetEvaluation {
  readonly distance: number;
  readonly facingDot: number;
  readonly eligible: boolean;
}

/** Gameplay contract for stationary or dynamic presentation-only responders. */
export interface CharacterActionTarget {
  readonly id: string;
  readonly enabled: boolean;
  getWorldPose(): WorldPose;
  receiveAction(action: CompletedCharacterAction): boolean;
  reset(): void;
}

export function isStrikeAction(
  action: CharacterActionName,
): action is 'punchLeft' | 'punchRight' | 'kickLeft' | 'kickRight' {
  return action.startsWith('punch') || action.startsWith('kick');
}

export function evaluateActionTarget(
  actor: WorldPose,
  target: WorldPose,
  range: ActionTargetRange,
): ActionTargetEvaluation {
  const dx = target.position.x - actor.position.x;
  const dz = target.position.z - actor.position.z;
  const distance = Math.hypot(dx, dz);
  const facingDot =
    distance <= 1e-6
      ? 1
      : (actor.forward.x * dx + actor.forward.z * dz) / distance;
  return {
    distance,
    facingDot,
    eligible:
      distance <= range.maxDistance && facingDot >= range.minimumFacingDot,
  };
}
