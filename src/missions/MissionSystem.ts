import { EventBus } from '../core/events';
import type { GameStateMachine } from '../core/gameState';
import type { GameSystem } from '../core/lifecycle';
import type { DialogueEvents } from '../dialogue/DialogueEvents';
import type { MoneyTransaction } from '../economy/PlayerMoneyAccount';
import type { HealthEvents } from '../health/Health';
import type { InteractionEvents } from '../interactions/Interactable';
import type { LevelDefinition } from '../world/LevelDefinition';
import type { ResolvedLevelLocation } from '../world/LocationResolver';
import type { WorldPoseSource, WorldPosition } from '../world/Spatial';
import {
  missionConditionMatches,
  type MissionContentRequestDefinition,
  type MissionDefinition,
  type MissionFactValue,
  type MissionRuntimeEvent,
} from './MissionDefinition';
import type {
  MissionHighlightSnapshot,
  MissionHighlightSource,
} from './MissionHighlight';

export type MissionStatus =
  'locked' | 'available' | 'active' | 'completed' | 'cancelled' | 'failed';
export type MissionObjectiveStatus = 'locked' | 'active' | 'completed';

export interface MissionObjectiveSnapshot {
  readonly id: string;
  readonly summary: string;
  readonly status: MissionObjectiveStatus;
}

export interface MissionProgressSnapshot {
  readonly id: string;
  readonly title: string;
  readonly status: MissionStatus;
  readonly attempt: number;
  readonly currentObjectiveId: string | undefined;
  readonly objectives: readonly MissionObjectiveSnapshot[];
  readonly canCancel: boolean;
  readonly retryReady: boolean;
  readonly rewardGranted: boolean;
  readonly failureReason: string | undefined;
}

export type MissionNotificationKind =
  | 'started'
  | 'objective-completed'
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'retry-ready';

export interface MissionNotificationSnapshot {
  readonly id: string;
  readonly kind: MissionNotificationKind;
  readonly missionId: string;
  readonly objectiveId: string | undefined;
  readonly title: string;
  readonly message: string;
}

export interface MissionSystemSnapshot {
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly activeMissionId: string | undefined;
  readonly missions: readonly MissionProgressSnapshot[];
  readonly facts: Readonly<Record<string, MissionFactValue>>;
  readonly highlights: readonly MissionHighlightSnapshot[];
  readonly notification: MissionNotificationSnapshot | undefined;
}

export interface MissionPersistenceSnapshot {
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly activeMissionId: string | undefined;
  readonly facts: Readonly<Record<string, MissionFactValue>>;
  readonly missions: readonly {
    readonly id: string;
    readonly status: MissionStatus;
    readonly attempt: number;
    readonly objectiveStatuses: readonly MissionObjectiveStatus[];
    readonly rewardGranted: boolean;
    readonly failureReason: string | undefined;
  }[];
}

export interface MissionEvents {
  changed: MissionSystemSnapshot;
  'mission:started': MissionProgressSnapshot;
  'mission:objective-completed': {
    readonly mission: MissionProgressSnapshot;
    readonly objective: MissionObjectiveSnapshot;
  };
  'mission:completed': MissionProgressSnapshot;
  'mission:cancelled': MissionProgressSnapshot;
  'mission:failed': MissionProgressSnapshot;
  'mission:retry-ready': MissionProgressSnapshot;
  'mission:content-requested': MissionContentRequestDefinition & {
    readonly missionId: string;
  };
  'mission:reward-granted': {
    readonly missionId: string;
    readonly rewardId: string;
    readonly money: MoneyTransaction | undefined;
    readonly equipmentIds: readonly string[];
    readonly facts: Readonly<Record<string, MissionFactValue>>;
  };
}

export interface MissionEventSource<Events extends object> {
  on<Key extends keyof Events>(
    type: Key,
    listener: (payload: Events[Key]) => void,
  ): () => void;
}

