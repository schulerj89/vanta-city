import { EventBus } from '../core/events';

export const PLAYER_STARTING_BALANCE = 500;
export const PLAYER_MAX_BALANCE = 999_999_999;

export interface MoneyMutationMetadata {
  readonly reason: string;
  readonly source?: string;
}

export interface MoneyTransaction extends MoneyMutationMetadata {
  readonly id: number;
  readonly kind: 'credit' | 'debit';
  readonly amount: number;
  readonly previousBalance: number;
  readonly balance: number;
  readonly delta: number;
}

export interface MoneyAccountSnapshot {
  readonly ownerId: string;
  readonly balance: number;
  readonly maximumBalance: number;
  readonly transactionSequence: number;
  readonly lastTransaction: MoneyTransaction | undefined;
}

export interface MoneyAccountEvents {
  transaction: MoneyTransaction;
  balanceChanged: MoneyTransaction;
}

/** Player-owned integer currency state. Callers request mutations; UI only observes. */
export class PlayerMoneyAccount {
  public readonly events = new EventBus<MoneyAccountEvents>();

  private value: number;
  private transactionSequence = 0;
  private lastTransaction: MoneyTransaction | undefined;
  private disposed = false;

  public constructor(
    public readonly ownerId: string,
    initialBalance = PLAYER_STARTING_BALANCE,
    public readonly maximumBalance = PLAYER_MAX_BALANCE,
  ) {
    assertCurrency(maximumBalance, 'Maximum balance');
    if (maximumBalance <= 0) {
      throw new Error('Maximum balance must be greater than zero');
    }
    assertCurrency(initialBalance, 'Initial balance', true);
    if (initialBalance > maximumBalance) {
      throw new Error('Initial balance cannot exceed maximum balance');
    }
    this.value = initialBalance;
  }

  public get balance(): number {
    return this.value;
  }

  public canAfford(amount: number): boolean {
    this.assertAvailable();
    assertCurrency(amount, 'Money amount');
    return this.value >= amount;
  }

  public credit(
    amount: number,
    metadata: MoneyMutationMetadata,
  ): MoneyTransaction | undefined {
    this.assertAvailable();
    assertMetadata(metadata);
    assertCurrency(amount, 'Credit amount');
    if (this.value + amount > this.maximumBalance) return undefined;
    return this.commit('credit', amount, metadata);
  }

  /** Returns undefined without changing state when the balance is insufficient. */
  public debit(
    amount: number,
    metadata: MoneyMutationMetadata,
  ): MoneyTransaction | undefined {
    this.assertAvailable();
    assertMetadata(metadata);
    assertCurrency(amount, 'Debit amount');
    if (amount > this.value) return undefined;
    return this.commit('debit', amount, metadata);
  }

  public reset(
    balance = PLAYER_STARTING_BALANCE,
    metadata: MoneyMutationMetadata = { reason: 'reset' },
  ): MoneyTransaction | undefined {
    this.assertAvailable();
    assertMetadata(metadata);
    assertCurrency(balance, 'Reset balance', true);
    if (balance > this.maximumBalance) {
      throw new Error('Reset balance cannot exceed maximum balance');
    }
    if (balance === this.value) return undefined;
    const kind = balance > this.value ? 'credit' : 'debit';
    return this.commit(kind, Math.abs(balance - this.value), metadata);
  }

  public getSnapshot(): MoneyAccountSnapshot {
    return Object.freeze({
      ownerId: this.ownerId,
      balance: this.value,
      maximumBalance: this.maximumBalance,
      transactionSequence: this.transactionSequence,
      lastTransaction: this.lastTransaction,
    });
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.events.clear();
  }

  private commit(
    kind: MoneyTransaction['kind'],
    amount: number,
    metadata: MoneyMutationMetadata,
  ): MoneyTransaction {
    const previousBalance = this.value;
    this.value += kind === 'credit' ? amount : -amount;
    this.transactionSequence += 1;
    const transaction = Object.freeze({
      id: this.transactionSequence,
      kind,
      amount,
      previousBalance,
      balance: this.value,
      delta: kind === 'credit' ? amount : -amount,
      reason: metadata.reason,
      ...(metadata.source === undefined ? {} : { source: metadata.source }),
    });
    this.lastTransaction = transaction;
    this.events.emit('transaction', transaction);
    this.events.emit('balanceChanged', transaction);
    return transaction;
  }

  private assertAvailable(): void {
    if (this.disposed) {
      throw new Error(`Money account "${this.ownerId}" is disposed`);
    }
  }
}

function assertCurrency(value: number, label: string, allowZero = false): void {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new Error(
      `${label} must be ${allowZero ? 'a non-negative' : 'a positive'} safe integer`,
    );
  }
}

function assertMetadata(metadata: MoneyMutationMetadata): void {
  if (!metadata.reason.trim()) throw new Error('Money reason is required');
  if (metadata.source !== undefined && !metadata.source.trim()) {
    throw new Error('Money source cannot be empty');
  }
}
