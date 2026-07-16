import {
  ConversationCatalog,
  validateConversationDefinitions,
} from './ConversationDefinition';

export const conversationDefinitions = validateConversationDefinitions([
  {
    id: 'conversation.mack.introduction',
    lines: [
      {
        speakerId: 'mack',
        text: 'You picked a loud night to visit the garage.',
      },
      {
        speakerId: 'player',
        text: 'I was told you know what moves through this district.',
      },
      {
        speakerId: 'mack',
        text: 'I know enough to tell you the alley radios never stay quiet for long.',
      },
    ],
  },
  {
    id: 'conversation.nox.placeholder',
    lines: [],
    placeholder: true,
  },
  {
    id: 'conversation.raze.placeholder',
    lines: [],
    placeholder: true,
  },
]);

export const conversationCatalog = new ConversationCatalog(
  conversationDefinitions,
);
