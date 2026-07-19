import type { AudioPreferenceStore } from '../audio/AudioPreferences';

const startedStorageKey = 'vanta-city:title-started';

export interface TitleScreenSnapshot {
  readonly visible: boolean;
  readonly startedBefore: boolean;
  readonly musicMuted: boolean;
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
  private started = false;

  public constructor(
    private readonly mount: HTMLElement,
    private readonly audioPreferences: AudioPreferenceStore,
    private readonly storage?: Pick<Storage, 'getItem' | 'setItem'>,
  ) {
    this.startedBefore = this.readStarted();
    this.element.className = 'title-screen';
    this.element.dataset.testid = 'title-screen';
    this.element.setAttribute('role', 'region');
    this.element.setAttribute('aria-labelledby', 'ashfall-title');

    const atmosphere = document.createElement('div');
    atmosphere.className = 'title-screen__atmosphere';
    atmosphere.setAttribute('aria-hidden', 'true');
    const signal = document.createElement('span');
    signal.className = 'title-screen__signal';
    const depot = document.createElement('span');
    depot.className = 'title-screen__depot';
    atmosphere.append(signal, depot);

    const content = document.createElement('div');
    content.className = 'title-screen__content';
    const kicker = document.createElement('p');
    kicker.className = 'title-screen__kicker';
    kicker.textContent = 'Ashfall City · September 1997';
    const title = document.createElement('h1');
    title.id = 'ashfall-title';
    title.className = 'title-screen__wordmark';
    title.textContent = 'Ashfall';
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
    this.startButton.focus({ preventScroll: true });
    return new Promise((resolve) => {
      this.resolveStart = resolve;
    });
  }

  public getSnapshot(): TitleScreenSnapshot {
    return {
      visible: !this.started,
      startedBefore: this.startedBefore,
      musicMuted: this.audioPreferences.current.muted,
      connected: this.element.isConnected,
    };
  }

  public dispose(): void {
    this.startButton.removeEventListener('click', this.begin);
    this.musicButton.removeEventListener('click', this.toggleMusic);
    this.unsubscribeAudio();
    this.element.remove();
    this.resolveStart = undefined;
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
    this.element.dataset.state = 'departing';
    resolve?.();
  };

  private readonly toggleMusic = (): void => {
    this.audioPreferences.update({
      muted: !this.audioPreferences.current.muted,
    });
  };

  private readonly syncMusic = (): void => {
    const muted = this.audioPreferences.current.muted;
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
