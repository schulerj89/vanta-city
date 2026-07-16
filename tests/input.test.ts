import { InputSystem } from '../src/input/InputSystem';
import { defaultBindings } from '../src/input/defaultBindings';

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

  it('claims bound arrow keys once without treating browser repeat as a new press', () => {
    const input = new InputSystem(defaultBindings);
    input.init();
    const first = new KeyboardEvent('keydown', {
      code: 'ArrowDown',
      cancelable: true,
    });
    const repeated = new KeyboardEvent('keydown', {
      code: 'ArrowDown',
      cancelable: true,
      repeat: true,
    });

    window.dispatchEvent(first);
    window.dispatchEvent(repeated);

    expect(first.defaultPrevented).toBe(true);
    expect(repeated.defaultPrevented).toBe(true);
    expect(input.isDown('moveBackward')).toBe(true);
    expect(input.wasPressed('moveBackward')).toBe(true);
    input.lateUpdate();
    expect(input.wasPressed('moveBackward')).toBe(false);
    input.dispose();
  });
});
