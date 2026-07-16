import { access, readFile } from 'node:fs/promises';
import {
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';
import { LoadingManager } from 'three';
import type { Material, Object3D, Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import type { AssetDescriptor } from '../../src/assets/AssetCatalog';
import type { CharacterDefinition } from '../../src/characters/CharacterDefinition';
import { createPlaceholderCharacter } from '../../src/characters/PlaceholderCharacter';
import type {
  CharacterAssetInspection,
  CharacterAssetInspector,
} from '../../src/characters/validation/CharacterAssetValidation';
import { CharacterInspectionError } from '../../src/characters/validation/CharacterAssetValidation';

interface GltfJson {
  readonly buffers?: readonly { readonly uri?: string }[];
  readonly images?: readonly {
    readonly uri?: string;
    readonly mimeType?: string;
  }[];
}

interface ResourceReference {
  readonly uri: string;
  readonly mimeType?: string;
}

export class NodeCharacterAssetInspector implements CharacterAssetInspector {
  private readonly publicRoot: string;

  public constructor(private readonly projectRoot: string) {
    this.publicRoot = resolve(projectRoot, 'public');
    installThreeNodePolyfills();
  }

  public async inspect(
    assetId: string,
    descriptor: AssetDescriptor,
  ): Promise<CharacterAssetInspection> {
    const sourcePath = this.resolveCatalogUrl(assetId, descriptor.url);
    try {
      await access(sourcePath);
    } catch (cause) {
      throw new CharacterInspectionError(
        'asset-missing',
        `Asset "${assetId}" does not exist at ${relative(this.projectRoot, sourcePath)}${descriptor.optional ? ' (catalog entry is optional)' : ''}.`,
        assetId,
        cause,
      );
    }

    let bytes: Buffer;
    let json: GltfJson;
    try {
      bytes = await readFile(sourcePath);
      json = readGlbJson(bytes);
    } catch (cause) {
      if (cause instanceof CharacterInspectionError) throw cause;
      throw new CharacterInspectionError(
        'glb-parse-failed',
        `Asset "${assetId}" is not a parseable GLB: ${toMessage(cause)}.`,
        assetId,
        cause,
      );
    }

    const resources = collectResources(json);
    const resourceData = new Map<string, string>();
    const localResources: string[] = [];
    for (const resource of resources) {
      if (resource.uri.startsWith('data:')) {
        localResources.push('embedded:data-uri');
        continue;
      }
      if (isNetworkUrl(resource.uri)) {
        throw new CharacterInspectionError(
          'external-network-resource',
          `Asset "${assetId}" references external network resource "${resource.uri}".`,
          assetId,
        );
      }
      const resourcePath = this.resolveResourcePath(
        assetId,
        sourcePath,
        resource.uri,
      );
      let resourceBytes: Buffer;
      try {
        resourceBytes = await readFile(resourcePath);
      } catch (cause) {
        throw new CharacterInspectionError(
          'local-resource-missing',
          `Asset "${assetId}" references missing local resource "${resource.uri}".`,
          assetId,
          cause,
        );
      }
      const mimeType = resource.mimeType ?? mimeTypeFor(resourcePath);
      resourceData.set(
        resource.uri,
        `data:${mimeType};base64,${resourceBytes.toString('base64')}`,
      );
      localResources.push(relative(this.projectRoot, resourcePath));
    }

    const manager = new LoadingManager();
    manager.setURLModifier((url) => resourceData.get(url) ?? url);
    const loader = new GLTFLoader(manager);
    let gltf: Awaited<ReturnType<GLTFLoader['parseAsync']>>;
    try {
      const arrayBuffer = Uint8Array.from(bytes).buffer;
      gltf = await loader.parseAsync(arrayBuffer, '');
    } catch (cause) {
      throw new CharacterInspectionError(
        'glb-parse-failed',
        `Asset "${assetId}" could not be parsed by Three.js: ${toMessage(cause)}.`,
        assetId,
        cause,
      );
    }

    const materialInspection = inspectMaterials(gltf.scene);
    let disposed = false;
    return {
      assetId,
      sourcePath: relative(this.projectRoot, sourcePath),
      scene: gltf.scene,
      animations: gltf.animations,
      localResources,
      ...materialInspection,
      dispose: () => {
        if (disposed) return;
        disposeSceneResources(gltf.scene);
        gltf.scene.clear();
        disposed = true;
      },
    };
  }

  public validatePreviewCycles(
    definition: CharacterDefinition,
    inspection: CharacterAssetInspection | undefined,
    cycles: number,
  ): Promise<void> {
    const instances = new Set<Object3D>();
    for (let cycle = 0; cycle < cycles; cycle += 1) {
      if (!inspection) {
        const placeholder = createPlaceholderCharacter();
        if (instances.has(placeholder.root)) {
          throw new Error(
            'Placeholder preview reused a disposed scene instance',
          );
        }
        instances.add(placeholder.root);
        placeholder.dispose();
        if (placeholder.root.children.length !== 0) {
          throw new Error(
            'Placeholder preview retained children after disposal',
          );
        }
        continue;
      }

      const instance = cloneSkeleton(inspection.scene);
      if (instances.has(instance)) {
        throw new Error(
          `Character "${definition.id}" preview reused a disposed model instance`,
        );
      }
      instances.add(instance);
      instance.removeFromParent();
      instance.clear();
      if (instance.children.length !== 0 || instance.parent !== null) {
        throw new Error(
          `Character "${definition.id}" preview instance did not dispose cleanly`,
        );
      }
    }
    return Promise.resolve();
  }

  private resolveCatalogUrl(assetId: string, url: string): string {
    if (isNetworkUrl(url)) {
      throw new CharacterInspectionError(
        'external-network-resource',
        `Asset "${assetId}" catalog URL must be local, received "${url}".`,
        assetId,
      );
    }
    const cleanUrl = decodeURIComponent(url.split(/[?#]/, 1)[0] ?? '');
    const path = resolve(this.publicRoot, cleanUrl.replace(/^\/+/, ''));
    this.assertWithinPublicRoot(assetId, path, url);
    return path;
  }

  private resolveResourcePath(
    assetId: string,
    sourcePath: string,
    uri: string,
  ): string {
    const decoded = decodeURIComponent(uri.split(/[?#]/, 1)[0] ?? '');
    const path = isAbsolute(decoded)
      ? resolve(this.publicRoot, decoded.replace(/^\/+/, ''))
      : resolve(dirname(sourcePath), decoded);
    this.assertWithinPublicRoot(assetId, path, uri);
    return path;
  }

  private assertWithinPublicRoot(
    assetId: string,
    path: string,
    source: string,
  ): void {
    if (
      path !== this.publicRoot &&
      !path.startsWith(`${this.publicRoot}${sep}`)
    ) {
      throw new CharacterInspectionError(
        'external-network-resource',
        `Asset "${assetId}" resource "${source}" escapes the public asset root.`,
        assetId,
      );
    }
  }
}

function readGlbJson(bytes: Buffer): GltfJson {
  if (bytes.byteLength < 20)
    throw new Error('file is smaller than a GLB header');
  if (bytes.readUInt32LE(0) !== 0x46546c67)
    throw new Error('GLB magic header is missing');
  if (bytes.readUInt32LE(4) !== 2)
    throw new Error('only GLB version 2 is supported');
  const declaredLength = bytes.readUInt32LE(8);
  if (declaredLength !== bytes.byteLength)
    throw new Error(
      `declared length ${declaredLength} does not match ${bytes.byteLength}`,
    );
  const jsonLength = bytes.readUInt32LE(12);
  if (bytes.readUInt32LE(16) !== 0x4e4f534a)
    throw new Error('first GLB chunk is not JSON');
  const jsonEnd = 20 + jsonLength;
  if (jsonEnd > bytes.byteLength)
    throw new Error('JSON chunk exceeds file size');
  const jsonText = bytes
    .subarray(20, jsonEnd)
    .toString('utf8')
    .replace(/[\0 ]+$/, '');
  return JSON.parse(jsonText) as GltfJson;
}

function collectResources(json: GltfJson): readonly ResourceReference[] {
  return [
    ...(json.buffers ?? [])
      .filter((entry): entry is { uri: string } => Boolean(entry.uri))
      .map(({ uri }) => ({ uri, mimeType: 'application/octet-stream' })),
    ...(json.images ?? [])
      .filter((entry): entry is { uri: string; mimeType?: string } =>
        Boolean(entry.uri),
      )
      .map(({ uri, mimeType }) => ({
        uri,
        ...(mimeType ? { mimeType } : {}),
      })),
  ];
}

function inspectMaterials(scene: Object3D): {
  materialCount: number;
  textureCount: number;
  unloadableTextureCount: number;
} {
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  scene.traverse((object) => {
    if (!('material' in object)) return;
    const candidates = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const candidate of candidates) {
      if (!isMaterial(candidate)) continue;
      materials.add(candidate);
      for (const value of Object.values(candidate)) {
        if (isTexture(value)) textures.add(value);
      }
    }
  });
  return {
    materialCount: materials.size,
    textureCount: textures.size,
    unloadableTextureCount: [...textures].filter(
      (texture) => texture.image === undefined || texture.image === null,
    ).length,
  };
}

function disposeSceneResources(scene: Object3D): void {
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  scene.traverse((object) => {
    if ('geometry' in object && isDisposable(object.geometry)) {
      object.geometry.dispose();
    }
    if (!('material' in object)) return;
    const candidates = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const candidate of candidates) {
      if (!isMaterial(candidate)) continue;
      materials.add(candidate);
      for (const value of Object.values(candidate)) {
        if (isTexture(value)) textures.add(value);
      }
    }
  });
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
}

function installThreeNodePolyfills(): void {
  if (!('ProgressEvent' in globalThis)) {
    Object.defineProperty(globalThis, 'ProgressEvent', {
      configurable: true,
      value: class ProgressEvent {
        public readonly lengthComputable: boolean;
        public readonly loaded: number;
        public readonly total: number;

        public constructor(
          public readonly type: string,
          init: {
            lengthComputable?: boolean;
            loaded?: number;
            total?: number;
          } = {},
        ) {
          this.lengthComputable = init.lengthComputable ?? false;
          this.loaded = init.loaded ?? 0;
          this.total = init.total ?? 0;
        }
      },
    });
  }
  if (!('createImageBitmap' in globalThis)) {
    Object.defineProperty(globalThis, 'createImageBitmap', {
      configurable: true,
      value: () =>
        Promise.resolve({ width: 1, height: 1, close: () => undefined }),
    });
  }
}

function mimeTypeFor(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

function isNetworkUrl(url: string): boolean {
  return /^(?:https?:)?\/\//i.test(url);
}

function isMaterial(value: unknown): value is Material {
  return (
    typeof value === 'object' &&
    value !== null &&
    'isMaterial' in value &&
    value.isMaterial === true
  );
}

function isTexture(value: unknown): value is Texture {
  return (
    typeof value === 'object' &&
    value !== null &&
    'isTexture' in value &&
    value.isTexture === true
  );
}

function isDisposable(value: unknown): value is { dispose(): void } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'dispose' in value &&
    typeof value.dispose === 'function'
  );
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
