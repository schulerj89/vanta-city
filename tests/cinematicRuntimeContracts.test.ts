import { EventBus } from '../src/core/events';
import { GameStateMachine, type StateEvents } from '../src/core/gameState';
import { CinematicCoordinator } from '../src/cinematics/CinematicCoordinator';
import {
  CinematicCatalog,
  type CinematicDefinition,
} from '../src/cinematics/CinematicDefinition';
import type {
  CinematicDestinationReadiness,
  CinematicRuntimeAdapters,
} from '../src/cinematics/CinematicRuntimeContracts';
import { cinematicDefinitions } from '../src/cinematics/cinematics';
import { testDistrict } from '../src/world/levels/testDistrict';

const destinationDefinition: CinematicDefinition = {
  ...cinematicDefinitions[0],
  id: 'cinematic.test.destination',
  entryEventId: 'cinematic.test.destination.entered',
  completionEventId: 'cinematic.test.destination.completed',
  restorationPolicy: 'authoritative-destination',
  participantFailurePolicy: 'land-at-destination',
  dependencies: {
    ...cinematicDefinitions[0].dependencies,
    levelId: 'test-district',
    locationId: 'landmark.north-approach',
    cameraAnchorIds: ['camera.ash-001.north-arrival'],
  },
  destination: {
    id: 'travel.test.destination',
    levelId: 'destination-level',
    locationId: 'destination-location',
    spawnId: 'destination-spawn',
    cameraAnchorId: 'destination-camera',
  },
  landingTransaction: {
    id: 'landing.test.destination',
    storyEffectIds: ['story.test.arrived'],
    missionHandoffIds: ['mission.test.handoff'],
  },
  shots: [
    {
      ...cinematicDefinitions[0].shots[0],
      id: 'shot.test.multi-cue',
      cameraAnchorId: 'camera.ash-001.north-arrival',
      participantIds: ['casual', 'mack'],
      durationSeconds: 3,
      subtitle: undefined,
      subtitleCues: [
        {
          id: 'subtitle.test.first',
          speakerId: 'mack',
          text: 'First cue.',
          startSeconds: 0.1,
          endSeconds: 1,
        },
        {
          id: 'subtitle.test.second',
          speakerId: 'rook',
          text: 'Second cue.',
          startSeconds: 1.2,
          endSeconds: 2.5,
        },
      ],
      performanceRequests: [
        {
          cueId: 'performance.test.hold',
          shotId: 'shot.test.multi-cue',
          atSeconds: 0,
          participantId: 'mack',
          intent: 'neutral-hold',
          phase: 'start',
          missingPerformancePolicy: 'block',
        },
        {
          cueId: 'performance.test.listen',
          shotId: 'shot.test.multi-cue',
          atSeconds: 1.1,
          participantId: 'mack',
          intent: 'listen',
          phase: 'start',
          targetParticipantId: 'casual',
          missingPerformancePolicy: 'block',
        },
      ],
    },
  ],
};

