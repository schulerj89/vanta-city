import { AssetCatalog } from '../src/assets/AssetCatalog';
import { createDialogueSpeakers } from '../src/dialogue/speakers';
import type { NpcDefinition } from '../src/npcs/NpcDefinition';

const mack: NpcDefinition = {
  id: 'mack',
  displayName: 'Mack',
  characterId: 'npc-worker',
  portraitAssetId: 'portrait.mack',
  defaultAnimation: 'idle',
  applauseAnimation: 'applaud',
  spawnId: 'spawn.mack',
  interactionLabel: 'Talk',
  conversationId: 'conversation.mack',
  interactionRadius: 2,
};

describe('createDialogueSpeakers', () => {
  it('omits an optional portrait when the dev server returns its HTML fallback', async () => {
    const request = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ 'content-type': 'text/html' }),
    }));

    const speakers = await createDialogueSpeakers(
      [mack],
      new AssetCatalog({
        'portrait.mack': {
          type: 'texture',
          url: '/mack.webp',
          optional: true,
        },
      }),
      request,
      'http://localhost/game',
    );

    expect(speakers[0]).toEqual({ id: 'mack', displayName: 'Mack' });
    expect(request).toHaveBeenCalledWith(
      new URL('http://localhost/mack.webp'),
      {
        method: 'HEAD',
      },
    );
  });

  it('keeps an installed local portrait', async () => {
    const speakers = await createDialogueSpeakers(
      [mack],
      new AssetCatalog({
        'portrait.mack': {
          type: 'texture',
          url: '/mack.webp',
          optional: true,
        },
      }),
      vi.fn(async () => ({
        ok: true,
        headers: new Headers({ 'content-type': 'image/webp' }),
      })),
      'http://localhost/game',
    );

    expect(speakers[0]?.portrait?.src).toBe('http://localhost/mack.webp');
  });
});
