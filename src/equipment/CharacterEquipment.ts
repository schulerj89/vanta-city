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
  readonly ammunition: Readonly<
    Partial<Record<EquipmentId, EquipmentAmmunitionSnapshot>>
  >;
  readonly reloadSequence: number;
  readonly dryFireSequence: number;
  readonly lastRejection: EquipmentUseRejection | undefined;
}

export interface EquipmentAmmunitionSnapshot {
  readonly current: number;
  readonly max: number;
  readonly empty: boolean;
}

export type EquipmentUseRejection =
  | 'no-equipment'
  | 'empty'
  | 'action-rejected'
  | 'not-reloadable'
  | 'already-full';

export interface EquipmentEvents {
  changed: EquipmentSnapshot;
  used: EquipmentSnapshot & {
    readonly itemId: EquipmentId;
    readonly action: EquipmentDefinition['useAction'];
  };
  ammunitionChanged: EquipmentSnapshot & {
    readonly itemId: EquipmentId;
    readonly ammunition: EquipmentAmmunitionSnapshot;
    readonly reason: 'consumed' | 'reloaded' | 'reset';
  };
  reloaded: EquipmentSnapshot & { readonly itemId: EquipmentId };
  dryFire: EquipmentSnapshot & { readonly itemId: EquipmentId };
}

/** Reusable game-owned equipment state; it never stores state on visual nodes. */
export class CharacterEquipment {
  public readonly events = new EventBus<EquipmentEvents>();

  private equippedId: EquipmentId | undefined;
  private changeSequence = 0;
  private useSequence = 0;
  private lastUseAccepted = false;
  private lastUseSource: string | undefined;
  private readonly ammunition = new Map<EquipmentId, number>();
  private reloadSequence = 0;
  private dryFireSequence = 0;
  private lastRejection: EquipmentUseRejection | undefined;
  private disposed = false;

  public constructor(public readonly ownerId: string) {
    for (const definition of equipmentById.values()) {
      if (definition.ammunition) {
        this.ammunition.set(definition.id, definition.ammunition.capacity);
      }
    }
  }

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
    if (!definition) return this.rejectUse('no-equipment', source);
    if (!this.canUse(definition.id)) {
      this.lastUseSource = source;
      this.lastUseAccepted = false;
      this.lastRejection = 'empty';
      this.dryFireSequence += 1;
      this.events.emit('dryFire', {
        ...this.getSnapshot(),
        itemId: definition.id,
      });
      return false;
    }
    const accepted = trigger(definition.useAction, source);
    this.lastUseAccepted = accepted;
    this.lastUseSource = source;
    this.lastRejection = accepted ? undefined : 'action-rejected';
    if (accepted) {
      this.consume(definition.id, 1);
      this.useSequence += 1;
      this.events.emit('used', {
        ...this.getSnapshot(),
        itemId: definition.id,
        action: definition.useAction,
      });
    }
    return accepted;
  }

  public getAmmunition(
    itemId: EquipmentId,
  ): EquipmentAmmunitionSnapshot | undefined {
    const definition = equipmentById.get(itemId);
    if (!definition?.ammunition) return undefined;
    const current = this.ammunition.get(itemId) ?? 0;
    return {
      current,
      max: definition.ammunition.capacity,
      empty: current <= 0,
    };
  }

  public canUse(itemId: EquipmentId): boolean {
    const ammunition = this.getAmmunition(itemId);
    return ammunition === undefined || !ammunition.empty;
  }

  public consume(itemId: EquipmentId, amount = 1): boolean {
    this.assertAvailable();
    const ammunition = this.getAmmunition(itemId);
    if (!ammunition || amount <= 0 || ammunition.current < amount) return false;
    this.ammunition.set(itemId, Math.max(0, ammunition.current - amount));
    this.publishAmmunition(itemId, 'consumed');
    return true;
  }

  public reload(itemId: EquipmentId, source = 'equipment:reload'): boolean {
    this.assertAvailable();
    const ammunition = this.getAmmunition(itemId);
    this.lastUseSource = source;
    if (!ammunition) return this.rejectUse('not-reloadable', source);
    if (ammunition.current === ammunition.max) {
      return this.rejectUse('already-full', source);
    }
    this.ammunition.set(itemId, ammunition.max);
    this.reloadSequence += 1;
    this.lastRejection = undefined;
    this.publishAmmunition(itemId, 'reloaded');
    this.events.emit('reloaded', { ...this.getSnapshot(), itemId });
    return true;
  }

  public resetAmmunition(itemId?: EquipmentId): void {
    this.assertAvailable();
    for (const definition of equipmentById.values()) {
      if (
        definition.ammunition &&
        (itemId === undefined || itemId === definition.id)
      ) {
        this.ammunition.set(definition.id, definition.ammunition.capacity);
        this.publishAmmunition(definition.id, 'reset');
      }
    }
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
      ammunition: Object.fromEntries(
        [...this.ammunition.keys()].map((itemId) => [
          itemId,
          this.getAmmunition(itemId),
        ]),
      ),
      reloadSequence: this.reloadSequence,
      dryFireSequence: this.dryFireSequence,
      lastRejection: this.lastRejection,
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

  private publishAmmunition(
    itemId: EquipmentId,
    reason: 'consumed' | 'reloaded' | 'reset',
  ): void {
    const ammunition = this.getAmmunition(itemId);
    if (!ammunition) return;
    this.events.emit('ammunitionChanged', {
      ...this.getSnapshot(),
      itemId,
      ammunition,
      reason,
    });
  }

  private rejectUse(rejection: EquipmentUseRejection, source: string): false {
    this.lastUseAccepted = false;
    this.lastUseSource = source;
    this.lastRejection = rejection;
    return false;
  }

  private assertAvailable(): void {
    if (this.disposed) {
      throw new Error(`Equipment owner "${this.ownerId}" is disposed`);
    }
  }
}
