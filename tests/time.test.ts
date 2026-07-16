import { GameClock } from '../src/core/time';

describe('GameClock', () => {
  it('reports delta and elapsed time in seconds', () => {
    const clock = new GameClock();
    expect(clock.tick(1_000)).toEqual({ delta: 0, elapsed: 0, frame: 1 });
    expect(clock.tick(1_016)).toEqual({
      delta: 0.016,
      elapsed: 0.016,
      frame: 2,
    });
  });

  it('clamps abnormally large and negative deltas', () => {
    const clock = new GameClock(0.1);
    clock.tick(1_000);
    expect(clock.tick(2_000).delta).toBe(0.1);
    expect(clock.tick(1_500).delta).toBe(0);
  });

  it('resets the next delta without resetting elapsed time', () => {
    const clock = new GameClock();
    clock.tick(1_000);
    clock.tick(1_020);
    clock.resetFrameDelta();
    expect(clock.tick(9_000)).toMatchObject({ delta: 0, elapsed: 0.02 });
  });
});
