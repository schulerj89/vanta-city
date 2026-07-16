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
});
