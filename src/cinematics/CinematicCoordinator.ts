import { EventBus } from '../core/events';
import type {
  GameState,
  GameStateMachine,
  StateEvents,
} from '../core/gameState';
import type { GameSystem } from '../core/lifecycle';
import type { FrameTime } from '../core/time';
import type { InputReader, PointerInputReader } from '../input/InputSystem';
import type {
  CameraControlHandle,
  ThirdPersonCameraSystem,
} from '../camera/ThirdPersonCameraSystem';
import type { WorldPosition } from '../world/Spatial';
import type { CinematicAnchorDefinition } from '../world/LevelDefinition';
import type {
  CinematicCatalog,
  CinematicCompletionResult,
  CinematicDefinition,
} from './CinematicDefinition';
import { getCinematicSubtitleCues } from './CinematicDefinition';
import type {
  CinematicDestinationHandle,
  CinematicPerformanceHandle,
  CinematicPerformanceReleaseReason,
  CinematicPerformanceRestoreToken,
  CinematicRuntimeAdapters,
} from './CinematicRuntimeContracts';

export interface CinematicSnapshot {
  readonly state: 'idle' | 'playing' | 'paused' | 'confirming-skip' | 'landing';
  readonly cinematicId?: string;
  readonly shotId?: string;
  readonly shotIndex?: number;
  readonly shotElapsedSeconds: number;
  readonly subtitleVisible: boolean;
  readonly subtitleCueId?: string;
  readonly speakerId?: string;
  readonly subtitleText: string;
  readonly lastResult?: CinematicCompletionResult;
  readonly lastFailure?: string;
  readonly playbackSequence: number;
  readonly emittedEventIds: readonly string[];
  readonly activePerformanceCueIds: readonly string[];
  readonly landingResult?: Extract<
    CinematicCompletionResult,
    'completed' | 'skipped' | 'failed'
  >;
  readonly destinationReadiness?: 'pending' | 'ready' | 'failed';
  readonly committedLandingTransactionId?: string;
}

export interface CinematicCoordinatorEvents {
  changed: CinematicSnapshot;
  event: { readonly id: string; readonly cinematicId: string };
  completed: {
    readonly cinematicId: string;
    readonly result: CinematicCompletionResult;
  };
}

export interface CinematicLevelSource {
  readonly activeLevel?: { readonly id: string };
  getCinematicAnchor(id: string): CinematicAnchorDefinition;
}

export interface CinematicParticipantSource {
  hasParticipant(id: string): boolean;
}

export interface CinematicControlTarget {
  isControlEnabled(): boolean;
  setControlEnabled(enabled: boolean): void;
}

interface ActiveCinematic {
  readonly definition: CinematicDefinition;
  readonly returnState: Extract<GameState, 'playing' | 'dialogue'>;
  readonly controlsWereEnabled: boolean;
  readonly pointerWasLocked: boolean;
  readonly focus: HTMLElement | undefined;
  shotIndex: number;
  shotElapsedSeconds: number;
  camera?: CameraControlHandle;
  pausedForSkip: boolean;
  pausedByGame: boolean;
  readonly performanceTokens: Map<string, CinematicPerformanceRestoreToken>;
  readonly performanceHandles: Map<string, CinematicPerformanceHandle>;
  readonly firedPerformanceCueIds: Set<string>;
  destination?: CinematicDestinationHandle;
  landingResult?: Extract<
    CinematicCompletionResult,
    'completed' | 'skipped' | 'failed'
  >;
  landingFailure?: string;
  landingCommitted: boolean;
}

export class CinematicCoordinator implements GameSystem {
  public readonly id = 'cinematic-coordinator';
  public readonly updateMode = 'always' as const;
  public readonly events = new EventBus<CinematicCoordinatorEvents>();
  private active: ActiveCinematic | undefined;
  private snapshot: CinematicSnapshot = idleSnapshot();
  private unsubscribeState: (() => void) | undefined;
  private playbackSequence = 0;
  private readonly emittedEventIds: string[] = [];

