export interface AccessibilityPreferences {
  readonly reducedCameraMotion: boolean;
  readonly dialogueTypewriter: boolean;
}

export const defaultAccessibilityPreferences: AccessibilityPreferences = {
  reducedCameraMotion: false,
  dialogueTypewriter: true,
};

interface StoredAccessibilityPreferences {
  readonly version: 1;
  readonly preferences: AccessibilityPreferences;
}

export class AccessibilityPreferenceStore {
  public static readonly storageKey = 'vanta-city:accessibility-preferences';
  public static readonly version = 1;

  private value: AccessibilityPreferences;
  private readonly listeners = new Set<
    (preferences: AccessibilityPreferences) => void
  >();

  public constructor(
    private readonly storage?: Pick<Storage, 'getItem' | 'setItem'>,
    defaults: AccessibilityPreferences = defaultAccessibilityPreferences,
  ) {
    this.value = sanitizeAccessibilityPreferences(this.read() ?? defaults);
  }

  public get current(): AccessibilityPreferences {
    return { ...this.value };
  }

  public update(
    update: Partial<AccessibilityPreferences>,
  ): AccessibilityPreferences {
    const next = sanitizeAccessibilityPreferences({ ...this.value, ...update });
    if (
      next.reducedCameraMotion === this.value.reducedCameraMotion &&
      next.dialogueTypewriter === this.value.dialogueTypewriter
    ) {
      return this.current;
    }
    this.value = next;
    this.write(next);
    for (const listener of [...this.listeners]) listener(this.current);
    return this.current;
  }

  public subscribe(
    listener: (preferences: AccessibilityPreferences) => void,
  ): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private read(): AccessibilityPreferences | undefined {
    try {
      const raw = this.storage?.getItem(
        AccessibilityPreferenceStore.storageKey,
      );
      if (!raw) return undefined;
      const stored = JSON.parse(raw) as Partial<StoredAccessibilityPreferences>;
      return stored.version === AccessibilityPreferenceStore.version &&
        stored.preferences
        ? stored.preferences
        : undefined;
    } catch {
      return undefined;
    }
  }

  private write(preferences: AccessibilityPreferences): void {
    try {
      this.storage?.setItem(
        AccessibilityPreferenceStore.storageKey,
        JSON.stringify({
          version: AccessibilityPreferenceStore.version,
          preferences,
        } satisfies StoredAccessibilityPreferences),
      );
    } catch {
      // Keep the validated in-memory preference when storage is unavailable.
    }
  }
}

export function sanitizeAccessibilityPreferences(
  preferences: AccessibilityPreferences,
): AccessibilityPreferences {
  return {
    reducedCameraMotion: preferences.reducedCameraMotion === true,
    dialogueTypewriter: preferences.dialogueTypewriter !== false,
  };
}
