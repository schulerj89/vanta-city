import {
  ConversationCatalog,
  validateConversationDefinitions,
} from './ConversationDefinition';

export const conversationDefinitions = validateConversationDefinitions([
  {
    id: 'conversation.mack.introduction',
    canCancel: true,
    lines: [
      {
        id: 'conversation.mack.introduction.late',
        speakerId: 'mack',
        text: 'You’re late.',
        onEnter: { id: 'conversation.mack-introduction.entered' },
      },
      {
        id: 'conversation.mack.introduction.nephew',
        speakerId: 'rook',
        text: 'Your nephew was supposed to meet me.',
      },
      {
        id: 'conversation.mack.introduction.later',
        speakerId: 'mack',
        text: 'Then he’s later.',
      },
      {
        id: 'conversation.mack.introduction.warning',
        speakerId: 'mack',
        text: 'Walk around the block. If anyone follows you, don’t bring them back here.',
      },
    ],
    onComplete: { id: 'conversation.mack-introduction.completed' },
  },
  {
    id: 'conversation.della.northbar-record',
    canCancel: true,
    lines: [
      {
        id: 'conversation.della.northbar-record.closed',
        speakerId: 'della-voss',
        text: 'Counter is closed. Next coach is posted on the board.',
      },
    ],
  },
  {
    id: 'conversation.nox.check-in',
    canCancel: true,
    lines: [
      {
        id: 'conversation.nox.check-in.clear',
        speakerId: 'nox',
        text: 'Alley’s clear. Keep moving.',
      },
    ],
  },
  {
    id: 'conversation.raze.check-in',
    canCancel: true,
    lines: [
      {
        id: 'conversation.raze.check-in.quiet',
        speakerId: 'raze',
        text: 'Deck’s quiet. Don’t make it loud.',
      },
    ],
  },
]);

export const conversationCatalog = new ConversationCatalog(
  conversationDefinitions,
);
