import type { LevelDefinition } from './LevelDefinition';
import type { StaticColliderDefinition } from '../physics/StaticCollider';

export interface WorldEvents {
  'level:loaded': { readonly level: LevelDefinition };
  'level:unloaded': { readonly levelId: string };
  'sector:loaded': {
    readonly levelId: string;
    readonly sectorId: string;
    readonly colliders: readonly StaticColliderDefinition[];
  };
  'sector:unloaded': { readonly levelId: string; readonly sectorId: string };
}
