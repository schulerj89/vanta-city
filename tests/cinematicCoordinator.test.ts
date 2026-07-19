import { EventBus } from '../src/core/events';
import { GameStateMachine, type StateEvents } from '../src/core/gameState';
import { CinematicCatalog } from '../src/cinematics/CinematicDefinition';
import type { CinematicDefinition } from '../src/cinematics/CinematicDefinition';
import { CinematicCoordinator } from '../src/cinematics/CinematicCoordinator';
import { testDistrict } from '../src/world/levels/testDistrict';

const localDefinition: CinematicDefinition = {
  id: 'cinematic.test.local',
  storyBeatId: 'story.test.local',
  missionId: 'mission.test.local',
  participantIds: ['casual', 'mack'],
  speakerIds: ['rook', 'mack'],
  entryEventId: 'cinematic.test.local.entered',
  completionEventId: 'cinematic.test.local.completed',
  skipPolicy: 'confirm',
  dependencies: {
    levelId: 'test-district',
    locationId: 'landmark.north-approach',
    cameraAnchorIds: [
      'camera.ash-001.north-arrival',
      'camera.ash-001.junction-watch',
      'camera.ash-001.mack-position',
    ],
    assetIds: [],
    animationIds: [],
    worldFactIds: [],
  },
  restorationPolicy: 'exact-prior-gameplay',
  shots: [
    ['shot.test.arrival', 'camera.ash-001.north-arrival', 3.4],
    ['shot.test.junction', 'camera.ash-001.junction-watch', 3.2],
    ['shot.test.mack', 'camera.ash-001.mack-position', 3.5],
  ].map(([id, cameraAnchorId, durationSeconds]) => ({
    id: id as string,
    purpose: 'Exercise generic ordered cinematic ownership.',
    cameraAnchorId: cameraAnchorId as string,
    durationSeconds: durationSeconds as number,
    transition: 'ease' as const,
    transitionSeconds: 0.3,
    obstructionPolicy: 'shared-camera-collision' as const,
    participantIds: ['casual', 'mack'],
    safeFrame: { minSubjectMarginPercent: 8 },
  })),
};

function harness() {
  const events = new EventBus<StateEvents>();
  const state = new GameStateMachine(events);
  state.transition('playing');
  const pressed = new Set<string>();
  let controls = true;
  let pointerLocked = true;
  let mackAvailable = true;
  let activeCameraOwner: string | undefined;
  const releases: string[] = [];
  const cameraTransitions: Array<number | undefined> = [];
  const coordinator = new CinematicCoordinator(
    new CinematicCatalog([localDefinition]),
    state,
    events,
    {
      isDown: () => false,
      wasPressed: (action) => pressed.has(action),
      wasReleased: () => false,
      consumeTransientActions: () => pressed.clear(),
    },
    {
      consumePointerDelta: () => ({ x: 0, y: 0, wheel: 0 }),
      isPointerLocked: () => pointerLocked,
      requestPointerLock: () => {
        pointerLocked = true;
      },
      releasePointerLock: () => {
        pointerLocked = false;
      },
      isUiFocused: () => false,
    },
    {
      requestCamera: (request) => {
        cameraTransitions.push(request.transitionDurationSeconds);
        activeCameraOwner = request.owner;
        const owner = request.owner;
        return {
          owner,
          get active() {
            return activeCameraOwner === owner;
          },
          release: () => {
            releases.push(owner);
            if (activeCameraOwner === owner) activeCameraOwner = undefined;
          },
          cancel: () => {
            if (activeCameraOwner === owner) activeCameraOwner = undefined;
          },
        };
      },
    },
    {
      activeLevel: testDistrict.definition,
      getCinematicAnchor: (id) => {
        const anchor = testDistrict.definition.cinematicAnchors.find(
          (candidate) => candidate.id === id,
        );
        if (!anchor) throw new Error(`Missing anchor "${id}"`);
        return anchor;
      },
    },
    {
      hasParticipant: (id) =>
        id === 'casual' || (id === 'mack' && mackAvailable),
    },
    {
      isControlEnabled: () => controls,
      setControlEnabled: (enabled) => {
        controls = enabled;
      },
    },
  );
  coordinator.init();
  const update = (delta: number) => {
    coordinator.update({ delta, elapsed: delta, frame: 1 });
    pressed.clear();
  };
  return {
    coordinator,
    state,
    update,
    controls: () => controls,
    activeCameraOwner: () => activeCameraOwner,
    pointerLocked: () => pointerLocked,
    releases,
    cameraTransitions,
    removeMack: () => {
      mackAvailable = false;
    },
  };
}

