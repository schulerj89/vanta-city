import { CharacterAnimationStateMachine } from '../src/characters/CharacterAnimationStateMachine';

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

  it('uses equipment locomotion with explicit normal-run fallback', () => {
    const graph = new CharacterAnimationStateMachine();
    const hasClip = (name: string) => ['idle', 'run', 'gunIdle'].includes(name);
    expect(
      graph.transition(
        {
          movement: 'idle',
          equipment: { idleAnimation: 'gunIdle', runAnimation: 'gunRun' },
        },
        hasClip,
      ).state,
    ).toMatchObject({ requestedClip: 'gunIdle', resolvedClip: 'gunIdle' });
    expect(
      graph.transition(
        {
          movement: 'running',
          equipment: { idleAnimation: 'gunIdle', runAnimation: 'gunRun' },
        },
        hasClip,
      ).state,
    ).toMatchObject({
      requestedClip: 'gunRun',
      resolvedClip: 'run',
      fallback: 'run',
    });
  });

  it('prioritizes native death and exposes static fade fallback when absent', () => {
    const native = new CharacterAnimationStateMachine();
    expect(
      native.transition(
        { movement: 'running', action: 'roll', depleted: true },
        (name) => name === 'death',
      ).state,
    ).toMatchObject({
      phase: 'death',
      requestedClip: 'death',
      resolvedClip: 'death',
      fallback: 'none',
    });
    const missing = new CharacterAnimationStateMachine();
    expect(
      missing.transition(
        { movement: 'idle', depleted: true },
        (name) => name === 'idle',
      ).state,
    ).toMatchObject({
      phase: 'death',
      resolvedClip: undefined,
      fallback: 'static',
    });
  });
});
