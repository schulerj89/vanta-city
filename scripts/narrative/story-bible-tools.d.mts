export interface StoryBibleCharacter {
  readonly id: string;
  readonly speakerId: string;
  readonly entityId: string;
}

export interface StoryBible {
  readonly characters: readonly StoryBibleCharacter[];
  readonly factions: readonly unknown[];
  readonly missions: readonly unknown[];
}

export const repositoryRoot: string;
export const sourcePath: string;
export const documentPath: string;

export function loadStoryBible(): Promise<unknown>;
export function validateStoryBible(bible: unknown): StoryBible;
export function renderStoryBible(bible: StoryBible): Promise<string>;
