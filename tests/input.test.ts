import { InputSystem } from '../src/input/InputSystem';

describe('InputSystem', () => {
  it('maps browser keys to named action state', () => {
    const input = new InputSystem({ moveForward: ['KeyW'] });
    input.init();

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    expect(input.isDown('moveForward')).toBe(true);
    expect(input.wasPressed('moveForward')).toBe(true);

    input.lateUpdate();
    expect(input.wasPressed('moveForward')).toBe(false);

    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    expect(input.isDown('moveForward')).toBe(false);
    expect(input.wasReleased('moveForward')).toBe(true);
    input.dispose();
  });

  it('rejects unknown action names', () => {
    const input = new InputSystem({ interact: ['KeyE'] });
    expect(() => input.isDown('missing')).toThrow('Unknown input action');
  });
});
