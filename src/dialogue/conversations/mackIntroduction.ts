import type { ConversationDefinition } from '../DialogueDefinition';

export const mackIntroduction = {
  id: 'mack.introduction',
  canCancel: true,
  lines: [
    {
      id: 'mack.introduction.late',
      speakerId: 'mack',
      text: 'You’re late.',
      onEnter: { id: 'conversation.mack-introduction.entered' },
    },
    {
      id: 'mack.introduction.nephew',
      speakerId: 'rook',
      text: 'Your nephew was supposed to meet me.',
    },
    {
      id: 'mack.introduction.later',
      speakerId: 'mack',
      text: 'Then he’s later.',
    },
    {
      id: 'mack.introduction.warning',
      speakerId: 'mack',
      text: 'Walk around the block. If anyone follows you, don’t bring them back here.',
    },
  ],
  onComplete: { id: 'conversation.mack-introduction.completed' },
} as const satisfies ConversationDefinition;
