import { MathUtils } from 'three';

export type CameraShoulderSide = 'left' | 'right';

export interface CameraPreferences {
  readonly horizontalSensitivity: number;
  readonly verticalSensitivity: number;
  readonly invertY: boolean;
  readonly followDistance: number;
  readonly automaticRecenter: boolean;
  readonly shoulderSide: CameraShoulderSide;
}

export const cameraPreferenceLimits = {
  minSensitivity: 0.0005,
  maxSensitivity: 0.01,
  minFollowDistance: 2.2,
  maxFollowDistance: 9,
} as const;

export const defaultCameraPreferences: CameraPreferences = {
  horizontalSensitivity: 0.0025,
  verticalSensitivity: 0.0025,
  invertY: false,
  followDistance: 4.8,
  automaticRecenter: true,
  shoulderSide: 'right',
};

interface StoredCameraPreferences {
  readonly version: 1;
  readonly preferences: CameraPreferences;
}

export type CameraPreferenceListener = (preferences: CameraPreferences) => void;

export class CameraPreferenceStore {
  public static readonly storageKey = 'vanta-city:camera-preferences';
  public static readonly version = 1;

  private value: CameraPreferences;
  private readonly listeners = new Set<CameraPreferenceListener>();

  public constructor(
    private readonly storage?: Pick<Storage, 'getItem' | 'setItem'>,
    defaults: CameraPreferences = defaultCameraPreferences,
  ) {
    this.value = sanitizePreferences(this.read() ?? defaults);
  }

  public get current(): CameraPreferences {
    return { ...this.value };
  }

  public update(update: Partial<CameraPreferences>): CameraPreferences {
    const next = sanitizePreferences({ ...this.value, ...update });
    if (preferencesEqual(this.value, next)) return this.current;
    this.value = next;
    this.write(next);
    for (const listener of [...this.listeners]) listener(this.current);
    return this.current;
  }

  public subscribe(listener: CameraPreferenceListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private read(): CameraPreferences | undefined {
    try {
      const raw = this.storage?.getItem(CameraPreferenceStore.storageKey);
      if (!raw) return undefined;
      const stored = JSON.parse(raw) as Partial<StoredCameraPreferences>;
      if (
        stored.version !== CameraPreferenceStore.version ||
        !stored.preferences
      ) {
        return undefined;
      }
      return stored.preferences;
    } catch {
      return undefined;
    }
  }

  private write(preferences: CameraPreferences): void {
    try {
      const stored: StoredCameraPreferences = {
        version: CameraPreferenceStore.version,
        preferences,
      };
      this.storage?.setItem(
        CameraPreferenceStore.storageKey,
        JSON.stringify(stored),
      );
    } catch {
      // Preferences remain valid in memory when storage is unavailable.
    }
  }
}

export function sanitizePreferences(
  preferences: CameraPreferences,
): CameraPreferences {
  const sensitivity = (value: number, fallback: number): number =>
    Number.isFinite(value)
      ? MathUtils.clamp(
          value,
          cameraPreferenceLimits.minSensitivity,
          cameraPreferenceLimits.maxSensitivity,
        )
      : fallback;
  return {
    horizontalSensitivity: sensitivity(
      preferences.horizontalSensitivity,
      defaultCameraPreferences.horizontalSensitivity,
    ),
    verticalSensitivity: sensitivity(
      preferences.verticalSensitivity,
      defaultCameraPreferences.verticalSensitivity,
    ),
    invertY: preferences.invertY === true,
    followDistance: Number.isFinite(preferences.followDistance)
      ? MathUtils.clamp(
          preferences.followDistance,
          cameraPreferenceLimits.minFollowDistance,
          cameraPreferenceLimits.maxFollowDistance,
        )
      : defaultCameraPreferences.followDistance,
    automaticRecenter: preferences.automaticRecenter !== false,
    shoulderSide: preferences.shoulderSide === 'left' ? 'left' : 'right',
  };
}

function preferencesEqual(a: CameraPreferences, b: CameraPreferences): boolean {
  return (
    a.horizontalSensitivity === b.horizontalSensitivity &&
    a.verticalSensitivity === b.verticalSensitivity &&
    a.invertY === b.invertY &&
    a.followDistance === b.followDistance &&
    a.automaticRecenter === b.automaticRecenter &&
    a.shoulderSide === b.shoulderSide
  );
}
