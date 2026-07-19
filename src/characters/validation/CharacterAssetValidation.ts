import { Box3, Vector3 } from 'three';
import type {
  AnimationClip,
  BufferGeometry,
  Material,
  Mesh,
  Object3D,
  SkinnedMesh,
} from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import type { AssetDescriptor, AssetManifest } from '../../assets/AssetCatalog';
import type { CharacterDefinition } from '../CharacterDefinition';
import { createPlaceholderCharacter } from '../PlaceholderCharacter';

export type ValidationSeverity = 'failure' | 'warning' | 'off';
export type ValidationDefectType = 'asset' | 'code';

export type CharacterValidationCode =
  | 'duplicate-character-id'
  | 'invalid-character-id'
  | 'invalid-asset-id'
  | 'invalid-asset-definition'
  | 'unknown-asset-id'
  | 'asset-type-mismatch'
  | 'asset-missing'
  | 'optional-asset-missing'
  | 'glb-parse-failed'
  | 'external-network-resource'
  | 'local-resource-missing'
  | 'no-renderable-meshes'
  | 'invalid-bounds'
  | 'scale-out-of-range'
  | 'height-out-of-range'
  | 'invalid-grounding'
  | 'ground-offset-out-of-range'
  | 'skeleton-required'
  | 'invalid-clip-duration'
  | 'required-animation-missing'
  | 'optional-animation-missing'
  | 'root-motion-exceeded'
  | 'material-texture-unloadable'
  | 'preview-cycle-failed';

export interface CharacterValidationConfig {
  readonly limits: {
    readonly minScale: number;
    readonly maxScale: number;
    readonly minHeight: number;
    readonly maxHeight: number;
    readonly maxAbsoluteGroundOffset: number;
    readonly rootMotionTolerance: number;
  };
  readonly previewCycles: number;
  readonly requireSkeletonForMappedAnimations: boolean;
  readonly rules: Readonly<
    Partial<Record<CharacterValidationCode, ValidationSeverity>>
  >;
}

export type CharacterValidationConfigInput = Omit<
  Partial<CharacterValidationConfig>,
  'limits'
> & {
  readonly limits?: Partial<CharacterValidationConfig['limits']>;
};

export interface CharacterAssetInspection {
  readonly assetId: string;
  readonly sourcePath: string;
  readonly scene: Object3D;
  readonly animations: readonly AnimationClip[];
  readonly localResources: readonly string[];
  readonly materialCount: number;
  readonly textureCount: number;
  readonly unloadableTextureCount: number;
  dispose(): void;
}

export class CharacterInspectionError extends Error {
  public constructor(
    public readonly code:
      | 'asset-missing'
      | 'glb-parse-failed'
      | 'external-network-resource'
      | 'local-resource-missing',
    message: string,
    public readonly assetId: string,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = 'CharacterInspectionError';
  }
}

export interface CharacterAssetInspector {
  inspect(
    assetId: string,
    descriptor: AssetDescriptor,
  ): Promise<CharacterAssetInspection>;
  validatePreviewCycles(
    definition: CharacterDefinition,
    inspection: CharacterAssetInspection | undefined,
    cycles: number,
  ): Promise<void>;
}

export interface CharacterValidationIssue {
  readonly code: CharacterValidationCode;
  readonly severity: Exclude<ValidationSeverity, 'off'>;
  readonly defectType: ValidationDefectType;
  readonly message: string;
  readonly assetId?: string;
}

export interface CharacterValidationMetrics {
  readonly source: 'placeholder' | 'asset' | 'unavailable';
  readonly sourcePath?: string;
  readonly meshCount?: number;
  readonly materialCount?: number;
  readonly textureCount?: number;
  readonly bounds?: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
  readonly calculatedHeight?: number;
  readonly lowestPoint?: number;
  readonly visualGroundOffset?: number;
  readonly scale: readonly [number, number, number];
  readonly skeletonCount?: number;
  readonly animationClips: readonly {
    readonly name: string;
    readonly duration: number;
  }[];
  readonly resolvedAnimations: Readonly<Record<string, string>>;
  readonly localResources: readonly string[];
  readonly previewCycles: number;
}

export interface CharacterValidationResult {
  readonly id: string;
  readonly displayName: string;
  readonly modelAssetId?: string;
  readonly status: 'passed' | 'warnings' | 'failed';
  readonly issues: readonly CharacterValidationIssue[];
  readonly metrics: CharacterValidationMetrics;
}