export interface MissionLevelSource {
  readonly activeLevel: LevelDefinition | undefined;
  resolveLocation(position: WorldPosition): ResolvedLevelLocation;
}

export interface MissionMoneySurface {
  credit(
    amount: number,
    metadata: { readonly reason: string; readonly source?: string },
  ): MoneyTransaction | undefined;
}

export interface MissionEquipmentSurface {
  owns(itemId: string): boolean;
  acquire(itemId: string): boolean;
}

export interface MissionSystemDependencies {
  readonly state: GameStateMachine;
  readonly player: WorldPoseSource;
  readonly level: MissionLevelSource;
  readonly interactions: MissionEventSource<InteractionEvents>;
  readonly dialogue: MissionEventSource<DialogueEvents>;
  readonly health: MissionEventSource<HealthEvents>;
  readonly money: MissionMoneySurface;
  readonly equipment: MissionEquipmentSurface;
}

interface MissionProgressState {
  status: MissionStatus;
  attempt: number;
  objectiveStatuses: MissionObjectiveStatus[];
  rewardGranted: boolean;
  failureReason: string | undefined;
}

const schemaVersion = 1 as const;

/** Sole owner of mission prerequisites, progress, facts, rewards and requests. */
export class MissionSystem implements GameSystem, MissionHighlightSource {
  public readonly id = 'missions';
  public readonly events = new EventBus<MissionEvents>();

  private readonly definitionsById: ReadonlyMap<string, MissionDefinition>;
  private readonly progress = new Map<string, MissionProgressState>();
  private readonly facts = new Map<string, MissionFactValue>();
  private readonly unsubscribers: (() => void)[] = [];
  private readonly enteredTriggers = new Set<string>();
  private activeMissionId: string | undefined;
  private lastLevelId: string | undefined;
  private lastLocationId: string | undefined;
  private notification: MissionNotificationSnapshot | undefined;
  private revision = 0;
  private notificationSequence = 0;
  private initialized = false;
  private disposed = false;

  public constructor(
    public readonly definitions: readonly MissionDefinition[],
    initialFacts: Readonly<Record<string, MissionFactValue>>,
    private readonly dependencies: MissionSystemDependencies,
  ) {
    this.definitionsById = new Map(
      definitions.map((definition) => [definition.id, definition]),
    );
    for (const [id, value] of Object.entries(initialFacts)) {
      this.facts.set(id, value);
    }
    for (const definition of definitions) {
      this.progress.set(definition.id, this.createProgress(definition));
    }
    this.refreshAvailability();
  }

  public init(): void {
    this.assertAvailable();
    if (this.initialized)
      throw new Error('Mission system is already initialized');
    this.initialized = true;
    this.unsubscribers.push(
      this.dependencies.interactions.on(
        'interaction:completed',
        ({ target }) => {
          this.dispatch({
            type: 'interaction-completed',
            interactionId: target.id,
          });
          const prefix = 'interaction.npc.';
          if (target.id.startsWith(prefix)) {
            this.dispatch({
              type: 'entity-interaction-completed',
              entityId: target.id.slice(prefix.length),
            });
          }
        },
      ),
      this.dependencies.dialogue.on('dialogue:hook', ({ hook }) =>
        this.dispatch({ type: 'event-hook', hookId: hook.id }),
      ),
      this.dependencies.dialogue.on(
        'dialogue:completed',
        ({ conversationId }) =>
          this.dispatch({ type: 'dialogue-completed', conversationId }),
      ),
      this.dependencies.health.on('depleted', () => {
        if (this.activeMissionId)
          this.fail(this.activeMissionId, 'player-depleted');
      }),
    );
  }

