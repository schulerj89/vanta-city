import type { CharacterActionName } from './CharacterActions';
import type { PlayerMovementState } from '../player/PlayerMovement';

export type CharacterAnimationPhase =
  'static' | 'locomotion' | 'airborne' | 'landing' | 'action' | 'reaction';

export type CharacterAnimationFallback = 'none' | 'idle' | 'static';

export interface CharacterAnimationGraphInput {
  readonly movement: PlayerMovementState;
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
  readonly transitionReason:
    'initial' | 'movement' | 'action' | 'reaction' | 'restoration';
}

/** Small game-owned priority graph; clip playback remains presentation-owned. */
export class CharacterAnimationStateMachine {
  private state: CharacterAnimationGraphState = initialState();

  public transition(
    input: CharacterAnimationGraphInput,
    hasClip: (logicalName: string) => boolean,
  ): {
    readonly state: CharacterAnimationGraphState;
    readonly changed: boolean;
  } {
    const requested = requestedState(input);
    const resolvedClip = hasClip(requested.clip)
      ? requested.clip
      : hasClip('idle')
        ? 'idle'
        : undefined;
    const fallback: CharacterAnimationFallback =
      resolvedClip === requested.clip
        ? 'none'
        : resolvedClip === 'idle'
          ? 'idle'
          : 'static';
    const label = formatLabel(requested.phase, requested.clip, fallback);
    const changed =
      this.state.phase !== requested.phase ||
      this.state.requestedClip !== requested.clip ||
      this.state.resolvedClip !== resolvedClip ||
      this.state.fallback !== fallback;
    if (!changed) return { state: this.state, changed: false };

    const previous = this.state;
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
      transitionReason,
    };
    return { state: this.state, changed: true };
  }

  public getState(): CharacterAnimationGraphState {
    return { ...this.state };
  }

  public reset(): void {
    this.state = initialState();
  }
}

function requestedState(input: CharacterAnimationGraphInput): {
  readonly phase: CharacterAnimationPhase;
  readonly clip: string;
} {
  if (input.reaction) return { phase: 'reaction', clip: input.reaction };
  if (input.action) return { phase: 'action', clip: input.action };
  switch (input.movement) {
    case 'walking':
      return { phase: 'locomotion', clip: 'walk' };
    case 'running':
      return { phase: 'locomotion', clip: 'run' };
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
    return fallback === 'idle'
      ? `idle (fallback for ${requestedClip})`
      : `static (fallback for ${requestedClip})`;
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
    transitionReason: 'initial',
  };
}