export interface CharacterValidationReport {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly config: CharacterValidationConfig;
  readonly summary: {
    readonly characters: number;
    readonly passed: number;
    readonly warnings: number;
    readonly failed: number;
    readonly hardFailures: number;
    readonly assetDefects: number;
    readonly codeDefects: number;
  };
  readonly catalogIssues: readonly CharacterValidationIssue[];
  readonly characters: readonly CharacterValidationResult[];
}

export const defaultCharacterValidationConfig: CharacterValidationConfig = {
  limits: {
    minScale: 0.01,
    maxScale: 10,
    minHeight: 0.5,
    maxHeight: 3,
    maxAbsoluteGroundOffset: 0.25,
    rootMotionTolerance: 0.05,
  },
  previewCycles: 3,
  requireSkeletonForMappedAnimations: true,
  rules: {
    'optional-asset-missing': 'warning',
    'optional-animation-missing': 'warning',
    'scale-out-of-range': 'warning',
    'height-out-of-range': 'warning',
    'ground-offset-out-of-range': 'warning',
    'root-motion-exceeded': 'failure',
  },
};

const defaultSeverity: Readonly<
  Record<CharacterValidationCode, Exclude<ValidationSeverity, 'off'>>
> = {
  'duplicate-character-id': 'failure',
  'invalid-character-id': 'failure',
  'invalid-asset-id': 'failure',
  'invalid-asset-definition': 'failure',
  'unknown-asset-id': 'failure',
  'asset-type-mismatch': 'failure',
  'asset-missing': 'failure',
  'optional-asset-missing': 'warning',
  'glb-parse-failed': 'failure',
  'external-network-resource': 'failure',
  'local-resource-missing': 'failure',
  'no-renderable-meshes': 'failure',
  'invalid-bounds': 'failure',
  'scale-out-of-range': 'warning',
  'height-out-of-range': 'warning',
  'invalid-grounding': 'failure',
  'ground-offset-out-of-range': 'warning',
  'skeleton-required': 'failure',
  'invalid-clip-duration': 'failure',
  'required-animation-missing': 'failure',
  'optional-animation-missing': 'warning',
  'root-motion-exceeded': 'failure',
  'material-texture-unloadable': 'failure',
  'preview-cycle-failed': 'failure',
};

export function mergeCharacterValidationConfig(
  override: CharacterValidationConfigInput = {},
): CharacterValidationConfig {
  const config: CharacterValidationConfig = {
    limits: {
      ...defaultCharacterValidationConfig.limits,
      ...override.limits,
    },
    previewCycles:
      override.previewCycles ?? defaultCharacterValidationConfig.previewCycles,
    requireSkeletonForMappedAnimations:
      override.requireSkeletonForMappedAnimations ??
      defaultCharacterValidationConfig.requireSkeletonForMappedAnimations,
    rules: {
      ...defaultCharacterValidationConfig.rules,
      ...override.rules,
    },
  };
  validateConfig(config);
  return config;
}

export async function validateCharacterCatalog(
  definitions: readonly CharacterDefinition[],
  manifest: AssetManifest,
  inspector: CharacterAssetInspector,
  config = defaultCharacterValidationConfig,
): Promise<CharacterValidationReport> {
  validateConfig(config);
  const duplicateIds = duplicateValues(definitions.map(({ id }) => id));
  const characters: CharacterValidationResult[] = [];
  const catalogIssues: CharacterValidationIssue[] = [];
  validateManifest(manifest, issueWriter(catalogIssues, config));

  for (const definition of definitions) {
    characters.push(
      await validateCharacter(
        definition,
        manifest,
        inspector,
        config,
        duplicateIds,
      ),
    );
  }

  const allIssues = [
    ...catalogIssues,
    ...characters.flatMap(({ issues }) => issues),
  ];
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    config,
    summary: {
      characters: characters.length,
      passed: characters.filter(({ status }) => status === 'passed').length,
      warnings: characters.filter(({ status }) => status === 'warnings').length,
      failed: characters.filter(({ status }) => status === 'failed').length,
      hardFailures: allIssues.filter(({ severity }) => severity === 'failure')
        .length,
      assetDefects: allIssues.filter(({ defectType }) => defectType === 'asset')
        .length,
      codeDefects: allIssues.filter(({ defectType }) => defectType === 'code')
        .length,
    },
    catalogIssues,
    characters,
  };
}

