import { readPlayerIntent } from '../src/player/PlayerIntent';
import type { InputReader } from '../src/input/InputSystem';

function inputReader(
  down: readonly string[] = [],
  pressed: readonly string[] = [],
): InputReader {
  return {
    isDown: (action) => down.includes(action),
    wasPressed: (action) => pressed.includes(action),
    wasReleased: () => false,
  };
}

describe('readPlayerIntent', () => {
  it('translates named directional actions and normalizes diagonals', () => {
    const intent = readPlayerIntent(
      inputReader(['moveForward', 'moveRight']),
      true,
    );

    expect(intent.move.length()).toBeCloseTo(1);
    expect(intent.move.x).toBeGreaterThan(0);
    expect(intent.move.y).toBeGreaterThan(0);
    expect(intent.sprint).toBe(true);
  });

  it('uses persistent run mode independently of held keyboard actions', () => {
    expect(readPlayerIntent(inputReader(['moveForward']), true).sprint).toBe(
      true,
    );
    expect(readPlayerIntent(inputReader(['moveForward']), false).sprint).toBe(
      false,
    );
  });

  it('cancels opposing input and preserves the jump edge', () => {
    const intent = readPlayerIntent(
      inputReader(
        ['moveForward', 'moveBackward', 'moveLeft', 'moveRight'],
        ['jump'],
      ),
    );

    expect(intent.move.lengthSq()).toBe(0);
    expect(intent.jump).toBe(true);
  });
});
