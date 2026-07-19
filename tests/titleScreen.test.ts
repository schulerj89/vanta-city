// @vitest-environment jsdom

import { AudioPreferenceStore } from '../src/audio/AudioPreferences';
import { TitleScreen } from '../src/ui/TitleScreen';

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem'> {
  private readonly values = new Map<string, string>();
  public getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  public setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('TitleScreen', () => {
  it('starts deliberately, persists Continue, and restores keyboard focus', async () => {
    const storage = new MemoryStorage();
    const mount = document.createElement('main');
    document.body.append(mount);
    const title = new TitleScreen(
      mount,
      new AudioPreferenceStore(storage),
      storage,
    );
    const waiting = title.waitForStart();
    const start = mount.querySelector<HTMLButtonElement>(
      '[data-testid="title-start"]',
    )!;
    expect(start).toBe(document.activeElement);
    expect(start.textContent).toBe('Start');
    start.click();
    await waiting;
    expect(title.getSnapshot().visible).toBe(false);
    title.dispose();

    const returning = new TitleScreen(
      mount,
      new AudioPreferenceStore(storage),
      storage,
    );
    expect(
      mount.querySelector('[data-testid="title-start"]')?.textContent,
    ).toBe('Continue');
    returning.dispose();
    mount.remove();
  });

  it('uses AudioPreferenceStore as the persistent immediate mute authority', () => {
    const storage = new MemoryStorage();
    const preferences = new AudioPreferenceStore(storage);
    const mount = document.createElement('main');
    const title = new TitleScreen(mount, preferences, storage);
    const music = mount.querySelector<HTMLButtonElement>(
      '[data-testid="title-music"]',
    )!;
    expect(music.getAttribute('aria-pressed')).toBe('false');
    music.click();
    expect(preferences.current.muted).toBe(true);
    expect(music.getAttribute('aria-label')).toBe('Unmute music');
    expect(new AudioPreferenceStore(storage).current.muted).toBe(true);
    title.dispose();
  });
});
