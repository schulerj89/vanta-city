// @vitest-environment jsdom
import { PlayerMoneyAccount } from '../src/economy/PlayerMoneyAccount';
import {
  MONEY_DELTA_DURATION_MS,
  MoneyHudSystem,
  formatCurrency,
} from '../src/ui/MoneyHudSystem';

describe('MoneyHudSystem', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('formats consistently and coalesces signed deltas without moving balance', () => {
    vi.useFakeTimers();
    expect(formatCurrency(1234567)).toBe('$1,234,567');
    const mount = document.createElement('main');
    document.body.append(mount);
    const account = new PlayerMoneyAccount('player', 500);
    const hud = new MoneyHudSystem(mount, account, false);
    hud.init();
    const balance = mount.querySelector('.money-hud__balance');
    expect(balance?.textContent).toBe('$500');
    expect(mount.querySelector('.money-hud')?.getAttribute('aria-live')).toBe(
      'polite',
    );

    account.credit(100, { reason: 'one' });
    account.credit(25, { reason: 'two' });
    expect(hud.getSnapshot()).toMatchObject({
      formattedBalance: '$625',
      delta: '+$125',
      deltaKind: 'credit',
      queuedDelta: 125,
    });
    expect(balance).toBe(mount.querySelector('.money-hud__balance'));
    account.debit(200, { reason: 'three' });
    expect(hud.getSnapshot()).toMatchObject({
      formattedBalance: '$425',
      delta: '−$75',
      deltaKind: 'debit',
    });
    vi.advanceTimersByTime(MONEY_DELTA_DURATION_MS);
    expect(hud.getSnapshot().delta).toBeUndefined();

    hud.dispose();
    account.dispose();
  });

  it('marks reduced motion and cleans listeners, timers, and DOM', () => {
    vi.useFakeTimers();
    const mount = document.createElement('main');
    document.body.append(mount);
    const account = new PlayerMoneyAccount('player');
    const hud = new MoneyHudSystem(mount, account, true);
    hud.init();
    account.credit(10, { reason: 'test' });
    expect(hud.getSnapshot()).toMatchObject({
      reducedMotion: true,
      delta: '+$10',
    });
    hud.dispose();
    hud.dispose();
    expect(mount.querySelector('.money-hud')).toBeNull();
    account.credit(10, { reason: 'after-dispose' });
    vi.runAllTimers();
    expect(hud.getSnapshot().queuedDelta).toBe(0);
    account.dispose();
  });
});
