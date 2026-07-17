// @vitest-environment jsdom
import { DebugCashPickup } from '../src/economy/DebugCashPickup';
import { PlayerMoneyAccount } from '../src/economy/PlayerMoneyAccount';
import { ProximityPickupSystem } from '../src/pickups/ProximityPickupSystem';
import type { GameContext } from '../src/game/GameRuntime';

describe('DebugCashPickup', () => {
  it('credits exactly once on overlap and cleans its world registration', () => {
    const objects = { add: vi.fn(), remove: vi.fn(() => true) };
    let position = { x: 1, y: 0, z: 2 };
    const player = {
      getWorldPose: () => ({
        position,
        forward: { x: 0, y: 0, z: -1 },
        radius: 0.38,
      }),
    };
    const system = new ProximityPickupSystem(player);
    system.init({ state: { current: 'playing' } } as GameContext);
    const account = new PlayerMoneyAccount('player', 500);
    const pickup = new DebugCashPickup(
      account,
      system,
      objects as never,
      player,
    );

    expect(pickup.spawn()).toBe(true);
    expect(pickup.spawn()).toBe(false);
    position = { x: 1, y: 0, z: 1.2 };
    system.update();
    system.update();

    expect(account.balance).toBe(600);
    expect(account.getSnapshot().transactionSequence).toBe(1);
    expect(pickup.getSnapshot()).toMatchObject({
      spawned: false,
      collected: true,
    });
    expect(system.getSnapshot()).toMatchObject({ count: 0, collectedCount: 1 });
    expect(objects.remove).toHaveBeenCalledWith('pickup.debug-cash');
    pickup.dispose();
    system.dispose();
  });
});
