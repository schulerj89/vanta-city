import type { GameSystem } from '../core/lifecycle';
import type {
  MoneyTransaction,
  PlayerMoneyAccount,
} from '../economy/PlayerMoneyAccount';

export const MONEY_DELTA_DURATION_MS = 1_400;
export const MONEY_COUNT_DURATION_MS = 650;

export interface MoneyHudSnapshot {
  readonly visible: boolean;
  /** The visual ticker value, which may trail the authoritative account. */
  readonly formattedBalance: string;
  readonly authoritativeBalance: number;
  readonly displayedBalance: number;
  readonly animating: boolean;
  readonly delta: string | undefined;
  readonly deltaKind: MoneyTransaction['kind'] | undefined;
  readonly reducedMotion: boolean;
  readonly queuedDelta: number;
}

export function formatCurrency(value: number): string {
  return `$${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)}`;
}

/** Accessible animated projection of the authoritative player account. */
export class MoneyHudSystem implements GameSystem {
  public readonly id = 'money-hud';
  public readonly updateMode = 'always' as const;

  private readonly root = document.createElement('section');
  private readonly balance = document.createElement('span');
  private readonly delta = document.createElement('span');
  private readonly announcement = document.createElement('span');
  private unsubscribe: (() => void) | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private animationFrame: number | undefined;
  private animationStartedAt = 0;
  private animationFrom: number;
  private animationTarget: number;
  private displayedBalance: number;
  private queuedDelta = 0;
  private disposed = false;

  public constructor(
    private readonly mount: HTMLElement,
    private readonly account: PlayerMoneyAccount,
    private readonly reducedMotion = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches ?? false,
  ) {
    this.displayedBalance = account.balance;
    this.animationFrom = account.balance;
    this.animationTarget = account.balance;
    this.root.className = 'money-hud';
    this.root.setAttribute('aria-label', 'Player money');
    this.balance.className = 'money-hud__balance';
    this.balance.setAttribute('aria-hidden', 'true');
    this.delta.className = 'money-hud__delta';
    this.delta.setAttribute('aria-hidden', 'true');
    this.delta.hidden = true;
    this.announcement.className = 'visually-hidden';
    this.announcement.setAttribute('role', 'status');
    this.announcement.setAttribute('aria-live', 'polite');
    this.announcement.setAttribute('aria-atomic', 'true');
    this.root.dataset.reducedMotion = String(this.reducedMotion);
    this.root.append(this.balance, this.delta, this.announcement);
  }

  public init(): void {
    if (this.disposed) throw new Error('Money HUD is disposed');
    this.mount.append(this.root);
    this.renderBalance(this.account.balance);
    this.announceBalance();
    this.unsubscribe = this.account.events.on('transaction', (transaction) =>
      this.showTransaction(transaction),
    );
  }

  public getSnapshot(): MoneyHudSnapshot {
    return {
      visible: this.root.isConnected,
      formattedBalance: this.balance.textContent ?? '',
      authoritativeBalance: this.account.balance,
      displayedBalance: this.displayedBalance,
      animating: this.animationFrame !== undefined,
      delta: this.delta.hidden
        ? undefined
        : (this.delta.textContent ?? undefined),
      deltaKind: this.delta.hidden
        ? undefined
        : this.delta.dataset.kind === 'credit'
          ? 'credit'
          : 'debit',
      reducedMotion: this.reducedMotion,
      queuedDelta: this.queuedDelta,
    };
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    if (this.timer !== undefined) clearTimeout(this.timer);
    if (this.animationFrame !== undefined)
      cancelAnimationFrame(this.animationFrame);
    this.timer = undefined;
    this.animationFrame = undefined;
    this.queuedDelta = 0;
    this.root.remove();
  }

  private showTransaction(transaction: MoneyTransaction): void {
    this.announceBalance();
    this.startCount(transaction.balance, transaction.delta);
    this.queuedDelta += transaction.delta;
    if (this.timer !== undefined) clearTimeout(this.timer);
    if (this.queuedDelta === 0) {
      this.hideDelta();
      return;
    }
    const kind = this.queuedDelta > 0 ? 'credit' : 'debit';
    this.delta.hidden = false;
    this.delta.dataset.kind = kind;
    this.delta.textContent = `${this.queuedDelta > 0 ? '+' : '−'}${formatCurrency(Math.abs(this.queuedDelta))}`;
    if (!this.reducedMotion) {
      this.delta.style.animation = 'none';
      void this.delta.offsetWidth;
      this.delta.style.removeProperty('animation');
    }
    this.root.dataset.animation = String(transaction.id);
    this.timer = setTimeout(() => this.hideDelta(), MONEY_DELTA_DURATION_MS);
  }

  private startCount(target: number, delta: number): void {
    if (this.animationFrame !== undefined) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = undefined;
    }
    this.animationFrom = this.displayedBalance;
    this.animationTarget = target;
    this.root.dataset.direction = delta >= 0 ? 'increase' : 'decrease';
    if (this.reducedMotion || this.animationFrom === target) {
      this.completeCount();
      return;
    }
    this.animationStartedAt = performance.now();
    this.animationFrame = requestAnimationFrame(this.advanceCount);
  }

  private readonly advanceCount = (timestamp: number): void => {
    if (this.disposed) return;
    const progress = Math.min(
      1,
      Math.max(
        0,
        (timestamp - this.animationStartedAt) / MONEY_COUNT_DURATION_MS,
      ),
    );
    const eased = 1 - Math.pow(1 - progress, 3);
    const next = Math.round(
      this.animationFrom + (this.animationTarget - this.animationFrom) * eased,
    );
    this.renderBalance(next);
    if (progress >= 1) {
      this.completeCount();
      return;
    }
    this.animationFrame = requestAnimationFrame(this.advanceCount);
  };

  private completeCount(): void {
    this.animationFrame = undefined;
    this.renderBalance(this.animationTarget);
    delete this.root.dataset.direction;
  }

  private renderBalance(value: number): void {
    this.displayedBalance = value;
    this.balance.textContent = formatCurrency(value);
  }

  private announceBalance(): void {
    this.announcement.textContent = `Balance ${formatCurrency(this.account.balance)}`;
  }

  private hideDelta(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.queuedDelta = 0;
    this.delta.hidden = true;
    delete this.delta.dataset.kind;
  }
}
