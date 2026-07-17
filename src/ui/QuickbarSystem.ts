import type { GameSystem } from '../core/lifecycle';
import type { CharacterEquipment } from '../equipment/CharacterEquipment';
import { equipmentDefinitions } from '../equipment/EquipmentDefinition';

export interface QuickbarSnapshot {
  readonly visible: boolean;
  readonly slotCount: number;
  readonly equippedId: string | undefined;
  readonly selectedSlot: number | undefined;
  readonly slots: readonly {
    readonly slot: number;
    readonly itemId: string;
    readonly label: string;
    readonly icon: string;
    readonly selected: boolean;
    readonly ammunition?: { readonly current: number; readonly max: number };
  }[];
}

/** Player-only HUD projection of reusable equipment state. */
export class QuickbarSystem implements GameSystem {
  public readonly id = 'player-quickbar';
  public readonly updateMode = 'always' as const;

  private readonly root = document.createElement('section');
  private readonly slots = new Map<number, HTMLElement>();
  private readonly unsubscribers: (() => void)[] = [];

  public constructor(
    private readonly mount: HTMLElement,
    private readonly equipment: CharacterEquipment,
  ) {
    this.root.className = 'quickbar';
    this.root.setAttribute('aria-label', 'Equipment quickbar');
    this.root.setAttribute('aria-live', 'polite');
    for (const definition of equipmentDefinitions) {
      const slot = document.createElement('div');
      slot.className = 'quickbar__slot';
      slot.dataset.slot = String(definition.quickbarSlot);
      slot.dataset.itemId = definition.id;
      slot.setAttribute('role', 'status');
      slot.setAttribute(
        'aria-label',
        `Slot ${definition.quickbarSlot}: ${definition.displayName}`,
      );
      const key = document.createElement('kbd');
      key.textContent = String(definition.quickbarSlot);
      const icon = document.createElement('span');
      icon.className = `quickbar__icon quickbar__icon--${definition.id}`;
      icon.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.className = 'quickbar__label';
      label.textContent = definition.displayName;
      const ammo = document.createElement('span');
      ammo.className = 'quickbar__ammo';
      slot.append(key, icon, label, ammo);
      this.slots.set(definition.quickbarSlot, slot);
      this.root.append(slot);
    }
  }

  public init(): void {
    this.mount.append(this.root);
    this.unsubscribers.push(
      this.equipment.events.on('changed', () => this.sync()),
      this.equipment.events.on('ammunitionChanged', () => this.sync()),
    );
    this.sync();
  }

  public getSnapshot(): QuickbarSnapshot {
    const equipment = this.equipment.getSnapshot();
    return {
      visible: this.root.isConnected && !this.root.hidden,
      slotCount: this.slots.size,
      equippedId: equipment.equippedId,
      selectedSlot: equipment.equippedSlot,
      slots: equipmentDefinitions.map((definition) => {
        const ammunition = this.equipment.getAmmunition(definition.id);
        return {
          slot: definition.quickbarSlot,
          itemId: definition.id,
          label: definition.displayName,
          icon: definition.id,
          selected: equipment.equippedSlot === definition.quickbarSlot,
          ammunition: ammunition
            ? { current: ammunition.current, max: ammunition.max }
            : undefined,
        };
      }),
    };
  }

  public dispose(): void {
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
    this.root.remove();
    this.slots.clear();
  }

  private sync(): void {
    const selected = this.equipment.getSnapshot().equippedSlot;
    for (const [slotNumber, slot] of this.slots) {
      const active = selected === slotNumber;
      slot.dataset.selected = String(active);
      slot.setAttribute('aria-current', active ? 'true' : 'false');
      const definition = equipmentDefinitions.find(
        ({ quickbarSlot }) => quickbarSlot === slotNumber,
      );
      const ammunition = definition
        ? this.equipment.getAmmunition(definition.id)
        : undefined;
      const ammo = slot.querySelector<HTMLElement>('.quickbar__ammo');
      if (ammo) {
        ammo.textContent = ammunition
          ? `${ammunition.current} / ${ammunition.max}`
          : '';
        ammo.hidden = ammunition === undefined;
      }
      if (definition) {
        slot.setAttribute(
          'aria-label',
          `Slot ${slotNumber}: ${definition.displayName}${
            ammunition
              ? `, ${ammunition.current} of ${ammunition.max} rounds`
              : ''
          }${active ? ', equipped' : ''}`,
        );
      }
    }
  }
}
