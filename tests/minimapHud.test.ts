import { EventBus } from '../src/core/events';
import type { StateEvents } from '../src/core/gameState';
import { GameStateMachine } from '../src/core/gameState';
import type { InputReader } from '../src/input/InputSystem';
import {
  headingDegreesFromForward,
  MinimapHudSystem,
  projectWorldToMap,
} from '../src/ui/MinimapHudSystem';
import { DefinitionLevelLocations } from '../src/world/LevelQueries';
import { testDistrict } from '../src/world/levels/testDistrict';

const input: InputReader = {
  isDown: () => false,
  wasPressed: () => false,
  wasReleased: () => false,
};

describe('MinimapHudSystem', () => {
  const bounds = testDistrict.definition.mapPresentation.bounds;

  it('projects the center and all bounds corners with north at the top', () => {
    expect(projectWorldToMap({ x: 7, z: 0 }, bounds)).toEqual({ x: 50, y: 50 });
    expect(projectWorldToMap({ x: -47.6875, z: 43.75 }, bounds)).toEqual({
      x: 0,
      y: 0,
    });
    expect(projectWorldToMap({ x: 61.6875, z: 43.75 }, bounds)).toEqual({
      x: 100,
      y: 0,
    });
    expect(projectWorldToMap({ x: -47.6875, z: -43.75 }, bounds)).toEqual({
      x: 0,
      y: 100,
    });
    expect(projectWorldToMap({ x: 61.6875, z: -43.75 }, bounds)).toEqual({
      x: 100,
      y: 100,
    });
  });

  it('converts public forward vectors to clockwise map headings', () => {
    expect(headingDegreesFromForward({ x: 0, z: 1 })).toBe(0);
    expect(headingDegreesFromForward({ x: 1, z: 0 })).toBe(90);
    expect(headingDegreesFromForward({ x: 0, z: -1 })).toBe(180);
    expect(headingDegreesFromForward({ x: -1, z: 0 })).toBe(270);
  });

  it('renders referenced level layers, tracks pose/location, and disposes', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const events = new EventBus<StateEvents>();
    const state = new GameStateMachine(events);
    const locations = new DefinitionLevelLocations(testDistrict.definition);
    const hud = new MinimapHudSystem(
      mount,
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
    );
    hud.init({ events, state, input });
    hud.update({ delta: 0, elapsed: 0, frame: 1 });
    expect(hud.getSnapshot().visible).toBe(false);

    state.transition('playing');
    hud.update({ delta: 0.1, elapsed: 0.1, frame: 2 });
    expect(hud.getSnapshot()).toMatchObject({
      visible: true,
      orientation: 'north-up',
      projected: { x: 69.19999999999999, y: 82 },
      headingDegrees: 90,
      layers: { roads: true, structures: true, spawns: false },
    });
    expect(mount.querySelectorAll('[data-layer="roads"] rect')).toHaveLength(9);
    expect(mount.querySelectorAll('[data-layer="roads"] path')).toHaveLength(1);
    expect(
      mount.querySelectorAll('[data-layer="structures"] rect'),
    ).toHaveLength(39);
    expect(
      mount.querySelector('[data-entry-id="v.road-east-quay-curve"]'),
    ).not.toBeNull();
    expect(
      mount.querySelectorAll('[data-layer="landmarks"] circle'),
    ).toHaveLength(5);
    expect(
      mount.querySelector('[data-entry-id="v.road-east-west"]'),
    ).not.toBeNull();
    expect(
      mount.querySelector('.minimap-hud__boundary')?.getAttribute('d'),
    ).toContain('L 99.25 18');

    hud.setLayerVisible('spawns', true);
    expect(hud.getSnapshot().layers.spawns).toBe(true);
    expect(
      (mount.querySelector('[data-layer="spawns"]') as SVGGElement).style
        .display,
    ).toBe('');

    state.transition('paused');
    hud.update({ delta: 0.1, elapsed: 0.2, frame: 3 });
    expect(hud.getSnapshot().visible).toBe(true);
    state.transition('character-select');
    hud.update({ delta: 0.1, elapsed: 0.3, frame: 4 });
    expect(hud.getSnapshot().visible).toBe(false);
    hud.dispose();
    expect(mount.querySelector('.minimap-hud')).toBeNull();
    mount.remove();
  });
});
