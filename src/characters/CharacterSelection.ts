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
  public static readonly storageKey = 'vanta-city:selected-character';

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

  public onSelectionChanged(listener: CharacterSelectionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private readStoredId(): string | undefined {
    try {
      return (
        this.storage?.getItem(CharacterSelectionStore.storageKey) ?? undefined
      );
    } catch {
      return undefined;
    }
  }

  private writeStoredId(id: string): void {
    try {
      this.storage?.setItem(CharacterSelectionStore.storageKey, id);
    } catch {
      // Storage can be unavailable in privacy modes; in-memory selection still works.
    }
  }
}
