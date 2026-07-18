import type { ActionBindings } from './InputSystem';

export type ControlGroup =
  'Movement' | 'Camera' | 'Actions' | 'Interface' | 'Dialogue & picker';

export interface ControlActionMetadata {
  readonly bindings: readonly string[];
  readonly keys: readonly string[];
  readonly gamepad: readonly string[];
  readonly gamepadButtons: readonly number[];
  readonly label: string;
  readonly group: ControlGroup;
  readonly help: boolean;
}

/** Single source of truth for runtime bindings, prompts, help, and tests. */
export const controlActions = {
  moveForward: control(
    ['KeyW', 'ArrowUp'],
    ['W', '↑'],
    'Move forward',
    'Movement',
    ['Left stick'],
  ),
  moveBackward: control(
    ['KeyS', 'ArrowDown'],
    ['S', '↓'],
    'Move backward',
    'Movement',
    ['Left stick'],
  ),
  moveLeft: control(
    ['KeyA', 'ArrowLeft'],
    ['A', '←'],
    'Move left',
    'Movement',
    ['Left stick'],
  ),
  moveRight: control(
    ['KeyD', 'ArrowRight'],
    ['D', '→'],
    'Move right',
    'Movement',
    ['Left stick'],
  ),
  toggleRun: control(
    ['KeyR'],
    ['R'],
    'Toggle walk / run',
    'Movement',
    ['L3'],
    [10],
  ),
  jump: control(['Space'], ['Space'], 'Jump', 'Movement', ['A'], [0]),
  cameraOrbitLeft: control(['KeyQ'], ['Q'], 'Orbit camera left', 'Camera', [
    'Right stick',
  ]),
  cameraOrbitRight: control(['KeyE'], ['E'], 'Orbit camera right', 'Camera', [
    'Right stick',
  ]),
  cameraOrbit: control(['Mouse0'], ['Drag'], 'Orbit camera freely', 'Camera'),
  cameraRecenter: control(
    ['KeyC'],
    ['C'],
    'Recenter camera',
    'Camera',
    ['R3'],
    [11],
  ),
  cameraSwitchShoulder: control(
    ['KeyV'],
    ['V'],
    'Switch shoulder',
    'Camera',
    ['RB'],
    [5],
  ),
  interact: control(['KeyG'], ['G'], 'Interact / talk', 'Actions', ['X'], [2]),
  recoverVehicle: control(
    ['KeyX'],
    ['X'],
    'Recover seated vehicle',
    'Actions',
    ['D-pad up'],
    [12],
  ),
  punch: control(
    ['KeyJ'],
    ['J'],
    'Punch (alternates side; one action at a time)',
    'Actions',
  ),
  kick: control(
    ['KeyL'],
    ['L'],
    'Kick (alternates side; one action at a time)',
    'Actions',
  ),
  roll: control(['KeyB'], ['B'], 'Directional roll', 'Actions', ['LB'], [4]),
  useEquipment: control(
    ['KeyU'],
    ['U'],
    'Use equipped item (hold handgun to repeat)',
    'Actions',
    ['RT'],
    [7],
  ),
  reloadEquipment: control(
    ['KeyT'],
    ['T'],
    'Reload equipped handgun',
    'Actions',
    ['D-pad down'],
    [13],
  ),
  quickbar1: control(['Digit1'], ['1'], 'Equip / unequip handgun', 'Actions'),
  quickbar2: control(['Digit2'], ['2'], 'Equip / unequip knife', 'Actions'),
  toggleHelp: control(
    ['KeyH'],
    ['H'],
    'Open / close controls',
    'Interface',
    ['View'],
    [8],
  ),
  closeHelp: control(
    ['Escape'],
    ['Esc'],
    'Close controls',
    'Interface',
    ['B'],
    [1],
  ),
  pause: control(['KeyP'], ['P'], 'Pause / resume', 'Interface', ['Menu'], [9]),
  toggleMap: control(
    ['KeyM'],
    ['M'],
    'Open / close district map',
    'Interface',
    ['LT'],
    [6],
  ),
  closeMap: control(
    ['Escape'],
    ['Esc'],
    'Close district map',
    'Interface',
    ['B'],
    [1],
    false,
  ),
  mapPanUp: control(
    ['KeyW', 'ArrowUp'],
    ['W', '↑'],
    'Map pan north',
    'Interface',
    ['D-pad up'],
    [12],
    false,
  ),
  mapPanDown: control(
    ['KeyS', 'ArrowDown'],
    ['S', '↓'],
    'Map pan south',
    'Interface',
    ['D-pad down'],
    [13],
    false,
  ),
  mapPanLeft: control(
    ['KeyA', 'ArrowLeft'],
    ['A', '←'],
    'Map pan west',
    'Interface',
    ['D-pad left'],
    [14],
    false,
  ),
  mapPanRight: control(
    ['KeyD', 'ArrowRight'],
    ['D', '→'],
    'Map pan east',
    'Interface',
    ['D-pad right'],
    [15],
    false,
  ),
  mapZoomIn: control(
    ['Equal', 'NumpadAdd'],
    ['+', '='],
    'Map zoom in',
    'Interface',
    ['RB'],
    [5],
    false,
  ),
  mapZoomOut: control(
    ['Minus', 'NumpadSubtract'],
    ['−'],
    'Map zoom out',
    'Interface',
    ['LB'],
    [4],
    false,
  ),
  mapReset: control(
    ['Digit0', 'Numpad0'],
    ['0'],
    'Reset map view',
    'Interface',
    [],
    [],
    false,
  ),
  toggleDebug: control(['Backquote'], ['`'], 'Developer tools', 'Interface'),
  openCharacterPicker: control(
    ['KeyK'],
    ['K'],
    'Character picker',
    'Interface',
    ['Y'],
    [3],
  ),
  advanceDialogue: control(
    ['Enter', 'Space', 'Mouse0'],
    ['Enter', 'Space', 'Click'],
    'Continue dialogue',
    'Dialogue & picker',
    ['A'],
    [0],
  ),
  skipDialogueTypewriter: control(
    ['KeyF'],
    ['F'],
    'Reveal dialogue text',
    'Dialogue & picker',
    ['X'],
    [2],
  ),
  cancelDialogue: control(
    ['Escape'],
    ['Esc'],
    'Cancel dialogue',
    'Dialogue & picker',
    ['B'],
    [1],
  ),
  pickerPrevious: control(
    ['ArrowLeft', 'KeyA'],
    ['←', 'A'],
    'Previous character',
    'Dialogue & picker',
    ['D-pad left'],
    [14],
  ),
  pickerNext: control(
    ['ArrowRight', 'KeyD'],
    ['→', 'D'],
    'Next character',
    'Dialogue & picker',
    ['D-pad right'],
    [15],
  ),
  pickerSelect: control(
    ['Space'],
    ['Space'],
    'Preview next emote',
    'Dialogue & picker',
    ['X'],
    [2],
  ),
  pickerConfirm: control(
    ['Enter'],
    ['Enter'],
    'Confirm character',
    'Dialogue & picker',
    ['A'],
    [0],
  ),
  pickerCancel: control(
    ['Escape', 'Backspace'],
    ['Esc', 'Backspace'],
    'Close character picker',
    'Dialogue & picker',
    ['B'],
    [1],
  ),
} as const satisfies Readonly<Record<string, ControlActionMetadata>>;

