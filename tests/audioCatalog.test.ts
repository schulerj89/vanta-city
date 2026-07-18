import { AudioCatalog, validateAudioCatalog } from '../src/audio/AudioCatalog';

const theme = {
  id: 'theme.ashfall-main',
  title: 'Ashfall Main Theme',
  channel: 'theme',
  url: '/assets/audio/theme.mp3',
  mimeType: 'audio/mpeg',
  loop: true,
  license: 'original-project-owned',
} as const;

describe('AudioCatalog', () => {
  it('resolves typed local tracks by id and channel', () => {
    const catalog = new AudioCatalog([theme]);
    expect(catalog.get(theme.id)).toEqual(theme);
    expect(catalog.first('theme')?.id).toBe(theme.id);
  });

  it('rejects duplicate ids and any runtime network URL', () => {
    expect(() => validateAudioCatalog([theme, theme])).toThrow(/Duplicate/);
    expect(() =>
      validateAudioCatalog([
        { ...theme, url: 'https://example.com/theme.mp3' },
      ]),
    ).toThrow(/local/);
  });
});
