export type AudioChannel = 'theme' | 'radio';

export interface AudioTrackDefinition {
  readonly id: string;
  readonly title: string;
  readonly channel: AudioChannel;
  readonly url: string;
  readonly mimeType: 'audio/mpeg' | 'audio/wav';
  readonly loop: boolean;
  readonly license: 'original-project-owned' | 'CC0-1.0' | 'public-domain';
}

export class AudioCatalog {
  private readonly tracks: ReadonlyMap<string, AudioTrackDefinition>;

  public constructor(definitions: readonly AudioTrackDefinition[]) {
    this.tracks = new Map(
      validateAudioCatalog(definitions).map((track) => [track.id, track]),
    );
  }

  public get(id: string): AudioTrackDefinition {
    const track = this.tracks.get(id);
    if (!track) throw new Error(`Unknown audio track id: ${id}`);
    return track;
  }

  public first(channel: AudioChannel): AudioTrackDefinition | undefined {
    return [...this.tracks.values()].find((track) => track.channel === channel);
  }

  public ids(): readonly string[] {
    return [...this.tracks.keys()];
  }
}

export function validateAudioCatalog(
  definitions: readonly AudioTrackDefinition[],
): readonly AudioTrackDefinition[] {
  const ids = new Set<string>();
  for (const track of definitions) {
    if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(track.id)) {
      throw new Error(`Invalid audio track id "${track.id}"`);
    }
    if (ids.has(track.id))
      throw new Error(`Duplicate audio track id: ${track.id}`);
    ids.add(track.id);
    if (!track.title.trim())
      throw new Error(`Audio track "${track.id}" requires a title`);
    if (
      !track.url.startsWith('/assets/audio/') ||
      /^(?:https?:)?\/\//i.test(track.url)
    ) {
      throw new Error(
        `Audio track "${track.id}" must use a local /assets/audio/ URL`,
      );
    }
  }
  return Object.freeze(definitions.map((track) => Object.freeze({ ...track })));
}

export const audioCatalog = new AudioCatalog([
  {
    id: 'theme.cinder-ledger',
    title: 'The Cinder Ledger',
    channel: 'theme',
    url: '/assets/audio/ashfall-theme/cinder-ledger-theme.mp3',
    mimeType: 'audio/mpeg',
    loop: true,
    license: 'original-project-owned',
  },
  {
    id: 'radio.cinder-ledger-instrumental',
    title: 'The Cinder Ledger · instrumental radio rotation',
    channel: 'radio',
    url: '/assets/audio/ashfall-theme/cinder-ledger-theme.mp3',
    mimeType: 'audio/mpeg',
    loop: true,
    license: 'original-project-owned',
  },
]);
