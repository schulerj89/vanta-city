import type { ActionBindings } from './InputSystem';

export const defaultBindings = {
  moveForward: ['KeyW', 'ArrowUp'],
  moveBackward: ['KeyS', 'ArrowDown'],
  moveLeft: ['KeyA', 'ArrowLeft'],
  moveRight: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space'],
  cameraOrbit: ['Mouse0'],
  cameraRecenter: ['KeyC'],
  interact: ['KeyE'],
  pause: ['Escape', 'KeyP'],
  toggleDebug: ['Backquote'],
  openCharacterPicker: ['KeyK'],
  pickerPrevious: ['ArrowLeft', 'KeyA'],
  pickerNext: ['ArrowRight', 'KeyD'],
  pickerSelect: ['Space'],
  pickerConfirm: ['Enter'],
  pickerCancel: ['Escape', 'Backspace'],
} as const satisfies ActionBindings;

export type DefaultAction = keyof typeof defaultBindings;
