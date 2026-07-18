import type { GameSystem } from '../core/lifecycle';
import type { FrameTime } from '../core/time';
import type { InputReader } from '../input/InputSystem';
import type { DebugUnregister, DebugValue } from './DebugRegistry';
import { DebugRegistry, debugSectionOrder } from './DebugRegistry';

// These are projections of existing public registrations, never new readers.
// Missing facts are omitted so sandboxes and late registrations stay generic.
const criticalFacts = [
  { id: 'runtime.state', label: 'State' },
  { id: 'player.position', label: 'Player' },
  { id: 'camera.owner', label: 'Camera' },
  { id: 'errors.count', label: 'Errors' },
] as const;

interface DebugSectionElements {
  readonly details: HTMLDetailsElement;
  readonly diagnostics: HTMLElement;
  readonly controls: HTMLElement;
}

interface DebugSectionCounts {
  diagnostics: number;
  controls: number;
}

export class DebugPanelSystem implements GameSystem {
  public readonly id = 'debug-panel';
  public readonly updateMode = 'always' as const;

  private readonly element = document.createElement('aside');
  private readonly valueElements = new Map<string, HTMLElement>();
  private readonly summaryElements = new Map<string, HTMLElement>();
  private readonly toggleElements = new Map<string, HTMLInputElement>();
  private readonly numberElements = new Map<string, HTMLInputElement>();
  private readonly sectionElements = new Map<string, DebugSectionElements>();
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
    this.element.addEventListener('keydown', this.stopPanelKeyboardEvent);
    this.element.addEventListener('mousedown', this.stopPanelPointerEvent);
    this.element.addEventListener('wheel', this.stopPanelPointerEvent);
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
    this.summaryElements.clear();
    this.toggleElements.clear();
    this.numberElements.clear();
    this.sectionElements.clear();
    this.sectionOpen.clear();
    this.element.removeEventListener('keydown', this.stopPanelKeyboardEvent);
    this.element.removeEventListener('mousedown', this.stopPanelPointerEvent);
    this.element.removeEventListener('wheel', this.stopPanelPointerEvent);
    this.element.remove();
  }

  private renderStructure(): void {
    const focusedKey = this.focusedControlKey();
    this.dirty = false;
    this.valueElements.clear();
    this.summaryElements.clear();
    this.toggleElements.clear();
    this.numberElements.clear();
    this.sectionElements.clear();

    const heading = document.createElement('header');
    heading.className = 'debug-panel__header';
    const title = document.createElement('strong');
    title.textContent = 'Developer tools';
    const controls = document.createElement('div');
    controls.className = 'debug-panel__controls';
    const expandAll = this.createBulkButton('Expand all', true);
    const collapseAll = this.createBulkButton('Collapse all', false);
    controls.append(expandAll, collapseAll);
    heading.append(title, controls);

    const glance = document.createElement('dl');
    glance.className = 'debug-glance';
    glance.setAttribute('aria-label', 'Critical runtime summary');
    this.element.replaceChildren(heading, glance);

    const groupFor = (
      name: string,
      kind: 'diagnostics' | 'controls',
    ): HTMLElement => {
      const existing = this.sectionElements.get(name);
      if (existing) return existing[kind];
      const details = document.createElement('details');
      details.className = 'debug-section';
      details.dataset.debugSection = name;
      details.open = this.sectionOpen.get(name) ?? false;
      const summary = document.createElement('summary');
      summary.className = 'debug-section__heading';
      summary.dataset.debugFocus = `section:${name}`;
      const sectionTitle = document.createElement('span');
      sectionTitle.className = 'debug-section__label';
      sectionTitle.setAttribute('role', 'heading');
      sectionTitle.setAttribute('aria-level', '2');
      sectionTitle.textContent = name;
      const count = document.createElement('span');
      count.className = 'debug-section__count';
      count.textContent = this.formatSectionCounts(sectionCounts.get(name));
      summary.append(sectionTitle, count);
      const body = document.createElement('div');
      body.className = 'debug-section__body';
      const diagnostics = this.createSectionGroup('Diagnostics');
      const sectionControls = this.createSectionGroup('Controls');
      const counts = sectionCounts.get(name);
      diagnostics.hidden = !counts?.diagnostics;
      sectionControls.hidden = !counts?.controls;
      body.append(diagnostics, sectionControls);
      details.addEventListener('toggle', () => {
        this.sectionOpen.set(name, details.open);
      });
      details.append(summary, body);
      this.sectionElements.set(name, {
        details,
        diagnostics,
        controls: sectionControls,
      });
      return kind === 'diagnostics' ? diagnostics : sectionControls;
    };

    const values = this.registry.readValues();
    const toggles = this.registry.listToggles();
    const commands = this.registry.listCommands();
    const numbers = this.registry.listNumbers();
    const valuesById = new Map(values.map((value) => [value.id, value]));
    for (const fact of criticalFacts) {
      if (!valuesById.has(fact.id)) continue;
      const item = document.createElement('div');
      item.className = 'debug-glance__item';
      item.dataset.debugSummary = fact.id;
      const label = document.createElement('dt');
      label.textContent = fact.label;
      const value = document.createElement('dd');
      value.dataset.debugSummaryValue = fact.id;
      item.append(label, value);
      glance.append(item);
      this.summaryElements.set(fact.id, value);
    }
    glance.hidden = this.summaryElements.size === 0;

    const sectionCounts = new Map<string, DebugSectionCounts>();
    const increment = (name: string, kind: keyof DebugSectionCounts): void => {
      const counts = sectionCounts.get(name) ?? {
        diagnostics: 0,
        controls: 0,
      };
      counts[kind] += 1;
      sectionCounts.set(name, counts);
    };
    for (const { group } of values) increment(group, 'diagnostics');
    for (const { group } of toggles) increment(group, 'controls');
    for (const { group } of numbers) increment(group, 'controls');
    for (const { group } of commands) increment(group, 'controls');
    const names = new Set([
      ...values.map(({ group }) => group),
      ...toggles.map(({ group }) => group),
      ...numbers.map(({ group }) => group),
      ...commands.map(({ group }) => group),
    ]);
    for (const name of [...names].sort(compareSections))
      groupFor(name, 'diagnostics');
    for (const { details } of this.sectionElements.values())
      this.element.append(details);

    for (const value of values) {
      const row = document.createElement('div');
      row.className = 'debug-value';
      const label = document.createElement('span');
      label.textContent = value.label;
      const output = document.createElement('output');
      output.dataset.debugValue = value.id;
      row.append(label, output);
      groupFor(value.group, 'diagnostics').append(row);
      this.valueElements.set(value.id, output);
    }

    for (const toggle of toggles) {
      const label = document.createElement('label');
      label.className = 'debug-toggle';
      label.dataset.debugToggle = toggle.id;
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.dataset.debugFocus = `toggle:${toggle.id}`;
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
      groupFor(toggle.group, 'controls').append(label);
      this.toggleElements.set(toggle.id, input);
    }

    for (const number of numbers) {
      const label = document.createElement('label');
      label.className = 'debug-number';
      label.dataset.debugNumber = number.id;
      const text = document.createElement('span');
      text.textContent = number.label;
      const input = document.createElement('input');
      input.type = 'number';
      input.min = String(number.min);
      input.max = String(number.max);
      input.step = String(number.step ?? 'any');
      input.value = String(number.value);
      input.dataset.debugFocus = `number:${number.id}`;
      input.setAttribute(
        'aria-label',
        `${number.label} (${number.min} to ${number.max})`,
      );
      input.addEventListener('change', () => {
        void this.registry
          .setNumber(number.id, input.valueAsNumber)
          .catch((error: unknown) => {
            input.value = String(
              this.registry.listNumbers().find(({ id }) => id === number.id)
                ?.value ?? number.value,
            );
            this.reportError(`debug number "${number.id}"`, error);
          });
      });
      label.append(text, input);
      groupFor(number.group, 'controls').append(label);
      this.numberElements.set(number.id, input);
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
        input.dataset.debugFocus = `command:${command.id}:argument`;
        input.placeholder = command.argumentLabel ?? '';
        input.setAttribute(
          'aria-label',
          `${command.label}: ${command.argumentLabel ?? 'argument'}`,
        );
        row.append(input);
      }
      const button = document.createElement('button');
      button.type = 'submit';
      button.dataset.debugFocus = `command:${command.id}:submit`;
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
      groupFor(command.group, 'controls').append(row);
    }

    this.restoreFocus(focusedKey);
  }

  private updateValues(): void {
    for (const entry of this.registry.readValues()) {
      const output = this.valueElements.get(entry.id);
      if (output) output.textContent = this.formatValue(entry.value);
      const summary = this.summaryElements.get(entry.id);
      if (summary) summary.textContent = this.formatValue(entry.value);
    }
    for (const entry of this.registry.listNumbers()) {
      const input = this.numberElements.get(entry.id);
      if (input && document.activeElement !== input) {
        input.value = String(entry.value);
      }
    }
  }

  private formatValue(value: DebugValue): string {
    if (value === undefined) return 'unavailable';
    if (value === null) return 'null';
    return String(value);
  }

  private applyVisibility(): void {
    this.element.hidden = !this.visible;
    if (
      !this.visible &&
      document.activeElement instanceof HTMLElement &&
      this.element.contains(document.activeElement)
    ) {
      document.activeElement.blur();
    }
  }

  private createBulkButton(label: string, open: boolean): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.debugFocus = open ? 'expand-all' : 'collapse-all';
    button.addEventListener('click', () => this.setAllSections(open));
    return button;
  }

  private createSectionGroup(label: string): HTMLElement {
    const group = document.createElement('div');
    group.className = 'debug-section__group';
    const heading = document.createElement('div');
    heading.className = 'debug-section__subheading';
    heading.textContent = label;
    group.append(heading);
    return group;
  }

  private setAllSections(open: boolean): void {
    for (const [name, { details }] of this.sectionElements) {
      this.sectionOpen.set(name, open);
      details.open = open;
    }
  }

  private formatSectionCounts(counts?: DebugSectionCounts): string {
    if (!counts) return '0 items';
    const labels: string[] = [];
    if (counts.diagnostics > 0)
      labels.push(
        `${counts.diagnostics} ${pluralize('diagnostic', counts.diagnostics)}`,
      );
    if (counts.controls > 0)
      labels.push(
        `${counts.controls} ${pluralize('control', counts.controls)}`,
      );
    return labels.join(' · ');
  }

  private focusedControlKey(): string | undefined {
    const active = document.activeElement;
    return active instanceof HTMLElement && this.element.contains(active)
      ? active.dataset.debugFocus
      : undefined;
  }

  private restoreFocus(key: string | undefined): void {
    if (!key) return;
    const match = [
      ...this.element.querySelectorAll<HTMLElement>('[data-debug-focus]'),
    ].find((element) => element.dataset.debugFocus === key);
    match?.focus({ preventScroll: true });
  }

  private readonly stopPanelKeyboardEvent = (event: KeyboardEvent): void => {
    if (event.code === 'Backquote') return;
    const target = event.target;
    const textEntry =
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLInputElement && target.type !== 'checkbox') ||
      (target instanceof HTMLElement && target.isContentEditable);
    const activation =
      ['Enter', 'Space'].includes(event.code) &&
      target instanceof HTMLElement &&
      ['BUTTON', 'INPUT', 'SUMMARY'].includes(target.tagName);
    if (textEntry || activation) event.stopPropagation();
  };

  private readonly stopPanelPointerEvent = (event: Event): void => {
    event.stopPropagation();
  };
}

function pluralize(label: string, count: number): string {
  return count === 1 ? label : `${label}s`;
}

function compareSections(left: string, right: string): number {
  const leftIndex = debugSectionOrder.indexOf(left);
  const rightIndex = debugSectionOrder.indexOf(right);
  if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right);
  if (leftIndex === -1) return 1;
  if (rightIndex === -1) return -1;
  return leftIndex - rightIndex;
}
