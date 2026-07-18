import type { AccessibilityPreferenceStore } from '../accessibility/AccessibilityPreferences';
import type { GameStateMachine } from '../core/gameState';
import type { GameSystem } from '../core/lifecycle';
import type { FrameTime } from '../core/time';
import type { DialogueSessionController } from '../dialogue/DialogueSessionController';
import type {
  ActionName,
  InputDevice,
  InputDeviceActionSnapshot,
  InputSystem,
  InputSystemDebugSnapshot,
} from '../input/InputSystem';
import type { VirtualGamepadFixture } from '../input/GamepadInput';
import { controlActions } from '../input/defaultBindings';
import type { CharacterPickerSystem } from '../ui/CharacterPickerSystem';
import type { HelpOverlayController } from '../ui/LazyHelpOverlaySystem';
import type { DebugRegistry, DebugUnregister } from './DebugRegistry';
import { debugSections } from './DebugRegistry';

export type InputControlOwner =
  | 'booting'
  | 'gameplay'
  | 'paused'
  | 'map'
  | 'help'
  | 'picker'
  | 'dialogue'
  | 'cinematic'
  | 'focused-ui';

export type InputActionFamily =
  | 'gameplay'
  | 'interface'
  | 'map'
  | 'help'
  | 'picker'
  | 'dialogue'
  | 'cinematic'
  | 'debug';

export interface OwnedDeviceActions extends InputDeviceActionSnapshot {
  readonly accepted: readonly ActionName[];
  readonly rejected: readonly ActionName[];
}

export interface RejectedInputSnapshot {
  readonly sequence: number;
  readonly frame: number;
  readonly device: InputDevice;
  readonly action: ActionName;
  readonly reason:
    | 'focused-text-entry'
    | 'help-modal-owns-input'
    | 'picker-modal-owns-input'
    | 'dialogue-owns-input'
    | 'map-owns-input'
    | 'gameplay-paused'
    | 'cinematic-owns-input'
    | 'game-not-ready';
}

export interface InputTimelineEntry {
  readonly sequence: number;
  readonly frame: number;
  readonly kind: 'owner' | 'device' | 'accepted' | 'rejected' | 'connection';
  readonly summary: string;
}

export interface InputOwnershipDebugSnapshot {
  readonly frame: number;
  readonly owner: InputControlOwner;
  readonly acceptedActions: readonly ActionName[];
  readonly acceptedActionFamilies: readonly InputActionFamily[];
  readonly activeInputFamily: 'none' | 'keyboard-mouse' | 'gamepad' | 'mixed';
  readonly activeDevice: InputDevice | undefined;
  readonly focusedElement: InputSystemDebugSnapshot['focusedElement'];
  readonly pointerLocked: boolean;
  readonly actions: {
    readonly keyboard: OwnedDeviceActions;
    readonly mouse: OwnedDeviceActions;
    readonly gamepad: OwnedDeviceActions;
  };
  readonly gamepad: InputSystemDebugSnapshot['gamepad'];
  readonly accessibility: AccessibilityPreferenceStore['current'];
  readonly mostRecentRejected: RejectedInputSnapshot | undefined;
  readonly timeline: readonly InputTimelineEntry[];
}

const timelineLimit = 16;
const allActions = Object.keys(controlActions).sort();

/** Development-only projection of the existing input and modal ownership state. */
export class InputOwnershipInspector implements GameSystem {
  public readonly id = 'input-ownership-inspector';
  public readonly updateMode = 'always' as const;

  private frame = 0;
  private eventSequence = 0;
  private rejectionSequence = 0;
  private lastRawRejectionSequence = 0;
  private previousOwner: InputControlOwner | undefined;
  private previousDevice: InputDevice | undefined;
  private previousConnected = false;
  private readonly timeline: InputTimelineEntry[] = [];
  private readonly unregister: DebugUnregister[] = [];
  private mostRecentRejected: RejectedInputSnapshot | undefined;
  private virtualFixture: VirtualGamepadFixture | undefined;
  private snapshot: InputOwnershipDebugSnapshot;

