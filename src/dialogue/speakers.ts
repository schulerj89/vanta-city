import type { DialogueSpeaker } from './DialoguePortraitResolver';
import type { AssetCatalog } from '../assets/AssetCatalog';
import type { NpcDefinition } from '../npcs/NpcDefinition';

type PortraitHeadRequest = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Pick<Response, 'ok' | 'headers'>>;

export async function createDialogueSpeakers(
  npcs: readonly NpcDefinition[],
  assets: AssetCatalog,
  request: PortraitHeadRequest = (input, init) => fetch(input, init),
  baseUrl = window.location.href,
): Promise<readonly DialogueSpeaker[]> {
  const speakers = await Promise.all(
    npcs.map(async (npc): Promise<DialogueSpeaker> => {
      const portrait = assets.get(npc.portraitAssetId);
      const portraitUrl = new URL(portrait.url, baseUrl);
      const localTexture =
        portrait.type === 'texture' &&
        portraitUrl.origin === new URL(baseUrl).origin;
      const installed =
        localTexture &&
        (!portrait.optional ||
          (await isInstalledPortrait(portraitUrl, request)));
      return {
        id: npc.id,
        displayName: npc.displayName,
        ...(installed
          ? {
              portrait: {
                src: portraitUrl.href,
                alt: `${npc.displayName} portrait`,
              },
            }
          : {}),
      } satisfies DialogueSpeaker;
    }),
  );
  return [
    ...speakers,
    { id: 'rook', displayName: 'Rook', usePlayerIdentity: true },
  ];
}

async function isInstalledPortrait(
  url: URL,
  request: PortraitHeadRequest,
): Promise<boolean> {
  try {
    const response = await request(url, { method: 'HEAD' });
    const contentType = response.headers.get('content-type') ?? '';
    return response.ok && !contentType.toLowerCase().includes('text/html');
  } catch {
    return false;
  }
}
