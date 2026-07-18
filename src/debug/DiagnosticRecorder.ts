import type { ThirdPersonCameraSystem } from '../camera/ThirdPersonCameraSystem';
import type { CharacterPlayerVisual } from '../player/CharacterPlayerVisual';
import type { ConversationCoordinator } from '../conversations/ConversationCoordinator';
import type { DialogueSessionController } from '../dialogue/DialogueSessionController';
import type { GameStateMachine, StateEvents } from '../core/gameState';
import type { EventBus } from '../core/events';
import type { GameSystem } from '../core/lifecycle';
import type { FrameTime } from '../core/time';
import type { InteractionSystem } from '../interactions/InteractionSystem';
import type { PlayerControllerSystem } from '../player/PlayerControllerSystem';
import type { DebugRegistry, DebugUnregister } from './DebugRegistry';
import { debugSections } from './DebugRegistry';
import type { RuntimeErrorReporter } from './RuntimeErrorReporter';
import { FixedRingBuffer } from './FixedRingBuffer';
import {
  DIAGNOSTIC_TRACE_SCHEMA,
  DIAGNOSTIC_TRACE_VERSION,
  parseDiagnosticTrace,
  serializeDiagnosticTrace,
  summarizeDiagnosticTrace,
} from './DiagnosticTrace';
import type {
  DiagnosticFactValue,
  DiagnosticTrace,
  DiagnosticTraceEvent,
  DiagnosticTraceFrame,
  DiagnosticTraceSummary,
} from './DiagnosticTrace';

export interface DiagnosticRecorderConfig {
  readonly durationSeconds?: number;
  readonly sampleHz?: number;
  readonly eventCapacity?: number;
}

export interface DiagnosticRecorderDependencies {
  readonly debug: DebugRegistry;
  readonly state: GameStateMachine;
  readonly stateEvents: EventBus<StateEvents>;
  readonly player: PlayerControllerSystem;
  readonly character: CharacterPlayerVisual;
  readonly camera: ThirdPersonCameraSystem;
  readonly interactions: InteractionSystem;
  readonly conversations: ConversationCoordinator;
  readonly dialogue: DialogueSessionController;
  readonly errors: RuntimeErrorReporter;
}

type RecorderState = DiagnosticTrace['state'];

const DEFAULT_DURATION_SECONDS = 8;
const DEFAULT_SAMPLE_HZ = 30;
const MIN_DURATION_SECONDS = 1;
const MAX_DURATION_SECONDS = 30;

/** Opt-in, development-only recorder composed entirely from public snapshots. */
export class DiagnosticRecorder implements GameSystem {
  public readonly id = 'diagnostic-recorder';
  public readonly updateMode = 'always' as const;

  private durationSeconds: number;
  private readonly sampleHz: number;
  private readonly configuredEventCapacity: number | undefined;
  private frames: FixedRingBuffer<DiagnosticTraceFrame>;
  private events: FixedRingBuffer<DiagnosticTraceEvent>;
  private state: RecorderState = 'idle';
  private currentElapsed = 0;
  private startedAtElapsed = 0;
  private nextSampleAt = 0;
  private frameSequence = 0;
  private eventSequence = 0;
  private lastFrameSequence: number | null = null;
  private unregisterDebug: DebugUnregister[] = [];
  private unsubscribeEvents: (() => void)[] = [];
  private importedSummary: DiagnosticTraceSummary | undefined;

  public constructor(
    private readonly dependencies: DiagnosticRecorderDependencies,
    config: DiagnosticRecorderConfig = {},
    private readonly target: Window = window,
  ) {
    if (!import.meta.env.DEV) {
      throw new Error('Diagnostic recorder is development-only');
    }
    this.durationSeconds = validateDuration(
      config.durationSeconds ?? DEFAULT_DURATION_SECONDS,
    );
    this.sampleHz = validateSampleHz(config.sampleHz ?? DEFAULT_SAMPLE_HZ);
    this.configuredEventCapacity = config.eventCapacity;
    this.frames = new FixedRingBuffer(this.frameCapacity);
    this.events = new FixedRingBuffer(this.eventCapacity);
  }

  public init(): void {
    this.registerDebugSurface();
    this.subscribeToFacts();
  }

  public update(time: FrameTime): void {
    this.currentElapsed = time.elapsed;
    if (this.state !== 'recording') return;
    const timestamp = Math.max(0, time.elapsed - this.startedAtElapsed);
    if (timestamp + Number.EPSILON < this.nextSampleAt) return;
    this.captureFrame(time, timestamp);
    this.nextSampleAt = timestamp + 1 / this.sampleHz;
  }

