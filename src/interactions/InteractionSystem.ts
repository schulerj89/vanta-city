import { EventBus } from '../core/events';
import type { EventBus as RuntimeEventBus } from '../core/events';
import type { GameStateMachine, StateEvents } from '../core/gameState';
import type { GameSystem } from '../core/lifecycle';
import type { InputReader } from '../input/InputSystem';
import { Vector3 } from 'three';
import type { CollisionWorld } from '../physics/CollisionWorld';
import type {
  Interactable,
  InteractionCandidate,
  InteractionCancelReason,
  InteractionDebugSnapshot,
  InteractionEvents,
  InteractionTargetSummary,
} from './Interactable';
import type {
  WorldPose,
  WorldPoseSource,
  WorldPosition,
} from '../world/Spatial';

const DEFAULT_RANGE = 2.5;
const MIN_FACING = -0.25;
const DEFAULT_LINE_OF_SIGHT_HEIGHT = 1.2;
export const INTERACTION_SWITCH_SCORE_MARGIN = 0.75;

interface InteractionRuntimeContext {
  readonly events: RuntimeEventBus<StateEvents>;
}

interface RegisteredInteractable {
  readonly definition: Interactable;
  enabled: boolean;
  completed: boolean;
}

interface RunningInteraction {
  readonly registration: RegisteredInteractable;
  readonly controller: AbortController;
  readonly token: symbol;
}

function locationOf(interactable: Interactable): WorldPosition {
  return typeof interactable.location === 'function'
    ? interactable.location()
    : interactable.location;
}

function distanceBetween(a: WorldPosition, b: WorldPosition): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function normalizedDotToTarget(pose: WorldPose, target: WorldPosition): number {
  const dx = target.x - pose.position.x;
  const dy = target.y - pose.position.y;
  const dz = target.z - pose.position.z;
  const targetLength = Math.hypot(dx, dy, dz);
  const forwardLength = Math.hypot(
    pose.forward.x,
    pose.forward.y,
    pose.forward.z,
  );
  if (targetLength === 0 || forwardLength === 0) return 1;
  return (
    (dx * pose.forward.x + dy * pose.forward.y + dz * pose.forward.z) /
    (targetLength * forwardLength)
  );
}

function summaryOf(interactable: Interactable): InteractionTargetSummary {
  return { id: interactable.id, prompt: interactable.prompt };
}

export class InteractionSystem implements GameSystem<InteractionRuntimeContext> {
  public readonly id = 'interactions';
  public readonly events = new EventBus<InteractionEvents>();

  private readonly registrations = new Map<string, RegisteredInteractable>();
  private selected: RegisteredInteractable | undefined;
  private running: RunningInteraction | undefined;
  private candidates: readonly InteractionCandidate[] = [];
  private pose: WorldPose | undefined;
  private debugTargets: InteractionDebugSnapshot['targets'] = [];
  private challengerId: string | undefined;
  private selectionDecision: InteractionDebugSnapshot['selectionDecision'] =
    'none';
  private unsubscribeState: (() => void) | undefined;

  public constructor(
    private readonly input: InputReader,
    private readonly state: GameStateMachine,
    private readonly player: WorldPoseSource,
    private readonly collision: Pick<CollisionWorld, 'castSegment'>,
  ) {}

  public init(context: InteractionRuntimeContext): void {
    this.unsubscribeState = context.events.on('game-state:changed', () => {
      this.validateRunningInteraction();
      this.refreshSelection();
    });
  }

  public register(interactable: Interactable): () => void {
    if (this.registrations.has(interactable.id)) {
      throw new Error(`Duplicate interactable: ${interactable.id}`);
    }
    this.registrations.set(interactable.id, {
      definition: interactable,
      enabled: interactable.enabled ?? true,
      completed: false,
    });
    return () => this.unregister(interactable.id);
  }

  public unregister(id: string): boolean {
    const registration = this.registrations.get(id);
    if (!registration) return false;
    this.registrations.delete(id);
    if (this.running?.registration === registration) {
      this.cancelRunning('target-removed');
    } else {
      if (this.selected === registration) this.setSelected(undefined);
      this.refreshSelection();
    }
    return true;
  }

  public setEnabled(id: string, enabled: boolean): void {
    const registration = this.registrations.get(id);
    if (!registration) throw new Error(`Unknown interactable: ${id}`);
    if (registration.enabled === enabled) return;
    registration.enabled = enabled;
    const target = summaryOf(registration.definition);
    this.events.emit(enabled ? 'interaction:enabled' : 'interaction:disabled', {
      target,
    });
    if (!enabled && this.running?.registration === registration) {
      this.cancelRunning('disabled');
    }
    this.refreshSelection();
  }

