import { EventBus } from '../src/core/events';
import type { StateEvents } from '../src/core/gameState';
import { GameStateMachine } from '../src/core/gameState';
import { DebugRegistry } from '../src/debug/DebugRegistry';
import { DiagnosticRecorder } from '../src/debug/DiagnosticRecorder';
import type { DiagnosticRecorderDependencies } from '../src/debug/DiagnosticRecorder';
import {
  parseDiagnosticTrace,
  serializeDiagnosticTrace,
  summarizeDiagnosticTrace,
} from '../src/debug/DiagnosticTrace';
import { FixedRingBuffer } from '../src/debug/FixedRingBuffer';
import type { DialogueEvents } from '../src/dialogue/DialogueEvents';
import type { InteractionEvents } from '../src/interactions/Interactable';
import type { PlayerActionEvents } from '../src/player/PlayerControllerSystem';
import type { RuntimeErrorEvents } from '../src/debug/RuntimeErrorReporter';
import { RuntimeErrorReporter } from '../src/debug/RuntimeErrorReporter';

describe('FixedRingBuffer', () => {
  it('retains insertion order at a deterministic fixed capacity', () => {
    const ring = new FixedRingBuffer<number>(3);
    ring.push(1);
    ring.push(2);
    ring.push(3);
    ring.push(4);

    expect(ring.size).toBe(3);
    expect(ring.toArray()).toEqual([2, 3, 4]);
    ring.clear();
    expect(ring.toArray()).toEqual([]);
  });

  it('rejects invalid capacities', () => {
    expect(() => new FixedRingBuffer(0)).toThrow('positive integer');
    expect(() => new FixedRingBuffer(1.5)).toThrow('positive integer');
  });
});

describe('DiagnosticRecorder', () => {
  it('bounds frames and correlates sanitized transition facts', () => {
    const fixture = recorderFixture({
      durationSeconds: 1,
      sampleHz: 2,
      eventCapacity: 16,
    });
    fixture.recorder.update({ delta: 0, elapsed: 10, frame: 99 });
    fixture.recorder.start();
    fixture.recorder.update({ delta: 0, elapsed: 10, frame: 100 });
    fixture.interactionEvents.emit('interaction:started', {
      target: { id: 'interaction.npc.mack', prompt: 'not recorded' },
    });
    fixture.errorEvents.emit('runtime-error:reported', {
      scope: '/Users/alice/project/file.ts',
      message: 'failed at https://secret.example/path',
    });
    fixture.recorder.update({ delta: 0.5, elapsed: 10.5, frame: 101 });
    fixture.recorder.update({ delta: 0.5, elapsed: 11, frame: 102 });
    fixture.recorder.freeze();

    const trace = fixture.recorder.exportTrace();
    expect(trace.config).toEqual({
      durationSeconds: 1,
      sampleHz: 2,
      frameCapacity: 2,
      eventCapacity: 16,
    });
    expect(
      trace.frames.map(({ sequence, sourceFrame, timestampMs }) => ({
        sequence,
        sourceFrame,
        timestampMs,
      })),
    ).toEqual([
      { sequence: 1, sourceFrame: 101, timestampMs: 500 },
      { sequence: 2, sourceFrame: 102, timestampMs: 1000 },
    ]);
    expect(trace.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'interaction:started',
          frameSequence: 0,
          facts: { targetId: 'interaction.npc.mack' },
        }),
        expect.objectContaining({
          type: 'runtime-error:reported',
          facts: { scope: '[path]', message: 'failed at [url]' },
        }),
      ]),
    );
    expect(JSON.stringify(trace)).not.toContain('not recorded');
  });

  it('exports deterministic versioned JSON and reads it back', () => {
    const { recorder } = recorderFixture();
    recorder.start();
    recorder.update({ delta: 0, elapsed: 2, frame: 7 });
    recorder.stop();

    const first = recorder.serialize();
    const second = recorder.serialize();
    expect(second).toBe(first);
    const parsed = parseDiagnosticTrace(first);
    expect(parsed).toEqual(recorder.exportTrace());
    expect(summarizeDiagnosticTrace(parsed)).toMatchObject({
      frameCount: 1,
      eventCount: 2,
      firstGameState: 'playing',
      lastGameState: 'playing',
    });
    expect(recorder.readback(first)).toEqual(summarizeDiagnosticTrace(parsed));
  });

  it('unregisters every command, value, and event listener on disposal', () => {
    const fixture = recorderFixture();
    expect(fixture.debug.listCommands().map(({ id }) => id)).toContain(
      'diagnostics.start',
    );
    fixture.recorder.start();
    fixture.recorder.dispose();
    fixture.interactionEvents.emit('interaction:completed', {
      target: { id: 'after-dispose', prompt: 'ignored' },
    });

    expect(fixture.debug.listCommands()).toEqual([]);
    expect(fixture.debug.readValues()).toEqual([]);
    expect(fixture.recorder.getStatus()).toMatchObject({
      state: 'idle',
      frameCount: 0,
      eventCount: 0,
    });
  });
});