function harness(options?: {
  readiness?: CinematicDestinationReadiness;
  performanceBlocker?: string;
}) {
  const stateEvents = new EventBus<StateEvents>();
  const state = new GameStateMachine(stateEvents);
  state.transition('playing');
  let controls = true;
  let pointer = true;
  let mackAvailable = true;
  let readiness: CinematicDestinationReadiness = options?.readiness ?? {
    state: 'pending',
  };
  const requests: string[] = [];
  const pauses: string[] = [];
  const resumes: string[] = [];
  const releases: string[] = [];
  const restores: string[] = [];
  const cameraReleases: string[] = [];
  const destinationRequests: string[] = [];
  const destinationDisposals: string[] = [];
  const commits: string[] = [];
  const adapters: CinematicRuntimeAdapters = {
    performances: {
      preflightPerformance: () =>
        options?.performanceBlocker
          ? { ready: false, reason: options.performanceBlocker }
          : { ready: true, resolution: 'exact' },
      capturePerformanceState: (participantId) => `token:${participantId}`,
      requestPerformance: (request) => {
        requests.push(request.cueId);
        return {
          requestId: request.cueId,
          pause: () => pauses.push(request.cueId),
          resume: () => resumes.push(request.cueId),
          release: (reason) => releases.push(`${request.cueId}:${reason}`),
        };
      },
      restorePerformance: (participantId) => restores.push(participantId),
    },
    destination: {
      preflightDestination: () => ({ ready: true }),
      requestDestination: (request) => {
        destinationRequests.push(request.id);
        return {
          getReadiness: () => readiness,
          pause: () => undefined,
          resume: () => undefined,
          cancel: () => undefined,
          dispose: () => destinationDisposals.push(request.id),
        };
      },
    },
    landing: {
      preflightLanding: () => ({ ready: true }),
      commitLanding: (transaction, context) => {
        commits.push(`${transaction.id}:${context.result}`);
        return { committed: true };
      },
    },
  };
  const coordinator = new CinematicCoordinator(
    new CinematicCatalog([destinationDefinition]),
    state,
    stateEvents,
    {
      isDown: () => false,
      wasPressed: () => false,
      wasReleased: () => false,
      consumeTransientActions: () => undefined,
    },
    {
      consumePointerDelta: () => ({ x: 0, y: 0, wheel: 0 }),
      isPointerLocked: () => pointer,
      requestPointerLock: () => {
        pointer = true;
      },
      releasePointerLock: () => {
        pointer = false;
      },
      isUiFocused: () => false,
    },
    {
      requestCamera: (request) => ({
        owner: request.owner,
        active: true,
        release: () => cameraReleases.push(request.owner),
        cancel: () => undefined,
      }),
    },
    {
      activeLevel: testDistrict.definition,
      getCinematicAnchor: (id) =>
        testDistrict.definition.cinematicAnchors.find(
          (anchor) => anchor.id === id,
        )!,
    },
    {
      hasParticipant: (id) => id === 'casual' || mackAvailable,
    },
    {
      isControlEnabled: () => controls,
      setControlEnabled: (value) => {
        controls = value;
      },
    },
    adapters,
  );
  coordinator.init();
  return {
    coordinator,
    state,
    requests,
    pauses,
    resumes,
    releases,
    restores,
    cameraReleases,
    destinationRequests,
    destinationDisposals,
    commits,
    controls: () => controls,
    pointer: () => pointer,
    setReadiness: (value: CinematicDestinationReadiness) => {
      readiness = value;
    },
    removeMack: () => {
      mackAvailable = false;
    },
    update: (delta: number) =>
      coordinator.update({ delta, elapsed: delta, frame: 1 }),
  };
}

