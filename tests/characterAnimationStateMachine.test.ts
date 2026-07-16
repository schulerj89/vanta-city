import {
  CharacterAnimationStateMachine,
  directionalRunThresholds,
  selectDirectionalLocomotion,
} from '../src/characters/CharacterAnimationStateMachine';

describe('CharacterAnimationStateMachine', () => {
  it('prioritizes reactions, actions, and movement then records restoration', () => {
    const graph = new CharacterAnimationStateMachine();
    const clips = new Set(['idle', 'walk', 'run', 'punchLeft', 'getHitLeft']);
    const hasClip = (name: string) => clips.has(name);

    expect(
      graph.transition({ movement: 'walking' }, hasClip).state,
    ).toMatchObject({
      phase: 'locomotion',
      resolvedClip: 'walk',
      transitionReason: 'initial',
    });
    expect(
      graph.transition({ movement: 'running', action: 'punchLeft' }, hasClip)
        .state,
    ).toMatchObject({
      phase: 'action',
      label: 'action:punchLeft',
      transitionReason: 'action',
    });
    expect(
      graph.transition(
        {
          movement: 'running',
          action: 'punchLeft',
          reaction: 'getHitLeft',
        },
        hasClip,
      ).state,
    ).toMatchObject({
      phase: 'reaction',
      label: 'reaction:getHitLeft',
      transitionReason: 'reaction',
    });
    expect(
      graph.transition({ movement: 'running' }, hasClip).state,
    ).toMatchObject({
      phase: 'locomotion',
      resolvedClip: 'run',
      transitionReason: 'restoration',
    });
  });

  it('makes unsupported airborne and landing fallback explicit', () => {
    const graph = new CharacterAnimationStateMachine();
    const hasClip = (name: string) => name === 'idle';
    expect(
      graph.transition({ movement: 'airborne' }, hasClip).state,
    ).toMatchObject({
      phase: 'airborne',
      requestedClip: 'airborne',
      resolvedClip: 'idle',
      fallback: 'idle',
      label: 'idle (fallback for airborne)',
    });
    expect(
      graph.transition({ movement: 'landing' }, hasClip).state,
    ).toMatchObject({
      phase: 'landing',
      requestedClip: 'landing',
      resolvedClip: 'idle',
      fallback: 'idle',
      label: 'idle (fallback for landing)',
    });
  });

  it('selects directional runs with stable enter and exit hysteresis', () => {
    expect(
      selectDirectionalLocomotion(
        'running',
        -directionalRunThresholds.enter,
        'forward',
      ),
    ).toBe('left');
    expect(
      selectDirectionalLocomotion(
        'running',
        -directionalRunThresholds.exit,
        'left',
      ),
    ).toBe('left');
    expect(
      selectDirectionalLocomotion(
        'running',
        -directionalRunThresholds.exit + 0.01,
        'left',
      ),
    ).toBe('forward');
    expect(
      selectDirectionalLocomotion(
        'running',
        directionalRunThresholds.enter,
        'left',
      ),
    ).toBe('right');
    expect(selectDirectionalLocomotion('walking', 1, 'right')).toBe('forward');
  });

  it('crosses among forward, left, and right without per-frame restarts', () => {
    const graph = new CharacterAnimationStateMachine();
    const hasClip = (name: string) =>
      ['idle', 'run', 'runLeft', 'runRight'].includes(name);
    const left = graph.transition(
      { movement: 'running', localMovementX: -0.8 },
      hasClip,
    );
    expect(left).toMatchObject({
      changed: true,
      state: {
        requestedClip: 'runLeft',
        resolvedClip: 'runLeft',
        directionalLocomotion: 'left',
        transitionSequence: 1,
      },
    });
    const stable = graph.transition(
      { movement: 'running', localMovementX: -0.48 },
      hasClip,
    );
    expect(stable.changed).toBe(false);
    expect(stable.state.transitionSequence).toBe(1);
    expect(
      graph.transition({ movement: 'running', localMovementX: 0.8 }, hasClip)
        .state,
    ).toMatchObject({
      requestedClip: 'runRight',
      directionalLocomotion: 'right',
      transitionSequence: 2,
    });
  });

  it('falls back from a missing directional clip to normal run', () => {
    const graph = new CharacterAnimationStateMachine();
    graph.transition(
      { movement: 'running', localMovementX: 0 },
      (name) => name === 'run' || name === 'idle',
    );
    const state = graph.transition(
      { movement: 'running', localMovementX: 1 },
      (name) => name === 'run' || name === 'idle',
    );
    expect(state.changed).toBe(false);
    expect(state.state).toMatchObject({
      requestedClip: 'runRight',
      resolvedClip: 'run',
      fallback: 'run',
      label: 'run (fallback for runRight)',
      directionalLocomotion: 'right',
    });
  });

  it('restores the latest directional run after an action', () => {
    const graph = new CharacterAnimationStateMachine();
    const hasClip = (name: string) =>
      ['idle', 'run', 'runLeft', 'runRight', 'punchLeft'].includes(name);
    graph.transition({ movement: 'running', localMovementX: -1 }, hasClip);
    graph.transition(
      { movement: 'running', localMovementX: 1, action: 'punchLeft' },
      hasClip,
    );
    expect(
      graph.transition({ movement: 'running', localMovementX: 1 }, hasClip)
        .state,
    ).toMatchObject({
      requestedClip: 'runRight',
      resolvedClip: 'runRight',
      directionalLocomotion: 'right',
      transitionReason: 'restoration',
    });
  });
});
