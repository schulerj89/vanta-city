import { Vector3 } from 'three';
import {
  calculateConversationFraming,
  resolveConversationCameraProfile,
} from '../src/camera/ConversationCameraProfile';
import type { WorldPose } from '../src/world/Spatial';

function pose(x: number, z: number, yaw: number): WorldPose {
  return {
    position: { x, y: 0, z },
    forward: { x: Math.sin(yaw), y: 0, z: Math.cos(yaw) },
  };
}

describe('conversation camera profiles', () => {
  it('selects the default and named profiles deterministically', () => {
    expect(resolveConversationCameraProfile().id).toBe('default');
    expect(resolveConversationCameraProfile('close').fieldOfView).toBe(46);
    expect(resolveConversationCameraProfile('wide').fieldOfView).toBe(54);
  });

  it('frames live participants independent of world origin and authored yaw', () => {
    const profile = resolveConversationCameraProfile();
    const original = calculateConversationFraming(
      pose(2, 4, 0.2),
      pose(6, 1, -2.4),
      profile,
      'right',
    );
    const translated = calculateConversationFraming(
      pose(102, -46, Math.PI),
      pose(106, -49, 0),
      profile,
      'right',
    );
    const translation = new Vector3(100, 0, -50);

    expect(translated.lookAt).toEqual(original.lookAt.clone().add(translation));
    expect(translated.position).toEqual(
      original.position.clone().add(translation),
    );
    expect(original.lookAt.x).toBeCloseTo(4);
    expect(original.lookAt.z).toBeCloseTo(2.5);
  });

  it('places opposite shoulders on opposite sides of the participant axis', () => {
    const player = pose(-1, 2, 1.7);
    const npc = pose(3, 2, -0.4);
    const profile = resolveConversationCameraProfile('wide');
    const right = calculateConversationFraming(player, npc, profile, 'right');
    const left = calculateConversationFraming(player, npc, profile, 'left');

    expect(right.lookAt).toEqual(left.lookAt);
    expect(right.position.x).toBeCloseTo(left.position.x);
    expect(right.position.z - right.lookAt.z).toBeCloseTo(
      -(left.position.z - left.lookAt.z),
    );
  });
});
