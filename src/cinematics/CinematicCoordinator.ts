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

export interface CinematicSnapshot {
  readonly state: 'idle' | 'playing' | 'paused' | 'confirming-skip';
  readonly cinematicId?: string;
  readonly shotId?: string;
  readonly shotIndex?: number;
  readonly shotElapsedSeconds: number;
  readonly subtitleVisible: boolean;
  readonly speakerId?: string;
  readonly subtitleText: string;
  readonly lastResult?: CinematicCompletionResult;
  readonly lastFailure?: string;
  readonly playbackSequence: number;
  readonly emittedEventIds: readonly string[];
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
  ) {}

  public init(): void {
    this.unsubscribeState = this.stateEvents.on(
      'game-state:changed',
      ({ from, to }) => {
        const active = this.active;
        if (!active) return;
        if (to === 'paused' && from === 'cinematic') {
          active.pausedByGame = true;
          this.publish();
        } else if (
          to === 'cinematic' &&
          from === 'paused' &&
          active.pausedByGame
        ) {
          active.pausedByGame = false;
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
    };
    this.active = active;
    this.playbackSequence += 1;
    this.player.setControlEnabled(false);
    this.pointer.releasePointerLock?.();
    this.state.transition('cinematic');
    this.emitDefinitionEvent(definition.entryEventId, definition.id);
    this.requestShot(active);
    this.publish();
    return true;
  }

  public update(time: FrameTime): void {
    const active = this.active;
    if (!active) return;
    if (active.pausedByGame || this.state.current === 'paused') return;
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
        this.fail(`Required participant "${id}" became unavailable`);
        return;
      }
    }
    active.shotElapsedSeconds += Math.max(0, time.delta);
    const shot = active.definition.shots[active.shotIndex]!;
    if (active.shotElapsedSeconds >= shot.durationSeconds) {
      if (active.shotIndex === active.definition.shots.length - 1) {
        this.finish('completed');
        return;
      }
      active.shotIndex += 1;
      active.shotElapsedSeconds = 0;
      this.requestShot(active);
    }
    this.publish();
  }

  public requestSkip(): boolean {
    if (!this.active || this.active.pausedForSkip) return false;
    this.active.pausedForSkip = true;
    this.publish();
    return true;
  }

  public confirmSkip(): boolean {
    if (!this.active?.pausedForSkip) return false;
    this.finish('skipped');
    return true;
  }

  public cancelSkip(): boolean {
    if (!this.active?.pausedForSkip) return false;
    this.active.pausedForSkip = false;
    this.input.consumeTransientActions?.();
    if (this.active.focus?.isConnected) {
      this.active.focus.focus({ preventScroll: true });
    }
    this.publish();
    return true;
  }

  public cancel(): boolean {
    if (!this.active) return false;
    this.finish('cancelled');
    return true;
  }

  public getSnapshot(): CinematicSnapshot {
    return this.snapshot;
  }

  public dispose(): void {
    this.unsubscribeState?.();
    this.unsubscribeState = undefined;
    if (this.active) this.finish('cancelled');
    this.events.clear();
  }

  private requestShot(active: ActiveCinematic): void {
    const shot = active.definition.shots[active.shotIndex]!;
    const anchor = this.level.getCinematicAnchor(shot.cameraAnchorId);
    active.camera = this.camera.requestCamera({
      owner: `cinematic:${active.definition.id}`,
      mode: 'cinematic',
      anchor: toCameraAnchor(anchor),
    });
  }

  private finish(result: CinematicCompletionResult, failure?: string): void {
    const active = this.active;
    if (!active) return;
    this.active = undefined;
    active.camera?.release();
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
    return undefined;
  }

  private emitDefinitionEvent(id: string, cinematicId: string): void {
    this.emittedEventIds.push(id);
    this.events.emit('event', { id, cinematicId });
  }

  private publish(): void {
    const active = this.active;
    if (!active) return;
    const shot = active.definition.shots[active.shotIndex]!;
    const subtitleVisible =
      active.shotElapsedSeconds >= shot.subtitle.startSeconds &&
      active.shotElapsedSeconds <= shot.subtitle.endSeconds;
    this.snapshot = {
      state: active.pausedForSkip
        ? 'confirming-skip'
        : active.pausedByGame
          ? 'paused'
          : 'playing',
      cinematicId: active.definition.id,
      shotId: shot.id,
      shotIndex: active.shotIndex,
      shotElapsedSeconds: active.shotElapsedSeconds,
      subtitleVisible,
      speakerId: subtitleVisible ? shot.subtitle.speakerId : undefined,
      subtitleText: subtitleVisible ? shot.subtitle.text : '',
      playbackSequence: this.playbackSequence,
      emittedEventIds: [...this.emittedEventIds],
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
  };
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
