import type { GameSystem } from '../core/lifecycle';
import type { CharacterEquipment } from '../equipment/CharacterEquipment';
import { equipmentDefinitions } from '../equipment/EquipmentDefinition';

export interface QuickbarSnapshot {
  readonly visible: boolean;
  readonly slotCount: number;
  readonly equippedId: string | undefined;
  readonly selectedSlot: number | undefined;
}

/** Player-only HUD projection of reusable equipment state. */
export class QuickbarSystem implements GameSystem {
  public readonly id = 'player-quickbar';
  public readonly updateMode = 'always' as const;

  private readonly root = document.createElement('section');
  private readonly slots = new Map<number, HTMLElement>();
  private unsubscribe: (() => void) | undefined;

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
      icon.className = 'quickbar__icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = definition.icon;
      const label = document.createElement('span');
      label.className = 'quickbar__label';
      label.textContent = definition.displayName;
      slot.append(key, icon, label);
      this.slots.set(definition.quickbarSlot, slot);
      this.root.append(slot);
    }
  }

  public init(): void {
    this.mount.append(this.root);
    this.unsubscribe = this.equipment.events.on('changed', () => this.sync());
    this.sync();
  }

  public getSnapshot(): QuickbarSnapshot {
    const equipment = this.equipment.getSnapshot();
    return {
      visible: this.root.isConnected && !this.root.hidden,
      slotCount: this.slots.size,
      equippedId: equipment.equippedId,
      selectedSlot: equipment.equippedSlot,
    };
  }

  public dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.root.remove();
    this.slots.clear();
  }

  private sync(): void {
    const selected = this.equipment.getSnapshot().equippedSlot;
    for (const [slotNumber, slot] of this.slots) {
      const active = selected === slotNumber;
      slot.dataset.selected = String(active);
      slot.setAttribute('aria-current', active ? 'true' : 'false');
    }
  }
}
