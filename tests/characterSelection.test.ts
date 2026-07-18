import { CharacterSelectionStore } from '../src/characters/CharacterSelection';
import type { CharacterDefinition } from '../src/characters/CharacterDefinition';
import { characterDefinitions } from '../src/characters/characters';

const definitions = [
  { id: 'placeholder', displayName: 'Placeholder', fallback: 'placeholder' },
  { id: 'hero', displayName: 'Hero', fallback: 'placeholder' },
] as const satisfies readonly CharacterDefinition[];

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

function storedPreference(id: string): string {
  return JSON.stringify({
    version: CharacterSelectionStore.preferenceVersion,
    selectedCharacterId: id,
  });
}

describe('CharacterSelectionStore', () => {
  it('registers exactly the two reviewed model-backed playable characters', () => {
    expect(characterDefinitions.map(({ id }) => id)).toEqual([
      'casual',
      'punk',
    ]);
    expect(
      characterDefinitions.every(
        ({ modelAssetId, fallback }) =>
          modelAssetId !== undefined && fallback === 'placeholder',
      ),
    ).toBe(true);
  });

  it('exposes the selected definition and notifies readers', () => {
    const selection = new CharacterSelectionStore(definitions, 'placeholder');
    const changed = vi.fn();
    selection.onSelectionChanged(changed);

    selection.select('hero');

    expect(selection.getSelectedId()).toBe('hero');
    expect(selection.getSelectedDefinition().displayName).toBe('Hero');
    expect(changed).toHaveBeenCalledWith(definitions[1]);
  });

  it('persists a valid choice in a versioned preference', () => {
    const storage = memoryStorage();
    const first = new CharacterSelectionStore(
      definitions,
      'placeholder',
      storage,
    );
    first.select('hero');

    const restored = new CharacterSelectionStore(
      definitions,
      'placeholder',
      storage,
    );
    expect(restored.getSelectedId()).toBe('hero');
    expect(storage.getItem(CharacterSelectionStore.storageKey)).toBe(
      storedPreference('hero'),
    );
  });

  it('allows boot to explicitly replace a stored preference through the same selection state', () => {
    const storage = memoryStorage();
    storage.setItem(
      CharacterSelectionStore.storageKey,
      storedPreference('hero'),
    );
    const selection = new CharacterSelectionStore(
      definitions,
      'placeholder',
      storage,
    );
    const changed = vi.fn();
    selection.onSelectionChanged(changed);

    selection.select('placeholder');

    expect(selection.getSelectedId()).toBe('placeholder');
    expect(changed).toHaveBeenCalledOnce();
    expect(changed).toHaveBeenCalledWith(definitions[0]);
    expect(storage.getItem(CharacterSelectionStore.storageKey)).toBe(
      storedPreference('placeholder'),
    );
  });

  it('rejects unknown selections and repairs unknown stored ids', () => {
    const storage = memoryStorage();
    storage.setItem(
      CharacterSelectionStore.storageKey,
      storedPreference('removed-character'),
    );
    const selection = new CharacterSelectionStore(
      definitions,
      'placeholder',
      storage,
    );

    expect(selection.getSelectedId()).toBe('placeholder');
    expect(storage.getItem(CharacterSelectionStore.storageKey)).toBe(
      storedPreference('placeholder'),
    );
    expect(() => selection.select('missing')).toThrow('Unknown character');
  });

  it('ignores malformed and unsupported preference versions', () => {
    const storage = memoryStorage();
    storage.setItem(
      CharacterSelectionStore.storageKey,
      JSON.stringify({ version: 2, selectedCharacterId: 'hero' }),
    );
    expect(
      new CharacterSelectionStore(
        definitions,
        'placeholder',
        storage,
      ).getSelectedId(),
    ).toBe('placeholder');

    storage.setItem(CharacterSelectionStore.storageKey, '{bad json');
    expect(
      new CharacterSelectionStore(
        definitions,
        'placeholder',
        storage,
      ).getSelectedId(),
    ).toBe('placeholder');
  });

  it('cycles through registered character definitions', () => {
    const selection = new CharacterSelectionStore(definitions, 'placeholder');

    expect(selection.cycle().id).toBe('hero');
    expect(selection.getSelectedId()).toBe('hero');
    expect(selection.cycle().id).toBe('placeholder');
  });
});
