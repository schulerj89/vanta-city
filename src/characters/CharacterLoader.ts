import type { AnimationClip, Object3D } from 'three';
import {
  AssetLoadError,
  type GameAssetLoader,
  type ModelInstance,
} from '../assets/AssetLoader';
import type { CharacterDefinition } from './CharacterDefinition';
import { createPlaceholderCharacter } from './PlaceholderCharacter';

export interface AnimationValidation {
  readonly clips: ReadonlyMap<string, AnimationClip>;
  readonly availableClips: ReadonlyMap<string, AnimationClip>;
  readonly discoveredClipNames: readonly string[];
  readonly warnings: readonly string[];
}

export interface RootMotionDiagnostic {
  readonly clip: string;
  readonly tracks: readonly string[];
  readonly samples: readonly (readonly [number, number, number])[];
}

export interface LoadedCharacter {
  readonly definition: CharacterDefinition;
  readonly root: Object3D;
  readonly animationClips: ReadonlyMap<string, AnimationClip>;
  /** Named authored clips, protected by the same root-motion policy as gameplay. */
  readonly availableAnimationClips?: ReadonlyMap<string, AnimationClip>;
  readonly rootMotionDiagnostics?: readonly RootMotionDiagnostic[];
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
      const animationClips = removeSceneRootMotion(
        validation.clips,
        model.scene,
      );
      const availableAnimationClips = removeSceneRootMotion(
        validation.availableClips,
        model.scene,
      );
      return {
        definition,
        root: model.scene,
        animationClips,
        availableAnimationClips,
        rootMotionDiagnostics: inspectSceneRootMotion(
          validation.availableClips,
          model.scene,
        ),
        discoveredClipNames: validation.discoveredClipNames,
        source: 'asset',
        warnings: validation.warnings,
        dispose: () => model?.dispose(),
      };
    } catch (error: unknown) {
      model?.dispose();
      const message = `Character "${definition.id}" could not load its model; using placeholder. ${toMessage(error)}`;
      // Optional external assets intentionally fall back when they have not
      // been installed. Keep the reason in debug state without filling the
      // browser console with expected warnings on every startup.
      if (!(error instanceof AssetLoadError && error.optional)) {
        this.warn(message);
      }
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
      availableAnimationClips: new Map(),
      rootMotionDiagnostics: [],
      discoveredClipNames: [],
      source: 'placeholder',
      warnings,
      dispose,
    };
  }
}

/**
 * Root motion is not a supported movement source. Remove only tracks that move
 * the instantiated scene root; bone and child translations remain untouched.
 */
export function removeSceneRootMotion(
  clips: ReadonlyMap<string, AnimationClip>,
  sceneRoot: Object3D,
): ReadonlyMap<string, AnimationClip> {
  const protectedClips = new Map<string, AnimationClip>();
  for (const [logicalName, source] of clips) {
    const tracks = source.tracks.filter(
      (track) => !isSceneRootPositionTrack(track.name, sceneRoot.name),
    );
    if (tracks.length === source.tracks.length) {
      protectedClips.set(logicalName, source);
      continue;
    }
    const clip = source.clone();
    clip.tracks = tracks.map((track) => track.clone());
    clip.resetDuration();
    protectedClips.set(logicalName, clip);
  }
  return protectedClips;
}

/** Reports authored scene-root translation without ever applying it. */
export function inspectSceneRootMotion(
  clips: ReadonlyMap<string, AnimationClip>,
  sceneRoot: Object3D,
): readonly RootMotionDiagnostic[] {
  const diagnostics: RootMotionDiagnostic[] = [];
  for (const [clipName, clip] of clips) {
    const tracks = clip.tracks.filter((track) =>
      isSceneRootPositionTrack(track.name, sceneRoot.name),
    );
    if (tracks.length === 0) continue;
    const samples: [number, number, number][] = [];
    for (const track of tracks) {
      for (let index = 0; index + 2 < track.values.length; index += 3) {
        samples.push([
          Number(track.values[index]),
          Number(track.values[index + 1]),
          Number(track.values[index + 2]),
        ]);
      }
    }
    diagnostics.push({
      clip: clipName,
      tracks: tracks.map(({ name }) => name),
      samples,
    });
  }
  return diagnostics;
}

export async function validateAnimationBindings(
  definition: CharacterDefinition,
  embeddedClips: readonly AnimationClip[],
  assets: GameAssetLoader,
): Promise<AnimationValidation> {
  const clips = new Map<string, AnimationClip>();
  const availableClips = new Map<string, AnimationClip>();
  const warnings: string[] = [];
  const discovered = new Set<string>();
  const sourceClips = new Map<string, readonly AnimationClip[]>();
  sourceClips.set('embedded', embeddedClips);
  addAvailableClips(availableClips, embeddedClips);
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
          addAvailableClips(availableClips, external, binding.assetId);
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

  return {
    clips,
    availableClips,
    discoveredClipNames: [...discovered].sort(),
    warnings,
  };
}

function addAvailableClips(
  destination: Map<string, AnimationClip>,
  clips: readonly AnimationClip[],
  source?: string,
): void {
  for (const clip of clips) {
    if (!clip.name) continue;
    const key =
      destination.has(clip.name) && source
        ? `${source}:${clip.name}`
        : clip.name;
    destination.set(key, clip);
  }
}

function applyTransform(root: Object3D, definition: CharacterDefinition): void {
  const transform = definition.transform;
  if (!transform) return;
  if (typeof transform.scale === 'number')
    root.scale.setScalar(transform.scale);
  else if (transform.scale) root.scale.set(...transform.scale);
  if (transform.rotation) root.rotation.set(...transform.rotation);
  if (transform.forwardAxisCorrection) {
    root.rotation.y += transform.forwardAxisCorrection;
  }
  if (transform.offset) root.position.set(...transform.offset);
  root.updateMatrixWorld(true);
}

function isSceneRootPositionTrack(
  trackName: string,
  rootName: string,
): boolean {
  if (trackName === '.position' || trackName === 'position') return true;
  if (!rootName) return false;
  return (
    trackName === `${rootName}.position` ||
    trackName === `${rootName}/.position`
  );
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
