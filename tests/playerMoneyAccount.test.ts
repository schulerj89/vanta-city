import {
  PLAYER_MAX_BALANCE,
  PLAYER_STARTING_BALANCE,
  PlayerMoneyAccount,
} from '../src/economy/PlayerMoneyAccount';

describe('PlayerMoneyAccount', () => {
  it('credits and debits integer currency with typed metadata and events', () => {
    const account = new PlayerMoneyAccount('player');
    const transactions = vi.fn();
    const balances = vi.fn();
    account.events.on('transaction', transactions);
    account.events.on('balanceChanged', balances);

    expect(
      account.credit(125, { reason: 'pickup', source: 'cash.1' }),
    ).toMatchObject({
      id: 1,
      kind: 'credit',
      previousBalance: PLAYER_STARTING_BALANCE,
      balance: 625,
      delta: 125,
      reason: 'pickup',
      source: 'cash.1',
    });
    expect(
      account.debit(200, { reason: 'purchase', source: 'test-shop' }),
    ).toMatchObject({ id: 2, kind: 'debit', balance: 425, delta: -200 });
    expect(transactions).toHaveBeenCalledTimes(2);
    expect(balances).toHaveBeenCalledTimes(2);
  });

  it('rejects invalid mutations, overflow, and unaffordable spends atomically', () => {
    const account = new PlayerMoneyAccount('player', 10);
    const event = vi.fn();
    account.events.on('transaction', event);
    for (const amount of [0, -1, 1.5, Number.NaN, Infinity]) {
      expect(() => account.credit(amount, { reason: 'invalid' })).toThrow(
        /safe integer/,
      );
    }
    expect(account.debit(11, { reason: 'too-expensive' })).toBeUndefined();
    expect(account.balance).toBe(10);
    expect(event).not.toHaveBeenCalled();
    expect(
      new PlayerMoneyAccount('max', PLAYER_MAX_BALANCE).credit(1, {
        reason: 'overflow',
      }),
    ).toBeUndefined();
    expect(() => account.credit(1, { reason: ' ' })).toThrow(/reason/);
  });

  it('returns frozen snapshots and disposes listeners and mutations safely', () => {
    const account = new PlayerMoneyAccount('player');
    const snapshot = account.getSnapshot();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(snapshot.balance).toBe(PLAYER_STARTING_BALANCE);
    account.credit(1, { reason: 'later' });
    expect(snapshot.balance).toBe(PLAYER_STARTING_BALANCE);
    account.dispose();
    account.dispose();
    expect(() => account.canAfford(1)).toThrow(/disposed/);
    expect(() => account.debit(1, { reason: 'late' })).toThrow(/disposed/);
  });
});
