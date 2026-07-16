import type { CharacterDefinition } from './CharacterDefinition';

export type CharacterSelectionListener = (
  definition: CharacterDefinition,
) => void;

export interface CharacterSelectionReader {
  getSelectedId(): string;
  getSelectedDefinition(): CharacterDefinition;
  onSelectionChanged(listener: CharacterSelectionListener): () => void;
}

export class CharacterSelectionStore implements CharacterSelectionReader {
  public static readonly storageKey = 'vanta-city:character-preference';
  public static readonly preferenceVersion = 1;

  private readonly byId: ReadonlyMap<string, CharacterDefinition>;
  private readonly listeners = new Set<CharacterSelectionListener>();
  private selectedId: string;

  public constructor(
    public readonly definitions: readonly CharacterDefinition[],
    defaultId: string,
    private readonly storage?: Pick<Storage, 'getItem' | 'setItem'>,
  ) {
    this.byId = new Map(
      definitions.map((definition) => [definition.id, definition]),
    );
    if (!this.byId.has(defaultId))
      throw new Error(`Unknown default character: ${defaultId}`);
    const storedId = this.readStoredId();
    this.selectedId =
      storedId && this.byId.has(storedId) ? storedId : defaultId;
    this.writeStoredId(this.selectedId);
  }

  public getSelectedId(): string {
    return this.selectedId;
  }

  public getSelectedDefinition(): CharacterDefinition {
    const definition = this.byId.get(this.selectedId);
    if (!definition)
      throw new Error(
        `Selected character is not registered: ${this.selectedId}`,
      );
    return definition;
  }

  public select(id: string): void {
    const definition = this.byId.get(id);
    if (!definition) throw new Error(`Unknown character: ${id}`);
    if (id === this.selectedId) return;
    this.selectedId = id;
    this.writeStoredId(id);
    for (const listener of [...this.listeners]) listener(definition);
  }

  public cycle(step = 1): CharacterDefinition {
    const currentIndex = this.definitions.findIndex(
      ({ id }) => id === this.selectedId,
    );
    const nextIndex =
      (currentIndex +
        (step % this.definitions.length) +
        this.definitions.length) %
      this.definitions.length;
    const definition = this.definitions[nextIndex]!;
    this.select(definition.id);
    return definition;
  }

  public onSelectionChanged(listener: CharacterSelectionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private readStoredId(): string | undefined {
    try {
      const value = this.storage?.getItem(CharacterSelectionStore.storageKey);
      if (!value) return undefined;
      const preference: unknown = JSON.parse(value);
      if (
        typeof preference !== 'object' ||
        preference === null ||
        !('version' in preference) ||
        preference.version !== CharacterSelectionStore.preferenceVersion ||
        !('selectedCharacterId' in preference) ||
        typeof preference.selectedCharacterId !== 'string'
      ) {
        return undefined;
      }
      return preference.selectedCharacterId;
    } catch {
      return undefined;
    }
  }

  private writeStoredId(id: string): void {
    try {
      this.storage?.setItem(
        CharacterSelectionStore.storageKey,
        JSON.stringify({
          version: CharacterSelectionStore.preferenceVersion,
          selectedCharacterId: id,
        }),
      );
    } catch {
      // Storage can be unavailable in privacy modes; in-memory selection still works.
    }
  }
}
