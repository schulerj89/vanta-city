export const DIAGNOSTIC_TRACE_SCHEMA = 'vanta-city.diagnostic-trace' as const;
export const DIAGNOSTIC_TRACE_VERSION = 1 as const;

export interface DiagnosticTraceFrame {
  readonly sequence: number;
  readonly sourceFrame: number;
  readonly timestampMs: number;
  readonly player: {
    readonly position: {
      readonly x: number;
      readonly y: number;
      readonly z: number;
    };
    readonly velocity: {
      readonly x: number;
      readonly y: number;
      readonly z: number;
    };
    readonly grounded: boolean;
    readonly movementState: string;
    readonly blocked: boolean;
    readonly facingYaw: number;
    readonly presentationFacingYaw: number;
    readonly animation: {
      readonly label: string;
      readonly phase: string;
      readonly requestedClip: string;
      readonly resolvedClip: string | undefined;
      readonly fallback: string;
      readonly transitionSequence: number;
      readonly transitionReason: string;
    };
  };
  readonly camera: {
    readonly owner: string;
    readonly mode: string;
    readonly obstructed: boolean;
    readonly actualDistance: number;
    readonly transitionProgress: number;
  };
  readonly interaction: {
    readonly selectedId: string | undefined;
    readonly challengerId: string | undefined;
    readonly selectionDecision: string;
    readonly selectedLineOfSight: string | undefined;
    readonly selectedBlockerId: string | undefined;
    readonly lineOfSightDecisions: readonly {
      readonly targetId: string;
      readonly result: string;
      readonly blockerId: string | undefined;
      readonly rejectionReason: string | undefined;
    }[];
  };
  readonly state: {
    readonly game: string;
    readonly conversationId: string | undefined;
    readonly conversationNpcId: string | undefined;
    readonly dialogue: string;
    readonly dialogueLineId: string | undefined;
    readonly dialogueLineIndex: number | undefined;
  };
}

export type DiagnosticFactValue = string | number | boolean | null;

export interface DiagnosticTraceEvent {
  readonly sequence: number;
  readonly timestampMs: number;
  readonly frameSequence: number | null;
  readonly type: string;
  readonly facts: Readonly<Record<string, DiagnosticFactValue>>;
}

export interface DiagnosticTrace {
  readonly schema: typeof DIAGNOSTIC_TRACE_SCHEMA;
  readonly version: typeof DIAGNOSTIC_TRACE_VERSION;
  readonly config: {
    readonly durationSeconds: number;
    readonly sampleHz: number;
    readonly frameCapacity: number;
    readonly eventCapacity: number;
  };
  readonly state: 'idle' | 'recording' | 'stopped' | 'frozen';
  readonly durationMs: number;
  readonly frames: readonly DiagnosticTraceFrame[];
  readonly events: readonly DiagnosticTraceEvent[];
}

export interface DiagnosticTraceSummary {
  readonly frameCount: number;
  readonly eventCount: number;
  readonly durationMs: number;
  readonly firstGameState: string | undefined;
  readonly lastGameState: string | undefined;
  readonly eventTypes: readonly string[];
  readonly timeline: string;
}

export function serializeDiagnosticTrace(trace: DiagnosticTrace): string {
  return JSON.stringify(trace, undefined, 2);
}

export function parseDiagnosticTrace(input: string): DiagnosticTrace {
  const value: unknown = JSON.parse(input);
  if (!isRecord(value)) throw new Error('Diagnostic trace must be an object');
  if (value.schema !== DIAGNOSTIC_TRACE_SCHEMA) {
    throw new Error(
      `Unsupported diagnostic trace schema: ${String(value.schema)}`,
    );
  }
  if (value.version !== DIAGNOSTIC_TRACE_VERSION) {
    throw new Error(
      `Unsupported diagnostic trace version: ${String(value.version)}`,
    );
  }
  if (
    !isRecord(value.config) ||
    !Array.isArray(value.frames) ||
    !Array.isArray(value.events)
  ) {
    throw new Error('Diagnostic trace is missing config, frames, or events');
  }
  if (
    !['idle', 'recording', 'stopped', 'frozen'].includes(String(value.state)) ||
    !isFiniteNumber(value.durationMs) ||
    !isFiniteNumber(value.config.durationSeconds) ||
    !isFiniteNumber(value.config.sampleHz) ||
    !isFiniteNumber(value.config.frameCapacity) ||
    !isFiniteNumber(value.config.eventCapacity) ||
    value.frames.length > value.config.frameCapacity ||
    value.events.length > value.config.eventCapacity
  ) {
    throw new Error(
      'Diagnostic trace has invalid state, duration, or capacity',
    );
  }
  for (const frame of value.frames) {
    if (
      !isRecord(frame) ||
      !isFiniteNumber(frame.sequence) ||
      !isFiniteNumber(frame.sourceFrame) ||
      !isFiniteNumber(frame.timestampMs) ||
      !isRecord(frame.player) ||
      !isRecord(frame.camera) ||
      !isRecord(frame.interaction) ||
      !isRecord(frame.state) ||
      typeof frame.state.game !== 'string'
    ) {
      throw new Error('Diagnostic trace contains an invalid frame');
    }
  }
  for (const event of value.events) {
    if (
      !isRecord(event) ||
      typeof event.type !== 'string' ||
      !isFiniteNumber(event.sequence) ||
      !isFiniteNumber(event.timestampMs) ||
      (event.frameSequence !== null && !isFiniteNumber(event.frameSequence)) ||
      !isRecord(event.facts) ||
      !Object.values(event.facts).every(isFactValue)
    ) {
      throw new Error('Diagnostic trace contains an invalid event');
    }
  }
  return value as unknown as DiagnosticTrace;
}

export function summarizeDiagnosticTrace(
  trace: DiagnosticTrace,
): DiagnosticTraceSummary {
  const first = trace.frames[0];
  const last = trace.frames.at(-1);
  const eventTypes = [...new Set(trace.events.map(({ type }) => type))].sort();
  const timeline = trace.events
    .slice(-8)
    .map(({ timestampMs, type }) => `${timestampMs}ms ${type}`)
    .join(' · ');
  return {
    frameCount: trace.frames.length,
    eventCount: trace.events.length,
    durationMs: trace.durationMs,
    firstGameState: first?.state.game,
    lastGameState: last?.state.game,
    eventTypes,
    timeline: timeline || 'no events',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isFactValue(value: unknown): value is DiagnosticFactValue {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    isFiniteNumber(value)
  );
}
