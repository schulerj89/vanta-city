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
});
