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
        id: 'conversation.mack.introduction.arrival',
        speakerId: 'mack',
        text: 'You made the 5:42. Orin didn’t.',
        portraitPresentation: 'none',
        onEnter: { id: 'conversation.mack-introduction.entered' },
      },
      {
        id: 'conversation.mack.introduction.how-long',
        speakerId: 'rook',
        text: 'How long?',
        portraitPresentation: 'none',
      },
      {
        id: 'conversation.mack.introduction.two-nights',
        speakerId: 'mack',
        text: 'Two nights. He left one yard address and no explanation.',
        portraitPresentation: 'none',
      },
      {
        id: 'conversation.mack.introduction.manifest',
        speakerId: 'rook',
        text: 'Marrow took the manifest carbon. They have my arrival time.',
        portraitPresentation: 'none',
      },
      {
        id: 'conversation.mack.introduction.not-name',
        speakerId: 'mack',
        text: 'Time and wagon. Not your name. Nox is holding the east yard.',
        portraitPresentation: 'none',
      },
      {
        id: 'conversation.mack.introduction.accept',
        speakerId: 'rook',
        text: 'I’m finding Orin. Give me the long road.',
        portraitPresentation: 'none',
      },
    ],
    onComplete: { id: 'conversation.mack-introduction.completed' },
  },
  {
    id: 'conversation.nox.check-in',
    canCancel: true,
    lines: [
      {
        id: 'conversation.nox.check-in.arrival',
        speakerId: 'nox',
        text: 'East gate stayed clear. You took the long road.',
        portraitPresentation: 'none',
      },
      {
        id: 'conversation.nox.check-in.name',
        speakerId: 'rook',
        text: 'You know who I am?',
        portraitPresentation: 'none',
      },
      {
        id: 'conversation.nox.check-in.orin',
        speakerId: 'nox',
        text: 'Orin wrote “Rook” beside this yard. Nothing else.',
        portraitPresentation: 'none',
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
