import {
  cameraLabNpcProfiles,
  createCameraLabPreset,
  positionPlayerForApproach,
} from '../src/sandbox/CameraCompositionLabState';

describe('Camera Composition Lab fixtures', () => {
  it('keeps NPC identity mapped to the authoritative conversation profiles', () => {
    expect(cameraLabNpcProfiles).toEqual({
      mack: 'close',
      nox: 'default',
      raze: 'wide',
    });
  });

  it('creates independent deterministic obstruction and viewport presets', () => {
    const alley = createCameraLabPreset('nox-alley');
    const second = createCameraLabPreset('nox-alley');
    expect(alley).toEqual(second);
    expect(alley).toMatchObject({
      npcId: 'nox',
      profileId: 'default',
      obstruction: { enabled: true, yaw: 0 },
    });
    expect(createCameraLabPreset('narrow-mobile')).toMatchObject({
      npcId: 'raze',
      profileId: 'wide',
      viewport: 'mobile',
    });
  });

  it.each([
    ['left', -3, 0, Math.PI / 2],
    ['right', 3, 0, -Math.PI / 2],
    ['front', 0, 3, Math.PI],
    ['back', 0, -3, 0],
  ] as const)(
    'derives a %s approach without changing the NPC pose',
    (side, x, z, yaw) => {
      const npc = { x: 0, y: 2, z: 0, yaw: 0 };
      const player = positionPlayerForApproach(npc, 3, side);
      expect(player).toMatchObject({ x, y: 2, z });
      expect(Math.abs(player.yaw - yaw) % (Math.PI * 2)).toBeCloseTo(0);
      expect(npc).toEqual({ x: 0, y: 2, z: 0, yaw: 0 });
    },
  );
});