  public start(durationSeconds = this.durationSeconds): void {
    const duration = validateDuration(durationSeconds);
    if (duration !== this.durationSeconds) {
      this.durationSeconds = duration;
      this.frames = new FixedRingBuffer(this.frameCapacity);
      this.events = new FixedRingBuffer(this.eventCapacity);
    } else {
      this.frames.clear();
      this.events.clear();
    }
    this.frameSequence = 0;
    this.eventSequence = 0;
    this.lastFrameSequence = null;
    this.startedAtElapsed = this.currentElapsed;
    this.nextSampleAt = 0;
    this.importedSummary = undefined;
    this.state = 'recording';
    this.recordEvent('recorder:started', { durationSeconds: duration });
  }

  public stop(): void {
    if (this.state !== 'recording') return;
    this.recordEvent('recorder:stopped', {});
    this.state = 'stopped';
  }

  public freeze(): void {
    if (this.state !== 'recording' && this.state !== 'stopped') return;
    if (this.state === 'recording') this.recordEvent('recorder:frozen', {});
    this.state = 'frozen';
  }

  public clear(): void {
    this.frames.clear();
    this.events.clear();
    this.frameSequence = 0;
    this.eventSequence = 0;
    this.lastFrameSequence = null;
    this.importedSummary = undefined;
    this.state = 'idle';
  }

  public exportTrace(): DiagnosticTrace {
    const frames = this.frames.toArray();
    const events = this.events.toArray();
    const lastTimestamp = Math.max(
      frames.at(-1)?.timestampMs ?? 0,
      events.at(-1)?.timestampMs ?? 0,
    );
    return {
      schema: DIAGNOSTIC_TRACE_SCHEMA,
      version: DIAGNOSTIC_TRACE_VERSION,
      config: {
        durationSeconds: this.durationSeconds,
        sampleHz: this.sampleHz,
        frameCapacity: this.frameCapacity,
        eventCapacity: this.eventCapacity,
      },
      state: this.state,
      durationMs: lastTimestamp,
      frames,
      events,
    };
  }

  public serialize(): string {
    return serializeDiagnosticTrace(this.exportTrace());
  }

  public readback(input: string): DiagnosticTraceSummary {
    const summary = summarizeDiagnosticTrace(parseDiagnosticTrace(input));
    this.importedSummary = summary;
    return summary;
  }

  public getStatus(): {
    readonly state: RecorderState;
    readonly frameCount: number;
    readonly eventCount: number;
    readonly frameCapacity: number;
    readonly eventCapacity: number;
    readonly importedSummary: DiagnosticTraceSummary | undefined;
  } {
    return {
      state: this.state,
      frameCount: this.frames.size,
      eventCount: this.events.size,
      frameCapacity: this.frameCapacity,
      eventCapacity: this.eventCapacity,
      importedSummary: this.importedSummary,
    };
  }

  public dispose(): void {
    for (const unsubscribe of this.unsubscribeEvents.splice(0)) unsubscribe();
    for (const unregister of this.unregisterDebug.splice(0)) unregister();
    this.clear();
  }

  private get frameCapacity(): number {
    return Math.ceil(this.durationSeconds * this.sampleHz);
  }

  private get eventCapacity(): number {
    const configured = this.configuredEventCapacity;
    if (configured !== undefined) {
      if (!Number.isInteger(configured) || configured <= 0) {
        throw new Error('Diagnostic event capacity must be a positive integer');
      }
      return configured;
    }
    return Math.max(128, Math.ceil(this.durationSeconds * 60));
  }