  public constructor(
    private readonly catalog: CinematicCatalog,
    private readonly state: GameStateMachine,
    private readonly stateEvents: EventBus<StateEvents>,
    private readonly input: InputReader,
    private readonly pointer: PointerInputReader,
    private readonly camera: Pick<ThirdPersonCameraSystem, 'requestCamera'>,
    private readonly level: CinematicLevelSource,
    private readonly participants: CinematicParticipantSource,
    private readonly player: CinematicControlTarget,
    private readonly adapters: CinematicRuntimeAdapters = {},
  ) {}

  public init(): void {
    this.unsubscribeState = this.stateEvents.on(
      'game-state:changed',
      ({ from, to }) => {
        const active = this.active;
        if (!active) return;
        if (to === 'paused' && from === 'cinematic') {
          active.pausedByGame = true;
          this.pauseExternalProgression(active);
          this.publish();
        } else if (
          to === 'cinematic' &&
          from === 'paused' &&
          active.pausedByGame
        ) {
          active.pausedByGame = false;
          this.resumeExternalProgression(active);
          this.publish();
        } else if (to !== 'cinematic' && to !== 'paused') {
          this.finish('cancelled');
        }
      },
    );
  }

  public start(id: string): boolean {
    if (this.active) return false;
    const definition = this.catalog.get(id);
    if (!definition) return false;
    if (this.state.current !== 'playing' && this.state.current !== 'dialogue')
      return false;
    const failure = this.validateDependencies(definition);
    if (failure) {
      this.snapshot = {
        ...idleSnapshot(),
        lastResult: 'failed',
        lastFailure: failure,
        playbackSequence: this.playbackSequence,
      };
      this.events.emit('changed', this.snapshot);
      this.events.emit('completed', { cinematicId: id, result: 'failed' });
      return false;
    }
    const focus =
      typeof document !== 'undefined' &&
      typeof HTMLElement !== 'undefined' &&
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined;
    const active: ActiveCinematic = {
      definition,
      returnState: this.state.current,
      controlsWereEnabled: this.player.isControlEnabled(),
      pointerWasLocked: this.pointer.isPointerLocked(),
      focus,
      shotIndex: 0,
      shotElapsedSeconds: 0,
      pausedForSkip: false,
      pausedByGame: false,
      performanceTokens: new Map(),
      performanceHandles: new Map(),
      firedPerformanceCueIds: new Set(),
      landingCommitted: false,
    };
    try {
      for (const participantId of this.performanceParticipantIds(definition)) {
        active.performanceTokens.set(
          participantId,
          this.adapters.performances!.capturePerformanceState(participantId),
        );
      }
    } catch (error) {
      this.restorePerformances(active);
      this.publishStartFailure(
        id,
        `Performance capture failed: ${errorText(error)}`,
      );
      return false;
    }
    this.active = active;
    this.playbackSequence += 1;
    this.emittedEventIds.length = 0;
    this.player.setControlEnabled(false);
    this.pointer.releasePointerLock?.();
    this.state.transition('cinematic');
    this.emitDefinitionEvent(definition.entryEventId, definition.id);
    this.requestShot(active);
    if (!this.runDuePerformanceRequests(active)) return false;
    this.publish();
    return true;
  }

  public update(time: FrameTime): void {
    const active = this.active;
    if (!active) return;
    if (active.pausedByGame || this.state.current === 'paused') return;
    if (active.landingResult) {
      this.updateLanding(active);
      return;
    }
    if (!active.pausedForSkip && this.input.wasPressed('skipCinematic')) {
      this.requestSkip();
      return;
    }
    if (active.pausedForSkip) {
      if (this.input.wasPressed('confirmCinematicSkip')) this.confirmSkip();
      else if (this.input.wasPressed('cancelCinematicSkip')) this.cancelSkip();
      return;
    }
    for (const id of active.definition.participantIds) {
      if (!this.participants.hasParticipant(id)) {
        const reason = `Required participant "${id}" became unavailable`;
        if (
          active.definition.participantFailurePolicy ===
            'land-at-destination' &&
          active.definition.destination
        ) {
          this.beginLanding('failed', reason);
        } else this.fail(reason);
        return;
      }
    }
    active.shotElapsedSeconds += Math.max(0, time.delta);
    if (!this.runDuePerformanceRequests(active)) return;
    const shot = active.definition.shots[active.shotIndex]!;
    if (active.shotElapsedSeconds >= shot.durationSeconds) {
      if (active.shotIndex === active.definition.shots.length - 1) {
        if (active.definition.destination) this.beginLanding('completed');
        else this.finish('completed');
        return;
      }
      active.shotIndex += 1;
      active.shotElapsedSeconds = 0;
      this.requestShot(active);
      if (!this.runDuePerformanceRequests(active)) return;
    }
    this.publish();
  }