async function validateCharacter(
  definition: CharacterDefinition,
  manifest: AssetManifest,
  inspector: CharacterAssetInspector,
  config: CharacterValidationConfig,
  duplicateIds: ReadonlySet<string>,
): Promise<CharacterValidationResult> {
  const issues: CharacterValidationIssue[] = [];
  const addIssue = issueWriter(issues, config);
  const scale = scaleVector(definition);
  let inspection: CharacterAssetInspection | undefined;
  const extraInspections: CharacterAssetInspection[] = [];
  let previewCycles = 0;
  let metrics: CharacterValidationMetrics = emptyMetrics(scale);

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(definition.id)) {
    addIssue(
      'invalid-character-id',
      'code',
      `Character id "${definition.id}" is not lowercase kebab-case.`,
    );
  }
  if (duplicateIds.has(definition.id)) {
    addIssue(
      'duplicate-character-id',
      'code',
      `Character id "${definition.id}" is registered more than once.`,
    );
  }
  validateScale(scale, config, addIssue);
  validateReferencedAssets(definition, manifest, addIssue);

  try {
    if (definition.modelAssetId) {
      const descriptor = manifest[definition.modelAssetId];
      if (descriptor?.type === 'model') {
        try {
          inspection = await inspector.inspect(
            definition.modelAssetId,
            descriptor,
          );
        } catch (error) {
          addInspectionError(error, descriptor, addIssue);
        }
      }
    }

    const source = inspection
      ? cloneSkeleton(inspection.scene)
      : definition.modelAssetId
        ? undefined
        : createPlaceholderCharacter().root;
    if (source) {
      applyTransform(source, definition);
      metrics = inspectScene(source, inspection, config, addIssue, scale);
      if (!inspection) disposePlaceholderScene(source);
      else source.clear();
    }

    if (inspection || !definition.modelAssetId) {
      try {
        await inspector.validatePreviewCycles(
          definition,
          inspection,
          config.previewCycles,
        );
        previewCycles = config.previewCycles;
      } catch (error) {
        addIssue(
          'preview-cycle-failed',
          inspection ? 'asset' : 'code',
          `Character preview could not complete ${config.previewCycles} cycles: ${toMessage(error)}`,
          definition.modelAssetId,
        );
      }
    }

    const animationMetrics = await validateAnimations(
      definition,
      manifest,
      inspector,
      inspection,
      extraInspections,
      config,
      addIssue,
    );
    metrics = {
      ...metrics,
      animationClips: animationMetrics.clips,
      resolvedAnimations: animationMetrics.resolved,
      previewCycles,
    };
  } finally {
    inspection?.dispose();
    for (const extra of extraInspections) extra.dispose();
  }

  const status = issues.some(({ severity }) => severity === 'failure')
    ? 'failed'
    : issues.length > 0
      ? 'warnings'
      : 'passed';
  return {
    id: definition.id,
    displayName: definition.displayName,
    ...(definition.modelAssetId
      ? { modelAssetId: definition.modelAssetId }
      : {}),
    status,
    issues,
    metrics,
  };
}

