import { SystemRegistry } from '../src/core/lifecycle';
import type { GameSystem } from '../src/core/lifecycle';

describe('SystemRegistry', () => {
  it('runs ordered lifecycle hooks and keeps always systems updating while paused', async () => {
    const calls: string[] = [];
    const simulation: GameSystem<string> = {
      id: 'simulation',
      init: (context) => {
        calls.push(`init:${context}`);
      },
      update: () => calls.push('simulation:update'),
      dispose: () => calls.push('simulation:dispose'),
    };
    const renderer: GameSystem<string> = {
      id: 'renderer',
      updateMode: 'always',
      update: () => calls.push('renderer:update'),
      lateUpdate: () => calls.push('renderer:late'),
      dispose: () => calls.push('renderer:dispose'),
    };
    const registry = new SystemRegistry<string>();
    registry.register(simulation).register(renderer);
    await registry.init('game');
    registry.update({ delta: 0.01, elapsed: 1, frame: 1 }, false);
    registry.dispose();

    expect(calls).toEqual([
      'init:game',
      'renderer:update',
      'renderer:late',
      'renderer:dispose',
      'simulation:dispose',
    ]);
  });

  it('rejects duplicate system ids', () => {
    const registry = new SystemRegistry();
    registry.register({ id: 'same' });
    expect(() => registry.register({ id: 'same' })).toThrow(
      'already registered',
    );
  });

  it('reports the failing system id and disposes initialized systems', async () => {
    const disposeFirst = vi.fn();
    const disposeFailing = vi.fn();
    const registry = new SystemRegistry();
    registry.register({ id: 'first', dispose: disposeFirst }).register({
      id: 'broken-assets',
      init: () => {
        throw new Error('manifest was unavailable');
      },
      dispose: disposeFailing,
    });

    await expect(registry.init(undefined)).rejects.toThrow(
      'Failed to initialize system "broken-assets": manifest was unavailable',
    );
    registry.dispose();
    expect(disposeFailing).toHaveBeenCalledOnce();
    expect(disposeFirst).toHaveBeenCalledOnce();
  });

  it('reports initialization readiness without changing lifecycle order', async () => {
    const registry = new SystemRegistry<string>();
    const initialized: string[] = [];
    registry.register({ id: 'world' }).register({ id: 'player' });

    await registry.init('game', {
      onSystemInitialized: (systemId) => initialized.push(systemId),
    });

    expect(initialized).toEqual(['world', 'player']);
    registry.dispose();
  });
});