  public requestSkip(): boolean {
    if (!this.active || this.active.pausedForSkip) return false;
    this.active.pausedForSkip = true;
    this.pauseExternalProgression(this.active);
    this.publish();
    return true;
  }

  public confirmSkip(): boolean {
    if (!this.active?.pausedForSkip) return false;
    if (this.active.definition.destination) this.beginLanding('skipped');
    else this.finish('skipped');
    return true;
  }

  public cancelSkip(): boolean {
    if (!this.active?.pausedForSkip) return false;
    this.active.pausedForSkip = false;
    this.resumeExternalProgression(this.active);
    this.input.consumeTransientActions?.();
    if (this.active.focus?.isConnected) {
      this.active.focus.focus({ preventScroll: true });
    }
    this.publish();
    return true;
  }

  public cancel(): boolean {
    if (!this.active) return false;
    if (this.active.landingResult) return false;
    this.finish('cancelled');
    return true;
  }

  public getSnapshot(): CinematicSnapshot {
    return this.snapshot;
  }

  public dispose(): void {
    this.unsubscribeState?.();
    this.unsubscribeState = undefined;
    if (this.active) this.finish('cancelled', undefined, 'disposed');
    this.events.clear();
  }

  private requestShot(active: ActiveCinematic): void {
    active.camera?.release();
    this.releasePerformanceHandles(active, 'shot-completed');
    const shot = active.definition.shots[active.shotIndex]!;
    const anchor = this.level.getCinematicAnchor(shot.cameraAnchorId);
    active.camera = this.camera.requestCamera({
      owner: `cinematic:${active.definition.id}`,
      mode: 'cinematic',
      anchor: toCameraAnchor(anchor),
    });
  }

  private runDuePerformanceRequests(active: ActiveCinematic): boolean {
    const adapter = this.adapters.performances;
    if (!adapter) return true;
    const shot = active.definition.shots[active.shotIndex]!;
    for (const request of shot.performanceRequests ?? []) {
      if (
        request.atSeconds > active.shotElapsedSeconds ||
        active.firedPerformanceCueIds.has(request.cueId)
      ) {
        continue;
      }
      try {
        const preflight = adapter.preflightPerformance(request);
        if (!preflight.ready && request.required === false) {
          active.firedPerformanceCueIds.add(request.cueId);
          continue;
        }
        const handle = adapter.requestPerformance(request);
        active.performanceHandles.set(request.cueId, handle);
        active.firedPerformanceCueIds.add(request.cueId);
      } catch (error) {
        const reason = `Performance "${request.cueId}" failed: ${errorText(error)}`;
        if (
          active.definition.participantFailurePolicy ===
            'land-at-destination' &&
          active.definition.destination
        ) {
          this.beginLanding('failed', reason);
        } else this.fail(reason);
        return false;
      }
    }
    return true;
  }

  private beginLanding(
    result: Extract<
      CinematicCompletionResult,
      'completed' | 'skipped' | 'failed'
    >,
    failure?: string,
  ): void {
    const active = this.active;
    const request = active?.definition.destination;
    if (!active || !request || active.landingResult) return;
    active.pausedForSkip = false;
    active.landingResult = result;
    active.landingFailure = failure;
    active.camera?.release();
    active.camera = undefined;
    this.releasePerformanceHandles(active, 'landing');
    this.restorePerformances(active);
    try {
      active.destination =
        this.adapters.destination!.requestDestination(request);
    } catch (error) {
      this.finish('failed', `Destination request failed: ${errorText(error)}`);
      return;
    }
    this.publish();
    this.updateLanding(active);
  }

