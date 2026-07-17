import type { GameSystem } from '../core/lifecycle';
import type {
  MoneyTransaction,
  PlayerMoneyAccount,
} from '../economy/PlayerMoneyAccount';

export const MONEY_DELTA_DURATION_MS = 1_400;

export interface MoneyHudSnapshot {
  readonly visible: boolean;
  readonly formattedBalance: string;
  readonly delta: string | undefined;
  readonly deltaKind: MoneyTransaction['kind'] | undefined;
  readonly reducedMotion: boolean;
  readonly queuedDelta: number;
}

export function formatCurrency(value: number): string {
  return `$${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)}`;
}

/** Accessible projection of the player account with one coalesced delta lane. */
export class MoneyHudSystem implements GameSystem {
  public readonly id = 'money-hud';
  public readonly updateMode = 'always' as const;

  private readonly root = document.createElement('section');
  private readonly balance = document.createElement('span');
  private readonly delta = document.createElement('span');
  private unsubscribe: (() => void) | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private queuedDelta = 0;
  private disposed = false;

  public constructor(
    private readonly mount: HTMLElement,
    private readonly account: PlayerMoneyAccount,
    private readonly reducedMotion = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches ?? false,
  ) {
    this.root.className = 'money-hud';
    this.root.setAttribute('aria-label', 'Player money');
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');
    this.root.setAttribute('aria-atomic', 'true');
    this.balance.className = 'money-hud__balance';
    this.delta.className = 'money-hud__delta';
    this.delta.setAttribute('aria-hidden', 'true');
    this.delta.hidden = true;
    this.root.dataset.reducedMotion = String(this.reducedMotion);
    this.root.append(this.balance, this.delta);
  }

  public init(): void {
    if (this.disposed) throw new Error('Money HUD is disposed');
    this.mount.append(this.root);
    this.syncBalance();
    this.unsubscribe = this.account.events.on('transaction', (transaction) =>
      this.showTransaction(transaction),
    );
  }

  public getSnapshot(): MoneyHudSnapshot {
    return {
      visible: this.root.isConnected,
      formattedBalance: this.balance.textContent ?? '',
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
    this.timer = undefined;
    this.queuedDelta = 0;
    this.root.remove();
  }

  private showTransaction(transaction: MoneyTransaction): void {
    this.syncBalance();
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

  private syncBalance(): void {
    this.balance.textContent = formatCurrency(this.account.balance);
  }

  private hideDelta(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.queuedDelta = 0;
    this.delta.hidden = true;
    delete this.delta.dataset.kind;
  }
}