  public update(): void {
    if (this.dependencies.state.current !== 'playing') return;
    const level = this.dependencies.level.activeLevel;
    const pose = this.dependencies.player.getWorldPose();
    if (!level || !pose) return;
    if (level.id !== this.lastLevelId) {
      this.lastLevelId = level.id;
      this.lastLocationId = undefined;
      this.enteredTriggers.clear();
    }
    for (const trigger of level.triggers) {
      const inside = pointInsideTrigger(pose.position, trigger);
      const wasInside = this.enteredTriggers.has(trigger.id);
      if (inside && !wasInside) {
        this.enteredTriggers.add(trigger.id);
        this.dispatch({
          type: 'world-trigger-entered',
          triggerId: trigger.id,
        });
      } else if (!inside && wasInside) {
        this.enteredTriggers.delete(trigger.id);
      }
    }
    const locationId = this.dependencies.level.resolveLocation(
      pose.position,
    ).id;
    if (locationId !== this.lastLocationId) {
      this.lastLocationId = locationId;
      this.dispatch({ type: 'world-location-entered', locationId });
    }
  }

  public dispatch(event: MissionRuntimeEvent): boolean {
    this.assertAvailable();
    if (!this.activeMissionId) {
      const startable = this.definitions.find((definition) => {
        const progress = this.progress.get(definition.id)!;
        return (
          (progress.status === 'available' ||
            progress.status === 'cancelled') &&
          this.prerequisitesMet(definition) &&
          missionConditionMatches(definition.startCondition, event)
        );
      });
      if (startable) this.start(startable.id);
    }
    const definition = this.activeDefinition();
    if (!definition) return false;
    const progress = this.progress.get(definition.id)!;
    const objectiveIndex = progress.objectiveStatuses.indexOf('active');
    const objective = definition.objectives[objectiveIndex];
    if (!objective || !missionConditionMatches(objective.condition, event)) {
      return false;
    }
    this.completeObjective(definition, objectiveIndex);
    return true;
  }

  public start(missionId: string): boolean {
    this.assertAvailable();
    if (this.activeMissionId) return false;
    const definition = this.requireDefinition(missionId);
    const progress = this.progress.get(missionId)!;
    if (
      !this.prerequisitesMet(definition) ||
      !['available', 'cancelled'].includes(progress.status)
    ) {
      return false;
    }
    progress.status = 'active';
    progress.attempt += 1;
    progress.objectiveStatuses = definition.objectives.map((_, index) =>
      index === 0 ? 'active' : 'locked',
    );
    progress.failureReason = undefined;
    this.activeMissionId = missionId;
    this.setNotification('started', definition, undefined, definition.title);
    this.bump();
    this.emitContentRequests(definition, 'started');
    this.events.emit('mission:started', this.snapshotFor(definition));
    return true;
  }

  public completeCurrentObjective(missionId = this.activeMissionId): boolean {
    if (!missionId || missionId !== this.activeMissionId) return false;
    const definition = this.requireDefinition(missionId);
    const index = this.progress
      .get(missionId)!
      .objectiveStatuses.indexOf('active');
    if (index < 0) return false;
    this.completeObjective(definition, index);
    return true;
  }

  public cancel(missionId = this.activeMissionId): boolean {
    if (!missionId || missionId !== this.activeMissionId) return false;
    const definition = this.requireDefinition(missionId);
    const progress = this.progress.get(missionId)!;
    if (!this.canCancel(definition, progress)) return false;
    progress.status = 'cancelled';
    progress.objectiveStatuses = definition.objectives.map(() => 'locked');
    progress.failureReason = undefined;
    this.activeMissionId = undefined;
    this.setNotification(
      'cancelled',
      definition,
      undefined,
      'Mission cancelled',
    );
    this.bump();
    this.events.emit('mission:cancelled', this.snapshotFor(definition));
    return true;
  }

  public fail(missionId: string, reason: string): boolean {
    if (missionId !== this.activeMissionId || !reason.trim()) return false;
    const definition = this.requireDefinition(missionId);
    const progress = this.progress.get(missionId)!;
    progress.status = 'failed';
    progress.failureReason = reason;
    this.activeMissionId = undefined;
    this.setNotification(
      'failed',
      definition,
      undefined,
      'Attempt failed · Retry ready',
    );
    this.bump();
    const snapshot = this.snapshotFor(definition);
    this.events.emit('mission:failed', snapshot);
    this.events.emit('mission:retry-ready', snapshot);
    return true;
  }