  public constructor(
    private readonly input: InputSystem,
    private readonly state: GameStateMachine,
    private readonly help: HelpOverlayController,
    private readonly picker: CharacterPickerSystem,
    private readonly dialogue: DialogueSessionController,
    private readonly accessibility: AccessibilityPreferenceStore,
    private readonly debug: DebugRegistry,
  ) {
    this.snapshot = this.createSnapshot(input.getDebugSnapshot());
  }

  public init(): void {
    this.registerDebugSurface();
  }

  public update(time: FrameTime): void {
    this.frame = time.frame;
    const raw = this.input.getDebugSnapshot();
    const owner = this.resolveOwner(raw);
    const acceptedActions = this.acceptedActions(owner);
    const allowed = new Set(acceptedActions);
    const keyboard = this.ownedActions(raw.keyboard, allowed);
    const mouse = this.ownedActions(raw.mouse, allowed);
    const gamepad = this.ownedActions(gamepadActions(raw), allowed);

    if (owner !== this.previousOwner) {
      this.pushTimeline('owner', `${this.previousOwner ?? 'none'} → ${owner}`);
      this.previousOwner = owner;
    }
    if (raw.activeDevice !== this.previousDevice) {
      this.pushTimeline(
        'device',
        `${this.previousDevice ?? 'none'} → ${raw.activeDevice ?? 'none'}`,
      );
      this.previousDevice = raw.activeDevice;
    }
    if (raw.gamepad.connected !== this.previousConnected) {
      this.pushTimeline(
        'connection',
        raw.gamepad.connected
          ? `gamepad connected: ${raw.gamepad.id ?? 'unknown'}`
          : 'gamepad disconnected',
      );
      this.previousConnected = raw.gamepad.connected;
    }

    this.recordActions('keyboard', keyboard, owner);
    this.recordActions('mouse', mouse, owner);
    this.recordActions('gamepad', gamepad, owner);
    const rawRejection = raw.lastRawRejection;
    if (rawRejection && rawRejection.sequence > this.lastRawRejectionSequence) {
      this.lastRawRejectionSequence = rawRejection.sequence;
      for (const action of rawRejection.actions) {
        this.reject(rawRejection.device, action, 'focused-text-entry');
      }
    }

    this.snapshot = {
      frame: this.frame,
      owner,
      acceptedActions,
      acceptedActionFamilies: unique(acceptedActions.map(actionFamilyFor)),
      activeInputFamily: activeInputFamily(raw),
      activeDevice: raw.activeDevice,
      focusedElement: raw.focusedElement,
      pointerLocked: raw.mouse.pointerLocked,
      actions: { keyboard, mouse, gamepad },
      gamepad: raw.gamepad,
      accessibility: this.accessibility.current,
      mostRecentRejected: this.mostRecentRejected,
      timeline: [...this.timeline],
    };
  }

  public getDebugSnapshot(): InputOwnershipDebugSnapshot {
    return this.snapshot;
  }

  public setVirtualGamepad(fixture?: VirtualGamepadFixture): void {
    this.virtualFixture = fixture
      ? {
          ...fixture,
          axes: [...fixture.axes],
          buttons: [...fixture.buttons],
        }
      : undefined;
    this.input.setVirtualGamepadFixture(this.virtualFixture);
  }

  public dispose(): void {
    for (const unregister of this.unregister.splice(0)) unregister();
    this.setVirtualGamepad(undefined);
    this.timeline.length = 0;
  }