function inspectScene(
  scene: Object3D,
  inspection: CharacterAssetInspection | undefined,
  config: CharacterValidationConfig,
  addIssue: IssueWriter,
  scale: readonly [number, number, number],
): CharacterValidationMetrics {
  const defectType = inspection ? 'asset' : 'code';
  scene.updateMatrixWorld(true);
  let meshCount = 0;
  let skeletonCount = 0;
  scene.traverse((object) => {
    if (isMeshObject(object) && object.geometry.getAttribute('position'))
      meshCount += 1;
    if (isSkinnedMeshObject(object) && object.skeleton.bones.length > 0)
      skeletonCount += 1;
  });
  if (meshCount === 0) {
    addIssue(
      'no-renderable-meshes',
      defectType,
      'Scene does not contain a renderable mesh.',
      inspection?.assetId,
    );
  }

  const bounds = new Box3().setFromObject(scene);
  const min = bounds.min.toArray();
  const max = bounds.max.toArray();
  const size = bounds.getSize(new Vector3());
  const boundsFinite = [...min, ...max, size.x, size.y, size.z].every(
    Number.isFinite,
  );
  if (bounds.isEmpty() || !boundsFinite || size.lengthSq() === 0) {
    addIssue(
      'invalid-bounds',
      defectType,
      'Calculated model bounds must be finite and nonzero.',
      inspection?.assetId,
    );
  }

  const lowestPoint = min[1];
  const visualGroundOffset = lowestPoint === 0 ? 0 : -lowestPoint;
  if (!Number.isFinite(lowestPoint) || !Number.isFinite(visualGroundOffset)) {
    addIssue(
      'invalid-grounding',
      defectType,
      'Lowest point and visual-ground offset must be finite.',
      inspection?.assetId,
    );
  } else if (
    Math.abs(visualGroundOffset) > config.limits.maxAbsoluteGroundOffset
  ) {
    addIssue(
      'ground-offset-out-of-range',
      defectType,
      `Visual-ground offset ${formatNumber(visualGroundOffset)} exceeds ±${config.limits.maxAbsoluteGroundOffset}.`,
      inspection?.assetId,
    );
  }

  if (
    Number.isFinite(size.y) &&
    (size.y < config.limits.minHeight || size.y > config.limits.maxHeight)
  ) {
    addIssue(
      'height-out-of-range',
      defectType,
      `Calculated height ${formatNumber(size.y)} is outside ${config.limits.minHeight}–${config.limits.maxHeight}.`,
      inspection?.assetId,
    );
  }
  if ((inspection?.unloadableTextureCount ?? 0) > 0) {
    addIssue(
      'material-texture-unloadable',
      'asset',
      `${inspection?.unloadableTextureCount ?? 0} material texture(s) could not be loaded.`,
      inspection?.assetId,
    );
  }

  return {
    source: inspection ? 'asset' : 'placeholder',
    ...(inspection ? { sourcePath: inspection.sourcePath } : {}),
    meshCount,
    materialCount: inspection?.materialCount ?? countMaterials(scene),
    textureCount: inspection?.textureCount ?? 0,
    bounds: { min, max },
    calculatedHeight: size.y,
    lowestPoint,
    visualGroundOffset,
    scale,
    skeletonCount,
    animationClips: [],
    resolvedAnimations: {},
    localResources: inspection?.localResources ?? [],
    previewCycles: 0,
  };
}