  public retry(missionId: string): boolean {
    if (this.activeMissionId) return false;
    const definition = this.requireDefinition(missionId);
    const progress = this.progress.get(missionId)!;
    if (progress.status !== 'failed') return false;
    progress.status = 'active';
    progress.attempt += 1;
    progress.objectiveStatuses = definition.objectives.map((_, index) =>
      index === 0 ? 'active' : 'locked',
    );
    progress.failureReason = undefined;
    this.activeMissionId = missionId;
    this.setNotification(
      'retry-ready',
      definition,
      definition.objectives[0],
      'Attempt restarted',
    );
    this.bump();
    return true;
  }

  public getSnapshot(): MissionSystemSnapshot {
    const highlights = this.activeHighlights();
    return freeze({
      schemaVersion,
      revision: this.revision,
      activeMissionId: this.activeMissionId,
      missions: this.definitions.map((definition) =>
        this.snapshotFor(definition),
      ),
      facts: Object.fromEntries(this.facts),
      highlights,
      notification: this.notification ? { ...this.notification } : undefined,
    });
  }

  public getHighlights(): readonly MissionHighlightSnapshot[] {
    return this.getSnapshot().highlights;
  }

  public subscribe(listener: () => void): () => void {
    return this.events.on('changed', () => listener());
  }

  public getPersistenceSnapshot(): MissionPersistenceSnapshot {
    return freeze({
      schemaVersion,
      revision: this.revision,
      activeMissionId: this.activeMissionId,
      facts: Object.fromEntries(this.facts),
      missions: this.definitions.map(({ id }) => {
        const progress = this.progress.get(id)!;
        return {
          id,
          status: progress.status,
          attempt: progress.attempt,
          objectiveStatuses: [...progress.objectiveStatuses],
          rewardGranted: progress.rewardGranted,
          failureReason: progress.failureReason,
        };
      }),
    });
  }

  public restore(snapshot: MissionPersistenceSnapshot): void {
    this.assertAvailable();
    if (this.initialized) {
      throw new Error(
        'Mission persistence must be restored before initialization',
      );
    }
    const savedIds = new Set(snapshot.missions.map(({ id }) => id));
    if (savedIds.size !== snapshot.missions.length) {
      throw new Error('Mission snapshot contains duplicate mission IDs');
    }
    for (const saved of snapshot.missions) {
      if (!this.definitionsById.has(saved.id)) {
        throw new Error(
          `Mission snapshot contains unknown mission "${saved.id}"`,
        );
      }
    }
    const restoredActive = snapshot.missions.filter(
      ({ status }) => status === 'active',
    );
    if (
      restoredActive.length > 1 ||
      restoredActive[0]?.id !== snapshot.activeMissionId
    ) {
      throw new Error('Mission snapshot active mission is inconsistent');
    }
    for (const saved of snapshot.missions) {
      const definition = this.requireDefinition(saved.id);
      if (saved.objectiveStatuses.length !== definition.objectives.length) {
        throw new Error(
          `Mission snapshot is incompatible with "${definition.id}"`,
        );
      }
      this.progress.set(definition.id, {
        status: saved.status,
        attempt: saved.attempt,
        objectiveStatuses: [...saved.objectiveStatuses],
        rewardGranted: saved.rewardGranted,
        failureReason: saved.failureReason,
      });
    }
    this.facts.clear();
    for (const [id, value] of Object.entries(snapshot.facts))
      this.facts.set(id, value);
    this.activeMissionId = snapshot.activeMissionId;
    this.revision = snapshot.revision;
    this.notification = undefined;
    this.refreshAvailability();
  }