  private createSnapshot(
    raw: InputSystemDebugSnapshot,
  ): InputOwnershipDebugSnapshot {
    const owner = this.resolveOwner(raw);
    const acceptedActions = this.acceptedActions(owner);
    const allowed = new Set(acceptedActions);
    return {
      frame: this.frame,
      owner,
      acceptedActions,
      acceptedActionFamilies: unique(acceptedActions.map(actionFamilyFor)),
      activeInputFamily: activeInputFamily(raw),
      activeDevice: raw.activeDevice,
      focusedElement: raw.focusedElement,
      pointerLocked: raw.mouse.pointerLocked,
      actions: {
        keyboard: this.ownedActions(raw.keyboard, allowed),
        mouse: this.ownedActions(raw.mouse, allowed),
        gamepad: this.ownedActions(gamepadActions(raw), allowed),
      },
      gamepad: raw.gamepad,
      accessibility: this.accessibility.current,
      mostRecentRejected: undefined,
      timeline: [],
    };
  }

  private resolveOwner(raw: InputSystemDebugSnapshot): InputControlOwner {
    if (raw.focusedElement?.textEntry) return 'focused-ui';
    if (this.help.getSnapshot().open) return 'help';
    if (this.picker.getSnapshot().open) return 'picker';
    if (
      this.state.current === 'dialogue' ||
      this.dialogue.getSnapshot().state !== 'idle'
    ) {
      return 'dialogue';
    }
    if (this.state.current === 'character-select') return 'picker';
    if (this.state.current === 'map') return 'map';
    if (this.state.current === 'playing') return 'gameplay';
    return this.state.current;
  }

  private acceptedActions(owner: InputControlOwner): readonly ActionName[] {
    return allActions.filter((action) => actionAcceptedBy(owner, action));
  }

  private ownedActions(
    actions: InputDeviceActionSnapshot,
    allowed: ReadonlySet<ActionName>,
  ): OwnedDeviceActions {
    return {
      down: actions.down,
      pressed: actions.pressed,
      released: actions.released,
      accepted: actions.pressed.filter((action) => allowed.has(action)),
      rejected: actions.pressed.filter((action) => !allowed.has(action)),
    };
  }

  private recordActions(
    device: InputDevice,
    actions: OwnedDeviceActions,
    owner: InputControlOwner,
  ): void {
    if (actions.accepted.length > 0) {
      this.pushTimeline(
        'accepted',
        `${device}: ${actions.accepted.join(', ')}`,
      );
    } else {
      for (const action of actions.rejected) {
        this.reject(device, action, rejectionReason(owner));
      }
    }
  }

  private reject(
    device: InputDevice,
    action: ActionName,
    reason: RejectedInputSnapshot['reason'],
  ): void {
    this.mostRecentRejected = {
      sequence: ++this.rejectionSequence,
      frame: this.frame,
      device,
      action,
      reason,
    };
    this.pushTimeline('rejected', `${device}: ${action} · ${reason}`);
  }

  private pushTimeline(
    kind: InputTimelineEntry['kind'],
    summary: string,
  ): void {
    this.timeline.push({
      sequence: ++this.eventSequence,
      frame: this.frame,
      kind,
      summary,
    });
    if (this.timeline.length > timelineLimit) this.timeline.shift();
  }

