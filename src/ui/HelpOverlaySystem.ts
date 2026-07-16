import type { GameSystem } from '../core/lifecycle';
import type { GameContext } from '../game/GameRuntime';
import type { GameRuntime } from '../game/GameRuntime';
import type { InputReader } from '../input/InputSystem';
import type { ControlGroup, HelpControlEntry } from '../input/defaultBindings';
import type { AccessibilityPreferenceStore } from '../accessibility/AccessibilityPreferences';

export interface HelpOverlaySnapshot {
  readonly open: boolean;
  readonly openedFromPlaying: boolean;
  readonly focusedElement: string | undefined;
  readonly preferences: AccessibilityPreferenceStore['current'] | undefined;
}

export class HelpOverlaySystem implements GameSystem<GameContext> {
  public readonly id = 'help-overlay';
  public readonly updateMode = 'always' as const;

  private readonly button = document.createElement('button');
  private readonly overlay = document.createElement('section');
  private readonly closeButton = document.createElement('button');
  private input: InputReader | undefined;
  private openState = false;
  private openedFromPlaying = false;
  private previousFocus: HTMLElement | undefined;
  private unsubscribeState: (() => void) | undefined;

  public constructor(
    private readonly mount: HTMLElement,
    private readonly runtime: GameRuntime,
    private readonly controls: readonly HelpControlEntry[],
    private readonly preferences?: AccessibilityPreferenceStore,
  ) {}

  public init(context: GameContext): void {
    this.input = context.input;
    this.button.type = 'button';
    this.button.className = 'help-button';
    this.button.textContent = 'Help';
    this.button.setAttribute('aria-haspopup', 'dialog');
    this.button.setAttribute('aria-controls', 'controls-help');
    this.button.setAttribute('aria-expanded', 'false');
    this.button.addEventListener('click', this.toggleFromButton);

    this.overlay.id = 'controls-help';
    this.overlay.className = 'help-overlay';
    this.overlay.hidden = true;
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.setAttribute('aria-labelledby', 'controls-help-title');
    this.overlay.addEventListener('keydown', this.onOverlayKeyDown);
    this.overlay.addEventListener('keyup', stopPropagation);
    this.overlay.addEventListener('mousedown', stopPropagation);
    this.overlay.addEventListener('mouseup', stopPropagation);
    this.overlay.append(this.buildPanel());

    this.mount.append(this.button, this.overlay);
    this.unsubscribeState = context.events.on('game-state:changed', () => {
      this.updateAvailability();
    });
    this.updateAvailability();
  }

  public update(): void {
    if (
      this.openState &&
      (this.input?.wasPressed('closeHelp') ||
        this.input?.wasPressed('toggleHelp'))
    ) {
      this.close();
      return;
    }
    if (
      !this.openState &&
      this.input?.wasPressed('toggleHelp') &&
      this.canOpen()
    ) {
      this.open();
    }
  }

  public open(): void {
    if (this.openState || !this.canOpen()) return;
    this.previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined;
    this.openedFromPlaying = this.runtime.state.current === 'playing';
    if (this.openedFromPlaying) this.runtime.pause();
    this.openState = true;
    this.overlay.hidden = false;
    this.button.setAttribute('aria-expanded', 'true');
    this.mount.classList.add('help-overlay-open');
    void document.exitPointerLock?.();
    this.closeButton.focus();
  }

  public close(): void {
    if (!this.openState) return;
    const shouldResume = this.openedFromPlaying;
    this.openState = false;
    this.openedFromPlaying = false;
    this.overlay.hidden = true;
    this.button.setAttribute('aria-expanded', 'false');
    this.mount.classList.remove('help-overlay-open');
    const focus = this.previousFocus;
    this.previousFocus = undefined;
    focus?.focus();
    if (shouldResume && this.runtime.state.current === 'paused') {
      this.runtime.resume();
    }
    this.updateAvailability();
  }

  public getSnapshot(): HelpOverlaySnapshot {
    const active = document.activeElement;
    return {
      open: this.openState,
      openedFromPlaying: this.openedFromPlaying,
      focusedElement:
        active instanceof HTMLElement
          ? (active.getAttribute('aria-label') ?? active.textContent?.trim())
          : undefined,
      preferences: this.preferences?.current,
    };
  }

  public dispose(): void {
    // Runtime disposal must never resume simulation while systems are being
    // torn down, even when help originally paused a playing session.
    this.openState = false;
    this.openedFromPlaying = false;
    this.previousFocus = undefined;
    this.mount.classList.remove('help-overlay-open');
    this.unsubscribeState?.();
    this.unsubscribeState = undefined;
    this.button.removeEventListener('click', this.toggleFromButton);
    this.closeButton.removeEventListener('click', this.closeFromButton);
    this.overlay.removeEventListener('keydown', this.onOverlayKeyDown);
    this.overlay.removeEventListener('keyup', stopPropagation);
    this.overlay.removeEventListener('mousedown', stopPropagation);
    this.overlay.removeEventListener('mouseup', stopPropagation);
    this.button.remove();
    this.overlay.remove();
    this.input = undefined;
  }

