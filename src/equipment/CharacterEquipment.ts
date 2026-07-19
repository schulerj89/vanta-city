import { EventBus } from '../core/events';
import type { CharacterActionSink } from '../characters/CharacterActions';
import { equipmentById, equipmentForQuickbarSlot } from './EquipmentDefinition';
import type { EquipmentDefinition, EquipmentId } from './EquipmentDefinition';

export interface EquipmentSnapshot {
  readonly ownerId: string;
  readonly equippedId: EquipmentId | undefined;
  readonly equippedSlot: number | undefined;
  readonly ownedIds: readonly EquipmentId[];
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

export interface EquipmentPersistenceSnapshot {
  readonly ownedIds: readonly EquipmentId[];
  readonly equippedId: EquipmentId | undefined;
  readonly ammunition: Readonly<Partial<Record<EquipmentId, number>>>;
}

export type EquipmentUseRejection =
  | 'no-equipment'
  | 'empty'
  | 'action-rejected'
  | 'not-reloadable'
  | 'already-full';

export interface EquipmentEvents {
  changed: EquipmentSnapshot;
  ownershipChanged: EquipmentSnapshot & {
    readonly itemId: EquipmentId;
    readonly owned: boolean;
  };
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
  private readonly ownedIds = new Set<EquipmentId>();
  private changeSequence = 0;
  private useSequence = 0;
  private lastUseAccepted = false;
  private lastUseSource: string | undefined;
  private readonly ammunition = new Map<EquipmentId, number>();
  private reloadSequence = 0;
  private dryFireSequence = 0;
  private lastRejection: EquipmentUseRejection | undefined;
  private disposed = false;

  public constructor(
    public readonly ownerId: string,
    initialOwned: readonly EquipmentId[] = equipmentDefinitionsOwnedByDefault(),
  ) {
    for (const itemId of initialOwned) {
      if (!equipmentById.has(itemId)) {
        throw new Error(`Unknown initial equipment: ${itemId}`);
      }
      this.ownedIds.add(itemId);
    }
    for (const definition of equipmentById.values()) {
      if (definition.ammunition) {
        this.ammunition.set(definition.id, definition.ammunition.capacity);
      }
    }
  }

  public get equipped(): EquipmentDefinition | undefined {
    return this.equippedId ? equipmentById.get(this.equippedId) : undefined;
  }

  public owns(itemId: EquipmentId): boolean {
    return this.ownedIds.has(itemId);
  }

  public acquire(itemId: EquipmentId): boolean {
    this.assertAvailable();
    if (!equipmentById.has(itemId) || this.ownedIds.has(itemId)) return false;
    this.ownedIds.add(itemId);
    this.publishOwnership(itemId, true);
    return true;
  }

  /** Grants and equips as one equipment-side operation for purchase callers. */
  public acquireAndEquip(
    itemId: EquipmentId,
  ): EquipmentAcquisition | undefined {
    this.assertAvailable();
    if (!equipmentById.has(itemId) || this.ownedIds.has(itemId))
      return undefined;
    const acquisition = { itemId, previousEquippedId: this.equippedId };
    this.ownedIds.add(itemId);
    this.equippedId = itemId;
    this.publishOwnership(itemId, true);
    this.publishChange();
    return acquisition;
  }

  /** Compensation hook for a caller whose surrounding transaction could not commit. */
  public rollbackAcquisition(acquisition: EquipmentAcquisition): void {
    this.assertAvailable();
    if (!this.ownedIds.has(acquisition.itemId)) return;
    this.ownedIds.delete(acquisition.itemId);
    this.equippedId = acquisition.previousEquippedId;
    this.publishOwnership(acquisition.itemId, false);
    this.publishChange();
  }

  public equip(itemId: EquipmentId): boolean {
    this.assertAvailable();
    if (!equipmentById.has(itemId) || !this.ownedIds.has(itemId)) return false;
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
    if (!definition || !this.owns(definition.id)) return false;
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

  /** Persistence-only atomic import. It emits no acquisition or use events. */
  public restore(snapshot: EquipmentPersistenceSnapshot): void {
    this.assertAvailable();
    const owned = new Set(snapshot.ownedIds);
    if (
      owned.size !== snapshot.ownedIds.length ||
      snapshot.ownedIds.some((id) => !equipmentById.has(id)) ||
      (snapshot.equippedId !== undefined && !owned.has(snapshot.equippedId))
    ) {
      throw new Error('Invalid equipment persistence snapshot');
    }
    const ammunition = new Map<EquipmentId, number>();
    for (const definition of equipmentById.values()) {
      if (!definition.ammunition) continue;
      const current = snapshot.ammunition[definition.id];
      if (
        current === undefined ||
        !Number.isSafeInteger(current) ||
        current < 0 ||
        current > definition.ammunition.capacity
      ) {
        throw new Error(`Invalid persisted ammunition for "${definition.id}"`);
      }
      ammunition.set(definition.id, current);
    }
    this.ownedIds.clear();
    for (const itemId of owned) this.ownedIds.add(itemId);
    this.equippedId = snapshot.equippedId;
    this.ammunition.clear();
    for (const [itemId, current] of ammunition) {
      this.ammunition.set(itemId, current);
    }
    this.changeSequence = 0;
    this.useSequence = 0;
    this.reloadSequence = 0;
    this.dryFireSequence = 0;
    this.lastUseAccepted = false;
    this.lastUseSource = undefined;
    this.lastRejection = undefined;
  }

  public getSnapshot(): EquipmentSnapshot {
    return {
      ownerId: this.ownerId,
      equippedId: this.equippedId,
      equippedSlot: this.equipped?.quickbarSlot,
      ownedIds: [...this.ownedIds],
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

  private publishOwnership(itemId: EquipmentId, owned: boolean): void {
    this.events.emit('ownershipChanged', {
      ...this.getSnapshot(),
      itemId,
      owned,
    });
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

export interface EquipmentAcquisition {
  readonly itemId: EquipmentId;
  readonly previousEquippedId: EquipmentId | undefined;
}

function equipmentDefinitionsOwnedByDefault(): EquipmentId[] {
  return [...equipmentById.keys()];
}
