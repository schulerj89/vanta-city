import type { AnimationClip, Object3D } from 'three';
import type { GameAssetLoader, ModelInstance } from '../assets/AssetLoader';
import type { CharacterDefinition } from './CharacterDefinition';
import { createPlaceholderCharacter } from './PlaceholderCharacter';

export interface AnimationValidation {
  readonly clips: ReadonlyMap<string, AnimationClip>;
  readonly discoveredClipNames: readonly string[];
  readonly warnings: readonly string[];
}

export interface LoadedCharacter {
  readonly definition: CharacterDefinition;
  readonly root: Object3D;
  readonly animationClips: ReadonlyMap<string, AnimationClip>;
  readonly discoveredClipNames: readonly string[];
  readonly source: 'asset' | 'placeholder';
  readonly warnings: readonly string[];
  dispose(): void;
}

export class CharacterLoader {
  public constructor(
    private readonly assets: GameAssetLoader,
    private readonly warn: (message: string) => void = console.warn,
  ) {}

  public async instantiate(
    definition: CharacterDefinition,
  ): Promise<LoadedCharacter> {
    if (!definition.modelAssetId) return this.placeholder(definition, []);

    let model: ModelInstance | undefined;
    try {
      model = await this.assets.instantiateModel(definition.modelAssetId);
      const validation = await validateAnimationBindings(
        definition,
        model.animations,
        this.assets,
      );
      for (const warning of validation.warnings) this.warn(warning);
      applyTransform(model.scene, definition);
      return {
        definition,
        root: model.scene,
        animationClips: validation.clips,
        discoveredClipNames: validation.discoveredClipNames,
        source: 'asset',
        warnings: validation.warnings,
        dispose: () => model?.dispose(),
      };
    } catch (error: unknown) {
      model?.dispose();
      const message = `Character "${definition.id}" could not load its model; using placeholder. ${toMessage(error)}`;
      this.warn(message);
      return this.placeholder(definition, [message]);
    }
  }

  private placeholder(
    definition: CharacterDefinition,
    warnings: readonly string[],
  ): LoadedCharacter {
    const placeholder = createPlaceholderCharacter();
    const dispose = (): void => placeholder.dispose();
    applyTransform(placeholder.root, definition);
    return {
      definition,
      root: placeholder.root,
      animationClips: new Map(),
      discoveredClipNames: [],
      source: 'placeholder',
      warnings,
      dispose,
    };
  }
}

export async function validateAnimationBindings(
  definition: CharacterDefinition,
  embeddedClips: readonly AnimationClip[],
  assets: GameAssetLoader,
): Promise<AnimationValidation> {
  const clips = new Map<string, AnimationClip>();
  const warnings: string[] = [];
  const discovered = new Set<string>();
  const sourceClips = new Map<string, readonly AnimationClip[]>();
  sourceClips.set('embedded', embeddedClips);
  for (const clip of embeddedClips) if (clip.name) discovered.add(clip.name);

  for (const [logicalName, binding] of Object.entries(
    definition.animations ?? {},
  )) {
    let candidates = embeddedClips;
    if (binding.assetId) {
      let external = sourceClips.get(binding.assetId);
      if (!external) {
        try {
          external = (await assets.loadGltf(binding.assetId)).animations;
          sourceClips.set(binding.assetId, external);
          for (const clip of external) if (clip.name) discovered.add(clip.name);
        } catch (error: unknown) {
          const warning = `Character "${definition.id}" animation asset "${binding.assetId}" failed: ${toMessage(error)}`;
          warnings.push(warning);
          continue;
        }
      }
      candidates = external;
    }

    const match = binding.clipNames
      .map((name) => candidates.find((clip) => clip.name === name))
      .find((clip): clip is AnimationClip => clip !== undefined);
    if (match) {
      clips.set(logicalName, match);
    } else {
      const importance = binding.required ? 'Required' : 'Optional';
      warnings.push(
        `${importance} animation "${logicalName}" is missing for character "${definition.id}" (tried: ${binding.clipNames.join(', ')})`,
      );
    }
  }

  return { clips, discoveredClipNames: [...discovered].sort(), warnings };
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

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
