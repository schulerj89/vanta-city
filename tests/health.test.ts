import { HealthComponent } from '../src/health/Health';

describe('HealthComponent', () => {
  it('clamps deterministic mutations and publishes typed lifecycle events', () => {
    const health = new HealthComponent('player', 100, 80);
    const changed = vi.fn();
    const depleted = vi.fn();
    const restored = vi.fn();
    health.events.on('changed', changed);
    health.events.on('depleted', depleted);
    health.events.on('restored', restored);

    health.damage(500, 'test:damage');
    expect(health.getSnapshot()).toMatchObject({
      current: 0,
      normalized: 0,
      alive: false,
      depleted: true,
      changeSequence: 1,
    });
    expect(depleted).toHaveBeenCalledOnce();

    health.heal(25, 'test:heal');
    expect(health.current).toBe(25);
    expect(restored).toHaveBeenCalledOnce();
    health.set(999);
    expect(health.current).toBe(100);
    expect(changed).toHaveBeenCalledTimes(3);
    expect(health.reset()).toBeUndefined();
  });

  it('rejects invalid configuration and is deterministic after disposal', () => {
    expect(() => new HealthComponent('bad', 0)).toThrow(/maximum/);
    expect(() => new HealthComponent('bad', 10, Number.NaN)).toThrow(/Initial/);
    const health = new HealthComponent('target', 40);
    expect(() => health.damage(-1)).toThrow(/non-negative/);
    health.dispose();
    expect(() => health.damage(1)).toThrow(/disposed/);
    health.dispose();
  });
});
