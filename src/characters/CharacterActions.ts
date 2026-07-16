export const characterActionNames = ['wave', 'interact', 'punch'] as const;

export type CharacterActionName = (typeof characterActionNames)[number];

export interface CharacterActionRequestState {
  readonly active: CharacterActionName | undefined;
  readonly lastRequested: CharacterActionName | undefined;
  readonly lastSource: string | undefined;
  readonly lastAccepted: boolean;
  readonly sequence: number;
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