async function validateAnimations(
  definition: CharacterDefinition,
  manifest: AssetManifest,
  inspector: CharacterAssetInspector,
  model: CharacterAssetInspection | undefined,
  extraInspections: CharacterAssetInspection[],
  config: CharacterValidationConfig,
  addIssue: IssueWriter,
): Promise<{
  clips: readonly { name: string; duration: number }[];
  resolved: Readonly<Record<string, string>>;
}> {
  const bySource = new Map<string, readonly AnimationClip[]>();
  bySource.set('embedded', model?.animations ?? []);

  for (const binding of Object.values(definition.animations ?? {})) {
    if (!binding.assetId || bySource.has(binding.assetId)) continue;
    const descriptor = manifest[binding.assetId];
    if (!descriptor || descriptor.type !== 'animation') continue;
    try {
      const inspection = await inspector.inspect(binding.assetId, descriptor);
      extraInspections.push(inspection);
      bySource.set(binding.assetId, inspection.animations);
    } catch (error) {
      addInspectionError(error, descriptor, addIssue);
      bySource.set(binding.assetId, []);
    }
  }

  const allClips = [...bySource.values()].flat();
  for (const clip of allClips) {
    if (!Number.isFinite(clip.duration) || clip.duration <= 0) {
      addIssue(
        'invalid-clip-duration',
        'asset',
        `Animation clip "${clip.name || '<unnamed>'}" has invalid duration ${String(clip.duration)}.`,
        model?.assetId,
      );
    }
  }

  const resolved: Record<string, string> = {};
  const optionalEmbeddedSourceUnavailable = Boolean(
    !model &&
    definition.modelAssetId &&
    manifest[definition.modelAssetId]?.optional,
  );
  for (const [logicalName, binding] of Object.entries(
    definition.animations ?? {},
  )) {
    const candidates = bySource.get(binding.assetId ?? 'embedded') ?? [];
    const clip = binding.clipNames
      .map((name) => candidates.find((candidate) => candidate.name === name))
      .find((candidate): candidate is AnimationClip => candidate !== undefined);
    if (!clip) {
      // The optional-file warning already explains why embedded clips cannot be
      // inspected. Keep required mappings strict whenever a model is present.
      if (!binding.assetId && optionalEmbeddedSourceUnavailable) continue;
      addIssue(
        binding.required
          ? 'required-animation-missing'
          : 'optional-animation-missing',
        'asset',
        `${binding.required ? 'Required' : 'Optional'} animation "${logicalName}" did not resolve (tried: ${binding.clipNames.join(', ')}).`,
        binding.assetId ?? model?.assetId,
      );
      continue;
    }
    resolved[logicalName] = clip.name;
    if (
      config.requireSkeletonForMappedAnimations &&
      (model?.scene ? countSkeletons(model.scene) : 0) === 0
    ) {
      addIssue(
        'skeleton-required',
        'asset',
        `Animation "${logicalName}" resolved but the character model has no skeleton.`,
        model?.assetId,
      );
    }
    if (['idle', 'walk', 'run', 'gesture', 'applaud'].includes(logicalName)) {
      const translation = rootMotionDistance(clip, model?.scene);
      if (translation > config.limits.rootMotionTolerance) {
        addIssue(
          'root-motion-exceeded',
          'asset',
          `Animation "${logicalName}" has ${formatNumber(translation)} units of horizontal root translation; tolerance is ${config.limits.rootMotionTolerance}.`,
          binding.assetId ?? model?.assetId,
        );
      }
    }
  }

  return {
    clips: allClips
      .map((clip) => ({
        name: clip.name || '<unnamed>',
        duration: clip.duration,
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    resolved,
  };
}

function validateReferencedAssets(
  definition: CharacterDefinition,
  manifest: AssetManifest,
  addIssue: IssueWriter,
): void {
  const references: [string, AssetDescriptor['type']][] = [];
  if (definition.portraitAssetId)
    references.push([definition.portraitAssetId, 'texture']);
  if (definition.modelAssetId)
    references.push([definition.modelAssetId, 'model']);
  for (const binding of Object.values(definition.animations ?? {})) {
    if (binding.assetId) references.push([binding.assetId, 'animation']);
  }
  for (const attachment of definition.attachments ?? []) {
    references.push([attachment.assetId, 'model']);
  }
  for (const variation of definition.materialVariations ?? []) {
    if (variation.textureAssetId)
      references.push([variation.textureAssetId, 'texture']);
  }

  for (const [id, expectedType] of references) {
    if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(id)) {
      addIssue(
        'invalid-asset-id',
        'code',
        `Referenced asset id "${id}" is invalid.`,
        id,
      );
      continue;
    }
    const descriptor = manifest[id];
    if (!descriptor) {
      addIssue(
        'unknown-asset-id',
        'code',
        `Referenced asset "${id}" is not registered.`,
        id,
      );
    } else if (descriptor.type !== expectedType) {
      addIssue(
        'asset-type-mismatch',
        'code',
        `Asset "${id}" is ${descriptor.type}, expected ${expectedType}.`,
        id,
      );
    }
  }
}

function validateManifest(
  manifest: AssetManifest,
  addIssue: IssueWriter,
): void {
  for (const [id, descriptor] of Object.entries(manifest)) {
    if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(id)) {
      addIssue(
        'invalid-asset-id',
        'code',
        `Catalog asset id "${id}" is invalid.`,
        id,
      );
    }
    if (
      !['model', 'animation', 'texture'].includes(descriptor.type) ||
      descriptor.url.trim().length === 0
    ) {
      addIssue(
        'invalid-asset-definition',
        'code',
        `Catalog asset "${id}" has an invalid type or URL.`,
        id,
      );
    }
  }
}

function validateScale(
  scale: readonly [number, number, number],
  config: CharacterValidationConfig,
  addIssue: IssueWriter,
): void {
  if (
    scale.some(
      (value) =>
        !Number.isFinite(value) ||
        value < config.limits.minScale ||
        value > config.limits.maxScale,
    )
  ) {
    addIssue(
      'scale-out-of-range',
      'code',
      `Scale [${scale.join(', ')}] is outside ${config.limits.minScale}–${config.limits.maxScale}.`,
    );
  }
}

function addInspectionError(
  error: unknown,
  descriptor: AssetDescriptor,
  addIssue: IssueWriter,
): void {
  if (error instanceof CharacterInspectionError) {
    const code =
      error.code === 'asset-missing' && descriptor.optional
        ? 'optional-asset-missing'
        : error.code;
    addIssue(code, 'asset', error.message, error.assetId);
    return;
  }
  addIssue(
    'glb-parse-failed',
    'asset',
    `Unexpected inspection failure: ${toMessage(error)}`,
  );
}

type IssueWriter = (
  code: CharacterValidationCode,
  defectType: ValidationDefectType,
  message: string,
  assetId?: string,
) => void;

function issueWriter(
  issues: CharacterValidationIssue[],
  config: CharacterValidationConfig,
): IssueWriter {
  return (code, defectType, message, assetId) => {
    const severity = config.rules[code] ?? defaultSeverity[code];
    if (severity === 'off') return;
    issues.push({
      code,
      severity,
      defectType,
      message,
      ...(assetId ? { assetId } : {}),
    });
  };
}

function rootMotionDistance(
  clip: AnimationClip,
  scene: Object3D | undefined,
): number {
  if (!scene) return 0;
  const rootNames = new Set<string>();
  scene.traverse((object) => {
    if (
      'isBone' in object &&
      object.isBone === true &&
      (!object.parent || !('isBone' in object.parent))
    ) {
      rootNames.add(object.name);
    }
  });
  if (scene.name) rootNames.add(scene.name);

  let maximum = 0;
  for (const track of clip.tracks) {
    if (!track.name.endsWith('.position')) continue;
    const target = track.name.slice(0, -'.position'.length);
    if (target && !rootNames.has(target)) continue;
    const values = track.values;
    if (values.length < 6) continue;
    const originX = Number(values[0]);
    const originZ = Number(values[2]);
    for (let index = 3; index + 2 < values.length; index += 3) {
      const distance = Math.hypot(
        Number(values[index]) - originX,
        Number(values[index + 2]) - originZ,
      );
      if (Number.isFinite(distance)) maximum = Math.max(maximum, distance);
    }
  }
  return maximum;
}

function applyTransform(root: Object3D, definition: CharacterDefinition): void {
  const transform = definition.transform;
  if (!transform) return;
  if (typeof transform.scale === 'number')
    root.scale.setScalar(transform.scale);
  else if (transform.scale) root.scale.set(...transform.scale);
  if (transform.rotation) root.rotation.set(...transform.rotation);
  if (transform.offset) root.position.set(...transform.offset);
}

function scaleVector(
  definition: CharacterDefinition,
): readonly [number, number, number] {
  const scale = definition.transform?.scale ?? 1;
  return typeof scale === 'number' ? [scale, scale, scale] : scale;
}

function countSkeletons(scene: Object3D): number {
  let count = 0;
  scene.traverse((object) => {
    if (isSkinnedMeshObject(object) && object.skeleton.bones.length > 0)
      count += 1;
  });
  return count;
}

function countMaterials(scene: Object3D): number {
  const materials = new Set<unknown>();
  scene.traverse((object) => {
    if (!('material' in object)) return;
    const material = object.material;
    if (Array.isArray(material)) {
      for (const entry of material) materials.add(entry);
    } else materials.add(material);
  });
  return materials.size;
}

function disposePlaceholderScene(scene: Object3D): void {
  scene.traverse((object) => {
    if (isMeshObject(object)) {
      object.geometry.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) material.dispose();
    }
  });
  scene.clear();
}

