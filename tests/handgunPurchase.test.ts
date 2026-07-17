import { CharacterEquipment } from '../src/equipment/CharacterEquipment';
import {
  HandgunPurchase,
  TEST_HANDGUN_PRICE,
} from '../src/economy/HandgunPurchase';
import { PlayerMoneyAccount } from '../src/economy/PlayerMoneyAccount';

describe('HandgunPurchase', () => {
  it('grants ownership, equips, deducts once, and is idempotent', () => {
    const account = new PlayerMoneyAccount('player', 500);
    const equipment = new CharacterEquipment('player', ['knife']);
    const purchase = new HandgunPurchase(account, equipment);
    expect(purchase.purchase()).toBe('purchased');
    expect(account.balance).toBe(500 - TEST_HANDGUN_PRICE);
    expect(equipment.getSnapshot()).toMatchObject({
      ownedIds: ['knife', 'handgun'],
      equippedId: 'handgun',
    });
    expect(purchase.purchase()).toBe('already-owned');
    expect(account.balance).toBe(500 - TEST_HANDGUN_PRICE);
  });

  it('rejects insufficient funds without changing either owner', () => {
    const account = new PlayerMoneyAccount('player', TEST_HANDGUN_PRICE - 1);
    const equipment = new CharacterEquipment('player', ['knife']);
    const purchase = new HandgunPurchase(account, equipment);
    expect(purchase.purchase()).toBe('insufficient-funds');
    expect(account.getSnapshot().transactionSequence).toBe(0);
    expect(equipment.owns('handgun')).toBe(false);
  });

  it('does not debit when acquisition/equip fails', () => {
    const account = new PlayerMoneyAccount('player', 500);
    const equipment = {
      owns: () => false,
      acquireAndEquip: () => undefined,
      rollbackAcquisition: vi.fn(),
    };
    const purchase = new HandgunPurchase(account, equipment);
    expect(purchase.purchase()).toBe('acquisition-failed');
    expect(account.balance).toBe(500);
    expect(account.getSnapshot().transactionSequence).toBe(0);
    expect(equipment.rollbackAcquisition).not.toHaveBeenCalled();
  });

  it('rolls back the acquisition if an unexpected final debit cannot commit', () => {
    const account = {
      canAfford: () => true,
      debit: vi.fn(() => undefined),
    };
    const equipment = new CharacterEquipment('player', ['knife']);
    const purchase = new HandgunPurchase(account as never, equipment);
    expect(purchase.purchase()).toBe('acquisition-failed');
    expect(account.debit).toHaveBeenCalledOnce();
    expect(equipment.getSnapshot()).toMatchObject({
      ownedIds: ['knife'],
      equippedId: undefined,
    });
  });
});
