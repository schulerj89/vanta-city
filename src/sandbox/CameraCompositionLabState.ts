import type { ConversationCameraProfileId } from '../camera/ConversationCameraProfile';
import type { CameraShoulderSide } from '../camera/CameraPreferences';
import { npcDefinitions } from '../npcs/npcs';

export type CameraLabNpcId = 'mack' | 'nox' | 'raze';
export type CameraLabApproachSide = 'left' | 'right' | 'front' | 'back';
export type CameraLabViewportPreset =
  'responsive' | 'desktop' | 'mobile' | 'short';
export type CameraLabPresetId =
  'default' | 'nox-alley' | 'narrow-mobile' | 'restoration';

export interface CameraLabPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
}

export interface CameraLabObstruction {
  readonly enabled: boolean;
  readonly position: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly yaw: number;
}

export interface CameraCompositionLabState {
  readonly preset: CameraLabPresetId;
  readonly npcId: CameraLabNpcId;
  readonly profileId: ConversationCameraProfileId;
  readonly player: CameraLabPose;
  readonly npc: CameraLabPose;
  readonly spacing: number;
  readonly approachSide: CameraLabApproachSide;
  readonly shoulder: CameraShoulderSide;
  readonly viewport: CameraLabViewportPreset;
  readonly authoredAnchor: boolean;
  readonly obstruction: CameraLabObstruction;
  readonly cameraRequested: boolean;
}

export const cameraLabNpcProfiles: Readonly<
  Record<CameraLabNpcId, ConversationCameraProfileId>
> = Object.freeze({
  mack: profileFor('mack'),
  nox: profileFor('nox'),
  raze: profileFor('raze'),
});

const defaultObstruction: CameraLabObstruction = Object.freeze({
  enabled: false,
  position: [0, 1.6, 2.1] as const,
  size: [3.6, 3.2, 0.45] as const,
  yaw: 0,
});

const presets: Readonly<Record<CameraLabPresetId, CameraCompositionLabState>> =
  Object.freeze({
    default: fixture({ preset: 'default' }),
    'nox-alley': fixture({
      preset: 'nox-alley',
      npcId: 'nox',
      profileId: 'default',
      player: { x: -1.5, y: 0, z: 0, yaw: Math.PI / 2 },
      npc: { x: 1.5, y: 0, z: 0, yaw: -Math.PI / 2 },
      spacing: 3,
      obstruction: {
        enabled: true,
        position: [0, 1.6, 2.1],
        size: [3.6, 3.2, 0.45],
        yaw: 0,
      },
    }),
    'narrow-mobile': fixture({
      preset: 'narrow-mobile',
      viewport: 'mobile',
      npcId: 'raze',
      profileId: 'wide',
    }),
    restoration: fixture({
      preset: 'restoration',
      cameraRequested: false,
      shoulder: 'left',
    }),
  });

export function createCameraLabPreset(
  id: CameraLabPresetId = 'default',
): CameraCompositionLabState {
  return structuredClone(presets[id]);
}

export function positionPlayerForApproach(
  npc: CameraLabPose,
  spacing: number,
  side: CameraLabApproachSide,
): CameraLabPose {
  const distance = Math.max(0.5, spacing);
  const offsets: Record<CameraLabApproachSide, readonly [number, number]> = {
    left: [-distance, 0],
    right: [distance, 0],
    front: [0, distance],
    back: [0, -distance],
  };
  const [x, z] = offsets[side];
  return {
    x: npc.x + x,
    y: npc.y,
    z: npc.z + z,
    yaw: Math.atan2(-x, -z),
  };
}

function fixture(
  update: Partial<CameraCompositionLabState>,
): CameraCompositionLabState {
  return {
    preset: 'default',
    npcId: 'mack',
    profileId: 'close',
    player: { x: -1.5, y: 0, z: 0, yaw: Math.PI / 2 },
    npc: { x: 1.5, y: 0, z: 0, yaw: -Math.PI / 2 },
    spacing: 3,
    approachSide: 'left',
    shoulder: 'right',
    viewport: 'responsive',
    authoredAnchor: false,
    obstruction: defaultObstruction,
    cameraRequested: true,
    ...update,
  };
}

function profileFor(id: CameraLabNpcId): ConversationCameraProfileId {
  return (
    npcDefinitions.find((definition) => definition.id === id)
      ?.conversationCameraProfileId ?? 'default'
  );
}