  private updateLanding(active: ActiveCinematic): void {
    if (!active.destination || !active.landingResult) return;
    const readiness = active.destination.getReadiness();
    if (readiness.state === 'pending') {
      this.publish();
      return;
    }
    if (readiness.state === 'failed') {
      this.finish('failed', readiness.reason);
      return;
    }
    const transaction = active.definition.landingTransaction!;
    if (!active.landingCommitted) {
      let commit;
      try {
        commit = this.adapters.landing!.commitLanding(transaction, {
          cinematicId: active.definition.id,
          result: active.landingResult,
        });
      } catch (error) {
        this.finish('failed', `Landing commit failed: ${errorText(error)}`);
        return;
      }
      if (!commit.committed) {
        this.finish(
          'failed',
          commit.reason ?? 'Landing transaction was rejected',
        );
        return;
      }
      active.landingCommitted = true;
    }
    this.finish(active.landingResult, active.landingFailure);
  }

  private finish(
    result: CinematicCompletionResult,
    failure?: string,
    releaseReason: CinematicPerformanceReleaseReason = result === 'cancelled'
      ? 'cancelled'
      : result === 'failed'
        ? 'failed'
        : 'landing',
  ): void {
    const active = this.active;
    if (!active) return;
    this.active = undefined;
    active.camera?.release();
    this.releasePerformanceHandles(active, releaseReason);
    this.restorePerformances(active);
    const finalDestinationReadiness = active.destination?.getReadiness().state;
    if (result === 'cancelled') active.destination?.cancel();
    active.destination?.dispose();
    this.player.setControlEnabled(active.controlsWereEnabled);
    this.input.consumeTransientActions?.();
    if (this.state.current === 'cinematic' || this.state.current === 'paused') {
      this.state.transition(active.returnState);
    }
    if (active.focus?.isConnected) active.focus.focus({ preventScroll: true });
    if (active.pointerWasLocked) this.pointer.requestPointerLock();
    this.emitDefinitionEvent(
      active.definition.completionEventId,
      active.definition.id,
    );
    this.snapshot = {
      ...idleSnapshot(),
      lastResult: result,
      lastFailure: failure,
      playbackSequence: this.playbackSequence,
      emittedEventIds: [...this.emittedEventIds],
      activePerformanceCueIds: [],
      landingResult: active.landingResult,
      destinationReadiness: finalDestinationReadiness,
      committedLandingTransactionId: active.landingCommitted
        ? active.definition.landingTransaction?.id
        : undefined,
    };
    this.events.emit('changed', this.snapshot);
    this.events.emit('completed', {
      cinematicId: active.definition.id,
      result,
    });
  }

  private fail(reason: string): void {
    this.finish('failed', reason);
  }