describe('DiagnosticTrace parser', () => {
  it('rejects unknown schemas and versions', () => {
    expect(() => parseDiagnosticTrace('{}')).toThrow('Unsupported');
    const fixture = recorderFixture();
    const trace = fixture.recorder.exportTrace();
    expect(() =>
      parseDiagnosticTrace(
        serializeDiagnosticTrace({ ...trace, version: 2 as never }),
      ),
    ).toThrow('version');
    expect(() =>
      parseDiagnosticTrace(
        serializeDiagnosticTrace({
          ...trace,
          frames: [{ sequence: 0 } as never],
        }),
      ),
    ).toThrow('invalid frame');
  });
});

describe('RuntimeErrorReporter diagnostic facts', () => {
  it('publishes a public recorder input and clears it on disposal', () => {
    const debug = new DebugRegistry();
    const reporter = new RuntimeErrorReporter(debug);
    const listener = vi.fn();
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    reporter.events.on('runtime-error:reported', listener);
    reporter.init();

    reporter.report('camera update', new Error('camera failed'));
    expect(listener).toHaveBeenCalledWith({
      scope: 'camera update',
      message: 'camera failed',
    });
    reporter.dispose();
    reporter.events.emit('runtime-error:reported', {
      scope: 'after',
      message: 'dispose',
    });
    expect(listener).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
});

function recorderFixture(
  config: ConstructorParameters<typeof DiagnosticRecorder>[1] = {
    durationSeconds: 2,
    sampleHz: 2,
    eventCapacity: 16,
  },
) {
  const debug = new DebugRegistry();
  const stateEvents = new EventBus<StateEvents>();
  const state = new GameStateMachine(stateEvents);
  state.transition('playing');
  const interactionEvents = new EventBus<InteractionEvents>();
  const conversationEvents = new EventBus<{
    'conversation:started': {
      session: { npcId: string; definition: { id: string } };
    };
    'conversation:ended': {
      session: { npcId: string; definition: { id: string } };
      reason: 'completed' | 'cancelled';
    };
  }>();
  const dialogueEvents = new EventBus<DialogueEvents>();
  const playerEvents = new EventBus<PlayerActionEvents>();
  const errorEvents = new EventBus<RuntimeErrorEvents>();
  const dependencies = {
    debug,
    state,
    stateEvents,
    player: {
      events: playerEvents,
      getPlayerPosition: () => ({ x: 1, y: 2, z: 3 }),
      getDebugSnapshot: () => ({
        velocity: { x: 0, y: 0, z: 1 },
        grounded: true,
        movementState: 'walking',
        blocked: false,
        facingYaw: 1,
        presentationFacingYaw: 1,
      }),
    },
    character: {
      getDebugSnapshot: () => ({
        animationGraph: {
          label: 'walk',
          phase: 'locomotion',
          requestedClip: 'walk',
          resolvedClip: 'walk',
          fallback: 'none',
          transitionSequence: 2,
          transitionReason: 'movement',
        },
      }),
    },
    camera: {
      getDebugSnapshot: () => ({
        owner: 'gameplay',
        mode: 'gameplay',
        obstructed: false,
        actualDistance: 4,
        transitionProgress: 1,
      }),
    },
    interactions: {
      events: interactionEvents,
      getDebugSnapshot: () => ({
        targets: [],
        selectedId: undefined,
        challengerId: undefined,
        selectionDecision: 'none',
      }),
    },
    conversations: { events: conversationEvents, active: undefined },
    dialogue: {
      events: dialogueEvents,
      getSnapshot: () => ({ state: 'idle' }),
    },
    errors: { events: errorEvents },
  } as unknown as DiagnosticRecorderDependencies;
  const recorder = new DiagnosticRecorder(dependencies, config);
  recorder.init();
  return {
    recorder,
    debug,
    interactionEvents,
    dialogueEvents,
    playerEvents,
    errorEvents,
  };
}
