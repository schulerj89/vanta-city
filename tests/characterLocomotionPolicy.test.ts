import { AnimationClip, QuaternionKeyframeTrack } from 'three';
import {
  createUpperBodyAnimationClip,
  createLowerBodyAnimationClip,
  resolveCharacterLocomotionPolicy,
} from '../src/characters/CharacterLocomotionPolicy';
import { equipmentById } from '../src/equipment/EquipmentDefinition';

describe('CharacterLocomotionPolicy', () => {
  const handgun = equipmentById.get('handgun')!;

  it('keeps reviewed firearm locomotion under an upper-body firing layer', () => {
    expect(
      resolveCharacterLocomotionPolicy({
        movement: 'walking',
        action: 'gunFire',
        equipment: handgun,
        depleted: false,
      }),
    ).toEqual({
      baseClip: 'walk',
      baseLayer: 'lower-body',
      stanceOverlayClip: undefined,
      actionLayer: 'upper-body',
    });
    expect(
      resolveCharacterLocomotionPolicy({
        movement: 'running',
        action: 'gunFire',
        equipment: handgun,
        depleted: false,
      }),
    ).toEqual({
      baseClip: 'gunRun',
      baseLayer: 'lower-body',
      stanceOverlayClip: undefined,
      actionLayer: 'upper-body',
    });
  });

  it('uses Walk legs plus the reviewed gun-idle upper pose when walking', () => {
    expect(
      resolveCharacterLocomotionPolicy({
        movement: 'walking',
        equipment: handgun,
        depleted: false,
      }),
    ).toEqual({
      baseClip: 'walk',
      baseLayer: 'lower-body',
      stanceOverlayClip: 'gunIdle',
      actionLayer: 'none',
    });
  });

  it('keeps upper-body tracks out of the firearm gait layer', () => {
    const values = [0, 0, 0, 1, 0, 0, 0, 1];
    const source = new AnimationClip('Gun run', 1, [
      new QuaternionKeyframeTrack('Chest.quaternion', [0, 1], values),
      new QuaternionKeyframeTrack('UpperLegR.quaternion', [0, 1], values),
    ]);
    expect(
      createLowerBodyAnimationClip(source).tracks.map(({ name }) => name),
    ).toEqual(['UpperLegR.quaternion']);
  });

  it('filters pelvis and leg tracks out of firearm overlays', () => {
    const values = [0, 0, 0, 1, 0, 0, 0, 1];
    const source = new AnimationClip('Gun fire', 1, [
      new QuaternionKeyframeTrack('Chest.quaternion', [0, 1], values),
      new QuaternionKeyframeTrack('UpperArmR.quaternion', [0, 1], values),
      new QuaternionKeyframeTrack('Body.quaternion', [0, 1], values),
      new QuaternionKeyframeTrack('UpperLegR.quaternion', [0, 1], values),
    ]);

    expect(
      createUpperBodyAnimationClip(source).tracks.map(({ name }) => name),
    ).toEqual(['Chest.quaternion', 'UpperArmR.quaternion']);
  });

  it('retains full-body locks for non-firearm actions and death', () => {
    expect(
      resolveCharacterLocomotionPolicy({
        movement: 'running',
        action: 'roll',
        equipment: handgun,
        depleted: false,
      }).actionLayer,
    ).toBe('full-body');
    expect(
      resolveCharacterLocomotionPolicy({
        movement: 'running',
        action: 'gunFire',
        equipment: handgun,
        depleted: true,
      }),
    ).toEqual({
      baseClip: undefined,
      baseLayer: 'full-body',
      stanceOverlayClip: undefined,
      actionLayer: 'full-body',
    });
  });
});
