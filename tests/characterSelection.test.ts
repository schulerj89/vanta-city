import { CharacterSelectionStore } from '../src/characters/CharacterSelection';
import type { CharacterDefinition } from '../src/characters/CharacterDefinition';

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

describe('CharacterSelectionStore', () => {
  it('exposes the selected definition and notifies readers', () => {
    const selection = new CharacterSelectionStore(definitions, 'placeholder');
    const changed = vi.fn();
    selection.onSelectionChanged(changed);

    selection.select('hero');

    expect(selection.getSelectedId()).toBe('hero');
    expect(selection.getSelectedDefinition().displayName).toBe('Hero');
    expect(changed).toHaveBeenCalledWith(definitions[1]);
  });

  it('persists a valid choice for the current session', () => {
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
  });

  it('rejects unknown selections and ignores unknown stored ids', () => {
    const storage = memoryStorage();
    storage.setItem(CharacterSelectionStore.storageKey, 'removed-character');
    const selection = new CharacterSelectionStore(
      definitions,
      'placeholder',
      storage,
    );

    expect(selection.getSelectedId()).toBe('placeholder');
    expect(() => selection.select('missing')).toThrow('Unknown character');
  });
});