  private registerDebugSurface(): void {
    const read = (): InputOwnershipDebugSnapshot => this.getDebugSnapshot();
    const values = [
      ['input.owner', 'Control owner', () => read().owner],
      [
        'input.accepted-families',
        'Accepted action families',
        () => read().acceptedActionFamilies.join(', ') || 'none',
      ],
      [
        'input.active-device',
        'Active input',
        () => `${read().activeInputFamily} · ${read().activeDevice ?? 'none'}`,
      ],
      [
        'input.keyboard-actions',
        'Keyboard actions',
        () => formatActions(read().actions.keyboard),
      ],
      [
        'input.mouse-actions',
        'Mouse actions / pointer lock',
        () =>
          `${formatActions(read().actions.mouse)} · lock ${read().pointerLocked}`,
      ],
      [
        'input.gamepad-actions',
        'Gamepad actions',
        () => formatActions(read().actions.gamepad),
      ],
      [
        'input.gamepad-axes',
        'Gamepad axes raw → adjusted',
        () => {
          const snapshot = read().gamepad;
          return `${formatNumbers(snapshot.rawAxes)} → ${formatNumbers(Object.values(snapshot.adjustedAxes))} · dz ${snapshot.stickDeadzone.toFixed(2)}`;
        },
      ],
      [
        'input.gamepad-buttons',
        'Gamepad buttons / edges',
        () => {
          const gamepad = read().gamepad;
          return `down ${formatList(gamepad.downButtons)} · +${formatList(gamepad.pressedButtons)} · -${formatList(gamepad.releasedButtons)} · threshold ${gamepad.buttonThreshold.toFixed(2)}`;
        },
      ],
      [
        'input.focus',
        'Focused element',
        () => {
          const focus = read().focusedElement;
          return focus
            ? `${focus.tag}${focus.label ? ` · ${focus.label}` : ''}${focus.textEntry ? ' · text entry' : ''}`
            : 'none';
        },
      ],
      [
        'input.rejected',
        'Most recent rejected input',
        () => {
          const rejected = read().mostRecentRejected;
          return rejected
            ? `${rejected.device} · ${rejected.action} · ${rejected.reason} · #${rejected.sequence}`
            : 'none';
        },
      ],
      [
        'input.accessibility',
        'Accessibility input effects',
        () => {
          const preferences = read().accessibility;
          return `reduced camera motion ${preferences.reducedCameraMotion} · dialogue typewriter ${preferences.dialogueTypewriter}`;
        },
      ],
      [
        'input.timeline',
        'Recent ownership timeline',
        () =>
          read()
            .timeline.slice(-6)
            .map(({ summary }) => summary)
            .join(' ← ') || 'none',
      ],
    ] as const;
    for (const [id, label, value] of values) {
      this.unregister.push(
        this.debug.registerValue({
          id,
          label,
          group: debugSections.input,
          read: value,
        }),
      );
    }
    this.unregister.push(
      this.debug.registerCommand({
        id: 'input.virtual-gamepad-connect',
        label: 'Connect virtual gamepad',
        group: debugSections.input,
        run: () =>
          this.setVirtualGamepad({
            connected: true,
            axes: [0, 0, 0, 0],
            buttons: Array.from({ length: 17 }, () => 0),
          }),
      }),
      this.debug.registerCommand({
        id: 'input.virtual-gamepad-disconnect',
        label: 'Disconnect virtual gamepad',
        group: debugSections.input,
        run: () =>
          this.setVirtualGamepad({
            connected: false,
            axes: [0, 0, 0, 0],
            buttons: Array.from({ length: 17 }, () => 0),
          }),
      }),
      this.debug.registerCommand({
        id: 'input.virtual-gamepad-axes',
        label: 'Set virtual gamepad axes',
        group: debugSections.input,
        argumentLabel: 'lx,ly,rx,ry',
        run: (argument) => {
          const axes = parseAxes(argument);
          this.setVirtualGamepad({
            connected: true,
            axes,
            buttons:
              this.virtualFixture?.buttons ??
              Array.from({ length: 17 }, () => 0),
          });
        },
      }),
      this.debug.registerCommand({
        id: 'input.virtual-gamepad-button',
        label: 'Set virtual gamepad button',
        group: debugSections.input,
        argumentLabel: 'index,value (0–1)',
        run: (argument) => {
          const [index, value] = parseButton(argument);
          const buttons = [
            ...(this.virtualFixture?.buttons ??
              Array.from({ length: 17 }, () => 0)),
          ];
          buttons[index] = value;
          this.setVirtualGamepad({
            connected: true,
            axes: this.virtualFixture?.axes ?? [0, 0, 0, 0],
            buttons,
          });
        },
      }),
    );
  }
}

function actionFamilyFor(action: ActionName): InputActionFamily {
  if (action.toLowerCase().includes('cinematic')) return 'cinematic';
  if (
    action === 'toggleMap' ||
    action === 'closeMap' ||
    action.startsWith('map')
  )
    return 'map';
  if (action.startsWith('picker')) return 'picker';
  if (
    action === 'advanceDialogue' ||
    action === 'skipDialogueTypewriter' ||
    action === 'cancelDialogue'
  ) {
    return 'dialogue';
  }
  if (action === 'closeHelp') return 'help';
  if (action === 'toggleDebug') return 'debug';
  if (
    controlActions[action as keyof typeof controlActions]?.group === 'Interface'
  ) {
    return 'interface';
  }
  return 'gameplay';
}

