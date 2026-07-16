import type { GameSystem } from '../core/lifecycle';
import type { FrameTime } from '../core/time';
import type { InputReader } from '../input/InputSystem';
import type { DebugUnregister, DebugValue } from './DebugRegistry';
import {
  DebugRegistry,
  debugSectionOrder,
  debugSections,
} from './DebugRegistry';

const defaultOpenSections = new Set<string>([
  debugSections.player,
  debugSections.camera,
  debugSections.interactions,
  debugSections.runtime,
]);

export class DebugPanelSystem implements GameSystem {
  public readonly id = 'debug-panel';
  public readonly updateMode = 'always' as const;

  private readonly element = document.createElement('aside');
  private readonly valueElements = new Map<string, HTMLElement>();
  private readonly toggleElements = new Map<string, HTMLInputElement>();
  private readonly sectionOpen = new Map<string, boolean>();
  private visible: boolean;
  private dirty = true;
  private smoothedFps = 0;
  private unregisterRegistry: DebugUnregister | undefined;
  private unregisterFps: DebugUnregister | undefined;

  public constructor(
    private readonly mount: HTMLElement,
    private readonly input: InputReader,
    private readonly registry: DebugRegistry,
    private readonly reportError: (scope: string, error: unknown) => void,
    initiallyVisible = false,
  ) {
    this.visible = initiallyVisible;
  }

  public init(): void {
    this.element.className = 'debug-panel';
    this.element.setAttribute('aria-label', 'Developer tools');
    this.unregisterRegistry = this.registry.subscribe((change) => {
      if (change.kind === 'structure') {
        this.dirty = true;
        return;
      }
      const input = this.toggleElements.get(change.id);
      if (input) input.checked = this.registry.isToggleEnabled(change.id);
    });
    this.unregisterFps = this.registry.registerValue({
      id: 'runtime.fps',
      label: 'FPS',
      read: () => this.smoothedFps.toFixed(0),
    });
    this.mount.append(this.element);
    this.applyVisibility();
  }

  public update(time: FrameTime): void {
    if (this.input.wasPressed('toggleDebug')) {
      this.visible = !this.visible;
      this.applyVisibility();
    }

    const fps = time.delta > 0 ? 1 / time.delta : 0;
    this.smoothedFps =
      this.smoothedFps === 0 ? fps : this.smoothedFps * 0.9 + fps * 0.1;

    if (!this.visible) return;
    if (this.dirty) this.renderStructure();
    this.updateValues();
  }

  public dispose(): void {
    this.unregisterFps?.();
    this.unregisterRegistry?.();
    this.unregisterFps = undefined;
    this.unregisterRegistry = undefined;
    this.valueElements.clear();
    this.toggleElements.clear();
    this.sectionOpen.clear();
    this.element.remove();
  }

  private renderStructure(): void {
    this.dirty = false;
    this.valueElements.clear();
    this.toggleElements.clear();

    const heading = document.createElement('header');
    heading.textContent = 'Developer tools';
    this.element.replaceChildren(heading);

    const groups = new Map<
      string,
      { details: HTMLDetailsElement; body: HTMLElement }
    >();
    const groupFor = (name: string): HTMLElement => {
      const existing = groups.get(name);
      if (existing) return existing.body;
      const details = document.createElement('details');
      details.className = 'debug-section';
      details.dataset.debugSection = name;
      details.open =
        this.sectionOpen.get(name) ?? defaultOpenSections.has(name);
      const title = document.createElement('summary');
      title.className = 'debug-section__heading';
      title.setAttribute('role', 'heading');
      title.setAttribute('aria-level', '2');
      title.textContent = name;
      const body = document.createElement('div');
      body.className = 'debug-section__body';
      details.addEventListener('toggle', () => {
        this.sectionOpen.set(name, details.open);
      });
      details.append(title, body);
      groups.set(name, { details, body });
      return body;
    };

    const values = this.registry.readValues();
    const toggles = this.registry.listToggles();
    const commands = this.registry.listCommands();
    const names = new Set([
      ...values.map(({ group }) => group),
      ...toggles.map(({ group }) => group),
      ...commands.map(({ group }) => group),
    ]);
    for (const name of [...names].sort(compareSections)) groupFor(name);
    for (const { details } of groups.values()) this.element.append(details);

    for (const value of values) {
      const row = document.createElement('div');
      row.className = 'debug-value';
      const label = document.createElement('span');
      label.textContent = value.label;
      const output = document.createElement('output');
      output.dataset.debugValue = value.id;
      row.append(label, output);
      groupFor(value.group).append(row);
      this.valueElements.set(value.id, output);
    }

    for (const toggle of toggles) {
      const label = document.createElement('label');
      label.className = 'debug-toggle';
      label.dataset.debugToggle = toggle.id;
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = toggle.enabled;
      input.addEventListener('change', () => {
        try {
          this.registry.setToggle(toggle.id, input.checked);
        } catch (error) {
          input.checked = !input.checked;
          this.reportError(`debug toggle "${toggle.id}"`, error);
        }
      });
      label.append(input, toggle.label);
      groupFor(toggle.group).append(label);
      this.toggleElements.set(toggle.id, input);
    }

    for (const command of commands) {
      const row = document.createElement('form');
      row.className = 'debug-command';
      row.dataset.debugCommand = command.id;
      const input = command.argumentLabel
        ? document.createElement('input')
        : undefined;
      if (input) {
        input.type = 'text';
        input.placeholder = command.argumentLabel ?? '';
        input.setAttribute(
          'aria-label',
          `${command.label}: ${command.argumentLabel ?? 'argument'}`,
        );
        row.append(input);
      }
      const button = document.createElement('button');
      button.type = 'submit';
      button.textContent = command.label;
      row.addEventListener('submit', (event) => {
        event.preventDefault();
        void this.registry
          .executeCommand(command.id, input?.value.trim() || undefined)
          .catch((error: unknown) => {
            this.reportError(`debug command "${command.id}"`, error);
          });
      });
      row.append(button);
      groupFor(command.group).append(row);
    }
  }

  private updateValues(): void {
    for (const entry of this.registry.readValues()) {
      const output = this.valueElements.get(entry.id);
      if (output) output.textContent = this.formatValue(entry.value);
    }
  }

  private formatValue(value: DebugValue): string {
    if (value === undefined) return 'unavailable';
    if (value === null) return 'null';
    return String(value);
  }

  private applyVisibility(): void {
    this.element.hidden = !this.visible;
  }
}

function compareSections(left: string, right: string): number {
  const leftIndex = debugSectionOrder.indexOf(left);
  const rightIndex = debugSectionOrder.indexOf(right);
  if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right);
  if (leftIndex === -1) return 1;
  if (rightIndex === -1) return -1;
  return leftIndex - rightIndex;
}
