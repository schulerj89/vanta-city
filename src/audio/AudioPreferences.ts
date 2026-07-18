import { EventBus } from '../core/events';

export interface AudioPreferences {
  readonly masterVolume: number;
  readonly themeVolume: number;
  readonly radioVolume: number;
  readonly muted: boolean;
  /** Accessibility option that down-mixes playback to one channel. */
  readonly monoOutput: boolean;
  readonly pauseWhenGamePaused: boolean;
}

export const defaultAudioPreferences: AudioPreferences = {
  masterVolume: 0.8,
  themeVolume: 0.7,
  radioVolume: 0.75,
  muted: false,
  monoOutput: false,
  pauseWhenGamePaused: true,
};

interface AudioPreferenceEvents {
  changed: AudioPreferences;
}

interface StoredAudioPreferences {
  readonly version: 1;
  readonly preferences: AudioPreferences;
}

export class AudioPreferenceStore {
  public static readonly storageKey = 'vanta-city:audio-preferences';
  public static readonly version = 1;
  public readonly events = new EventBus<AudioPreferenceEvents>();

  private value: AudioPreferences;

  public constructor(
    private readonly storage?: Pick<Storage, 'getItem' | 'setItem'>,
    defaults: AudioPreferences = defaultAudioPreferences,
  ) {
    this.value = sanitizeAudioPreferences(this.read() ?? defaults);
  }

  public get current(): AudioPreferences {
    return { ...this.value };
  }

  public update(update: Partial<AudioPreferences>): AudioPreferences {
    const next = sanitizeAudioPreferences({ ...this.value, ...update });
    if (JSON.stringify(next) === JSON.stringify(this.value))
      return this.current;
    this.value = next;
    this.write(next);
    this.events.emit('changed', this.current);
    return this.current;
  }

  private read(): AudioPreferences | undefined {
    try {
      const raw = this.storage?.getItem(AudioPreferenceStore.storageKey);
      if (!raw) return undefined;
      const stored = JSON.parse(raw) as Partial<StoredAudioPreferences>;
      return stored.version === AudioPreferenceStore.version &&
        stored.preferences
        ? stored.preferences
        : undefined;
    } catch {
      return undefined;
    }
  }

  private write(preferences: AudioPreferences): void {
    try {
      this.storage?.setItem(
        AudioPreferenceStore.storageKey,
        JSON.stringify({
          version: AudioPreferenceStore.version,
          preferences,
        } satisfies StoredAudioPreferences),
      );
    } catch {
      // Validated memory state remains authoritative when storage is unavailable.
    }
  }
}

export function sanitizeAudioPreferences(
  value: AudioPreferences,
): AudioPreferences {
  return {
    masterVolume: bounded(
      value.masterVolume,
      defaultAudioPreferences.masterVolume,
    ),
    themeVolume: bounded(
      value.themeVolume,
      defaultAudioPreferences.themeVolume,
    ),
    radioVolume: bounded(
      value.radioVolume,
      defaultAudioPreferences.radioVolume,
    ),
    muted: value.muted === true,
    monoOutput: value.monoOutput === true,
    pauseWhenGamePaused: value.pauseWhenGamePaused !== false,
  };
}

function bounded(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}
