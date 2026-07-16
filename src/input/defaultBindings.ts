import type { ActionBindings } from './InputSystem';

export const defaultBindings = {
  moveForward: ['KeyW', 'ArrowUp'],
  moveBackward: ['KeyS', 'ArrowDown'],
  moveLeft: ['KeyA', 'ArrowLeft'],
  moveRight: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  interact: ['KeyE'],
  pause: ['Escape', 'KeyP'],
  toggleDebug: ['Backquote'],
} as const satisfies ActionBindings;

export type DefaultAction = keyof typeof defaultBindings;
