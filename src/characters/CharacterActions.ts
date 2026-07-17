export const characterActionNames = [
  'wave',
  'interact',
  'punchLeft',
  'punchRight',
  'kickLeft',
  'kickRight',
  'roll',
  'gunFire',
  'knifeSlash',
] as const;

export type CharacterActionName = (typeof characterActionNames)[number];

export type CharacterActionRejection = 'busy' | 'unavailable' | 'depleted';
export type CharacterActionCompletionRelease =
  'mixer-finished' | 'duration-fallback';

export interface CharacterActionTiming {
  readonly impactNormalizedTime: number | undefined;
}

export const characterActionTimings: Readonly<
  Record<CharacterActionName, CharacterActionTiming>
> = {
  wave: { impactNormalizedTime: undefined },
  interact: { impactNormalizedTime: undefined },
  punchLeft: { impactNormalizedTime: 0.55 },
  punchRight: { impactNormalizedTime: 0.55 },
  kickLeft: { impactNormalizedTime: 0.62 },
  kickRight: { impactNormalizedTime: 0.62 },
  roll: { impactNormalizedTime: undefined },
  gunFire: { impactNormalizedTime: 0.45 },
  knifeSlash: { impactNormalizedTime: 0.55 },
};

export interface CharacterActionRequestState {
  readonly active: CharacterActionName | undefined;
  readonly busy: boolean;
  readonly lastRequested: CharacterActionName | undefined;
  readonly lastSource: string | undefined;
  readonly lastAccepted: boolean;
  readonly lastRejection: CharacterActionRejection | undefined;
  readonly busyRejectionCount: number;
  readonly sequence: number;
  readonly activeNormalizedTime: number;
  readonly lastImpact: CharacterActionName | undefined;
  readonly lastImpactSource: string | undefined;
  readonly impactSequence: number;
  readonly impactNormalizedTime: number | undefined;
  readonly completedSequenceAtImpact: number | undefined;
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
