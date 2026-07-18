// @vitest-environment jsdom
import { PlayerMoneyAccount } from '../src/economy/PlayerMoneyAccount';
import {
  MONEY_COUNT_DURATION_MS,
  MONEY_DELTA_DURATION_MS,
  MoneyHudSystem,
  formatCurrency,
} from '../src/ui/MoneyHudSystem';

describe('MoneyHudSystem', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('counts from the prior display to authoritative balance and coalesces interruption', () => {
    vi.useFakeTimers();
    const animation = installAnimationDriver();
    expect(formatCurrency(1234567)).toBe('$1,234,567');
    const mount = document.createElement('main');
    document.body.append(mount);
    const account = new PlayerMoneyAccount('player', 500);
    const hud = new MoneyHudSystem(mount, account, false);
    hud.init();
    const balance = mount.querySelector('.money-hud__balance');
    expect(mount.querySelector('.money-hud__label')?.textContent).toBe('FUNDS');
    expect(
      mount.querySelector('.money-hud__label')?.getAttribute('aria-hidden'),
    ).toBe('true');
    expect(balance?.textContent).toBe('$500');
    expect(balance?.getAttribute('aria-hidden')).toBe('true');
    expect(mount.querySelector('[role="status"]')?.textContent).toBe(
      'Balance $500',
    );

    account.credit(100, { reason: 'one' });
    expect(account.balance).toBe(600);
    expect(hud.getSnapshot()).toMatchObject({
      formattedBalance: '$500',
      authoritativeBalance: 600,
      displayedBalance: 500,
      animating: true,
      delta: '+$100',
    });
    animation.advance(MONEY_COUNT_DURATION_MS / 2);
    const interruptedAt = hud.getSnapshot().displayedBalance;
    expect(interruptedAt).toBeGreaterThan(500);
    expect(interruptedAt).toBeLessThan(600);

    account.credit(25, { reason: 'two' });
    account.debit(200, { reason: 'three' });
    expect(account.balance).toBe(425);
    expect(hud.getSnapshot()).toMatchObject({
      displayedBalance: interruptedAt,
      authoritativeBalance: 425,
      delta: '−$75',
      deltaKind: 'debit',
      queuedDelta: -75,
    });
    animation.advance(MONEY_COUNT_DURATION_MS);
    expect(hud.getSnapshot()).toMatchObject({
      formattedBalance: '$425',
      displayedBalance: 425,
      authoritativeBalance: 425,
      animating: false,
    });
    vi.advanceTimersByTime(MONEY_DELTA_DURATION_MS);
    expect(hud.getSnapshot().delta).toBeUndefined();

    hud.dispose();
    account.dispose();
  });

  it('uses immediate reduced-motion updates and disposes listeners, rAF, timers, and DOM', () => {
    vi.useFakeTimers();
    const animation = installAnimationDriver();
    const mount = document.createElement('main');
    document.body.append(mount);
    const account = new PlayerMoneyAccount('player');
    const hud = new MoneyHudSystem(mount, account, true);
    hud.init();
    account.credit(10, { reason: 'test' });
    expect(hud.getSnapshot()).toMatchObject({
      reducedMotion: true,
      formattedBalance: '$510',
      displayedBalance: 510,
      animating: false,
      delta: '+$10',
    });
    expect(animation.pending()).toBe(0);
    hud.dispose();
    hud.dispose();
    expect(mount.querySelector('.money-hud')).toBeNull();
    account.credit(10, { reason: 'after-dispose' });
    vi.runAllTimers();
    expect(hud.getSnapshot().queuedDelta).toBe(0);
    account.dispose();
  });
});

function installAnimationDriver() {
  let now = 0;
  let id = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const nextId = ++id;
    callbacks.set(nextId, callback);
    return nextId;
  });
  vi.stubGlobal('cancelAnimationFrame', (frameId: number) => {
    callbacks.delete(frameId);
  });
  return {
    advance(milliseconds: number) {
      now += milliseconds;
      const scheduled = [...callbacks.values()];
      callbacks.clear();
      for (const callback of scheduled) callback(now);
    },
    pending: () => callbacks.size,
  };
}
