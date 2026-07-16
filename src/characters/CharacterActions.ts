export const characterActionNames = [
  'wave',
  'interact',
  'punchLeft',
  'punchRight',
  'kickLeft',
  'kickRight',
] as const;

export type CharacterActionName = (typeof characterActionNames)[number];

export type CharacterActionRejection = 'busy' | 'unavailable';
export type CharacterActionCompletionRelease =
  'mixer-finished' | 'duration-fallback';

export interface CharacterActionRequestState {
  readonly active: CharacterActionName | undefined;
  readonly busy: boolean;
  readonly lastRequested: CharacterActionName | undefined;
  readonly lastSource: string | undefined;
  readonly lastAccepted: boolean;
  readonly lastRejection: CharacterActionRejection | undefined;
  readonly busyRejectionCount: number;
  readonly sequence: number;
  readonly lastCompleted: CharacterActionName | undefined;
  readonly lastCompletedSource: string | undefined;
  readonly completedSequence: number;
  readonly completionRelease: CharacterActionCompletionRelease | undefined;
}

export interface CharacterActionSink {
  triggerCharacterAction(action: CharacterActionName, source?: string): boolean;
  getCharacterActionState(): CharacterActionRequestState;
}

export function isCharacterActionName(
  value: string | undefined,
): value is CharacterActionName {
  return characterActionNames.some((name) => name === value);
}
