import { MathUtils, Vector3 } from 'three';
import type { WorldPose } from '../world/Spatial';
import type { CameraShoulderSide } from './CameraPreferences';

export type ConversationCameraProfileId = 'default' | 'close' | 'wide';

export type ConversationFramingFallbackReason =
  | 'none'
  | 'near-facing-stabilized'
  | 'coincident-facing-axis'
  | 'coincident-player-facing'
  | 'coincident-npc-facing'
  | 'coincident-world-forward';

export type ConversationSafeFrameStatus =
  'inside' | 'distance-clamped' | 'obstruction-constrained' | 'unavailable';

export interface ConversationCameraProfile {
  readonly id: ConversationCameraProfileId;
  readonly focusHeight: number;
  readonly baseDistance: number;
  readonly separationScale: number;
  readonly minDistance: number;
  readonly maxDistance: number;
  readonly elevation: number;
  readonly narrowAspectMaxScale: number;
  readonly fieldOfView?: number;
  readonly participantRadius: number;
  readonly participantHalfHeight: number;
  readonly stableAxisSeparation: number;
  readonly nearSeparation: number;
  readonly overShoulderAngle: number;
  readonly minimumCameraBackoff: number;
  readonly safeFrameFraction: number;
  readonly minPitch: number;
  readonly maxPitch: number;
}

export interface ConversationFramingDiagnostics {
  readonly participantSeparation: number;
  readonly chosenSide: CameraShoulderSide;
  readonly fallbackReason: ConversationFramingFallbackReason;
  readonly safeFrameStatus: ConversationSafeFrameStatus;
  readonly requiredDistance: number;
  readonly cameraDistance: number;
  readonly pitch: number;
  readonly nearDistance: boolean;
}

export interface ConversationFramingPose {
  readonly position: Vector3;
  readonly lookAt: Vector3;
  readonly diagnostics: ConversationFramingDiagnostics;
}

const standardPolicy = Object.freeze({
  participantRadius: 0.44,
  participantHalfHeight: 1.05,
  stableAxisSeparation: 0.65,
  nearSeparation: 1.15,
  overShoulderAngle: MathUtils.degToRad(12),
  minimumCameraBackoff: 2.35,
  safeFrameFraction: 0.82,
  minPitch: MathUtils.degToRad(8),
  maxPitch: MathUtils.degToRad(17),
});

const profiles: Readonly<
  Record<ConversationCameraProfileId, ConversationCameraProfile>
> = Object.freeze({
  default: Object.freeze({
    ...standardPolicy,
    id: 'default',
    focusHeight: 1.25,
    baseDistance: 3,
    separationScale: 0.35,
    minDistance: 2.8,
    maxDistance: 6,
    elevation: 1.1,
    narrowAspectMaxScale: 1.7,
  }),
  close: Object.freeze({
    ...standardPolicy,
    id: 'close',
    focusHeight: 1.25,
    baseDistance: 2.7,
    separationScale: 0.3,
    minDistance: 2.65,
    maxDistance: 5.2,
    elevation: 1,
    narrowAspectMaxScale: 1.8,
    fieldOfView: 46,
  }),
  wide: Object.freeze({
    ...standardPolicy,
    id: 'wide',
    focusHeight: 1.3,
    baseDistance: 3.5,
    separationScale: 0.4,
    minDistance: 3.35,
    maxDistance: 6.5,
    elevation: 1.2,
    narrowAspectMaxScale: 1.55,
    fieldOfView: 54,
  }),
});

export function isConversationCameraProfileId(
  value: string,
): value is ConversationCameraProfileId {
  return Object.hasOwn(profiles, value);
}

export function resolveConversationCameraProfile(
  id?: ConversationCameraProfileId,
): ConversationCameraProfile {
  return profiles[id ?? 'default'];
}

/**
 * Standard translation-invariant conversation composition. The position axis
 * remains authoritative; participant facing only stabilizes nearly coincident
 * poses where tiny positional changes otherwise produce large camera swings.
 */