  public cancelActive(reason: InteractionCancelReason = 'replaced'): void {
    this.cancelRunning(reason);
  }

  public update(): void {
    this.validateRunningInteraction();
    this.refreshSelection();
    if (this.input.wasPressed('interact')) this.startSelected();
  }

  public getActiveTarget(): InteractionTargetSummary | undefined {
    return this.selected ? summaryOf(this.selected.definition) : undefined;
  }

  public getDebugSnapshot(): InteractionDebugSnapshot {
    return {
      pose: this.pose,
      targets: this.debugTargets,
      candidates: this.candidates,
      selectedId: this.selected?.definition.id,
      challengerId: this.challengerId,
      selectionDecision: this.selectionDecision,
      switchScoreMargin: INTERACTION_SWITCH_SCORE_MARGIN,
    };
  }

  public dispose(): void {
    this.unsubscribeState?.();
    this.unsubscribeState = undefined;
    this.cancelRunning('system-disposed');
    this.setSelected(undefined);
    this.registrations.clear();
    this.candidates = [];
    this.debugTargets = [];
    this.events.clear();
  }

  private refreshSelection(): void {
    this.pose = this.player.getWorldPose();
    const ranked = this.evaluateCandidates(this.pose);
    this.candidates = ranked.candidates;
    this.debugTargets = ranked.targets;
    if (this.running) {
      this.setSelected(undefined);
      this.challengerId = undefined;
      this.selectionDecision = 'none';
      return;
    }
    const best = this.candidates[0];
    const current = this.selected
      ? this.candidates.find(
          ({ target }) => target.id === this.selected?.definition.id,
        )
      : undefined;
    this.challengerId =
      best && best.target.id !== current?.target.id
        ? best.target.id
        : undefined;
    if (!best) {
      this.selectionDecision = 'none';
      this.setSelected(undefined);
      return;
    }
    if (
      current &&
      best.target.id !== current.target.id &&
      best.score < current.score + INTERACTION_SWITCH_SCORE_MARGIN
    ) {
      this.selectionDecision = 'held-current';
      return;
    }
    this.selectionDecision = current
      ? best.target.id === current.target.id
        ? 'selected-best'
        : 'switched'
      : 'selected-best';
    this.setSelected(this.registrations.get(best.target.id));
  }

  private evaluateCandidates(pose: WorldPose | undefined): {
    candidates: InteractionCandidate[];
    targets: InteractionDebugSnapshot['targets'];
  } {
    const candidates: InteractionCandidate[] = [];
    const targets: InteractionDebugSnapshot['targets'][number][] = [];
    for (const registration of this.registrations.values()) {
      const target = registration.definition;
      const location = locationOf(target);
      const range = target.range ?? DEFAULT_RANGE;
      const base = { id: target.id, location, range };
      const unavailable = this.unavailableReason(registration);
      if (unavailable) {
        targets.push({
          ...base,
          available: false,
          distance: undefined,
          facing: undefined,
          lineOfSight: 'not-tested',
          blockerId: undefined,
          score: undefined,
          rejectionReason: unavailable,
        });
        continue;
      }
      if (!pose) {
        targets.push({
          ...base,
          available: true,
          distance: undefined,
          facing: undefined,
          lineOfSight: 'not-tested',
          blockerId: undefined,
          score: undefined,
          rejectionReason: 'no-player',
        });
        continue;
      }
      const distance = distanceBetween(pose.position, location);
      const facing = normalizedDotToTarget(pose, location);
      if (distance > range || facing < MIN_FACING) {
        targets.push({
          ...base,
          available: true,
          distance,
          facing,
          lineOfSight: 'not-tested',
          blockerId: undefined,
          score: undefined,
          rejectionReason: distance > range ? 'out-of-range' : 'behind',
        });
        continue;
      }
      const los = this.castLineOfSight(pose, target, location);
      if (los.obstructed) {
        targets.push({
          ...base,
          available: true,
          distance,
          facing,
          lineOfSight: 'blocked',
          blockerId: los.colliderId,
          score: undefined,
          rejectionReason: 'occluded',
        });
        continue;
      }

      // Priority dominates. Within a priority, closer and more centered targets
      // rank higher. The id tie-break makes overlapping results deterministic.
      const score =
        (target.priority ?? 0) * 100 +
        (1 - distance / Math.max(range, Number.EPSILON)) * 10 +
        (facing + 1) / 2;
      candidates.push({
        target: summaryOf(target),
        location,
        distance,
        facing,
        visible: true,
        blockerId: undefined,
        score,
      });
      targets.push({
        ...base,
        available: true,
        distance,
        facing,
        lineOfSight: 'clear',
        blockerId: undefined,
        score,
        rejectionReason: undefined,
      });
    }
    candidates.sort(
      (a, b) => b.score - a.score || a.target.id.localeCompare(b.target.id),
    );
    return { candidates, targets };
  }

