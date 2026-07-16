import type { AssetManifest } from '../assets/AssetLoader';
import type { LevelDefinition, LevelModule } from './LevelDefinition';
import { validateLevelDefinition } from './LevelDefinition';

export class LevelRegistry {
  private readonly definitions = new Map<string, LevelDefinition>();
  private readonly assetEntries: Record<string, AssetManifest[string]> = {};

  public constructor(modules: readonly LevelModule[] = []) {
    for (const module of modules) this.register(module);
  }

  public register(module: LevelModule): this {
    const { definition, assets } = module;
    validateLevelDefinition(definition);
    if (this.definitions.has(definition.id)) {
      throw new Error(`Level "${definition.id}" is already registered`);
    }
    for (const [id, asset] of Object.entries(assets)) {
      const existing = this.assetEntries[id];
      if (
        existing &&
        (existing.type !== asset.type || existing.url !== asset.url)
      ) {
        throw new Error(`Conflicting asset registration for "${id}"`);
      }
      this.assetEntries[id] = asset;
    }
    this.definitions.set(definition.id, definition);
    return this;
  }

  public get(id: string): LevelDefinition {
    const level = this.definitions.get(id);
    if (!level) throw new Error(`Unknown level id: ${id}`);
    return level;
  }

  public has(id: string): boolean {
    return this.definitions.has(id);
  }

  public get assetManifest(): AssetManifest {
    return { ...this.assetEntries };
  }
}
