import type { CharacterActionName } from '../characters/CharacterActions';
import type { WorldPose, WorldPosition } from '../world/Spatial';

export interface CharacterActionImpact {
  readonly action: CharacterActionName;
  readonly source: string | undefined;
  readonly sequence: number;
  readonly normalizedTime: number;
}

export interface StrikeVolume {
  /** Distance from the actor origin to the start of the forward sweep. */
  readonly forwardOffset: number;
  /** Length of the forward sweep, before either volume radius is applied. */
  readonly horizontalReach: number;
  readonly radius: number;
  readonly minimumY: number;
  readonly maximumY: number;
}

export interface HurtVolume {
  readonly radius: number;
  readonly height: number;
}

export interface ActionTargetVolumeContract {
  readonly punch: StrikeVolume;
  readonly kick: StrikeVolume;
  readonly hurt: HurtVolume;
  readonly minimumFacingDot: number;
}

export type ActionTargetRejectionReason =
  'disabled' | 'target-busy' | 'not-facing' | 'out-of-range' | 'vertical-miss';

export interface ActionTargetEvaluation {
  readonly actionKind: 'punch' | 'kick';
  readonly distance: number;
  readonly facingDot: number;
  readonly facing: boolean;
  readonly attackStart: WorldPosition;
  readonly attackEnd: WorldPosition;
  readonly closestContact: WorldPosition;
  readonly horizontalSeparation: number;
  readonly combinedRadius: number;
  /** Positive for a miss, zero at tangency, negative for penetration. */
  readonly horizontalGap: number;
  readonly horizontalContact: boolean;
  readonly attackMinimumY: number;
  readonly attackMaximumY: number;
  readonly targetMinimumY: number;
  readonly targetMaximumY: number;
  readonly verticalOverlap: number;
  readonly verticalContact: boolean;
  readonly enabled: boolean;
  readonly targetBusy: boolean;
  readonly eligible: boolean;
  readonly rejectionReason: ActionTargetRejectionReason | undefined;
}

/** Gameplay contract for stationary or dynamic presentation-only responders. */
export interface CharacterActionTarget {
  readonly id: string;
  readonly enabled: boolean;
  getWorldPose(): WorldPose;
  receiveActionImpact(impact: CharacterActionImpact): boolean;
  reset(): void;
}

export function isStrikeAction(
  action: CharacterActionName,
): action is 'punchLeft' | 'punchRight' | 'kickLeft' | 'kickRight' {
  return action.startsWith('punch') || action.startsWith('kick');
}

/**
 * Evaluates an impact-time forward sweep against a stationary vertical hurt
 * cylinder. The world transforms are read-only; presentation never repairs
 * contact by moving either simulation origin.
 */
export function evaluateActionTarget(
  actor: WorldPose,
  target: WorldPose,
  action: 'punchLeft' | 'punchRight' | 'kickLeft' | 'kickRight',
  contract: ActionTargetVolumeContract,
  state: { readonly enabled: boolean; readonly targetBusy: boolean },
): ActionTargetEvaluation {
  const actionKind = action.startsWith('punch') ? 'punch' : 'kick';
  const attack = contract[actionKind];
  const forwardLength = Math.hypot(actor.forward.x, actor.forward.z);
  const forwardX = forwardLength > 1e-6 ? actor.forward.x / forwardLength : 0;
  const forwardZ = forwardLength > 1e-6 ? actor.forward.z / forwardLength : 1;
  const dx = target.position.x - actor.position.x;
  const dz = target.position.z - actor.position.z;
  const distance = Math.hypot(dx, dz);
  const facingDot =
    distance <= 1e-6 ? 1 : (forwardX * dx + forwardZ * dz) / distance;
  const facing = facingDot >= contract.minimumFacingDot;
  const startX = actor.position.x + forwardX * attack.forwardOffset;
  const startZ = actor.position.z + forwardZ * attack.forwardOffset;
  const endX = startX + forwardX * attack.horizontalReach;
  const endZ = startZ + forwardZ * attack.horizontalReach;
  const segmentX = endX - startX;
  const segmentZ = endZ - startZ;
  const segmentLengthSquared = segmentX * segmentX + segmentZ * segmentZ;
  const projection =
    segmentLengthSquared <= 1e-9
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((target.position.x - startX) * segmentX +
              (target.position.z - startZ) * segmentZ) /
              segmentLengthSquared,
          ),
        );
  const closestX = startX + segmentX * projection;
  const closestZ = startZ + segmentZ * projection;
  const horizontalSeparation = Math.hypot(
    target.position.x - closestX,
    target.position.z - closestZ,
  );
  const combinedRadius = attack.radius + contract.hurt.radius;
  const horizontalGap = horizontalSeparation - combinedRadius;
  const horizontalContact = horizontalGap <= 0;
  const attackMinimumY = actor.position.y + attack.minimumY;
  const attackMaximumY = actor.position.y + attack.maximumY;
  const targetMinimumY = target.position.y;
  const targetMaximumY = target.position.y + contract.hurt.height;
  const verticalOverlap = Math.max(
    0,
    Math.min(attackMaximumY, targetMaximumY) -
      Math.max(attackMinimumY, targetMinimumY),
  );
  const verticalContact = verticalOverlap > 0;
  const rejectionReason = !state.enabled
    ? 'disabled'
    : state.targetBusy
      ? 'target-busy'
      : !facing
        ? 'not-facing'
        : !horizontalContact
          ? 'out-of-range'
          : !verticalContact
            ? 'vertical-miss'
            : undefined;
  return {
    actionKind,
    distance,
    facingDot,
    facing,
    attackStart: { x: startX, y: attackMinimumY, z: startZ },
    attackEnd: { x: endX, y: attackMaximumY, z: endZ },
    closestContact: {
      x: closestX,
      y: Math.max(attackMinimumY, targetMinimumY),
      z: closestZ,
    },
    horizontalSeparation,
    combinedRadius,
    horizontalGap,
    horizontalContact,
    attackMinimumY,
    attackMaximumY,
    targetMinimumY,
    targetMaximumY,
    verticalOverlap,
    verticalContact,
    enabled: state.enabled,
    targetBusy: state.targetBusy,
    eligible: rejectionReason === undefined,
    rejectionReason,
  };
}
