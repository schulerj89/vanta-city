export type AudioChannel = 'theme' | 'radio';
export type AudioTrackRole = 'music' | 'station-break';

export interface AudioTrackDefinition {
  readonly id: string;
  readonly title: string;
  readonly channel: AudioChannel;
  readonly role: AudioTrackRole;
  readonly url: string;
  readonly mimeType: 'audio/mpeg' | 'audio/mp4' | 'audio/wav';
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
    return this.all(channel)[0];
  }

  /** Ordered program entries for a channel. Catalog order is authoritative. */
  public all(channel: AudioChannel): readonly AudioTrackDefinition[] {
    return [...this.tracks.values()].filter(
      (track) => track.channel === channel,
    );
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
    role: 'music',
    url: '/assets/audio/ashfall-theme/cinder-ledger-theme.mp3',
    mimeType: 'audio/mpeg',
    loop: true,
    license: 'original-project-owned',
  },
  {
    id: 'radio.ashfall-night-service.station-break-001',
    title: 'Ashfall Night Service · station break 001',
    channel: 'radio',
    role: 'station-break',
    url: '/assets/audio/ashfall-night-service/host/station-break-001.mp3',
    mimeType: 'audio/mpeg',
    loop: false,
    license: 'original-project-owned',
  },
  {
    id: 'radio.ashfall-night-service.bus-stop-sun',
    title: 'Bus Stop Sun',
    channel: 'radio',
    role: 'music',
    url: '/assets/audio/ashfall-night-service/music/bus-stop-sun.m4a',
    mimeType: 'audio/mp4',
    loop: false,
    license: 'original-project-owned',
  },
  {
    id: 'radio.ashfall-night-service.basement-ciphers',
    title: 'Basement Ciphers',
    channel: 'radio',
    role: 'music',
    url: '/assets/audio/ashfall-night-service/music/basement-ciphers.m4a',
    mimeType: 'audio/mp4',
    loop: false,
    license: 'original-project-owned',
  },
  {
    id: 'radio.ashfall-night-service.bus-ticket-folds',
    title: 'Bus Ticket Folds',
    channel: 'radio',
    role: 'music',
    url: '/assets/audio/ashfall-night-service/music/bus-ticket-folds.m4a',
    mimeType: 'audio/mp4',
    loop: false,
    license: 'original-project-owned',
  },
  {
    id: 'radio.ashfall-night-service.sugar-suit',
    title: 'Sugar Suit',
    channel: 'radio',
    role: 'music',
    url: '/assets/audio/ashfall-night-service/music/sugar-suit.m4a',
    mimeType: 'audio/mp4',
    loop: false,
    license: 'original-project-owned',
  },
]);