  private buildPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'help-overlay__panel';
    const header = document.createElement('header');
    const copy = document.createElement('div');
    const eyebrow = document.createElement('p');
    eyebrow.className = 'help-overlay__eyebrow';
    eyebrow.textContent = 'Vanta City field guide';
    const title = document.createElement('h1');
    title.id = 'controls-help-title';
    title.textContent = 'Controls';
    const description = document.createElement('p');
    description.textContent =
      'Keyboard, mouse, and gamepad controls change by context. Gameplay actions pause while a menu owns focus.';
    copy.append(eyebrow, title, description);
    this.closeButton.type = 'button';
    this.closeButton.className = 'help-overlay__close';
    this.closeButton.textContent = 'Close';
    this.closeButton.setAttribute('aria-label', 'Close controls help');
    this.closeButton.addEventListener('click', this.closeFromButton);
    header.append(copy, this.closeButton);

    const grid = document.createElement('div');
    grid.className = 'help-overlay__grid';
    const groups = new Map<ControlGroup, HelpControlEntry[]>();
    for (const entry of this.controls) {
      const entries = groups.get(entry.group) ?? [];
      entries.push(entry);
      groups.set(entry.group, entries);
    }
    for (const [group, entries] of groups) {
      const section = document.createElement('section');
      const heading = document.createElement('h2');
      heading.textContent = group;
      const list = document.createElement('dl');
      for (const entry of entries) {
        const term = document.createElement('dt');
        for (const key of entry.keys) {
          const keyElement = document.createElement('kbd');
          keyElement.textContent = key;
          term.append(keyElement);
        }
        for (const button of entry.gamepad) {
          const keyElement = document.createElement('kbd');
          keyElement.textContent = button;
          keyElement.dataset.input = 'gamepad';
          term.append(keyElement);
        }
        const detail = document.createElement('dd');
        detail.textContent = entry.label;
        list.append(term, detail);
      }
      section.append(heading, list);
      grid.append(section);
    }
    panel.append(header, grid);
    if (this.preferences) panel.append(this.buildPreferences());
    return panel;
  }

  private buildPreferences(): HTMLElement {
    const section = document.createElement('section');
    section.className = 'help-overlay__preferences';
    const heading = document.createElement('h2');
    heading.textContent = 'Accessibility';
    const description = document.createElement('p');
    description.textContent = 'Saved on this device.';
    section.append(heading, description);
    section.append(
      this.preferenceToggle(
        'Reduce camera motion',
        'Removes automatic recentering and animated camera smoothing.',
        'reducedCameraMotion',
      ),
      this.preferenceToggle(
        'Animate dialogue text',
        'Turn off to reveal each dialogue line immediately.',
        'dialogueTypewriter',
      ),
    );
    return section;
  }

  private preferenceToggle(
    label: string,
    description: string,
    key: 'reducedCameraMotion' | 'dialogueTypewriter',
  ): HTMLElement {
    const wrapper = document.createElement('label');
    wrapper.className = 'help-overlay__preference';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = this.preferences?.current[key] ?? false;
    input.addEventListener('change', () => {
      this.preferences?.update({ [key]: input.checked });
    });
    const copy = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = label;
    const detail = document.createElement('small');
    detail.textContent = description;
    copy.append(name, detail);
    wrapper.append(input, copy);
    return wrapper;
  }

  private canOpen(): boolean {
    return (
      this.runtime.state.current === 'playing' ||
      this.runtime.state.current === 'paused'
    );
  }

  private updateAvailability(): void {
    this.button.disabled = !this.canOpen() && !this.openState;
    this.button.hidden =
      !this.openState &&
      this.runtime.state.current !== 'playing' &&
      this.runtime.state.current !== 'paused';
  }

  private readonly toggleFromButton = (event: MouseEvent): void => {
    event.stopPropagation();
    if (this.openState) this.close();
    else this.open();
  };

  private readonly closeFromButton = (event: MouseEvent): void => {
    event.stopPropagation();
    this.close();
  };

  private readonly onOverlayKeyDown = (event: KeyboardEvent): void => {
    event.stopPropagation();
    if (event.code === 'Escape' || event.code === 'KeyH') {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.code === 'Tab') {
      event.preventDefault();
      const focusable = [
        this.closeButton,
        ...Array.from(this.overlay.querySelectorAll<HTMLInputElement>('input')),
      ];
      const current = focusable.indexOf(
        document.activeElement as HTMLInputElement,
      );
      const step = event.shiftKey ? -1 : 1;
      focusable[
        (current + step + focusable.length) % focusable.length
      ]?.focus();
    }
  };
}

function stopPropagation(event: Event): void {
  event.stopPropagation();
}