export type DefaultAction = keyof typeof controlActions;

export const defaultBindings = Object.fromEntries(
  Object.entries(controlActions).map(([action, metadata]) => [
    action,
    metadata.bindings,
  ]),
) as Readonly<
  Record<DefaultAction, readonly string[]>
> satisfies ActionBindings;

export const defaultGamepadButtons = Object.fromEntries(
  Object.entries(controlActions).map(([action, metadata]) => [
    action,
    metadata.gamepadButtons,
  ]),
) as Readonly<
  Record<DefaultAction, readonly number[]>
> satisfies ActionBindings<number>;

export interface HelpControlEntry {
  readonly action: DefaultAction;
  readonly label: string;
  readonly group: ControlGroup;
  readonly keys: readonly string[];
  readonly gamepad: readonly string[];
}

export const helpControlEntries: readonly HelpControlEntry[] = Object.entries(
  controlActions,
).flatMap(([action, metadata]) =>
  metadata.help
    ? [
        {
          action: action as DefaultAction,
          label: metadata.label,
          group: metadata.group,
          keys: metadata.keys,
          gamepad: metadata.gamepad,
        },
      ]
    : [],
);

export function bindingLabel(action: DefaultAction): string {
  const binding = controlActions[action];
  return [...binding.keys, ...binding.gamepad].join(' / ');
}

export const characterControlSummary = [
  `${bindingLabel('cameraOrbitLeft')}/${bindingLabel('cameraOrbitRight')} orbit`,
  `${bindingLabel('toggleRun')} run`,
  `${bindingLabel('interact')} interact`,
  `${bindingLabel('punch')}/${bindingLabel('kick')} actions`,
  `${bindingLabel('roll')} roll`,
  `${bindingLabel('quickbar1')}/${bindingLabel('quickbar2')} equipment · ${bindingLabel('useEquipment')} use`,
  `${bindingLabel('toggleHelp')} help`,
].join(' · ');

function control(
  bindings: readonly string[],
  keys: readonly string[],
  label: string,
  group: ControlGroup,
  gamepad: readonly string[] = [],
  gamepadButtons: readonly number[] = [],
  help = true,
): ControlActionMetadata {
  return { bindings, keys, gamepad, gamepadButtons, label, group, help };
}
