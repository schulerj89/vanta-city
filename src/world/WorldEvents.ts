import type { LevelDefinition } from './LevelDefinition';

export interface WorldEvents {
  'level:loaded': { readonly level: LevelDefinition };
  'level:unloaded': { readonly levelId: string };
}
