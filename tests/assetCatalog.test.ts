import {
  AssetCatalog,
  validateAssetManifest,
} from '../src/assets/AssetCatalog';

describe('AssetCatalog', () => {
  it('resolves validated logical asset ids', () => {
    const catalog = new AssetCatalog({
      'character.hero.model': { type: 'model', url: '/hero.glb' },
    });

    expect(catalog.get('character.hero.model')).toMatchObject({
      type: 'model',
      url: '/hero.glb',
    });
    expect(catalog.has('character.missing.model')).toBe(false);
  });

  it('rejects invalid ids and empty urls', () => {
    expect(() =>
      validateAssetManifest({
        'Character Hero': { type: 'model', url: '/hero.glb' },
      }),
    ).toThrow('Invalid asset id');
    expect(() =>
      validateAssetManifest({
        'character.hero': { type: 'model', url: ' ' },
      }),
    ).toThrow('non-empty URL');
  });

  it('reports unknown ids clearly', () => {
    const catalog = new AssetCatalog({});
    expect(() => catalog.get('missing')).toThrow('Unknown asset id: missing');
  });
});
