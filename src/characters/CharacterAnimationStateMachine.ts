import type { CharacterActionName } from './CharacterActions';
import type { PlayerMovementState } from '../player/PlayerMovement';

export type CharacterAnimationPhase =
  'static' | 'locomotion' | 'airborne' | 'landing' | 'action' | 'reaction';

export type CharacterAnimationFallback = 'none' | 'run' | 'idle' | 'static';

export type CharacterDirectionalLocomotion = 'forward' | 'left' | 'right';

export const directionalRunThresholds = {
  enter: 0.5,
  exit: 0.3,
} as const;

export interface CharacterAnimationGraphInput {
  readonly movement: PlayerMovementState;
  /** Camera-relative input: negative X is left, positive X is right. */
  readonly localMovementX?: number;
  readonly action?: CharacterActionName;
  readonly reaction?: string;
}

export interface CharacterAnimationGraphState {
  readonly phase: CharacterAnimationPhase;
  readonly requestedClip: string;
  readonly resolvedClip: string | undefined;
  readonly fallback: CharacterAnimationFallback;
  readonly label: string;
  readonly transitionSequence: number;
  readonly previousLabel: string | undefined;
  readonly directionalLocomotion: CharacterDirectionalLocomotion;
  readonly transitionReason:
    'initial' | 'movement' | 'action' | 'reaction' | 'restoration';
}

/** Small game-owned priority graph; clip playback remains presentation-owned. */
export class CharacterAnimationStateMachine {
  private state: CharacterAnimationGraphState = initialState();
  private directionalLocomotion: CharacterDirectionalLocomotion = 'forward';

  public transition(
    input: CharacterAnimationGraphInput,
    hasClip: (logicalName: string) => boolean,
  ): {
    readonly state: CharacterAnimationGraphState;
    readonly changed: boolean;
  } {
    this.directionalLocomotion = selectDirectionalLocomotion(
      input.movement,
      input.localMovementX ?? 0,
      this.directionalLocomotion,
    );
    const requested = requestedState(input, this.directionalLocomotion);
    const directionalFallback =
      requested.phase === 'locomotion' &&
      requested.clip !== 'run' &&
      requested.clip.startsWith('run') &&
      hasClip('run')
        ? 'run'
        : undefined;
    const resolvedClip = hasClip(requested.clip)
      ? requested.clip
      : (directionalFallback ?? (hasClip('idle') ? 'idle' : undefined));
    const fallback: CharacterAnimationFallback =
      resolvedClip === requested.clip
        ? 'none'
        : resolvedClip === 'run'
          ? 'run'
          : resolvedClip === 'idle'
            ? 'idle'
            : 'static';
    const label = formatLabel(requested.phase, requested.clip, fallback);
    const stateChanged =
      this.state.phase !== requested.phase ||
      this.state.requestedClip !== requested.clip ||
      this.state.resolvedClip !== resolvedClip ||
      this.state.fallback !== fallback;
    if (!stateChanged) {
      if (this.state.directionalLocomotion !== this.directionalLocomotion) {
        this.state = {
          ...this.state,
          directionalLocomotion: this.directionalLocomotion,
        };
      }
      return { state: this.state, changed: false };
    }

    const previous = this.state;
    const playbackChanged =
      previous.phase !== requested.phase ||
      previous.resolvedClip !== resolvedClip;
    const transitionReason =
      (previous.phase === 'action' || previous.phase === 'reaction') &&
      requested.phase !== 'action' &&
      requested.phase !== 'reaction'
        ? 'restoration'
        : requested.phase === 'action'
          ? 'action'
          : requested.phase === 'reaction'
            ? 'reaction'
            : previous.transitionSequence === 0
              ? 'initial'
              : 'movement';
    this.state = {
      phase: requested.phase,
      requestedClip: requested.clip,
      resolvedClip,
      fallback,
      label,
      transitionSequence: previous.transitionSequence + 1,
      previousLabel: previous.label,
      directionalLocomotion: this.directionalLocomotion,
      transitionReason,
    };
    return { state: this.state, changed: playbackChanged };
  }

  public getState(): CharacterAnimationGraphState {
    return { ...this.state };
  }

  public reset(): void {
    this.directionalLocomotion = 'forward';
    this.state = initialState();
  }
}

function requestedState(
  input: CharacterAnimationGraphInput,
  direction: CharacterDirectionalLocomotion,
): {
  readonly phase: CharacterAnimationPhase;
  readonly clip: string;
} {
  if (input.reaction) return { phase: 'reaction', clip: input.reaction };
  if (input.action) return { phase: 'action', clip: input.action };
  switch (input.movement) {
    case 'walking':
      return { phase: 'locomotion', clip: 'walk' };
    case 'running':
      return {
        phase: 'locomotion',
        clip:
          direction === 'left'
            ? 'runLeft'
            : direction === 'right'
              ? 'runRight'
              : 'run',
      };
    case 'airborne':
      return { phase: 'airborne', clip: 'airborne' };
    case 'landing':
      return { phase: 'landing', clip: 'landing' };
    case 'idle':
      return { phase: 'locomotion', clip: 'idle' };
  }
}

function formatLabel(
  phase: CharacterAnimationPhase,
  requestedClip: string,
  fallback: CharacterAnimationFallback,
): string {
  if (fallback !== 'none') {
    return fallback === 'static'
      ? `static (fallback for ${requestedClip})`
      : `${fallback} (fallback for ${requestedClip})`;
  }
  return phase === 'action' || phase === 'reaction'
    ? `${phase}:${requestedClip}`
    : requestedClip;
}

function initialState(): CharacterAnimationGraphState {
  return {
    phase: 'static',
    requestedClip: 'static',
    resolvedClip: undefined,
    fallback: 'static',
    label: 'static',
    transitionSequence: 0,
    previousLabel: undefined,
    directionalLocomotion: 'forward',
    transitionReason: 'initial',
  };
}

export function selectDirectionalLocomotion(
  movement: PlayerMovementState,
  localMovementX: number,
  current: CharacterDirectionalLocomotion,
): CharacterDirectionalLocomotion {
  if (movement !== 'running') return 'forward';
  const lateral = Math.max(-1, Math.min(1, localMovementX));
  if (current === 'left') {
    if (lateral >= directionalRunThresholds.enter) return 'right';
    return lateral > -directionalRunThresholds.exit ? 'forward' : 'left';
  }
  if (current === 'right') {
    if (lateral <= -directionalRunThresholds.enter) return 'left';
    return lateral < directionalRunThresholds.exit ? 'forward' : 'right';
  }
  if (lateral <= -directionalRunThresholds.enter) return 'left';
  if (lateral >= directionalRunThresholds.enter) return 'right';
  return 'forward';
}
