import type { ActionBindings } from './InputSystem';

export type ControlGroup =
  'Movement' | 'Camera' | 'Actions' | 'Interface' | 'Dialogue & picker';

export interface ControlActionMetadata {
  readonly bindings: readonly string[];
  readonly keys: readonly string[];
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
  ),
  moveBackward: control(
    ['KeyS', 'ArrowDown'],
    ['S', '↓'],
    'Move backward',
    'Movement',
  ),
  moveLeft: control(['KeyA', 'ArrowLeft'], ['A', '←'], 'Move left', 'Movement'),
  moveRight: control(
    ['KeyD', 'ArrowRight'],
    ['D', '→'],
    'Move right',
    'Movement',
  ),
  toggleRun: control(['KeyR'], ['R'], 'Toggle walk / run', 'Movement'),
  jump: control(['Space'], ['Space'], 'Jump', 'Movement'),
  cameraOrbitLeft: control(['KeyQ'], ['Q'], 'Orbit camera left', 'Camera'),
  cameraOrbitRight: control(['KeyE'], ['E'], 'Orbit camera right', 'Camera'),
  cameraOrbit: control(['Mouse0'], ['Drag'], 'Orbit camera freely', 'Camera'),
  cameraRecenter: control(['KeyC'], ['C'], 'Recenter camera', 'Camera'),
  cameraSwitchShoulder: control(['KeyV'], ['V'], 'Switch shoulder', 'Camera'),
  interact: control(['KeyG'], ['G'], 'Interact / talk', 'Actions'),
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
  toggleHelp: control(['KeyH'], ['H'], 'Open / close controls', 'Interface'),
  closeHelp: control(['Escape'], ['Esc'], 'Close controls', 'Interface'),
  pause: control(['KeyP'], ['P'], 'Pause / resume', 'Interface'),
  toggleDebug: control(['Backquote'], ['`'], 'Developer tools', 'Interface'),
  openCharacterPicker: control(
    ['KeyK'],
    ['K'],
    'Character picker',
    'Interface',
  ),
  advanceDialogue: control(
    ['Enter', 'Space', 'Mouse0'],
    ['Enter', 'Space', 'Click'],
    'Continue dialogue',
    'Dialogue & picker',
  ),
  skipDialogueTypewriter: control(
    ['KeyF'],
    ['F'],
    'Reveal dialogue text',
    'Dialogue & picker',
  ),
  cancelDialogue: control(
    ['Escape'],
    ['Esc'],
    'Cancel dialogue',
    'Dialogue & picker',
  ),
  pickerPrevious: control(
    ['ArrowLeft', 'KeyA'],
    ['←', 'A'],
    'Previous character',
    'Dialogue & picker',
  ),
  pickerNext: control(
    ['ArrowRight', 'KeyD'],
    ['→', 'D'],
    'Next character',
    'Dialogue & picker',
  ),
  pickerSelect: control(
    ['Space'],
    ['Space'],
    'Preview next emote',
    'Dialogue & picker',
  ),
  pickerConfirm: control(
    ['Enter'],
    ['Enter'],
    'Confirm character',
    'Dialogue & picker',
  ),
  pickerCancel: control(
    ['Escape', 'Backspace'],
    ['Esc', 'Backspace'],
    'Close character picker',
    'Dialogue & picker',
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

export interface HelpControlEntry {
  readonly action: DefaultAction;
  readonly label: string;
  readonly group: ControlGroup;
  readonly keys: readonly string[];
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
        },
      ]
    : [],
);

export function bindingLabel(action: DefaultAction): string {
  return controlActions[action].keys.join(' / ');
}

export const characterControlSummary = [
  `${bindingLabel('cameraOrbitLeft')}/${bindingLabel('cameraOrbitRight')} orbit`,
  `${bindingLabel('toggleRun')} run`,
  `${bindingLabel('interact')} interact`,
  `${bindingLabel('punch')}/${bindingLabel('kick')} actions`,
  `${bindingLabel('toggleHelp')} help`,
].join(' · ');

function control(
  bindings: readonly string[],
  keys: readonly string[],
  label: string,
  group: ControlGroup,
  help = true,
): ControlActionMetadata {
  return { bindings, keys, label, group, help };
}