describe('CinematicCoordinator', () => {
  it('validates and completes ordered shots through one camera owner', () => {
    const h = harness();
    expect(h.coordinator.start(localDefinition.id)).toBe(true);
    expect(h.state.current).toBe('cinematic');
    expect(h.controls()).toBe(false);
    expect(h.coordinator.getSnapshot()).toMatchObject({
      shotId: 'shot.test.arrival',
      playbackSequence: 1,
    });

    h.update(3.5);
    expect(h.coordinator.getSnapshot().shotId).toBe('shot.test.junction');
    h.update(3.3);
    expect(h.coordinator.getSnapshot().shotId).toBe('shot.test.mack');
    h.update(3.6);

    expect(h.coordinator.getSnapshot()).toMatchObject({
      state: 'idle',
      lastResult: 'completed',
      emittedEventIds: [
        'cinematic.test.local.entered',
        'cinematic.test.local.completed',
      ],
    });
    expect(h.state.current).toBe('playing');
    expect(h.controls()).toBe(true);
    expect(h.activeCameraOwner()).toBeUndefined();
    expect(h.pointerLocked()).toBe(true);
    expect(h.cameraTransitions).toEqual([0.3, 0.3, 0.3]);
  });

  it('restores through cancellation and disposal without a second completion boundary', () => {
    const h = harness();
    expect(h.coordinator.start(localDefinition.id)).toBe(true);
    expect(h.coordinator.cancel()).toBe(true);
    expect(h.coordinator.getSnapshot().lastResult).toBe('cancelled');
    expect(h.state.current).toBe('playing');
    expect(h.controls()).toBe(true);
    expect(h.pointerLocked()).toBe(true);

    expect(h.coordinator.start(localDefinition.id)).toBe(true);
    h.coordinator.dispose();
    expect(h.state.current).toBe('playing');
    expect(h.controls()).toBe(true);
    expect(h.activeCameraOwner()).toBeUndefined();
  });

  it('pauses for skip confirmation and cancel resumes the exact shot clock', () => {
    const h = harness();
    h.coordinator.start(localDefinition.id);
    h.update(1.25);
    h.coordinator.requestSkip();
    const before = h.coordinator.getSnapshot();
    h.update(2);
    expect(h.coordinator.getSnapshot()).toMatchObject({
      state: 'confirming-skip',
      shotId: before.shotId,
      shotElapsedSeconds: before.shotElapsedSeconds,
    });
    expect(h.coordinator.cancelSkip()).toBe(true);
    h.update(0.5);
    expect(h.coordinator.getSnapshot().shotElapsedSeconds).toBeCloseTo(1.75);
    expect(h.coordinator.getSnapshot().emittedEventIds).toHaveLength(1);
  });

  it('uses normal cleanup for confirmed skip, failure, and repeated playback', () => {
    const h = harness();
    h.coordinator.start(localDefinition.id);
    h.coordinator.requestSkip();
    expect(h.coordinator.confirmSkip()).toBe(true);
    expect(h.coordinator.getSnapshot().lastResult).toBe('skipped');
    expect(h.controls()).toBe(true);

    expect(h.coordinator.start(localDefinition.id)).toBe(true);
    h.removeMack();
    h.update(0.1);
    expect(h.coordinator.getSnapshot()).toMatchObject({
      lastResult: 'failed',
      lastFailure: 'Required participant "mack" became unavailable',
      playbackSequence: 2,
    });
    expect(h.state.current).toBe('playing');
    expect(h.activeCameraOwner()).toBeUndefined();
    expect(h.releases).toHaveLength(2);
  });
});
