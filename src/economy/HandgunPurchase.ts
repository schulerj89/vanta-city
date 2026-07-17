import type { CharacterEquipment } from '../equipment/CharacterEquipment';
import type { PlayerMoneyAccount } from './PlayerMoneyAccount';

export const TEST_HANDGUN_PRICE = 250;

export type HandgunPurchaseResult =
  'purchased' | 'already-owned' | 'insufficient-funds' | 'acquisition-failed';

type PurchaseEquipment = Pick<
  CharacterEquipment,
  'owns' | 'acquireAndEquip' | 'rollbackAcquisition'
>;

/** Atomic local purchase policy. It owns no balance or inventory state. */
export class HandgunPurchase {
  public constructor(
    private readonly account: PlayerMoneyAccount,
    private readonly equipment: PurchaseEquipment,
  ) {}

  public purchase(source = 'debug:handgun-purchase'): HandgunPurchaseResult {
    if (this.equipment.owns('handgun')) return 'already-owned';
    if (!this.account.canAfford(TEST_HANDGUN_PRICE)) {
      return 'insufficient-funds';
    }
    const acquisition = this.equipment.acquireAndEquip('handgun');
    if (!acquisition) return 'acquisition-failed';
    const debit = this.account.debit(TEST_HANDGUN_PRICE, {
      reason: 'handgun-purchase',
      source,
    });
    if (!debit) {
      this.equipment.rollbackAcquisition(acquisition);
      return 'acquisition-failed';
    }
    return 'purchased';
  }
}