  private castLineOfSight(
    pose: WorldPose,
    target: Interactable,
    location = locationOf(target),
  ) {
    const height = target.lineOfSightHeight ?? DEFAULT_LINE_OF_SIGHT_HEIGHT;
    return this.collision.castSegment(
      new Vector3(pose.position.x, pose.position.y + height, pose.position.z),
      new Vector3(location.x, location.y + height, location.z),
      { ignoreColliderIds: target.collisionIgnoreIds },
    );
  }

  private unavailableReason(
    registration: RegisteredInteractable,
  ): InteractionDebugSnapshot['targets'][number]['rejectionReason'] {
    const target = registration.definition;
    if (!registration.enabled) return 'disabled';
    if (registration.completed && target.repeatable === false)
      return 'completed';
    const requiredStates = target.requiredStates ?? ['playing'];
    if (!requiredStates.includes(this.state.current)) return 'game-state';
    if (!(
      target.isAvailable?.({
        gameState: this.state.current,
        targetId: target.id,
      }) ?? true
    ))
      return 'unavailable';
    return undefined;
  }

  private isAvailable(registration: RegisteredInteractable): boolean {
    return this.unavailableReason(registration) === undefined;
  }

  private setSelected(registration: RegisteredInteractable | undefined): void {
    if (registration === this.selected) return;
    this.selected = registration;
    this.events.emit('interaction:target-changed', {
      target: registration ? summaryOf(registration.definition) : undefined,
    });
  }

  private startSelected(): void {
    const registration = this.selected;
    if (!registration || this.running || !this.isAvailable(registration))
      return;
    const target = registration.definition;
    const controller = new AbortController();
    const token = Symbol(target.id);
    this.running = { registration, controller, token };
    this.setSelected(undefined);
    this.events.emit('interaction:started', { target: summaryOf(target) });

    let result: void | Promise<void>;
    try {
      result = target.interact({
        gameState: this.state.current,
        targetId: target.id,
        signal: controller.signal,
      });
    } catch (error) {
      this.failRunning(token, error);
      return;
    }

    if (result === undefined) {
      this.completeRunning(token);
      return;
    }
    void Promise.resolve(result).then(
      () => this.completeRunning(token),
      (error: unknown) => this.failRunning(token, error),
    );
  }

  private completeRunning(token: symbol): void {
    if (this.running?.token !== token) return;
    const registration = this.running.registration;
    this.running = undefined;
    registration.completed = true;
    this.events.emit('interaction:completed', {
      target: summaryOf(registration.definition),
    });
    this.refreshSelection();
  }

  private failRunning(token: symbol, error: unknown): void {
    if (this.running?.token !== token) return;
    this.cancelRunning('handler-error', error);
  }

  private validateRunningInteraction(): void {
    const running = this.running;
    if (!running) return;
    if (!this.registrations.has(running.registration.definition.id)) {
      this.cancelRunning('target-removed');
      return;
    }
    if (!running.registration.enabled) {
      this.cancelRunning('disabled');
      return;
    }
    const target = running.registration.definition;
    const requiredStates = target.requiredStates ?? ['playing'];
    if (!requiredStates.includes(this.state.current)) {
      this.cancelRunning('game-state');
      return;
    }
    if (!(
      target.isAvailable?.({
        gameState: this.state.current,
        targetId: target.id,
      }) ?? true
    )) {
      this.cancelRunning('unavailable');
      return;
    }
    const pose = this.player.getWorldPose();
    if (
      !pose ||
      distanceBetween(pose.position, locationOf(target)) >
        (target.range ?? DEFAULT_RANGE)
    ) {
      this.cancelRunning('out-of-range');
      return;
    }
    if (this.castLineOfSight(pose, target).obstructed) {
      this.cancelRunning('occluded');
    }
  }

  private cancelRunning(
    reason: InteractionCancelReason,
    error?: unknown,
  ): void {
    const running = this.running;
    if (!running) return;
    this.running = undefined;
    running.controller.abort(reason);
    this.events.emit('interaction:cancelled', {
      target: summaryOf(running.registration.definition),
      reason,
      ...(error === undefined ? {} : { error }),
    });
    this.refreshSelection();
  }
}