  private captureFrame(time: FrameTime, timestamp: number): void {
    const player = this.dependencies.player.getDebugSnapshot();
    const character = this.dependencies.character.getDebugSnapshot();
    const camera = this.dependencies.camera.getDebugSnapshot();
    const interaction = this.dependencies.interactions.getDebugSnapshot();
    const selectedTarget = interaction.targets.find(
      ({ id }) => id === interaction.selectedId,
    );
    const dialogue = this.dependencies.dialogue.getSnapshot();
    const conversation = this.dependencies.conversations.active;
    const sequence = this.frameSequence++;
    this.frames.push({
      sequence,
      sourceFrame: time.frame,
      timestampMs: toMilliseconds(timestamp),
      player: {
        position: this.dependencies.player.getPlayerPosition(),
        velocity: player.velocity,
        grounded: player.grounded,
        movementState: player.movementState,
        blocked: player.blocked,
        facingYaw: player.facingYaw,
        presentationFacingYaw: player.presentationFacingYaw,
        animation: {
          label: character.animationGraph.label,
          phase: character.animationGraph.phase,
          requestedClip: character.animationGraph.requestedClip,
          resolvedClip: character.animationGraph.resolvedClip,
          fallback: character.animationGraph.fallback,
          transitionSequence: character.animationGraph.transitionSequence,
          transitionReason: character.animationGraph.transitionReason,
        },
      },
      camera: {
        owner: camera.owner,
        mode: camera.mode,
        obstructed: camera.obstructed,
        actualDistance: camera.actualDistance,
        transitionProgress: camera.transitionProgress,
      },
      interaction: {
        selectedId: interaction.selectedId,
        challengerId: interaction.challengerId,
        selectionDecision: interaction.selectionDecision,
        selectedLineOfSight: selectedTarget?.lineOfSight,
        selectedBlockerId: selectedTarget?.blockerId,
        lineOfSightDecisions: interaction.targets
          .filter(
            ({ id, lineOfSight }) =>
              lineOfSight !== 'not-tested' ||
              id === interaction.selectedId ||
              id === interaction.challengerId,
          )
          .map(({ id, lineOfSight, blockerId, rejectionReason }) => ({
            targetId: id,
            result: lineOfSight,
            blockerId,
            rejectionReason,
          })),
      },
      state: {
        game: this.dependencies.state.current,
        conversationId: conversation?.definition.id,
        conversationNpcId: conversation?.npcId,
        dialogue: dialogue.state,
        dialogueLineId: dialogue.lineId,
        dialogueLineIndex: dialogue.lineIndex,
      },
    });
    this.lastFrameSequence = sequence;
  }

  private recordEvent(
    type: string,
    facts: Readonly<Record<string, DiagnosticFactValue>>,
  ): void {
    if (this.state !== 'recording') return;
    this.events.push({
      sequence: this.eventSequence++,
      timestampMs: toMilliseconds(this.currentElapsed - this.startedAtElapsed),
      frameSequence: this.lastFrameSequence,
      type,
      facts,
    });
  }

  private subscribeToFacts(): void {
    const {
      stateEvents,
      interactions,
      conversations,
      dialogue,
      player,
      errors,
    } = this.dependencies;
    this.unsubscribeEvents.push(
      stateEvents.on('game-state:changed', ({ from, to }) =>
        this.recordEvent('game-state:changed', { from, to }),
      ),
      interactions.events.on('interaction:target-changed', ({ target }) =>
        this.recordEvent('interaction:target-changed', {
          targetId: target?.id ?? null,
        }),
      ),
      interactions.events.on('interaction:started', ({ target }) =>
        this.recordEvent('interaction:started', { targetId: target.id }),
      ),
      interactions.events.on('interaction:completed', ({ target }) =>
        this.recordEvent('interaction:completed', { targetId: target.id }),
      ),
      interactions.events.on('interaction:cancelled', ({ target, reason }) =>
        this.recordEvent('interaction:cancelled', {
          targetId: target.id,
          reason,
        }),
      ),
      interactions.events.on('interaction:enabled', ({ target }) =>
        this.recordEvent('interaction:enabled', { targetId: target.id }),
      ),
      interactions.events.on('interaction:disabled', ({ target }) =>
        this.recordEvent('interaction:disabled', { targetId: target.id }),
      ),
      conversations.events.on('conversation:started', ({ session }) =>
        this.recordEvent('conversation:started', {
          conversationId: session.definition.id,
          npcId: session.npcId,
        }),
      ),
      conversations.events.on('conversation:ended', ({ session, reason }) =>
        this.recordEvent('conversation:ended', {
          conversationId: session.definition.id,
          npcId: session.npcId,
          reason,
        }),
      ),
      dialogue.events.on('dialogue:started', ({ conversation }) =>
        this.recordEvent('dialogue:started', {
          conversationId: conversation.id,
        }),
      ),
      dialogue.events.on('dialogue:line-changed', (event) =>
        this.recordEvent('dialogue:line-changed', {
          conversationId: event.conversationId,
          lineId: event.lineId,
          lineIndex: event.lineIndex,
          speakerId: event.speakerId,
        }),
      ),
      dialogue.events.on('dialogue:completed', ({ conversationId }) =>
        this.recordEvent('dialogue:completed', { conversationId }),
      ),
      dialogue.events.on('dialogue:cancelled', ({ conversationId, reason }) =>
        this.recordEvent('dialogue:cancelled', { conversationId, reason }),
      ),
      player.events.on('character-action:impact', (event) =>
        this.recordEvent('character-action:impact', {
          action: event.action,
          source: event.source ?? null,
          sequence: event.sequence,
          normalizedTime: event.normalizedTime,
        }),
      ),
      player.events.on('character-action:completed', (event) =>
        this.recordEvent('character-action:completed', {
          action: event.action,
          source: event.source ?? null,
          sequence: event.sequence,
        }),
      ),
      errors.events.on('runtime-error:reported', ({ scope, message }) =>
        this.recordEvent('runtime-error:reported', {
          scope: sanitizeErrorFact(scope),
          message: sanitizeErrorFact(message),
        }),
      ),
    );
  }

