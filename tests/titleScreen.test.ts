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
    expect(mount.querySelector('h1')?.textContent).toBe('VANTA CITY');
    expect(title.getSnapshot().state).toBe('first-run');
    expect(start.textContent).toBe('Start');
    start.click();
    await waiting;
    expect(title.getSnapshot().visible).toBe(false);
    expect(title.getSnapshot().state).toBe('departing');
    title.dispose();
    expect(title.getSnapshot()).toMatchObject({
      state: 'disposed',
      connected: false,
    });

    const returning = new TitleScreen(
      mount,
      new AudioPreferenceStore(storage),
      storage,
    );
    expect(
      mount.querySelector('[data-testid="title-start"]')?.textContent,
    ).toBe('Continue');
    expect(returning.getSnapshot().state).toBe('returning');
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

  it('shares one wait promise and can restore focus without duplicate entry', async () => {
    const storage = new MemoryStorage();
    const mount = document.createElement('main');
    document.body.append(mount);
    const title = new TitleScreen(
      mount,
      new AudioPreferenceStore(storage),
      storage,
    );
    const first = title.waitForStart();
    const second = title.waitForStart();
    expect(second).toBe(first);
    const start = mount.querySelector<HTMLButtonElement>(
      '[data-testid="title-start"]',
    )!;
    start.blur();
    title.restoreFocus();
    expect(start).toBe(document.activeElement);
    start.click();
    await expect(first).resolves.toBeUndefined();
    expect(storage.getItem('vanta-city:title-started')).toBe('1');
    title.dispose();
    mount.remove();
  });
});
