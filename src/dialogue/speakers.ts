import type { DialogueSpeaker } from './DialoguePortraitResolver';
import type { AssetCatalog } from '../assets/AssetCatalog';
import type { NpcDefinition } from '../npcs/NpcDefinition';

export function createDialogueSpeakers(
  npcs: readonly NpcDefinition[],
  assets: AssetCatalog,
): readonly DialogueSpeaker[] {
  return [
    ...npcs.map((npc) => {
      const portrait = assets.get(npc.portraitAssetId);
      return {
        id: npc.id,
        displayName: npc.displayName,
        ...(portrait.type === 'texture'
          ? {
              portrait: {
                src: portrait.url,
                alt: `${npc.displayName} portrait`,
              },
            }
          : {}),
      } satisfies DialogueSpeaker;
    }),
    { id: 'rook', displayName: 'Rook', usePlayerIdentity: true },
  ];
}
