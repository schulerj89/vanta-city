import type { LevelDefinition } from './LevelDefinition';
import type { StaticColliderDefinition } from '../physics/StaticCollider';

export interface WorldEvents {
  'level:loaded': { readonly level: LevelDefinition };
  'level:unloaded': { readonly levelId: string };
  'sector:loaded': {
    /** Published after the sector root is attached and can be queried in scene. */
    readonly levelId: string;
    readonly sectorId: string;
    readonly colliders: readonly StaticColliderDefinition[];
  };
  /** Published before sector roots, materials, textures, and models are disposed. */
  'sector:unloaded': { readonly levelId: string; readonly sectorId: string };
}
