import { DevelopmentAssetFaults } from '../src/debug/DevelopmentAssetFaults';
import { SimulatedAssetFailure } from '../src/debug/DevelopmentAssetFaults';

describe('DevelopmentAssetFaults', () => {
  it('emits controlled progress, fails a selected logical id, and resets', async () => {
    vi.useFakeTimers();
    const faults = DevelopmentAssetFaults.from(
      new URLSearchParams('loadDelayMs=200&loadFail=character.casual.model'),
    );
    const progress: number[] = [];
    const pending = faults.run(
      'character.casual.model',
      vi.fn(async () => 'loaded'),
      (value) => progress.push(value),
    );
    const failed = expect(pending).rejects.toBeInstanceOf(
      SimulatedAssetFailure,
    );
    await vi.advanceTimersByTimeAsync(200);
    await failed;
    expect(progress.some((value) => value > 0 && value < 1)).toBe(true);
    expect(faults.getSnapshot()).toMatchObject({
      activeLoads: 0,
      simulatedLoads: 1,
      failureAssetId: 'character.casual.model',
    });
    faults.reset();
    expect(faults.getSnapshot()).toMatchObject({
      delayMs: 0,
      failureAssetId: undefined,
    });
    faults.dispose();
    vi.useRealTimers();
  });

  it('rejects pending delays during disposal', async () => {
    vi.useFakeTimers();
    const faults = DevelopmentAssetFaults.from(
      new URLSearchParams('loadDelayMs=1000'),
    );
    const pending = faults.run(
      'hero',
      vi.fn(async () => 'loaded'),
      vi.fn(),
    );
    const disposed = expect(pending).rejects.toThrow('disposed');
    faults.dispose();
    await disposed;
    expect(faults.getSnapshot()).toMatchObject({
      disposed: true,
      activeLoads: 0,
    });
    vi.useRealTimers();
  });
});
