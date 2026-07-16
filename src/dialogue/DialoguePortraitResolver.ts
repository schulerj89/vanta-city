import type { DialogueLine } from '../conversations/ConversationDefinition';

export interface DialogueSpeaker {
  readonly id: string;
  readonly displayName: string;
  readonly portrait?: { readonly src: string; readonly alt?: string };
  readonly usePlayerIdentity?: boolean;
}

export interface PlayerPortraitIdentity {
  readonly displayName: string;
  readonly portraitSrc?: string;
}

export interface PlayerPortraitIdentitySource {
  getSelectedIdentity(): PlayerPortraitIdentity | undefined;
}

export interface ResolvedDialoguePortrait {
  readonly kind: 'image' | 'fallback';
  readonly source:
    | 'line-override'
    | 'speaker'
    | 'player-identity'
    | 'player-identity-fallback'
    | 'speaker-fallback'
    | 'unknown-speaker';
  readonly alt: string;
  readonly initials: string;
  readonly src?: string;
}

export class DialoguePortraitResolver {
  private readonly speakers: ReadonlyMap<string, DialogueSpeaker>;

  public constructor(
    speakers: readonly DialogueSpeaker[],
    private readonly playerIdentity?: PlayerPortraitIdentitySource,
  ) {
    this.speakers = new Map(speakers.map((speaker) => [speaker.id, speaker]));
  }

  public getSpeaker(speakerId: string): DialogueSpeaker | undefined {
    return this.speakers.get(speakerId);
  }

  public getSpeakerName(speakerId: string): string {
    return this.getSpeaker(speakerId)?.displayName ?? 'Unknown speaker';
  }

  public resolve(line: DialogueLine): ResolvedDialoguePortrait {
    const speaker = this.getSpeaker(line.speakerId);
    const speakerName = speaker?.displayName ?? 'Unknown speaker';
    const speakerInitials = initialsFor(speakerName);
    if (line.portraitOverride) {
      return {
        kind: 'image',
        source: 'line-override',
        src: line.portraitOverride.src,
        alt: line.portraitOverride.alt ?? `${speakerName} portrait`,
        initials: speakerInitials,
      };
    }
    if (speaker?.usePlayerIdentity) {
      const identity = this.playerIdentity?.getSelectedIdentity();
      if (identity?.portraitSrc) {
        return {
          kind: 'image',
          source: 'player-identity',
          src: identity.portraitSrc,
          alt: `${identity.displayName} portrait`,
          initials: initialsFor(identity.displayName),
        };
      }
      return {
        kind: 'fallback',
        source: 'player-identity-fallback',
        alt: `${speakerName} portrait fallback`,
        initials: initialsFor(identity?.displayName ?? speakerName),
      };
    }
    if (speaker?.portrait) {
      return {
        kind: 'image',
        source: 'speaker',
        src: speaker.portrait.src,
        alt: speaker.portrait.alt ?? `${speakerName} portrait`,
        initials: speakerInitials,
      };
    }
    return {
      kind: 'fallback',
      source: speaker ? 'speaker-fallback' : 'unknown-speaker',
      alt: `${speakerName} portrait fallback`,
      initials: speaker ? speakerInitials : '?',
    };
  }
}

function initialsFor(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  return initials || '?';
}
