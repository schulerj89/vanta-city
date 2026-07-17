import { EventBus } from '../core/events';
import type { CharacterActionSink } from '../characters/CharacterActions';
import { equipmentById, equipmentForQuickbarSlot } from './EquipmentDefinition';
import type { EquipmentDefinition, EquipmentId } from './EquipmentDefinition';

export interface EquipmentSnapshot {
  readonly ownerId: string;
  readonly equippedId: EquipmentId | undefined;
  readonly equippedSlot: number | undefined;
  readonly changeSequence: number;
  readonly useSequence: number;
  readonly lastUseAccepted: boolean;
  readonly lastUseSource: string | undefined;
}

export interface EquipmentEvents {
  changed: EquipmentSnapshot;
  used: EquipmentSnapshot & {
    readonly itemId: EquipmentId;
    readonly action: EquipmentDefinition['useAction'];
  };
}

/** Reusable game-owned equipment state; it never stores state on visual nodes. */
export class CharacterEquipment {
  public readonly events = new EventBus<EquipmentEvents>();

  private equippedId: EquipmentId | undefined;
  private changeSequence = 0;
  private useSequence = 0;
  private lastUseAccepted = false;
  private lastUseSource: string | undefined;
  private disposed = false;

  public constructor(public readonly ownerId: string) {}

  public get equipped(): EquipmentDefinition | undefined {
    return this.equippedId ? equipmentById.get(this.equippedId) : undefined;
  }

  public equip(itemId: EquipmentId): boolean {
    this.assertAvailable();
    if (!equipmentById.has(itemId)) return false;
    if (this.equippedId === itemId) return false;
    this.equippedId = itemId;
    this.publishChange();
    return true;
  }

  public unequip(): boolean {
    this.assertAvailable();
    if (!this.equippedId) return false;
    this.equippedId = undefined;
    this.publishChange();
    return true;
  }

  /** Selecting the active slot again unequips it. */
  public toggleQuickbarSlot(slot: number): boolean {
    this.assertAvailable();
    const definition = equipmentForQuickbarSlot(slot);
    if (!definition) return false;
    return this.equippedId === definition.id
      ? this.unequip()
      : this.equip(definition.id);
  }

  public use(sink: CharacterActionSink, source = 'equipment'): boolean {
    return this.useWithTrigger(
      (action, requestSource) =>
        sink.triggerCharacterAction(action, requestSource),
      source,
    );
  }

  public useWithTrigger(
    trigger: (
      action: EquipmentDefinition['useAction'],
      source: string,
    ) => boolean,
    source = 'equipment',
  ): boolean {
    this.assertAvailable();
    const definition = this.equipped;
    const accepted = Boolean(
      definition && trigger(definition.useAction, source),
    );
    this.lastUseAccepted = accepted;
    this.lastUseSource = source;
    if (accepted && definition) {
      this.useSequence += 1;
      this.events.emit('used', {
        ...this.getSnapshot(),
        itemId: definition.id,
        action: definition.useAction,
      });
    }
    return accepted;
  }

  public getSnapshot(): EquipmentSnapshot {
    return {
      ownerId: this.ownerId,
      equippedId: this.equippedId,
      equippedSlot: this.equipped?.quickbarSlot,
      changeSequence: this.changeSequence,
      useSequence: this.useSequence,
      lastUseAccepted: this.lastUseAccepted,
      lastUseSource: this.lastUseSource,
    };
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.equippedId = undefined;
    this.events.clear();
  }

  private publishChange(): void {
    this.changeSequence += 1;
    this.events.emit('changed', this.getSnapshot());
  }

  private assertAvailable(): void {
    if (this.disposed) {
      throw new Error(`Equipment owner "${this.ownerId}" is disposed`);
    }
  }
}
