import { MathUtils, Vector3 } from 'three';
import type { WorldPose } from '../world/Spatial';
import type { CameraShoulderSide } from './CameraPreferences';

export type ConversationCameraProfileId = 'default' | 'close' | 'wide';

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
}

export interface ConversationFramingPose {
  readonly position: Vector3;
  readonly lookAt: Vector3;
}

const profiles: Readonly<
  Record<ConversationCameraProfileId, ConversationCameraProfile>
> = Object.freeze({
  default: Object.freeze({
    id: 'default',
    focusHeight: 1.35,
    baseDistance: 3,
    separationScale: 0.35,
    minDistance: 3,
    maxDistance: 6,
    elevation: 1.1,
    narrowAspectMaxScale: 1.7,
  }),
  close: Object.freeze({
    id: 'close',
    focusHeight: 1.35,
    baseDistance: 2.7,
    separationScale: 0.3,
    minDistance: 2.8,
    maxDistance: 5.2,
    elevation: 1,
    narrowAspectMaxScale: 1.8,
    fieldOfView: 46,
  }),
  wide: Object.freeze({
    id: 'wide',
    focusHeight: 1.35,
    baseDistance: 3.5,
    separationScale: 0.4,
    minDistance: 3.5,
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

/** Pure, translation-invariant two-shot framing from the live participants. */
export function calculateConversationFraming(
  playerPose: WorldPose,
  npcPose: WorldPose,
  profile: ConversationCameraProfile,
  shoulderSide: CameraShoulderSide,
  viewportAspect = 16 / 9,
): ConversationFramingPose {
  const playerFocus = asVector(playerPose.position).add(
    new Vector3(0, profile.focusHeight, 0),
  );
  const npcFocus = asVector(npcPose.position).add(
    new Vector3(0, profile.focusHeight, 0),
  );
  const lookAt = new Vector3().lerpVectors(playerFocus, npcFocus, 0.5);
  const participantAxis = npcFocus.clone().sub(playerFocus);
  participantAxis.y = 0;
  const separation = participantAxis.length();
  if (separation < 1e-6) {
    participantAxis.copy(asVector(playerPose.forward));
    participantAxis.y = 0;
  }
  if (participantAxis.lengthSq() < 1e-12) participantAxis.set(0, 0, 1);
  participantAxis.normalize();
  const sideSign = shoulderSide === 'right' ? 1 : -1;
  const side = new Vector3(
    -participantAxis.z,
    0,
    participantAxis.x,
  ).multiplyScalar(sideSign);
  const profileDistance = MathUtils.clamp(
    profile.baseDistance + Math.max(0.5, separation) * profile.separationScale,
    profile.minDistance,
    profile.maxDistance,
  );
  const safeAspect =
    Number.isFinite(viewportAspect) && viewportAspect > 0
      ? viewportAspect
      : 16 / 9;
  const distance =
    profileDistance *
    MathUtils.clamp(1 / safeAspect, 1, profile.narrowAspectMaxScale);
  return {
    lookAt,
    position: lookAt
      .clone()
      .addScaledVector(side, distance)
      .add(new Vector3(0, profile.elevation, 0)),
  };
}

function asVector(value: {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}): Vector3 {
  return new Vector3(value.x, value.y, value.z);
}
