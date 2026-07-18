import {
  GamepadInputAdapter,
  applyRadialDeadzone,
} from '../src/input/GamepadInput';
import { InputSystem } from '../src/input/InputSystem';
import { defaultBindings } from '../src/input/defaultBindings';

function virtualGamepad(): {
  readonly gamepad: Gamepad;
  setButton(index: number, pressed: boolean): void;
  setAxes(x: number, y: number, cameraX?: number, cameraY?: number): void;
} {
  const buttons = Array.from({ length: 17 }, () => ({
    pressed: false,
    touched: false,
    value: 0,
  }));
  const axes = [0, 0, 0, 0];
  const gamepad = {
    axes,
    buttons,
    connected: true,
    id: 'Virtual standard gamepad',
    index: 0,
    mapping: 'standard',
    timestamp: 0,
    vibrationActuator: null,
  } as unknown as Gamepad;
  return {
    gamepad,
    setButton: (index, pressed) => {
      buttons[index] = { pressed, touched: pressed, value: Number(pressed) };
    },
    setAxes: (x, y, cameraX = 0, cameraY = 0) => {
      axes.splice(0, 4, x, y, cameraX, cameraY);
    },
  };
}

describe('GamepadInputAdapter', () => {
  it('applies a radial deadzone and rescales useful stick travel', () => {
    expect(applyRadialDeadzone(0.1, 0.1, 0.2)).toEqual({ x: 0, y: 0 });
    const diagonal = applyRadialDeadzone(0.6, 0.6, 0.2);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(
      (Math.hypot(0.6, 0.6) - 0.2) / 0.8,
    );
  });

  it('reports analog axes and exactly one edge for a held button', () => {
    const virtual = virtualGamepad();
    const adapter = new GamepadInputAdapter(undefined, () => [virtual.gamepad]);
    virtual.setAxes(0.6, -0.8, -0.5, 0.25);
    virtual.setButton(2, true);

    adapter.poll();
    expect(adapter.readAxis('moveX')).toBeGreaterThan(0);
    expect(adapter.readAxis('moveY')).toBeGreaterThan(0);
    expect(adapter.readAxis('cameraX')).toBeLessThan(0);
    expect(adapter.isDown('interact')).toBe(true);
    expect(adapter.wasPressed('interact')).toBe(true);

    adapter.lateUpdate();
    adapter.poll();
    expect(adapter.isDown('interact')).toBe(true);
    expect(adapter.wasPressed('interact')).toBe(false);

    virtual.setButton(2, false);
    adapter.poll();
    expect(adapter.wasReleased('interact')).toBe(true);
  });

  it('snapshots raw/adjusted controls and virtual disconnect/reconnect', () => {
    const adapter = new GamepadInputAdapter();
    adapter.setVirtualFixture({
      connected: true,
      axes: [0.1, -0.8, 0.6, 0],
      buttons: Array.from({ length: 17 }, (_, index) =>
        index === 2 ? 0.75 : 0,
      ),
    });
    adapter.poll();
    const connected = adapter.getDebugSnapshot();

    expect(connected).toMatchObject({
      connected: true,
      virtual: true,
      rawAxes: [0.1, -0.8, 0.6, 0],
      downButtons: [2],
      pressedButtons: [2],
      buttonThreshold: 0.5,
      stickDeadzone: 0.2,
    });
    expect(connected.adjustedAxes.moveY).toBeGreaterThan(0);
    expect(connected.adjustedAxes.cameraX).toBeGreaterThan(0);

    adapter.lateUpdate();
    adapter.setVirtualFixture({ connected: false, axes: [], buttons: [] });
    adapter.poll();
    expect(adapter.getDebugSnapshot()).toMatchObject({
      connected: false,
      virtual: true,
      releasedButtons: [2],
    });

    adapter.lateUpdate();
    adapter.setVirtualFixture({
      connected: true,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => 0),
    });
    adapter.poll();
    expect(adapter.getDebugSnapshot().connected).toBe(true);
  });

  it('coexists with keyboard input through the named InputReader', () => {
    const virtual = virtualGamepad();
    const gamepad = new GamepadInputAdapter(undefined, () => [virtual.gamepad]);
    const input = new InputSystem(defaultBindings, window, gamepad);
    input.init();
    virtual.setButton(0, true);
    input.update();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));

    expect(input.wasPressed('jump')).toBe(true);
    expect(input.isDown('moveForward')).toBe(true);

    input.dispose();
  });

  it('isolates gamepad actions and axes while a text field owns focus', () => {
    const virtual = virtualGamepad();
    const gamepad = new GamepadInputAdapter(undefined, () => [virtual.gamepad]);
    const input = new InputSystem(defaultBindings, window, gamepad);
    const field = document.createElement('input');
    document.body.append(field);
    input.init();
    field.focus();
    virtual.setButton(2, true);
    virtual.setAxes(1, -1);
    input.update();

    expect(input.wasPressed('interact')).toBe(false);
    expect(input.readAxis('moveX')).toBe(0);

    field.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }),
    );
    expect(input.getDebugSnapshot().lastRawRejection).toMatchObject({
      device: 'keyboard',
      control: 'KeyW',
      actions: ['mapPanUp', 'moveForward'],
      reason: 'focused-text-entry',
    });

    input.dispose();
    field.remove();
  });

  it('allows only the active modal gamepad action family', () => {
    const virtual = virtualGamepad();
    const gamepad = new GamepadInputAdapter(undefined, () => [virtual.gamepad]);
    const input = new InputSystem(defaultBindings, window, gamepad);
    const modal = document.createElement('section');
    modal.id = 'controls-help';
    modal.setAttribute('aria-modal', 'true');
    document.body.append(modal);
    input.init();
    virtual.setButton(1, true);
    virtual.setButton(9, true);
    virtual.setAxes(1, -1);
    input.update();

    expect(input.wasPressed('closeHelp')).toBe(true);
    expect(input.wasPressed('pause')).toBe(false);
    expect(input.readAxis('moveX')).toBe(0);

    input.dispose();
    modal.remove();
  });
});
