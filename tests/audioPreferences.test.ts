import { AudioPreferenceStore } from '../src/audio/AudioPreferences';

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem'> {
  public values = new Map<string, string>();
  public getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  public setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('AudioPreferenceStore', () => {
  it('bounds, persists, and publishes volume/mute/accessibility preferences', () => {
    const storage = new MemoryStorage();
    const store = new AudioPreferenceStore(storage);
    const changed = vi.fn();
    store.events.on('changed', changed);
    store.update({
      masterVolume: 2,
      themeVolume: -1,
      radioVolume: Number.NaN,
      muted: true,
      monoOutput: true,
    });
    expect(store.current).toMatchObject({
      masterVolume: 1,
      themeVolume: 0,
      radioVolume: 0.75,
      muted: true,
      monoOutput: true,
    });
    expect(new AudioPreferenceStore(storage).current).toEqual(store.current);
    expect(changed).toHaveBeenCalledOnce();
  });

  it('repairs malformed and incompatible persistence', () => {
    const storage = new MemoryStorage();
    storage.setItem(AudioPreferenceStore.storageKey, '{bad');
    expect(new AudioPreferenceStore(storage).current.masterVolume).toBe(0.8);
    storage.setItem(
      AudioPreferenceStore.storageKey,
      JSON.stringify({ version: 2, preferences: {} }),
    );
    expect(new AudioPreferenceStore(storage).current.masterVolume).toBe(0.8);
  });
});
