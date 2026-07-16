import type { DialogueSpeaker } from './DialoguePortraitResolver';

export const dialogueSpeakers = [
  { id: 'mack', displayName: 'Mack' },
  { id: 'rook', displayName: 'Rook', usePlayerIdentity: true },
] as const satisfies readonly DialogueSpeaker[];
