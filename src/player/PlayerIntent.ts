import { Vector2 } from 'three';
import type { InputReader } from '../input/InputSystem';

export interface PlayerIntent {
  readonly move: Readonly<Vector2>;
  readonly sprint: boolean;
  readonly jump: boolean;
}

export const idlePlayerIntent: PlayerIntent = {
  move: new Vector2(),
  sprint: false,
  jump: false,
};

export function readPlayerIntent(
  input: InputReader,
  runMode = false,
): PlayerIntent {
  const x =
    Number(input.isDown('moveRight')) - Number(input.isDown('moveLeft'));
  const y =
    Number(input.isDown('moveForward')) - Number(input.isDown('moveBackward'));
  const move = new Vector2(x, y);
  if (move.lengthSq() > 1) move.normalize();
  return {
    move,
    sprint: runMode,
    jump: input.wasPressed('jump'),
  };
}
