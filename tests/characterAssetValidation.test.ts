import {
  AnimationClip,
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  VectorKeyframeTrack,
} from 'three';
import type { AssetManifest } from '../src/assets/AssetCatalog';
import type { CharacterDefinition } from '../src/characters/CharacterDefinition';
import type {
  CharacterAssetInspection,
  CharacterAssetInspector,
} from '../src/characters/validation/CharacterAssetValidation';
import {
  CharacterInspectionError,
  mergeCharacterValidationConfig,
  validateCharacterCatalog,
} from '../src/characters/validation/CharacterAssetValidation';

const modelManifest: AssetManifest = {
  'character.hero.model': { type: 'model', url: '/assets/hero.glb' },
};

const hero: CharacterDefinition = {
  id: 'hero',
  displayName: 'Hero',
  modelAssetId: 'character.hero.model',
  fallback: 'placeholder',
};

function modelInspection(
  animations: readonly AnimationClip[] = [],
): CharacterAssetInspection {
  const scene = new Group();
  scene.name = 'Root';
  const mesh = new Mesh(new BoxGeometry(1, 2, 1), new MeshBasicMaterial());
  mesh.position.y = 1;
  scene.add(mesh);
  return {
    assetId: 'character.hero.model',
    sourcePath: 'public/assets/hero.glb',
    scene,
    animations,
    localResources: [],
    materialCount: 1,
    textureCount: 0,
    unloadableTextureCount: 0,
    dispose: vi.fn(),
  };
}

function mockInspector(
  inspection: CharacterAssetInspection,
): CharacterAssetInspector {
  return {
    inspect: vi.fn(async () => inspection),
    validatePreviewCycles: vi.fn(async () => undefined),
  };
}

describe('character asset validation', () => {
  it('reports metrics and repeated preview success for a valid model', async () => {
    const inspection = modelInspection();
    const inspector = mockInspector(inspection);

    const report = await validateCharacterCatalog(
      [hero],
      modelManifest,
      inspector,
      mergeCharacterValidationConfig(),
    );

    expect(report.summary).toMatchObject({ passed: 1, failed: 0 });
    expect(report.characters[0]?.metrics).toMatchObject({
      meshCount: 1,
      calculatedHeight: 2,
      lowestPoint: 0,
      visualGroundOffset: 0,
      previewCycles: 3,
    });
    expect(inspector.validatePreviewCycles).toHaveBeenCalledWith(
      hero,
      inspection,
      3,
    );
    expect(inspection.dispose).toHaveBeenCalledOnce();
  });

  it('warns instead of failing when a missing model is explicitly optional', async () => {
    const manifest: AssetManifest = {
      'character.hero.model': {
        type: 'model',
        url: '/assets/hero.glb',
        optional: true,
      },
    };
    const inspector: CharacterAssetInspector = {
      inspect: vi.fn(async () => {
        throw new CharacterInspectionError(
          'asset-missing',
          'hero.glb is absent',
          'character.hero.model',
        );
      }),
      validatePreviewCycles: vi.fn(async () => undefined),
    };

    const optionalAnimatedHero: CharacterDefinition = {
      ...hero,
      animations: { idle: { clipNames: ['Idle'], required: true } },
    };
    const report = await validateCharacterCatalog(
      [optionalAnimatedHero],
      manifest,
      inspector,
      mergeCharacterValidationConfig(),
    );

    expect(report.summary).toMatchObject({ warnings: 1, failed: 0 });
    expect(report.characters[0]?.issues).toMatchObject([
      { code: 'optional-asset-missing', severity: 'warning' },
    ]);
  });

  it('detects clip duration, mapping, skeleton, and root-motion defects', async () => {
    const movingIdle = new AnimationClip('Idle', 1, [
      new VectorKeyframeTrack('Root.position', [0, 1], [0, 0, 0, 0.2, 0, 0]),
    ]);
    const broken = new AnimationClip('Broken', 0, []);
    const definition: CharacterDefinition = {
      ...hero,
      animations: {
        idle: { clipNames: ['Idle'], required: true },
        walk: { clipNames: ['Walk'], required: true },
      },
    };

    const report = await validateCharacterCatalog(
      [definition],
      modelManifest,
      mockInspector(modelInspection([movingIdle, broken])),
      mergeCharacterValidationConfig(),
    );
    const codes = report.characters[0]?.issues.map(({ code }) => code);

    expect(codes).toEqual(
      expect.arrayContaining([
        'invalid-clip-duration',
        'required-animation-missing',
        'skeleton-required',
        'root-motion-exceeded',
      ]),
    );
    expect(report.summary.failed).toBe(1);
  });

  it('applies root-motion validation to NPC gestures', async () => {
    const movingGesture = new AnimationClip('Gesture', 1, [
      new VectorKeyframeTrack('Root.position', [0, 1], [0, 0, 0, 0.2, 0, 0]),
    ]);
    const definition: CharacterDefinition = {
      ...hero,
      animations: {
        gesture: { clipNames: ['Gesture'], required: true },
      },
    };

    const report = await validateCharacterCatalog(
      [definition],
      modelManifest,
      mockInspector(modelInspection([movingGesture])),
      mergeCharacterValidationConfig({
        requireSkeletonForMappedAnimations: false,
      }),
    );

    expect(report.characters[0]?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'root-motion-exceeded' }),
      ]),
    );
  });

  it('supports warning, failure, and off rule overrides', async () => {
    const movingIdle = new AnimationClip('Idle', 1, [
      new VectorKeyframeTrack('Root.position', [0, 1], [0, 0, 0, 0.2, 0, 0]),
    ]);
    const definition: CharacterDefinition = {
      ...hero,
      animations: {
        idle: { clipNames: ['Idle'], required: false },
        walk: { clipNames: ['Walk'], required: false },
      },
    };
    const config = mergeCharacterValidationConfig({
      requireSkeletonForMappedAnimations: false,
      rules: {
        'root-motion-exceeded': 'warning',
        'optional-animation-missing': 'off',
      },
    });

    const report = await validateCharacterCatalog(
      [definition],
      modelManifest,
      mockInspector(modelInspection([movingIdle])),
      config,
    );

    expect(report.summary).toMatchObject({ warnings: 1, failed: 0 });
    expect(report.characters[0]?.issues).toMatchObject([
      { code: 'root-motion-exceeded', severity: 'warning' },
    ]);
  });

  it('reports duplicate character and invalid asset identifiers as code defects', async () => {
    const invalid: CharacterDefinition = {
      id: 'Hero Bad',
      displayName: 'Invalid',
      modelAssetId: 'Invalid Asset',
      fallback: 'placeholder',
    };
    const inspector = mockInspector(modelInspection());

    const report = await validateCharacterCatalog(
      [invalid, invalid],
      {
        'Bad Catalog ID': {
          type: 'model',
          url: '/assets/unreferenced.glb',
        },
      },
      inspector,
      mergeCharacterValidationConfig(),
    );
    const codes = report.characters[0]?.issues.map(({ code }) => code);

    expect(codes).toEqual(
      expect.arrayContaining([
        'duplicate-character-id',
        'invalid-character-id',
        'invalid-asset-id',
      ]),
    );
    expect(report.summary.codeDefects).toBeGreaterThan(0);
    expect(report.catalogIssues).toMatchObject([
      { code: 'invalid-asset-id', defectType: 'code' },
    ]);
    expect(inspector.inspect).not.toHaveBeenCalled();
  });
});
