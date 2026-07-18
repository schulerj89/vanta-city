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

  it('discards paused transient edges without dropping held state', () => {
    const input = new InputSystem({ punch: ['KeyJ'] });
    input.init();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ' }));
    expect(input.wasPressed('punch')).toBe(true);

    input.consumeTransientActions();

    expect(input.wasPressed('punch')).toBe(false);
    expect(input.isDown('punch')).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyJ' }));
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

  it('does not leak editable control keystrokes into game actions', () => {
    const input = new InputSystem(defaultBindings);
    const field = document.createElement('input');
    document.body.append(field);
    input.init();

    field.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }),
    );
    expect(input.isDown('moveForward')).toBe(false);
    expect(input.wasPressed('moveForward')).toBe(false);

    field.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'Backquote', bubbles: true }),
    );
    expect(input.wasPressed('toggleDebug')).toBe(true);

    input.dispose();
    field.remove();
  });

  it('does not fire gameplay controls while a text field owns keyboard input', () => {
    const input = new InputSystem(defaultBindings);
    input.init();
    const field = document.createElement('input');
    document.body.append(field);
    field.focus();

    field.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'KeyR', bubbles: true }),
    );
    expect(input.wasPressed('toggleRun')).toBe(false);
    expect(input.isUiFocused()).toBe(true);

    field.remove();
    input.dispose();
  });

  it('does not mistake a closed UI button focus target for an active modal owner', () => {
    const input = new InputSystem(defaultBindings);
    input.init();
    const button = document.createElement('button');
    document.body.append(button);
    button.focus();
    expect(input.isUiFocused()).toBe(false);
    button.remove();
    input.dispose();
  });

  it('shares pointer aim state through its single listener lifecycle', () => {
    const input = new InputSystem(defaultBindings);
    input.init();
    window.dispatchEvent(
      new MouseEvent('mousemove', { clientX: 123, clientY: 234 }),
    );
    expect(input.getPointerAimSnapshot()).toMatchObject({
      clientX: 123,
      clientY: 234,
      hasPosition: true,
      locked: false,
    });

    input.dispose();
    window.dispatchEvent(
      new MouseEvent('mousemove', { clientX: 456, clientY: 567 }),
    );
    expect(input.getPointerAimSnapshot()).toMatchObject({
      clientX: 123,
      clientY: 234,
    });
  });
});
