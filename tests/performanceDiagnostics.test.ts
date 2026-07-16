import { SystemRegistry } from '../src/core/lifecycle';
import {
  DevelopmentRuntimeDiagnostics,
  RollingTimingWindow,
} from '../src/debug/PerformanceDiagnostics';

describe('performance diagnostics', () => {
  it('reports a bounded rolling min/average/max and p95 window', () => {
    const window = new RollingTimingWindow(4);
    for (const value of [1, 2, 3, 4, 20]) window.add(value);

    expect(window.snapshot()).toEqual({
      samples: 4,
      minMs: 2,
      averageMs: 7.25,
      maxMs: 20,
      p95Ms: 20,
    });
    window.reset();
    expect(window.snapshot().samples).toBe(0);
  });

  it('times update phases only when an opt-in sink is attached', async () => {
    const readings = [0, 2, 2, 5];
    const diagnostics = new DevelopmentRuntimeDiagnostics(
      10,
      () => readings.shift() ?? 5,
    );
    const registry = new SystemRegistry<void>();
    registry.register({ id: 'simulation', update: () => undefined });
    registry.register({
      id: 'renderer',
      lateUpdate: () => undefined,
      updateMode: 'always',
    });
    await registry.init(undefined);
    registry.setTimingSink(diagnostics);
    registry.update({ delta: 0.1, elapsed: 0.1, frame: 1 }, true);

    expect(diagnostics.getSnapshot().systems).toMatchObject({
      simulation: { update: { samples: 1, averageMs: 2 } },
      renderer: { lateUpdate: { samples: 1, averageMs: 3 } },
    });
    registry.dispose();
  });
});