function isMeshObject(
  object: Object3D,
): object is Mesh<BufferGeometry, Material | Material[]> {
  return 'isMesh' in object && object.isMesh === true;
}

function isSkinnedMeshObject(
  object: Object3D,
): object is SkinnedMesh<BufferGeometry, Material | Material[]> {
  return 'isSkinnedMesh' in object && object.isSkinnedMesh === true;
}

function emptyMetrics(
  scale: readonly [number, number, number],
): CharacterValidationMetrics {
  return {
    source: 'unavailable',
    scale,
    animationClips: [],
    resolvedAnimations: {},
    localResources: [],
    previewCycles: 0,
  };
}

function duplicateValues(values: readonly string[]): ReadonlySet<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return duplicates;
}

function validateConfig(config: CharacterValidationConfig): void {
  const limits = Object.values(config.limits);
  if (limits.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error(
      'Character validation limits must be finite and nonnegative',
    );
  }
  if (
    config.limits.minScale <= 0 ||
    config.limits.minHeight <= 0 ||
    config.limits.minScale > config.limits.maxScale ||
    config.limits.minHeight > config.limits.maxHeight
  ) {
    throw new Error('Character validation minimums cannot exceed maximums');
  }
  if (!Number.isInteger(config.previewCycles) || config.previewCycles < 1) {
    throw new Error('previewCycles must be a positive integer');
  }
  for (const severity of Object.values(config.rules)) {
    if (!['failure', 'warning', 'off'].includes(severity)) {
      throw new Error(`Invalid validation rule severity: ${String(severity)}`);
    }
  }
}

function formatNumber(value: number): string {
  return value.toFixed(3).replace(/\.?0+$/, '');
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