  private registerDebugSurface(): void {
    const debug = this.dependencies.debug;
    this.unregisterDebug.push(
      debug.registerValue({
        id: 'diagnostics.status',
        label: 'Diagnostic recorder',
        group: debugSections.runtime,
        read: () => this.state,
      }),
      debug.registerValue({
        id: 'diagnostics.capacity',
        label: 'Diagnostic frames / events',
        group: debugSections.runtime,
        read: () =>
          `${this.frames.size}/${this.frameCapacity} · ${this.events.size}/${this.eventCapacity}`,
      }),
      debug.registerValue({
        id: 'diagnostics.timeline',
        label: 'Diagnostic timeline',
        group: debugSections.runtime,
        read: () =>
          this.importedSummary?.timeline ??
          summarizeDiagnosticTrace(this.exportTrace()).timeline,
      }),
      debug.registerCommand({
        id: 'diagnostics.start',
        label: 'Start diagnostic recording',
        group: debugSections.runtime,
        argumentLabel: 'duration seconds (default 8)',
        run: (argument) =>
          this.start(
            argument === undefined ? this.durationSeconds : Number(argument),
          ),
      }),
      debug.registerCommand({
        id: 'diagnostics.stop',
        label: 'Stop diagnostic recording',
        group: debugSections.runtime,
        run: () => this.stop(),
      }),
      debug.registerCommand({
        id: 'diagnostics.freeze',
        label: 'Freeze diagnostic recording',
        group: debugSections.runtime,
        run: () => this.freeze(),
      }),
      debug.registerCommand({
        id: 'diagnostics.clear',
        label: 'Clear diagnostic recording',
        group: debugSections.runtime,
        run: () => this.clear(),
      }),
      debug.registerCommand({
        id: 'diagnostics.export',
        label: 'Export diagnostic JSON',
        group: debugSections.runtime,
        run: () => this.download(),
      }),
      debug.registerCommand({
        id: 'diagnostics.readback',
        label: 'Read back diagnostic JSON',
        group: debugSections.runtime,
        argumentLabel: 'paste exported JSON',
        run: (argument) => {
          if (!argument) throw new Error('Diagnostic JSON is required');
          this.readback(argument);
        },
      }),
    );
  }

  private download(): void {
    const serialized = this.serialize();
    const blob = new Blob([serialized], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = this.target.document.createElement('a');
    link.href = url;
    link.download = 'vanta-city-diagnostic-trace.json';
    link.hidden = true;
    this.target.document.body.append(link);
    try {
      link.click();
    } finally {
      link.remove();
      URL.revokeObjectURL(url);
    }
  }
}

function validateDuration(duration: number): number {
  if (
    !Number.isFinite(duration) ||
    duration < MIN_DURATION_SECONDS ||
    duration > MAX_DURATION_SECONDS
  ) {
    throw new Error(
      `Diagnostic duration must be between ${MIN_DURATION_SECONDS} and ${MAX_DURATION_SECONDS} seconds`,
    );
  }
  return duration;
}

function validateSampleHz(sampleHz: number): number {
  if (!Number.isFinite(sampleHz) || sampleHz <= 0 || sampleHz > 120) {
    throw new Error('Diagnostic sample rate must be between 0 and 120 Hz');
  }
  return sampleHz;
}

function toMilliseconds(seconds: number): number {
  return Math.max(0, Math.round(seconds * 1000));
}

function sanitizeErrorFact(value: string): string {
  return value
    .replace(/https?:\/\/\S+/giu, '[url]')
    .replace(/\/Users\/[^\s:]+/giu, '[path]')
    .slice(0, 240);
}