  private validateDependencies(
    definition: CinematicDefinition,
  ): string | undefined {
    if (this.level.activeLevel?.id !== definition.dependencies.levelId)
      return `Required level "${definition.dependencies.levelId}" is unavailable`;
    for (const id of definition.participantIds)
      if (!this.participants.hasParticipant(id))
        return `Required participant "${id}" is unavailable`;
    try {
      for (const id of definition.dependencies.cameraAnchorIds)
        this.level.getCinematicAnchor(id);
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    try {
      for (const shot of definition.shots) {
        for (const request of shot.performanceRequests ?? []) {
          const adapter = this.adapters.performances;
          if (!adapter)
            return `Performance adapter is unavailable for "${request.cueId}"`;
          const result = adapter.preflightPerformance(request);
          if (!result.ready && request.required !== false)
            return result.reason ?? `Missing performance "${request.cueId}"`;
          if (
            result.ready &&
            result.resolution === 'neutral-fallback' &&
            request.missingPerformancePolicy !== 'neutral-fallback'
          ) {
            return `Performance "${request.cueId}" rejected an unapproved neutral fallback`;
          }
        }
      }
      if (definition.destination) {
        if (!this.adapters.destination || !this.adapters.landing)
          return 'Destination cinematic adapters are unavailable';
        const destination = this.adapters.destination.preflightDestination(
          definition.destination,
        );
        if (!destination.ready) return destination.reason;
        const landing = this.adapters.landing.preflightLanding(
          definition.landingTransaction!,
        );
        if (!landing.ready) return landing.reason;
      }
    } catch (error) {
      return `Cinematic preflight failed: ${errorText(error)}`;
    }
    return undefined;
  }

  private publishStartFailure(id: string, failure: string): void {
    this.snapshot = {
      ...idleSnapshot(),
      lastResult: 'failed',
      lastFailure: failure,
      playbackSequence: this.playbackSequence,
    };
    this.events.emit('changed', this.snapshot);
    this.events.emit('completed', { cinematicId: id, result: 'failed' });
  }

  private performanceParticipantIds(
    definition: CinematicDefinition,
  ): readonly string[] {
    if (!this.adapters.performances) return [];
    return [
      ...new Set(
        definition.shots.flatMap((shot) =>
          (shot.performanceRequests ?? []).map(
            (request) => request.participantId,
          ),
        ),
      ),
    ];
  }

  private pauseExternalProgression(active: ActiveCinematic): void {
    for (const handle of active.performanceHandles.values()) handle.pause();
    active.destination?.pause();
  }

  private resumeExternalProgression(active: ActiveCinematic): void {
    for (const handle of active.performanceHandles.values()) handle.resume();
    active.destination?.resume();
  }

  private releasePerformanceHandles(
    active: ActiveCinematic,
    reason: CinematicPerformanceReleaseReason,
  ): void {
    for (const handle of active.performanceHandles.values())
      handle.release(reason);
    active.performanceHandles.clear();
  }

  private restorePerformances(active: ActiveCinematic): void {
    const adapter = this.adapters.performances;
    if (!adapter) return;
    const entries = [...active.performanceTokens.entries()].reverse();
    active.performanceTokens.clear();
    for (const [participantId, token] of entries) {
      try {
        adapter.restorePerformance(participantId, token);
      } catch {
        // Continue restoring remaining participants and global ownership.
      }
    }
  }

  private emitDefinitionEvent(id: string, cinematicId: string): void {
    this.emittedEventIds.push(id);
    this.events.emit('event', { id, cinematicId });
  }

  private publish(): void {
    const active = this.active;
    if (!active) return;
    const shot = active.definition.shots[active.shotIndex]!;
    const subtitleIndex = getCinematicSubtitleCues(shot).findIndex(
      (cue) =>
        active.shotElapsedSeconds >= cue.startSeconds &&
        active.shotElapsedSeconds <= cue.endSeconds,
    );
    const subtitle =
      subtitleIndex >= 0
        ? getCinematicSubtitleCues(shot)[subtitleIndex]
        : undefined;
    const readiness = active.destination?.getReadiness();
    this.snapshot = {
      state: active.landingResult
        ? 'landing'
        : active.pausedForSkip
          ? 'confirming-skip'
          : active.pausedByGame
            ? 'paused'
            : 'playing',
      cinematicId: active.definition.id,
      shotId: shot.id,
      shotIndex: active.shotIndex,
      shotElapsedSeconds: active.shotElapsedSeconds,
      subtitleVisible: Boolean(subtitle),
      subtitleCueId: subtitle
        ? (subtitle.id ?? `${shot.id}:subtitle:${subtitleIndex}`)
        : undefined,
      speakerId: subtitle?.speakerId,
      subtitleText: subtitle?.text ?? '',
      playbackSequence: this.playbackSequence,
      emittedEventIds: [...this.emittedEventIds],
      activePerformanceCueIds: [...active.performanceHandles.keys()],
      landingResult: active.landingResult,
      destinationReadiness: readiness?.state,
      committedLandingTransactionId: active.landingCommitted
        ? active.definition.landingTransaction?.id
        : undefined,
    };
    this.events.emit('changed', this.snapshot);
  }
}

function idleSnapshot(): CinematicSnapshot {
  return {
    state: 'idle',
    shotElapsedSeconds: 0,
    subtitleVisible: false,
    subtitleText: '',
    playbackSequence: 0,
    emittedEventIds: [],
    activePerformanceCueIds: [],
  };
}
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function toCameraAnchor(anchor: CinematicAnchorDefinition) {
  return {
    id: anchor.id,
    position: tuple(anchor.position),
    lookAt: tuple(anchor.lookAt),
    fieldOfView: anchor.fieldOfView,
  };
}
function tuple(value: readonly [number, number, number]): WorldPosition {
  return { x: value[0], y: value[1], z: value[2] };
}
