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

  it('backs up within the profile limit for narrow portrait viewports', () => {
    const player = pose(-1, 2, 0);
    const npc = pose(3, 2, Math.PI);
    const profile = resolveConversationCameraProfile('close');
    const desktop = calculateConversationFraming(
      player,
      npc,
      profile,
      'right',
      16 / 9,
    );
    const portrait = calculateConversationFraming(
      player,
      npc,
      profile,
      'right',
      390 / 844,
    );

    expect(portrait.lookAt).toEqual(desktop.lookAt);
    expect(portrait.position.distanceTo(portrait.lookAt)).toBeGreaterThan(
      desktop.position.distanceTo(desktop.lookAt),
    );
    expect(portrait.diagnostics.safeFrameStatus).toBe('distance-clamped');
    expect(portrait.diagnostics.cameraDistance).toBeLessThan(
      portrait.diagnostics.requiredDistance,
    );
    expect(portrait.diagnostics.cameraDistance).toBeLessThanOrEqual(
      profile.maxDistance * profile.narrowAspectMaxScale,
    );
  });

  it('uses one close-safe three-quarter policy at capsule-to-capsule distance', () => {
    const profile = resolveConversationCameraProfile('close');
    const player = pose(-0.4, 0, Math.PI / 2);
    const npc = pose(0.4, 0, -Math.PI / 2);
    const framing = calculateConversationFraming(player, npc, profile, 'right');
    const offset = framing.position.clone().sub(framing.lookAt);

    expect(framing.diagnostics).toMatchObject({
      participantSeparation: 0.8,
      chosenSide: 'right',
      nearDistance: true,
      safeFrameStatus: 'inside',
    });
    expect(framing.diagnostics.cameraDistance).toBeGreaterThanOrEqual(
      profile.minimumCameraBackoff,
    );
    expect(Math.abs(offset.x)).toBeGreaterThan(0.25);
    expect(Math.abs(offset.z)).toBeGreaterThan(2);
    expect(framing.diagnostics.pitch).toBeGreaterThanOrEqual(profile.minPitch);
    expect(framing.diagnostics.pitch).toBeLessThanOrEqual(profile.maxPitch);
  });

  it('stays stable for tiny close-range participant shifts', () => {
    const profile = resolveConversationCameraProfile();
    const original = calculateConversationFraming(
      pose(-0.31, 0, Math.PI / 2),
      pose(0.31, 0, -Math.PI / 2),
      profile,
      'left',
    );
    const shifted = calculateConversationFraming(
      pose(-0.305, 0.004, Math.PI / 2),
      pose(0.315, 0.006, -Math.PI / 2),
      profile,
      'left',
    );

    expect(shifted.position.distanceTo(original.position)).toBeLessThan(0.03);
    expect(shifted.diagnostics.fallbackReason).toBe('near-facing-stabilized');
  });

  it('uses facing and then world-forward deterministic coincident fallbacks', () => {
    const profile = resolveConversationCameraProfile();
    const facing = calculateConversationFraming(
      pose(0, 0, 0),
      pose(0, 0, Math.PI),
      profile,
      'right',
    );
    const degeneratePose: WorldPose = {
      position: { x: 0, y: 0, z: 0 },
      forward: { x: 0, y: 0, z: 0 },
    };
    const worldForward = calculateConversationFraming(
      degeneratePose,
      degeneratePose,
      profile,
      'right',
    );

    expect(facing.diagnostics.fallbackReason).toBe('coincident-facing-axis');
    expect(worldForward.diagnostics.fallbackReason).toBe(
      'coincident-world-forward',
    );
    expect(worldForward.position.toArray().every(Number.isFinite)).toBe(true);
  });
});
