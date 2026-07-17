import { EventBus } from '../src/core/events';
import { GameStateMachine } from '../src/core/gameState';
import type { StateEvents } from '../src/core/gameState';
import type { InputReader } from '../src/input/InputSystem';
import {
  formatWorldCoordinates,
  LocationHudSystem,
} from '../src/ui/LocationHudSystem';
import { DefinitionLevelLocations } from '../src/world/LevelQueries';
import { testDistrict } from '../src/world/levels/testDistrict';

const input: InputReader = {
  isDown: () => false,
  wasPressed: () => false,
  wasReleased: () => false,
};

describe('LocationHudSystem', () => {
  it('formats stable signed coordinates without negative zero', () => {
    expect(formatWorldCoordinates({ x: 40, y: -0.01, z: -39.96 })).toBe(
      'X +40.0 · Y +0.0 · Z -40.0',
    );
  });

  it('samples public pose/location APIs, follows state visibility, and disposes', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const events = new EventBus<StateEvents>();
    const state = new GameStateMachine(events);
    const locations = new DefinitionLevelLocations(testDistrict.definition);
    const pose = {
      getWorldPose: () => ({
        position: { x: 38, y: 0.15, z: 4 },
        forward: { x: 0, y: 0, z: -1 },
      }),
    };
    const hud = new LocationHudSystem(mount, pose, {
      activeLevel: testDistrict.definition,
      resolveLocation: (position) => locations.resolveLocation(position),
    });
    hud.init({ events, state, input });
    hud.update({ delta: 0, elapsed: 0, frame: 1 });
    expect(hud.getSnapshot().visible).toBe(false);

    state.transition('playing');
    hud.update({ delta: 0.1, elapsed: 0.1, frame: 2 });
    expect(hud.getSnapshot()).toMatchObject({
      visible: true,
      locationId: 'landmark.exchange-beacon',
      coordinates: 'X +38.0 · Y +0.2 · Z +4.0',
      updateCount: 1,
    });
    expect(mount.textContent).toContain('Exchange Beacon');

    state.transition('character-select');
    hud.update({ delta: 0.1, elapsed: 0.2, frame: 3 });
    expect(hud.getSnapshot().visible).toBe(false);
    hud.dispose();
    expect(mount.querySelector('.location-hud')).toBeNull();
    mount.remove();
  });
});
