import { AccessibilityPreferenceStore } from '../src/accessibility/AccessibilityPreferences';

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem'> {
  private readonly values = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('AccessibilityPreferenceStore', () => {
  it('persists reduced camera motion and immediate dialogue reveal', () => {
    const storage = new MemoryStorage();
    const preferences = new AccessibilityPreferenceStore(storage);
    preferences.update({
      reducedCameraMotion: true,
      dialogueTypewriter: false,
    });

    expect(new AccessibilityPreferenceStore(storage).current).toEqual({
      reducedCameraMotion: true,
      dialogueTypewriter: false,
    });
    expect(
      JSON.parse(
        storage.getItem(AccessibilityPreferenceStore.storageKey) ?? '{}',
      ),
    ).toMatchObject({ version: AccessibilityPreferenceStore.version });
  });

  it('ignores malformed and incompatible storage', () => {
    const storage = new MemoryStorage();
    storage.setItem(AccessibilityPreferenceStore.storageKey, '{bad json');
    expect(new AccessibilityPreferenceStore(storage).current).toEqual({
      reducedCameraMotion: false,
      dialogueTypewriter: true,
    });
    storage.setItem(
      AccessibilityPreferenceStore.storageKey,
      JSON.stringify({ version: 2, preferences: {} }),
    );
    expect(new AccessibilityPreferenceStore(storage).current).toEqual({
      reducedCameraMotion: false,
      dialogueTypewriter: true,
    });
  });
});
