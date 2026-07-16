import type { GameSystem } from '../core/lifecycle';
import type { FrameTime } from '../core/time';
import type { InputReader } from '../input/InputSystem';
import type { DebugUnregister, DebugValue } from './DebugRegistry';
import { DebugRegistry } from './DebugRegistry';

export class DebugPanelSystem implements GameSystem {
  public readonly id = 'debug-panel';
  public readonly updateMode = 'always' as const;

  private readonly element = document.createElement('aside');
  private readonly valueElements = new Map<string, HTMLElement>();
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
    this.unregisterRegistry = this.registry.subscribe(() => {
      this.dirty = true;
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
    this.element.remove();
  }

  private renderStructure(): void {
    this.dirty = false;
    this.valueElements.clear();

    const heading = document.createElement('header');
    heading.textContent = 'Developer tools';
    this.element.replaceChildren(heading);

    const groups = new Map<string, HTMLElement>();
    const groupFor = (name: string): HTMLElement => {
      const existing = groups.get(name);
      if (existing) return existing;
      const section = document.createElement('section');
      const title = document.createElement('h2');
      title.textContent = name;
      section.append(title);
      groups.set(name, section);
      this.element.append(section);
      return section;
    };

    for (const value of this.registry.readValues()) {
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

    for (const toggle of this.registry.listToggles()) {
      const label = document.createElement('label');
      label.className = 'debug-toggle';
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
    }

    for (const command of this.registry.listCommands()) {
      const row = document.createElement('div');
      row.className = 'debug-command';
      const input = command.argumentLabel
        ? document.createElement('input')
        : undefined;
      if (input) {
        input.type = 'text';
        input.placeholder = command.argumentLabel ?? '';
        input.setAttribute('aria-label', command.argumentLabel ?? 'Argument');
        row.append(input);
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = command.label;
      button.addEventListener('click', () => {
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