function actionAcceptedBy(
  owner: InputControlOwner,
  action: ActionName,
): boolean {
  const family = actionFamilyFor(action);
  if (owner === 'focused-ui') return action === 'toggleDebug';
  if (owner === 'help')
    return action === 'closeHelp' || action === 'toggleHelp';
  if (owner === 'picker') return family === 'picker';
  if (owner === 'dialogue') return family === 'dialogue';
  if (owner === 'map') return family === 'map';
  if (owner === 'cinematic') {
    return (
      family === 'cinematic' || action === 'pause' || action === 'toggleDebug'
    );
  }
  if (owner === 'paused') {
    return [
      'pause',
      'toggleHelp',
      'openCharacterPicker',
      'toggleMap',
      'toggleDebug',
    ].includes(action);
  }
  if (owner === 'gameplay') {
    return !['picker', 'dialogue', 'help'].includes(family);
  }
  return action === 'toggleDebug';
}

function gamepadActions(
  raw: InputSystemDebugSnapshot,
): InputDeviceActionSnapshot {
  return {
    down: raw.gamepad.downActions,
    pressed: raw.gamepad.pressedActions,
    released: raw.gamepad.releasedActions,
  };
}

function rejectionReason(
  owner: InputControlOwner,
): RejectedInputSnapshot['reason'] {
  if (owner === 'focused-ui') return 'focused-text-entry';
  if (owner === 'help') return 'help-modal-owns-input';
  if (owner === 'picker') return 'picker-modal-owns-input';
  if (owner === 'dialogue') return 'dialogue-owns-input';
  if (owner === 'map') return 'map-owns-input';
  if (owner === 'paused') return 'gameplay-paused';
  if (owner === 'cinematic') return 'cinematic-owns-input';
  return 'game-not-ready';
}

function activeInputFamily(
  raw: InputSystemDebugSnapshot,
): InputOwnershipDebugSnapshot['activeInputFamily'] {
  const keyboardMouse = raw.activeDevices.some(
    (device) => device !== 'gamepad',
  );
  const gamepad = raw.activeDevices.includes('gamepad');
  if (keyboardMouse && gamepad) return 'mixed';
  if (gamepad) return 'gamepad';
  if (keyboardMouse) return 'keyboard-mouse';
  return 'none';
}

function unique<Value extends string>(
  values: readonly Value[],
): readonly Value[] {
  return [...new Set(values)].sort();
}

function formatActions(actions: OwnedDeviceActions): string {
  return `down ${formatList(actions.down)} · accepted ${formatList(actions.accepted)} · rejected ${formatList(actions.rejected)}`;
}

function formatList(values: readonly (string | number)[]): string {
  return values.length > 0 ? values.join(',') : '—';
}

function formatNumbers(values: readonly number[]): string {
  return values.map((value) => value.toFixed(2)).join(',') || '—';
}

function parseAxes(argument: string | undefined): readonly number[] {
  const axes = argument?.split(',').map(Number) ?? [];
  if (axes.length !== 4 || axes.some((value) => !Number.isFinite(value))) {
    throw new Error('Expected four comma-separated finite axes');
  }
  return axes.map((value) => Math.max(-1, Math.min(1, value)));
}

function parseButton(argument: string | undefined): readonly [number, number] {
  const [rawIndex, rawValue] = argument?.split(',') ?? [];
  const index = Number(rawIndex);
  const value = Number(rawValue);
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index > 16 ||
    !Number.isFinite(value)
  ) {
    throw new Error('Expected button index 0–16 and finite value 0–1');
  }
  return [index, Math.max(0, Math.min(1, value))];
}
