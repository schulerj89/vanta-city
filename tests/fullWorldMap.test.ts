import { EventBus } from '../src/core/events';
import { GameStateMachine, type StateEvents } from '../src/core/gameState';
import type { InputReader, PointerInputReader } from '../src/input/InputSystem';
import type { MissionHighlightSource } from '../src/missions/MissionHighlight';
import { FullWorldMapSystem } from '../src/ui/FullWorldMapSystem';
import { DefinitionLevelLocations } from '../src/world/LevelQueries';
import { testDistrict } from '../src/world/levels/testDistrict';

describe('FullWorldMapSystem', () => {
  it('renders the complete authored district and filters mission highlights by location', () => {
    const fixture = createFixture({
      getHighlights: () => [
        {
          id: 'highlight.valid',
          missionId: 'mission.signal',
          objectiveId: 'objective.valid',
          channels: ['map'],
          target: {
            kind: 'location',
            referenceId: 'mission.intersection-center',
          },
          label: 'Reach Ashfall Crossing',
          priority: 'primary',
        },
        {
          id: 'highlight.invalid',
          missionId: 'mission.invalid',
          objectiveId: 'objective.invalid',
          channels: ['map'],
          target: { kind: 'location', referenceId: 'missing.location' },
          label: 'Invalid',
          priority: 'secondary',
        },
        {
          id: 'highlight.world-only',
          missionId: 'mission.world',
          objectiveId: 'objective.world',
          channels: ['world'],
          target: {
            kind: 'location',
            referenceId: 'mission.intersection-center',
          },
          label: 'World only',
          priority: 'secondary',
        },
      ],
      subscribe: () => () => undefined,
    });

    fixture.map.open();
    fixture.map.update({ delta: 0.1, elapsed: 0.1, frame: 1 });
    const snapshot = fixture.map.getSnapshot();

    expect(snapshot).toMatchObject({
      open: true,
      priorState: 'playing',
      levelId: 'test-district',
      geometryCount: 31,
      roadCount: 6,
      structureCount: 25,
      sectorCount: 14,
      placeCount: 8,
      highlightCount: 1,
      locationName: 'Ashfall Junction',
      focusedTestId: 'map-close',
    });
    expect(fixture.mount.querySelectorAll('[data-sector-id]')).toHaveLength(14);
    expect(
      fixture.mount.querySelector('[data-entry-id="v.road-east-quay-curve"]'),
    ).not.toBeNull();
    expect(fixture.mount.querySelectorAll('[data-objective-id]')).toHaveLength(
      1,
    );
    const objectiveButton = fixture.mount.querySelector<HTMLButtonElement>(
      '[aria-label="Center map on objective Reach Ashfall Crossing"]',
    );
    objectiveButton?.click();
    expect(fixture.map.getSnapshot().zoom).toBe(2);
    fixture.dispose();
  });

  it('clamps zoom and pan, traps focus, then restores state, focus, and pointer intent', () => {
    const fixture = createFixture();
    const prior = document.createElement('button');
    document.body.append(prior);
    prior.focus();
    fixture.pointerLocked = true;
    fixture.map.open();

    for (let index = 0; index < 20; index += 1) fixture.map.zoomBy(1);
    fixture.map.panBy(1000, -1000);
    expect(fixture.map.getSnapshot()).toMatchObject({
      zoom: 4,
      center: { x: 87.5, y: 12.5 },
      pointerWasLocked: true,
    });

    const close = fixture.mount.querySelector<HTMLElement>(
      '[data-testid="map-close"]',
    )!;
    close.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
      }),
    );
    expect(document.activeElement).toBe(
      fixture.mount.querySelector('[data-testid="map-reset"]'),
    );

    fixture.map.close();
    expect(fixture.runtime.state.current).toBe('playing');
    expect(document.activeElement).toBe(prior);
    expect(fixture.requestPointerLock).toHaveBeenCalledOnce();
    expect(fixture.map.getSnapshot().open).toBe(false);
    fixture.dispose();
    prior.remove();
  });

  it('returns to paused without requesting pointer lock and removes all listeners on disposal', () => {
    const fixture = createFixture();
    fixture.runtime.state.transition('paused');
    fixture.map.open();
    fixture.map.close();
    expect(fixture.runtime.state.current).toBe('paused');
    expect(fixture.requestPointerLock).not.toHaveBeenCalled();
    fixture.dispose();
    expect(
      fixture.mount.querySelector('[data-testid="full-world-map"]'),
    ).toBeNull();
  });
});

function createFixture(
  highlights: MissionHighlightSource = {
    getHighlights: () => [],
    subscribe: () => () => undefined,
  },
) {
  const mount = document.createElement('main');
  document.body.append(mount);
  const events = new EventBus<StateEvents>();
  const state = new GameStateMachine(events);
  state.transition('playing');
  const runtime = {
    state,
    enterMap: () => {
      const previous = state.current;
      if (previous !== 'playing' && previous !== 'paused') return undefined;
      state.transition('map');
      return previous;
    },
    exitMap: (returnState: 'playing' | 'paused') =>
      state.transition(returnState),
  };
  const input: InputReader = {
    isDown: () => false,
    wasPressed: () => false,
    wasReleased: () => false,
  };
  const requestPointerLock = vi.fn();
  let pointerLocked = false;
  const pointer: PointerInputReader = {
    consumePointerDelta: () => ({ x: 0, y: 0, wheel: 0 }),
    isPointerLocked: () => pointerLocked,
    requestPointerLock,
    releasePointerLock: () => {
      pointerLocked = false;
    },
  };
  const locations = new DefinitionLevelLocations(testDistrict.definition);
  const map = new FullWorldMapSystem(
    mount,
    runtime,
    pointer,
    {
      getWorldPose: () => ({
        position: { x: 28, y: 0.2, z: -28 },
        forward: { x: 1, y: 0, z: 0 },
      }),
    },
    {
      activeLevel: testDistrict.definition,
      resolveLocation: (position) => locations.resolveLocation(position),
    },
    highlights,
  );
  map.init({ events, state, input });
  return {
    map,
    mount,
    runtime,
    requestPointerLock,
    get pointerLocked() {
      return pointerLocked;
    },
    set pointerLocked(value: boolean) {
      pointerLocked = value;
    },
    dispose: () => {
      map.dispose();
      mount.remove();
    },
  };
}