export function calculateConversationFraming(
  playerPose: WorldPose,
  npcPose: WorldPose,
  profile: ConversationCameraProfile,
  shoulderSide: CameraShoulderSide,
  viewportAspect = 16 / 9,
  verticalFieldOfView = profile.fieldOfView ?? 50,
): ConversationFramingPose {
  const playerFocus = asVector(playerPose.position).add(
    new Vector3(0, profile.focusHeight, 0),
  );
  const npcFocus = asVector(npcPose.position).add(
    new Vector3(0, profile.focusHeight, 0),
  );
  const lookAt = new Vector3().lerpVectors(playerFocus, npcFocus, 0.5);
  const positionAxis = npcFocus.clone().sub(playerFocus);
  positionAxis.y = 0;
  const separation = positionAxis.length();
  const axisResolution = resolveParticipantAxis(
    positionAxis,
    separation,
    playerPose,
    npcPose,
    profile.stableAxisSeparation,
  );
  const participantAxis = axisResolution.axis;
  const sideSign = shoulderSide === 'right' ? 1 : -1;
  const side = new Vector3(
    -participantAxis.z,
    0,
    participantAxis.x,
  ).multiplyScalar(sideSign);
  const horizontalDirection = side
    .multiplyScalar(Math.cos(profile.overShoulderAngle))
    .addScaledVector(participantAxis, -Math.sin(profile.overShoulderAngle))
    .normalize();

  const safeAspect =
    Number.isFinite(viewportAspect) && viewportAspect > 0
      ? viewportAspect
      : 16 / 9;
  const safeFov = MathUtils.clamp(
    Number.isFinite(verticalFieldOfView) ? verticalFieldOfView : 50,
    15,
    120,
  );
  const safeFrameDistance = calculateSafeFrameDistance(
    separation,
    safeAspect,
    safeFov,
    profile,
  );
  const profileDistance = MathUtils.clamp(
    profile.baseDistance + separation * profile.separationScale,
    profile.minDistance,
    profile.maxDistance,
  );
  const narrowScale = MathUtils.clamp(
    1 / safeAspect,
    1,
    profile.narrowAspectMaxScale,
  );
  const maximumDistance = profile.maxDistance * narrowScale;
  const requiredDistance = Math.max(
    profile.minimumCameraBackoff,
    profileDistance,
    safeFrameDistance,
  );
  const distance = Math.min(requiredDistance, maximumDistance);
  const unclampedPitch = Math.atan2(profile.elevation, distance);
  const pitch = MathUtils.clamp(
    unclampedPitch,
    profile.minPitch,
    profile.maxPitch,
  );
  const elevation = Math.tan(pitch) * distance;

  return {
    lookAt,
    position: lookAt
      .clone()
      .addScaledVector(horizontalDirection, distance)
      .add(new Vector3(0, elevation, 0)),
    diagnostics: {
      participantSeparation: separation,
      chosenSide: shoulderSide,
      fallbackReason: axisResolution.fallbackReason,
      safeFrameStatus:
        requiredDistance <= maximumDistance + 1e-6
          ? 'inside'
          : 'distance-clamped',
      requiredDistance,
      cameraDistance: distance,
      pitch,
      nearDistance: separation < profile.nearSeparation,
    },
  };
}

function calculateSafeFrameDistance(
  separation: number,
  aspect: number,
  verticalFieldOfView: number,
  profile: ConversationCameraProfile,
): number {
  const verticalHalfAngle = MathUtils.degToRad(verticalFieldOfView / 2);
  const horizontalHalfAngle = Math.atan(Math.tan(verticalHalfAngle) * aspect);
  const horizontalExtent =
    (separation / 2) * Math.cos(profile.overShoulderAngle) +
    profile.participantRadius;
  const horizontalTangent =
    Math.tan(horizontalHalfAngle) * profile.safeFrameFraction;
  const verticalTangent =
    Math.tan(verticalHalfAngle) * profile.safeFrameFraction;
  return Math.max(
    horizontalExtent / Math.max(horizontalTangent, 1e-3),
    profile.participantHalfHeight / Math.max(verticalTangent, 1e-3),
  );
}

function resolveParticipantAxis(
  positionAxis: Vector3,
  separation: number,
  playerPose: WorldPose,
  npcPose: WorldPose,
  stableAxisSeparation: number,
): {
  readonly axis: Vector3;
  readonly fallbackReason: ConversationFramingFallbackReason;
} {
  const positionDirection =
    separation > 1e-6 ? positionAxis.clone().normalize() : undefined;
  const playerForward = horizontalDirection(playerPose.forward);
  const npcForward = horizontalDirection(npcPose.forward);
  const facingAxis =
    playerForward && npcForward
      ? playerForward.clone().sub(npcForward)
      : undefined;
  if (facingAxis && facingAxis.lengthSq() > 1e-8) facingAxis.normalize();
  else facingAxis?.set(0, 0, 0);

  if (positionDirection && separation >= stableAxisSeparation) {
    return { axis: positionDirection, fallbackReason: 'none' };
  }
  if (positionDirection && facingAxis && facingAxis.lengthSq() > 0) {
    if (facingAxis.dot(positionDirection) < 0) facingAxis.negate();
    const positionWeight = MathUtils.smoothstep(
      separation,
      0.05,
      stableAxisSeparation,
    );
    return {
      axis: facingAxis
        .multiplyScalar(1 - positionWeight)
        .addScaledVector(positionDirection, positionWeight)
        .normalize(),
      fallbackReason: 'near-facing-stabilized',
    };
  }
  if (facingAxis && facingAxis.lengthSq() > 0) {
    return { axis: facingAxis, fallbackReason: 'coincident-facing-axis' };
  }
  if (positionDirection) {
    return { axis: positionDirection, fallbackReason: 'none' };
  }
  if (playerForward) {
    return {
      axis: playerForward,
      fallbackReason: 'coincident-player-facing',
    };
  }
  if (npcForward) {
    return {
      axis: npcForward.negate(),
      fallbackReason: 'coincident-npc-facing',
    };
  }
  return {
    axis: new Vector3(0, 0, 1),
    fallbackReason: 'coincident-world-forward',
  };
}

function horizontalDirection(value: {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}): Vector3 | undefined {
  const result = asVector(value);
  result.y = 0;
  if (!result.toArray().every(Number.isFinite) || result.lengthSq() < 1e-8) {
    return undefined;
  }
  return result.normalize();
}

function asVector(value: {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}): Vector3 {
  return new Vector3(value.x, value.y, value.z);
}
