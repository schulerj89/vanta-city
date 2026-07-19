import type { AudioPreferenceStore } from '../audio/AudioPreferences';

const startedStorageKey = 'vanta-city:title-started';

/** Typed cancellation emitted only when a pending title gate is disposed. */
export class TitleScreenDisposedError extends Error {
  public readonly code = 'title-screen-disposed';

  public constructor() {
    super('The title screen was disposed before Start or Continue was chosen.');
    this.name = 'TitleScreenDisposedError';
  }
}

export interface TitleScreenSnapshot {
  readonly visible: boolean;
  readonly startedBefore: boolean;
  readonly musicMuted: boolean;
  readonly state: 'first-run' | 'returning' | 'departing' | 'disposed';
  readonly connected: boolean;
}

/** Deliberate, accessible boot gate. Audio truth remains in AudioPreferenceStore. */
export class TitleScreen {
  private readonly element = document.createElement('section');
  private readonly startButton = document.createElement('button');
  private readonly musicButton = document.createElement('button');
  private readonly startedBefore: boolean;
  private readonly unsubscribeAudio: () => void;
  private resolveStart: (() => void) | undefined;
  private rejectStart: ((reason: TitleScreenDisposedError) => void) | undefined;
  private startPromise: Promise<void> | undefined;
  private started = false;
  private disposed = false;

  public constructor(
    private readonly mount: HTMLElement,
    private readonly audioPreferences: AudioPreferenceStore,
    private readonly storage?: Pick<Storage, 'getItem' | 'setItem'>,
  ) {
    this.startedBefore = this.readStarted();
    this.element.className = 'title-screen';
    this.element.dataset.testid = 'title-screen';
    this.element.dataset.runState = this.startedBefore
      ? 'returning'
      : 'first-run';
    this.element.setAttribute('role', 'region');
    this.element.setAttribute('aria-labelledby', 'vanta-city-title');

    const atmosphere = document.createElement('div');
    atmosphere.className = 'title-screen__atmosphere';
    atmosphere.setAttribute('aria-hidden', 'true');
    const hero = document.createElement('span');
    hero.className = 'title-screen__hero';
    const rain = document.createElement('span');
    rain.className = 'title-screen__rain';
    atmosphere.append(hero, rain);

    const content = document.createElement('div');
    content.className = 'title-screen__content';
    const kicker = document.createElement('p');
    kicker.className = 'title-screen__kicker';
    kicker.textContent = 'Ashfall City · September 1997';
    const title = document.createElement('h1');
    title.id = 'vanta-city-title';
    title.className = 'title-screen__wordmark';
    title.textContent = 'VANTA CITY';
    const subtitle = document.createElement('p');
    subtitle.className = 'title-screen__subtitle';
    subtitle.textContent = 'The Cinder Ledger';
    const premise = document.createElement('p');
    premise.className = 'title-screen__premise';
    premise.textContent =
      'The first coach is in. Someone who promised to meet it is missing.';
    const actions = document.createElement('div');
    actions.className = 'title-screen__actions';
    this.startButton.type = 'button';
    this.startButton.className = 'title-screen__start';
    this.startButton.dataset.testid = 'title-start';
    this.startButton.textContent = this.startedBefore ? 'Continue' : 'Start';
    this.startButton.addEventListener('click', this.begin);
    this.musicButton.type = 'button';
    this.musicButton.className = 'title-screen__music';
    this.musicButton.dataset.testid = 'title-music';
    this.musicButton.addEventListener('click', this.toggleMusic);
    actions.append(this.startButton, this.musicButton);
    const hint = document.createElement('p');
    hint.className = 'title-screen__hint';
    hint.textContent = 'Enter or Space to begin · Music is optional';
    content.append(kicker, title, subtitle, premise, actions, hint);
    this.element.append(atmosphere, content);
    this.mount.append(this.element);
    this.unsubscribeAudio = this.audioPreferences.events.on(
      'changed',
      this.syncMusic,
    );
    this.syncMusic();
  }

  public waitForStart(): Promise<void> {
    if (this.started) return Promise.resolve();
    if (this.disposed) return Promise.reject(new TitleScreenDisposedError());
    if (this.startPromise) return this.startPromise;
    this.startButton.focus({ preventScroll: true });
    this.startPromise = new Promise((resolve, reject) => {
      this.resolveStart = resolve;
      this.rejectStart = reject;
    });
    return this.startPromise;
  }

  /** Restores the deliberate entry action after an integrator-owned failure. */
  public restoreFocus(): void {
    if (!this.started && !this.disposed)
      this.startButton.focus({ preventScroll: true });
  }

  public getSnapshot(): TitleScreenSnapshot {
    return {
      visible: !this.started && !this.disposed && this.element.isConnected,
      startedBefore: this.startedBefore,
      musicMuted: this.audioPreferences.current.muted,
      state: this.disposed
        ? 'disposed'
        : this.started
          ? 'departing'
          : this.startedBefore
            ? 'returning'
            : 'first-run',
      connected: this.element.isConnected,
    };
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.startButton.removeEventListener('click', this.begin);
    this.musicButton.removeEventListener('click', this.toggleMusic);
    this.unsubscribeAudio();
    this.element.remove();
    const reject = this.rejectStart;
    this.resolveStart = undefined;
    this.rejectStart = undefined;
    this.startPromise = undefined;
    if (!this.started) reject?.(new TitleScreenDisposedError());
  }

  private readonly begin = (): void => {
    if (this.started) return;
    this.started = true;
    try {
      this.storage?.setItem(startedStorageKey, '1');
    } catch {
      // A private or full storage area cannot prevent starting the game.
    }
    const resolve = this.resolveStart;
    this.resolveStart = undefined;
    this.rejectStart = undefined;
    this.element.dataset.state = 'departing';
    this.element.setAttribute('aria-hidden', 'true');
    resolve?.();
  };

  private readonly toggleMusic = (): void => {
    this.audioPreferences.update({
      muted: !this.audioPreferences.current.muted,
    });
  };

  private readonly syncMusic = (): void => {
    const muted = this.audioPreferences.current.muted;
    this.element.dataset.music = muted ? 'muted' : 'on';
    this.musicButton.setAttribute('aria-pressed', String(muted));
    this.musicButton.setAttribute(
      'aria-label',
      muted ? 'Unmute music' : 'Mute music',
    );
    this.musicButton.textContent = muted ? 'Music · Muted' : 'Music · On';
  };

  private readStarted(): boolean {
    try {
      return this.storage?.getItem(startedStorageKey) === '1';
    } catch {
      return false;
    }
  }
}
