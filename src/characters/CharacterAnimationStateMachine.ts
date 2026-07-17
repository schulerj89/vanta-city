import type { CharacterActionName } from './CharacterActions';
import type { PlayerMovementState } from '../player/PlayerMovement';

export type CharacterAnimationPhase =
  | 'static'
  | 'locomotion'
  | 'airborne'
  | 'landing'
  | 'action'
  | 'reaction'
  | 'death';

export type CharacterAnimationFallback = 'none' | 'run' | 'idle' | 'static';

export interface CharacterEquipmentAnimationInput {
  readonly idleAnimation?: string;
  readonly runAnimation?: string;
}

export interface CharacterAnimationGraphInput {
  readonly movement: PlayerMovementState;
  readonly action?: CharacterActionName;
  readonly reaction?: string;
  readonly equipment?: CharacterEquipmentAnimationInput;
  readonly depleted?: boolean;
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
    'initial' | 'movement' | 'action' | 'reaction' | 'death' | 'restoration';
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
      : requested.fallbackClip && hasClip(requested.fallbackClip)
        ? requested.fallbackClip
        : requested.phase !== 'death' && hasClip('idle')
          ? 'idle'
          : undefined;
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
    if (!stateChanged) return { state: this.state, changed: false };

    const previous = this.state;
    const playbackChanged =
      previous.phase !== requested.phase ||
      previous.resolvedClip !== resolvedClip;
    const transitionReason =
      (previous.phase === 'action' ||
        previous.phase === 'reaction' ||
        previous.phase === 'death') &&
      requested.phase !== 'action' &&
      requested.phase !== 'reaction'
        ? 'restoration'
        : requested.phase === 'death'
          ? 'death'
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
    return { state: this.state, changed: playbackChanged };
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
  readonly fallbackClip?: string;
} {
  if (input.depleted) return { phase: 'death', clip: 'death' };
  if (input.reaction) return { phase: 'reaction', clip: input.reaction };
  if (input.action) return { phase: 'action', clip: input.action };
  switch (input.movement) {
    case 'walking':
      return { phase: 'locomotion', clip: 'walk' };
    case 'running':
      return input.equipment?.runAnimation
        ? {
            phase: 'locomotion',
            clip: input.equipment.runAnimation,
            fallbackClip: 'run',
          }
        : { phase: 'locomotion', clip: 'run' };
    case 'airborne':
      return { phase: 'airborne', clip: 'airborne' };
    case 'landing':
      return { phase: 'landing', clip: 'landing' };
    case 'idle':
      return input.equipment?.idleAnimation
        ? {
            phase: 'locomotion',
            clip: input.equipment.idleAnimation,
            fallbackClip: 'idle',
          }
        : { phase: 'locomotion', clip: 'idle' };
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
  return phase === 'action' || phase === 'reaction' || phase === 'death'
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
