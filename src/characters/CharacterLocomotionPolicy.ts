import { AnimationClip } from 'three';
import type { KeyframeTrack } from 'three';
import type { CharacterActionName } from './CharacterActions';
import type { EquipmentDefinition } from '../equipment/EquipmentDefinition';
import type { PlayerMovementState } from '../player/PlayerMovement';

export type CharacterActionLayer = 'none' | 'full-body' | 'upper-body';

export interface CharacterLocomotionPolicyInput {
  readonly movement: PlayerMovementState;
  readonly action?: CharacterActionName;
  readonly equipment?: EquipmentDefinition;
  readonly depleted: boolean;
}

export interface CharacterLocomotionPolicy {
  readonly baseClip: string | undefined;
  readonly baseLayer: 'full-body' | 'lower-body';
  readonly stanceOverlayClip: string | undefined;
  readonly actionLayer: CharacterActionLayer;
}

export interface CharacterLocomotionSnapshot {
  readonly movement: PlayerMovementState;
  readonly horizontalSpeed: number;
  readonly baseClip: string | undefined;
  readonly baseLayer: 'full-body' | 'lower-body';
  readonly stanceOverlayClip: string | undefined;
  readonly actionClip: CharacterActionName | undefined;
  readonly actionLayer: CharacterActionLayer;
  readonly transitionSequence: number;
}

/**
 * One gameplay-facing animation policy. Firearm recoil is the only currently
 * reviewed upper-body action; every other action retains the full-body lock.
 */
export function resolveCharacterLocomotionPolicy(
  input: CharacterLocomotionPolicyInput,
): CharacterLocomotionPolicy {
  if (input.depleted) {
    return {
      baseClip: undefined,
      baseLayer: 'full-body',
      stanceOverlayClip: undefined,
      actionLayer: 'full-body',
    };
  }

  const firearmEquipped = input.equipment?.id === 'handgun';
  const layeredFirearmLocomotion =
    firearmEquipped &&
    (input.movement === 'idle' ||
      input.movement === 'walking' ||
      input.movement === 'running');
  const actionLayer = !input.action
    ? 'none'
    : input.action === 'gunFire' && firearmEquipped
      ? 'upper-body'
      : 'full-body';
  const baseClip =
    actionLayer === 'full-body'
      ? undefined
      : resolveBaseClip(input.movement, input.equipment);
  return {
    baseClip,
    baseLayer: layeredFirearmLocomotion ? 'lower-body' : 'full-body',
    // There is no reviewed gun-walk clip. Preserve the authored Walk legs and
    // layer the inspected Idle_Gun upper body instead.
    stanceOverlayClip:
      !input.action && layeredFirearmLocomotion
        ? input.equipment?.idleAnimation
        : undefined,
    actionLayer,
  };
}

/** Keeps firearm overlays away from the pelvis and legs that own the gait. */
export function createUpperBodyAnimationClip(
  source: AnimationClip,
): AnimationClip {
  const tracks = source.tracks
    .filter((track) => isUpperBodyTrack(track))
    .map((track) => track.clone());
  return new AnimationClip(
    `${source.name}__upper-body`,
    source.duration,
    tracks,
  );
}

export function createLowerBodyAnimationClip(
  source: AnimationClip,
): AnimationClip {
  const tracks = source.tracks
    .filter((track) => !isUpperBodyTrack(track))
    .map((track) => track.clone());
  return new AnimationClip(
    `${source.name}__lower-body`,
    source.duration,
    tracks,
  );
}

function resolveBaseClip(
  movement: PlayerMovementState,
  equipment?: EquipmentDefinition,
): string {
  switch (movement) {
    case 'idle':
      return equipment?.idleAnimation ?? 'idle';
    case 'walking':
      return 'walk';
    case 'running':
      return equipment?.runAnimation ?? 'run';
    case 'airborne':
      return 'airborne';
    case 'landing':
      return 'landing';
  }
}

function isUpperBodyTrack(track: KeyframeTrack): boolean {
  const target = track.name.split('.')[0] ?? '';
  return /^(Torso|Chest|Neck|Head|Shoulder|UpperArm|LowerArm|Wrist|Palm|Index|Middle|Ring|Pinky|Thumb)/.test(
    target,
  );
}
