export type AssetType = 'model' | 'animation' | 'texture';

export interface AssetAttribution {
  readonly title: string;
  readonly creator?: string;
  readonly sourceUrl?: string;
  readonly license?: string;
  readonly licenseUrl?: string;
}

export interface AssetDescriptor {
  readonly type: AssetType;
  readonly url: string;
  readonly optional?: boolean;
  readonly attribution?: AssetAttribution;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

export type AssetManifest = Readonly<Record<string, AssetDescriptor>>;

export class AssetCatalog {
  private readonly assets: AssetManifest;

  public constructor(manifest: AssetManifest) {
    this.assets = validateAssetManifest(manifest);
  }

  public get(id: string): AssetDescriptor {
    const asset = this.assets[id];
    if (!asset) throw new Error(`Unknown asset id: ${id}`);
    return asset;
  }

  public has(id: string): boolean {
    return id in this.assets;
  }

  public ids(): readonly string[] {
    return Object.keys(this.assets);
  }
}

export function validateAssetManifest(manifest: AssetManifest): AssetManifest {
  for (const [id, asset] of Object.entries(manifest)) {
    if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(id)) {
      throw new Error(
        `Invalid asset id "${id}"; use lowercase dot-separated identifiers`,
      );
    }
    if (!['model', 'animation', 'texture'].includes(asset.type)) {
      throw new Error(
        `Asset "${id}" has unsupported type: ${String(asset.type)}`,
      );
    }
    if (asset.url.trim().length === 0) {
      throw new Error(`Asset "${id}" must define a non-empty URL`);
    }
  }
  return Object.freeze({ ...manifest });
}
