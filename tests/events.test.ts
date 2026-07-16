import { EventBus } from '../src/core/events';

interface TestEvents {
  score: { points: number };
}

describe('EventBus', () => {
  it('delivers typed events and supports unsubscribe', () => {
    const bus = new EventBus<TestEvents>();
    const listener = vi.fn();
    const unsubscribe = bus.on('score', listener);

    bus.emit('score', { points: 10 });
    unsubscribe();
    bus.emit('score', { points: 20 });

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({ points: 10 });
  });
});
