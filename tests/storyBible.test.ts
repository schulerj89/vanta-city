import { describe, expect, it } from 'vitest';
import {
  loadStoryBible,
  renderStoryBible,
  validateStoryBible,
} from '../scripts/narrative/story-bible-tools.mjs';

describe('Ashfall story bible', () => {
  it('validates the canonical structured source and renders deterministically', async () => {
    const bible = validateStoryBible(await loadStoryBible());

    expect(bible.missions).toHaveLength(6);
    expect(bible.characters.find(({ id }) => id === 'rook')).toMatchObject({
      speakerId: 'rook',
      entityId: 'casual',
    });
    expect(await renderStoryBible(bible)).toBe(await renderStoryBible(bible));
  });
});