  /** Applies canonical story facts through the mission-owned persistence surface. */
  public applyFactChanges(
    changes: Readonly<Record<string, MissionFactValue>>,
  ): boolean {
    this.assertAvailable();
    let changed = false;
    for (const [id, value] of Object.entries(changes)) {
      if (this.facts.get(id) === value) continue;
      this.facts.set(id, value);
      changed = true;
    }
    if (changed) {
      this.refreshAvailability();
      this.bump();
    }
    return changed;
  }

  public dispose(): void {
    if (this.disposed) return;
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
    this.events.clear();
    this.enteredTriggers.clear();
    this.initialized = false;
    this.disposed = true;
  }

  private completeObjective(
    definition: MissionDefinition,
    objectiveIndex: number,
  ): void {
    const progress = this.progress.get(definition.id)!;
    const objective = definition.objectives[objectiveIndex]!;
    progress.objectiveStatuses[objectiveIndex] = 'completed';
    const next = definition.objectives[objectiveIndex + 1];
    if (next) {
      progress.objectiveStatuses[objectiveIndex + 1] = 'active';
      this.setNotification(
        'objective-completed',
        definition,
        objective,
        next.summary,
      );
      this.bump();
      this.events.emit('mission:objective-completed', {
        mission: this.snapshotFor(definition),
        objective: this.objectiveSnapshot(objective, 'completed'),
      });
      this.emitContentRequests(definition, 'objective-completed', objective.id);
      return;
    }
    this.finish(definition, objective);
  }

  private finish(
    definition: MissionDefinition,
    finalObjective: MissionDefinition['objectives'][number],
  ): void {
    const progress = this.progress.get(definition.id)!;
    if (!progress.rewardGranted) this.grantReward(definition);
    progress.status = 'completed';
    progress.failureReason = undefined;
    this.activeMissionId = undefined;
    this.setNotification(
      'completed',
      definition,
      finalObjective,
      `Mission complete${definition.reward.moneyAmount ? ` · $${definition.reward.moneyAmount} received` : ''}`,
    );
    this.refreshAvailability();
    this.bump();
    this.emitContentRequests(definition, 'completed');
    this.events.emit('mission:completed', this.snapshotFor(definition));
  }

  private grantReward(definition: MissionDefinition): void {
    const progress = this.progress.get(definition.id)!;
    const reward = definition.reward;
    const money = reward.moneyAmount
      ? this.dependencies.money.credit(reward.moneyAmount, {
          reason: `Mission complete: ${definition.title}`,
          source: reward.id,
        })
      : undefined;
    const equipmentIds: string[] = [];
    for (const itemId of reward.equipmentIds ?? []) {
      if (this.dependencies.equipment.owns(itemId)) continue;
      if (!this.dependencies.equipment.acquire(itemId)) {
        throw new Error(`Mission reward could not grant equipment "${itemId}"`);
      }
      equipmentIds.push(itemId);
    }
    for (const [id, value] of Object.entries(reward.factChanges)) {
      this.facts.set(id, value);
    }
    progress.rewardGranted = true;
    this.events.emit('mission:reward-granted', {
      missionId: definition.id,
      rewardId: reward.id,
      money,
      equipmentIds,
      facts: { ...reward.factChanges },
    });
  }

  private emitContentRequests(
    definition: MissionDefinition,
    phase: MissionContentRequestDefinition['phase'],
    objectiveId?: string,
  ): void {
    for (const request of definition.contentRequests ?? []) {
      if (
        request.phase !== phase ||
        (phase === 'objective-completed' && request.objectiveId !== objectiveId)
      ) {
        continue;
      }
      this.events.emit('mission:content-requested', {
        missionId: definition.id,
        ...request,
      });
    }
  }

  private activeHighlights(): readonly MissionHighlightSnapshot[] {
    const definition = this.activeDefinition();
    if (!definition) return [];
    const progress = this.progress.get(definition.id)!;
    const objectiveIndex = progress.objectiveStatuses.indexOf('active');
    const objective = definition.objectives[objectiveIndex];
    if (!objective) return [];
    return (objective.highlights ?? []).map((highlight) => ({
      ...highlight,
      missionId: definition.id,
      objectiveId: objective.id,
      channels: [...highlight.channels],
      target: { ...highlight.target },
    }));
  }

