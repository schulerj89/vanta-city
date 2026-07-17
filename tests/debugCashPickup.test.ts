// @vitest-environment jsdom
import type { Interactable } from '../src/interactions/Interactable';
import { DebugCashPickup } from '../src/economy/DebugCashPickup';
import { PlayerMoneyAccount } from '../src/economy/PlayerMoneyAccount';

describe('DebugCashPickup', () => {
  afterEach(() => vi.useRealTimers());

  it('credits exactly once and cleans its world and interaction registrations', async () => {
    vi.useFakeTimers();
    let interactable: Interactable | undefined;
    const unregister = vi.fn();
    const interactions = {
      register: vi.fn((value: Interactable) => {
        interactable = value;
        return unregister;
      }),
    };
    const objects = { add: vi.fn(), remove: vi.fn(() => true) };
    const player = {
      getWorldPose: () => ({
        position: { x: 1, y: 0, z: 2 },
        forward: { x: 0, y: 0, z: -1 },
        radius: 0.38,
      }),
    };
    const account = new PlayerMoneyAccount('player', 500);
    const pickup = new DebugCashPickup(
      account,
      interactions as never,
      objects as never,
      player,
    );
    expect(pickup.spawn()).toBe(true);
    expect(pickup.spawn()).toBe(false);
    await interactable?.interact({
      gameState: 'playing',
      targetId: 'interaction.debug-cash-pickup',
      signal: new AbortController().signal,
    });
    await interactable?.interact({
      gameState: 'playing',
      targetId: 'interaction.debug-cash-pickup',
      signal: new AbortController().signal,
    });
    expect(account.balance).toBe(600);
    expect(account.getSnapshot().transactionSequence).toBe(1);
    expect(pickup.getSnapshot()).toMatchObject({
      spawned: true,
      collected: true,
    });
    vi.runAllTimers();
    expect(unregister).toHaveBeenCalledOnce();
    expect(objects.remove).toHaveBeenCalledWith(
      'interaction.debug-cash-pickup',
    );
    expect(pickup.getSnapshot().spawned).toBe(false);
    pickup.dispose();
  });
});
