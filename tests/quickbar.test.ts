// @vitest-environment jsdom
import { CharacterEquipment } from '../src/equipment/CharacterEquipment';
import { QuickbarSystem } from '../src/ui/QuickbarSystem';

describe('QuickbarSystem', () => {
  it('projects exactly two accessible square slots and follows reusable loadout state', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const equipment = new CharacterEquipment('player');
    const quickbar = new QuickbarSystem(mount, equipment);
    quickbar.init();

    const slots = [...mount.querySelectorAll('.quickbar__slot')];
    expect(slots).toHaveLength(2);
    expect(slots.map((slot) => slot.getAttribute('aria-label'))).toEqual([
      'Slot 1: Handgun, 8 of 8 rounds',
      'Slot 2: Knife',
    ]);
    expect(quickbar.getSnapshot()).toMatchObject({
      visible: true,
      slotCount: 2,
      selectedSlot: undefined,
    });

    equipment.toggleQuickbarSlot(2);
    expect(slots[1]?.getAttribute('aria-current')).toBe('true');
    expect(quickbar.getSnapshot()).toMatchObject({
      equippedId: 'knife',
      selectedSlot: 2,
    });
    expect(quickbar.getSnapshot().slots[0]?.ammunition).toEqual({
      current: 8,
      max: 8,
    });
    equipment.toggleQuickbarSlot(2);
    expect(slots[1]?.getAttribute('aria-current')).toBe('false');

    quickbar.dispose();
    expect(mount.querySelector('.quickbar')).toBeNull();
    equipment.dispose();
    mount.remove();
  });

  it('keeps stable slots while exposing an unowned item as locked', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const equipment = new CharacterEquipment('player', ['knife']);
    const quickbar = new QuickbarSystem(mount, equipment);
    quickbar.init();
    const handgun = mount.querySelector<HTMLElement>(
      '[data-item-id="handgun"]',
    );
    expect(handgun?.dataset.owned).toBe('false');
    expect(handgun?.getAttribute('aria-label')).toBe('Slot 1: Handgun, locked');
    expect(quickbar.getSnapshot().slots[0]).toMatchObject({
      owned: false,
      ammunition: undefined,
    });
    equipment.acquire('handgun');
    expect(handgun?.dataset.owned).toBe('true');
    expect(handgun?.getAttribute('aria-label')).toBe(
      'Slot 1: Handgun, 8 of 8 rounds',
    );
    quickbar.dispose();
    equipment.dispose();
    mount.remove();
  });
});