  private snapshotFor(definition: MissionDefinition): MissionProgressSnapshot {
    const progress = this.progress.get(definition.id)!;
    const currentIndex = progress.objectiveStatuses.indexOf('active');
    return freeze({
      id: definition.id,
      title: definition.title,
      status: progress.status,
      attempt: progress.attempt,
      currentObjectiveId: definition.objectives[currentIndex]?.id,
      objectives: definition.objectives.map((objective, index) =>
        this.objectiveSnapshot(objective, progress.objectiveStatuses[index]!),
      ),
      canCancel: this.canCancel(definition, progress),
      retryReady: progress.status === 'failed',
      rewardGranted: progress.rewardGranted,
      failureReason: progress.failureReason,
    });
  }

  private objectiveSnapshot(
    objective: MissionDefinition['objectives'][number],
    status: MissionObjectiveStatus,
  ): MissionObjectiveSnapshot {
    return freeze({ id: objective.id, summary: objective.summary, status });
  }

  private canCancel(
    definition: MissionDefinition,
    progress: MissionProgressState,
  ): boolean {
    if (progress.status !== 'active') return false;
    const boundary = definition.cancellationUntilObjectiveId;
    if (!boundary) return true;
    const index = definition.objectives.findIndex(({ id }) => id === boundary);
    return progress.objectiveStatuses[index] !== 'completed';
  }

  private prerequisitesMet(definition: MissionDefinition): boolean {
    return (
      definition.prerequisiteMissionIds.every(
        (id) => this.progress.get(id)?.status === 'completed',
      ) &&
      definition.prerequisiteFacts.every(
        ({ id, equals }) => this.facts.get(id) === equals,
      )
    );
  }

  private refreshAvailability(): void {
    for (const definition of this.definitions) {
      const progress = this.progress.get(definition.id)!;
      if (
        ['active', 'completed', 'cancelled', 'failed'].includes(progress.status)
      ) {
        continue;
      }
      progress.status = this.prerequisitesMet(definition)
        ? 'available'
        : 'locked';
    }
  }

  private createProgress(definition: MissionDefinition): MissionProgressState {
    return {
      status: 'locked',
      attempt: 0,
      objectiveStatuses: definition.objectives.map(() => 'locked'),
      rewardGranted: false,
      failureReason: undefined,
    };
  }

  private activeDefinition(): MissionDefinition | undefined {
    return this.activeMissionId
      ? this.definitionsById.get(this.activeMissionId)
      : undefined;
  }

  private requireDefinition(id: string): MissionDefinition {
    const definition = this.definitionsById.get(id);
    if (!definition) throw new Error(`Unknown mission: ${id}`);
    return definition;
  }

  private setNotification(
    kind: MissionNotificationKind,
    mission: MissionDefinition,
    objective: MissionDefinition['objectives'][number] | undefined,
    message: string,
  ): void {
    this.notificationSequence += 1;
    this.notification = {
      id: `mission-notification-${this.notificationSequence}`,
      kind,
      missionId: mission.id,
      objectiveId: objective?.id,
      title: mission.title,
      message,
    };
  }

  private bump(): void {
    this.revision += 1;
    this.events.emit('changed', this.getSnapshot());
  }

  private assertAvailable(): void {
    if (this.disposed) throw new Error('Mission system is disposed');
  }
}

function pointInsideTrigger(
  point: WorldPosition,
  trigger: LevelDefinition['triggers'][number],
): boolean {
  const [x, y, z] = trigger.position;
  const [width, height, depth] = trigger.size;
  return (
    Math.abs(point.x - x) <= width / 2 &&
    Math.abs(point.y - y) <= height / 2 &&
    Math.abs(point.z - z) <= depth / 2
  );
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      freeze(nested);
    }
  }
  return value;
}