describe('CINEMATIC-003 runtime contracts', () => {
  it('schedules multiple subtitles and performance intents deterministically across skip pause', () => {
    const h = harness();
    expect(h.coordinator.start(destinationDefinition.id)).toBe(true);
    expect(h.requests).toEqual(['performance.test.hold']);
    h.update(0.2);
    expect(h.coordinator.getSnapshot()).toMatchObject({
      subtitleCueId: 'subtitle.test.first',
      subtitleText: 'First cue.',
    });
    h.coordinator.requestSkip();
    h.update(5);
    expect(h.pauses).toEqual(['performance.test.hold']);
    expect(h.coordinator.getSnapshot().shotElapsedSeconds).toBe(0.2);
    h.coordinator.cancelSkip();
    expect(h.resumes).toEqual(['performance.test.hold']);
    h.update(1);
    expect(h.requests).toEqual([
      'performance.test.hold',
      'performance.test.listen',
    ]);
    expect(h.coordinator.getSnapshot()).toMatchObject({
      subtitleCueId: 'subtitle.test.second',
      subtitleText: 'Second cue.',
    });
  });

  it.each(['completed', 'skipped', 'failed'] as const)(
    'commits the same landing transaction exactly once for %s landing',
    (result) => {
      const h = harness();
      h.coordinator.start(destinationDefinition.id);
      if (result === 'completed') h.update(3.1);
      if (result === 'skipped') {
        h.coordinator.requestSkip();
        h.coordinator.confirmSkip();
      }
      if (result === 'failed') {
        h.removeMack();
        h.update(0.1);
      }
      expect(h.coordinator.getSnapshot()).toMatchObject({
        state: 'landing',
        landingResult: result,
        destinationReadiness: 'pending',
      });
      expect(h.destinationRequests).toEqual(['travel.test.destination']);
      expect(h.commits).toEqual([]);
      h.setReadiness({ state: 'ready' });
      h.update(0);
      h.update(0);
      expect(h.commits).toEqual([`landing.test.destination:${result}`]);
      expect(h.coordinator.getSnapshot()).toMatchObject({
        state: 'idle',
        lastResult: result,
        committedLandingTransactionId: 'landing.test.destination',
      });
      expect(h.controls()).toBe(true);
      expect(h.pointer()).toBe(true);
      expect(h.state.current).toBe('playing');
      expect(h.destinationDisposals).toEqual(['travel.test.destination']);
    },
  );

  it('never enters or commits landing when skip confirmation is cancelled', () => {
    const h = harness();
    h.coordinator.start(destinationDefinition.id);
    h.coordinator.requestSkip();
    h.coordinator.cancelSkip();
    expect(h.destinationRequests).toEqual([]);
    expect(h.commits).toEqual([]);
    expect(h.coordinator.getSnapshot()).toMatchObject({ state: 'playing' });
  });

  it('preflights blockers before camera, control, or participant state changes', () => {
    const h = harness({ performanceBlocker: 'missing-performance:listen' });
    expect(h.coordinator.start(destinationDefinition.id)).toBe(false);
    expect(h.coordinator.getSnapshot()).toMatchObject({
      state: 'idle',
      lastResult: 'failed',
      lastFailure: 'missing-performance:listen',
    });
    expect(h.cameraReleases).toEqual([]);
    expect(h.requests).toEqual([]);
    expect(h.restores).toEqual([]);
    expect(h.controls()).toBe(true);
    expect(h.pointer()).toBe(true);
    expect(h.state.current).toBe('playing');
  });

  it('does not commit when readiness fails and disposes every request on repeated runs', () => {
    const h = harness({
      readiness: { state: 'failed', reason: 'load-failed' },
    });
    for (let index = 0; index < 3; index += 1) {
      expect(h.coordinator.start(destinationDefinition.id)).toBe(true);
      h.update(3.1);
      expect(h.coordinator.getSnapshot()).toMatchObject({
        state: 'idle',
        lastResult: 'failed',
        lastFailure: 'load-failed',
      });
    }
    expect(h.commits).toEqual([]);
    expect(h.destinationDisposals).toHaveLength(3);
    expect(h.restores).toEqual(['mack', 'mack', 'mack']);
    expect(h.releases).toHaveLength(6);
    h.coordinator.dispose();
    expect(h.controls()).toBe(true);
    expect(h.pointer()).toBe(true);
  });

  it('disposal releases active performance and camera ownership without starting travel', () => {
    const h = harness();
    h.coordinator.start(destinationDefinition.id);
    h.update(0.2);
    h.coordinator.dispose();
    expect(h.releases).toEqual(['performance.test.hold:disposed']);
    expect(h.restores).toEqual(['mack']);
    expect(h.cameraReleases).toHaveLength(1);
    expect(h.destinationRequests).toEqual([]);
    expect(h.commits).toEqual([]);
    expect(h.state.current).toBe('playing');
    expect(h.controls()).toBe(true);
    expect(h.pointer()).toBe(true);
  });
});
