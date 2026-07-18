import { CombatOpponentDecision } from '../src/debug/CombatOpponentDecision';
import { sparringTargetConfig } from '../src/debug/sparringTarget';

const input = (overrides = {}) => ({
  delta: 0.1,
  enabled: true,
  gameplayAvailable: true,
  selfAlive: true,
  targetAlive: true,
  distance: 4,
  facingDot: 1,
  pathClear: true,
  ...overrides,
});

describe('CombatOpponentDecision', () => {
  it('deterministically engages, approaches, attacks once, and recovers', () => {
    const decision = new CombatOpponentDecision(sparringTargetConfig.opponent);
    expect(decision.update(input()).state).toBe('engage');
    expect(decision.update(input()).state).toBe('approach');
    expect(decision.update(input()).shouldMove).toBe(true);
    expect(decision.update(input({ distance: 1, delta: 0.1 })).state).toBe(
      'attack',
    );
    expect(decision.getSnapshot().attackSequence).toBe(1);
    expect(
      decision.update(input({ distance: 1, delta: 0.36 })).shouldDamage,
    ).toBe(true);
    expect(
      decision.update(input({ distance: 1, delta: 0.01 })).shouldDamage,
    ).toBe(false);
    expect(decision.update(input({ distance: 1, delta: 0.4 })).state).toBe(
      'recover',
    );
    expect(decision.getSnapshot().damageSequence).toBe(1);
  });

  it('stops for obstacles and gates pause, dialogue, range, and death', () => {
    const decision = new CombatOpponentDecision(sparringTargetConfig.opponent);
    decision.update(input());
    decision.update(input());
    expect(decision.update(input({ pathClear: false }))).toMatchObject({
      state: 'approach',
      shouldMove: false,
      blocked: true,
    });
    expect(decision.update(input({ gameplayAvailable: false })).state).toBe(
      'idle',
    );
    expect(decision.update(input({ distance: 9 })).state).toBe('idle');
    expect(decision.update(input({ selfAlive: false })).state).toBe('dead');
    decision.reset();
    expect(decision.getSnapshot()).toMatchObject({
      state: 'idle',
      attackSequence: 0,
      damageSequence: 0,
    });
  });
});
