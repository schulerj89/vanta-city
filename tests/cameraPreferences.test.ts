import {
  CameraPreferenceStore,
  cameraPreferenceLimits,
  defaultCameraPreferences,
} from '../src/camera/CameraPreferences';

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem'> {
  private readonly values = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('CameraPreferenceStore', () => {
  it('uses the closer full-body gameplay framing for untouched preferences', () => {
    const preferences = new CameraPreferenceStore(new MemoryStorage());

    expect(defaultCameraPreferences.followDistance).toBe(4.8);
    expect(preferences.current.followDistance).toBe(4.8);
  });

  it('persists versioned gameplay preferences', () => {
    const storage = new MemoryStorage();
    const first = new CameraPreferenceStore(storage);
    first.update({
      horizontalSensitivity: 0.004,
      verticalSensitivity: 0.003,
      invertY: true,
      followDistance: 7,
      automaticRecenter: false,
      shoulderSide: 'left',
    });

    const restored = new CameraPreferenceStore(storage);

    expect(restored.current).toEqual(first.current);
    expect(restored.current.followDistance).toBe(7);
    expect(
      JSON.parse(storage.getItem(CameraPreferenceStore.storageKey) ?? '{}'),
    ).toMatchObject({ version: CameraPreferenceStore.version });
  });

  it('clamps unsafe values and ignores incompatible storage versions', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      CameraPreferenceStore.storageKey,
      JSON.stringify({ version: 99, preferences: { followDistance: 100 } }),
    );
    const preferences = new CameraPreferenceStore(storage);
    preferences.update({
      horizontalSensitivity: 100,
      verticalSensitivity: -1,
      followDistance: 100,
    });

    expect(preferences.current.horizontalSensitivity).toBe(
      cameraPreferenceLimits.maxSensitivity,
    );
    expect(preferences.current.verticalSensitivity).toBe(
      cameraPreferenceLimits.minSensitivity,
    );
    expect(preferences.current.followDistance).toBe(
      cameraPreferenceLimits.maxFollowDistance,
    );
  });
});
