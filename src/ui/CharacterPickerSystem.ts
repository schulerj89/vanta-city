import type { GameState, GameStateMachine } from '../core/gameState';
import type { GameSystem } from '../core/lifecycle';
import type { FrameTime } from '../core/time';
import type { GameContext } from '../game/GameRuntime';
import type { InputReader } from '../input/InputSystem';
import type {
  CharacterAvailabilityProbe,
  CharacterAvailabilityResult,
  CharacterAvailabilityStatus,
} from '../characters/CharacterAvailability';
import type { CharacterDefinition } from '../characters/CharacterDefinition';
import type {
  CharacterPreviewSnapshot,
  CharacterPreviewSurface,
} from '../characters/CharacterPreviewSystem';
import type { CharacterSelectionStore } from '../characters/CharacterSelection';
import { bindingLabel } from '../input/defaultBindings';

export type CharacterPickerPreviewState =
  | 'idle'
  | 'checking'
  | 'loading'
  | 'ready'
  | 'fallback'
  | 'unavailable'
  | 'failed';

export interface CharacterPickerSnapshot {
  readonly open: boolean;
  readonly registeredCharacterIds: readonly string[];
  readonly availableCharacterIds: readonly string[];
  readonly fallbackCharacterIds: readonly string[];
  readonly unavailableCharacterIds: readonly string[];
  readonly focusedCharacterId: string;
  readonly selectedCharacterId: string;
  readonly confirmedCharacterId: string;
  readonly previewState: CharacterPickerPreviewState;
  readonly preview: CharacterPreviewSnapshot;
}

interface AvailabilityEntry {
  readonly status: CharacterAvailabilityStatus;
  readonly reason?: string;
}

/** A single focused live preview; arrows change only the draft choice. */
export class CharacterPickerSystem implements GameSystem {
  public readonly id = 'character-picker';
  public readonly updateMode = 'always' as const;

  private readonly element = document.createElement('section');
  private readonly definitions: readonly CharacterDefinition[];
  private readonly availability = new Map<string, AvailabilityEntry>();
  private input: InputReader | undefined;
  private state: GameStateMachine | undefined;
  private unsubscribeSelection: (() => void) | undefined;
  private returnState: Exclude<GameState, 'booting' | 'character-select'> =
    'playing';
  private openState = false;
  private disposed = false;
  private focusedId: string;
  private selectedId: string;
  private previewState: CharacterPickerPreviewState = 'idle';
  private previewVersion = 0;

  public constructor(
    private readonly mount: HTMLElement,
    private readonly selection: CharacterSelectionStore,
    private readonly availabilityProbe: CharacterAvailabilityProbe,
    private readonly preview: CharacterPreviewSurface,
  ) {
    this.definitions = selection.definitions.filter(
      ({ pickerVisible }) => pickerVisible !== false,
    );
    const initial =
      this.definitions.find(({ id }) => id === selection.getSelectedId()) ??
      this.definitions[0];
    if (!initial) throw new Error('Character picker needs a visible character');
    this.focusedId = initial.id;
    this.selectedId = initial.id;
    for (const definition of this.definitions) {
      this.availability.set(definition.id, { status: 'checking' });
    }
  }

  public init(context: GameContext): void {
    this.input = context.input;
    this.state = context.state;
    this.element.className = 'character-picker';
    this.element.hidden = true;
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-modal', 'true');
    this.element.setAttribute('aria-labelledby', 'character-picker-title');
    this.element.addEventListener('click', this.onClick);
    this.mount.append(this.element);
    this.unsubscribeSelection = this.selection.onSelectionChanged(() => {
      if (this.openState) return;
      const selected = this.definitionById(this.selection.getSelectedId());
      if (!selected) return;
      this.focusedId = selected.id;
      this.selectedId = selected.id;
    });
    this.startAvailabilityChecks();
  }

  public update(time: FrameTime): void {
    if (!this.input) return;
    if (!this.openState) {
      if (
        this.input.wasPressed('openCharacterPicker') &&
        (this.state?.current === 'playing' || this.state?.current === 'paused')
      ) {
        this.open();
      }
      return;
    }
    this.preview.update(time.delta);
    this.updateAnimationLabel();
    if (this.input.wasPressed('pickerPrevious')) this.previous();
    if (this.input.wasPressed('pickerNext')) this.next();
    if (this.input.wasPressed('pickerSelect')) this.playNextPreviewAnimation();
    if (this.input.wasPressed('pickerConfirm')) this.confirm();
    if (this.input.wasPressed('pickerCancel')) this.cancel();
  }

  public open(): void {
    if (this.openState || !this.state) return;
    const current = this.state.current;
    if (current === 'booting' || current === 'character-select') return;
    this.returnState = current;
    const selected = this.definitionById(this.selection.getSelectedId());
    this.focusedId = selected?.id ?? this.definitions[0]!.id;
    this.selectedId = this.focusedId;
    this.openState = true;
    this.element.hidden = false;
    this.mount.classList.add('character-picker-open');
    this.state.transition('character-select');
    void document.exitPointerLock?.();
    this.render();
    void this.loadFocusedPreview();
    this.focusAction('confirm');
  }

  public previous(): void {
    this.moveFocus(-1);
  }

  public next(): void {
    this.moveFocus(1);
  }

  public focusCharacter(id: string): void {
    const definition = this.definitionById(id);
    if (!definition) return;
    this.focusedId = definition.id;
    if (this.isSelectable(definition.id)) this.selectedId = definition.id;
    this.render();
    void this.loadFocusedPreview();
  }

  /** Existing named input compatibility: Space now advances the live emote. */
  public selectFocused(): void {
    this.playNextPreviewAnimation();
  }

  public playNextPreviewAnimation(): void {
    if (!this.openState || !this.preview.nextAnimation()) return;
    this.updateAnimationLabel();
  }

  public confirm(): void {
    if (!this.openState || !this.isSelectable(this.selectedId)) return;
    this.selection.select(this.selectedId);
    this.close();
  }

  public cancel(): void {
    if (!this.openState) return;
    const selected = this.definitionById(this.selection.getSelectedId());
    this.selectedId = selected?.id ?? this.definitions[0]!.id;
    this.focusedId = this.selectedId;
    this.close();
  }

  public getSnapshot(): CharacterPickerSnapshot {
    const entries = [...this.availability.entries()];
    return {
      open: this.openState,
      registeredCharacterIds: this.definitions.map(({ id }) => id),
      availableCharacterIds: idsWithStatus(entries, 'available'),
      fallbackCharacterIds: idsWithStatus(entries, 'fallback'),
      unavailableCharacterIds: idsWithStatus(entries, 'unavailable'),
      focusedCharacterId: this.focusedId,
      selectedCharacterId: this.selectedId,
      confirmedCharacterId: this.selection.getSelectedId(),
      previewState: this.previewState,
      preview: this.preview.getSnapshot(),
    };
  }

  public dispose(): void {
    this.disposed = true;
    this.previewVersion += 1;
    this.unsubscribeSelection?.();
    this.element.removeEventListener('click', this.onClick);
    this.preview.dispose();
    this.element.remove();
    this.mount.classList.remove('character-picker-open');
    this.input = undefined;
    this.state = undefined;
  }

  private startAvailabilityChecks(): void {
    for (const definition of this.definitions) {
      void this.availabilityProbe.check(definition).then((result) => {
        if (this.disposed) return;
        this.applyAvailability(definition.id, result);
      });
    }
  }

  private applyAvailability(
    id: string,
    result: CharacterAvailabilityResult,
  ): void {
    this.availability.set(id, result);
    if (result.status === 'unavailable' && this.selectedId === id) {
      const replacement = this.definitions.find((definition) =>
        this.isSelectable(definition.id),
      );
      if (replacement) {
        this.focusedId = replacement.id;
        this.selectedId = replacement.id;
        void this.loadFocusedPreview();
      }
    }
    if (this.openState) this.render();
  }

  private close(): void {
    if (!this.openState || !this.state) return;
    this.openState = false;
    this.previewVersion += 1;
    this.preview.clear();
    this.previewState = 'idle';
    this.element.hidden = true;
    this.mount.classList.remove('character-picker-open');
    this.state.transition(this.returnState);
  }

  private moveFocus(step: number): void {
    const index = this.definitions.findIndex(({ id }) => id === this.focusedId);
    const nextIndex =
      (index + (step % this.definitions.length) + this.definitions.length) %
      this.definitions.length;
    const next = this.definitions[nextIndex]!;
    this.focusedId = next.id;
    if (this.availability.get(next.id)?.status !== 'unavailable') {
      this.selectedId = next.id;
    }
    this.render();
    void this.loadFocusedPreview();
  }

  private async loadFocusedPreview(): Promise<void> {
    if (!this.openState) return;
    const definition = this.definitionById(this.focusedId);
    if (!definition) return;
    const version = ++this.previewVersion;
    this.previewState = 'loading';
    this.render();
    try {
      await this.preview.show(definition);
      if (version !== this.previewVersion || !this.openState) return;
      const snapshot = this.preview.getSnapshot();
      this.previewState =
        snapshot.status === 'fallback' ||
        this.availability.get(definition.id)?.status === 'fallback'
          ? 'fallback'
          : 'ready';
    } catch {
      if (version !== this.previewVersion || !this.openState) return;
      this.previewState = 'failed';
    }
    this.render();
  }

  private render(): void {
    if (!this.openState) return;
    const definition = this.definitionById(this.focusedId)!;
    const availability = this.availability.get(definition.id)!;

    this.element.replaceChildren();
    const shell = document.createElement('div');
    shell.className = 'character-picker__shell';

    const header = document.createElement('header');
    header.className = 'character-picker__header';
    const heading = document.createElement('div');
    const eyebrow = document.createElement('p');
    eyebrow.className = 'character-picker__eyebrow';
    eyebrow.textContent = 'Vanta City resident registry';
    const title = document.createElement('h1');
    title.id = 'character-picker-title';
    title.textContent = 'Choose your character';
    const intro = document.createElement('p');
    intro.textContent = 'One resident. One live preview. Confirm when ready.';
    heading.append(eyebrow, title, intro);
    const closeButton = this.actionButton('Cancel', 'cancel', 'quiet');
    closeButton.setAttribute('aria-label', 'Close character picker');
    header.append(heading, closeButton);

    const content = document.createElement('main');
    content.className = 'character-picker__content';
    const previous = this.arrowButton('←', 'previous', 'Previous character');
    const next = this.arrowButton('→', 'next', 'Next character');
    const previewPanel = this.createFocusedPreview(definition, availability);
    content.append(previous, previewPanel, next);

    const footer = document.createElement('footer');
    footer.className = 'character-picker__footer';
    const hints = document.createElement('p');
    hints.className = 'character-picker__hints';
    hints.textContent = `${bindingLabel('pickerPrevious')} / ${bindingLabel('pickerNext')} switch character  ·  ${bindingLabel('pickerSelect')} change pose  ·  ${bindingLabel('pickerConfirm')} confirm  ·  ${bindingLabel('pickerCancel')} cancel`;
    const actions = document.createElement('div');
    actions.append(
      this.actionButton('Preview next pose', 'preview-animation', 'quiet'),
      this.actionButton(
        `Enter as ${this.definitionById(this.selectedId)!.displayName}`,
        'confirm',
        'primary',
        !this.isSelectable(this.selectedId),
      ),
    );
    footer.append(hints, actions);
    shell.append(header, content, footer);
    this.element.append(shell);
  }

  private createFocusedPreview(
    definition: CharacterDefinition,
    availability: AvailabilityEntry,
  ): HTMLElement {
    const panel = document.createElement('article');
    panel.className = 'character-picker__preview';
    panel.dataset.characterId = definition.id;
    if (availability.status === 'unavailable') {
      panel.classList.add('is-unavailable');
    }

    const viewport = document.createElement('div');
    viewport.className = 'character-picker__viewport';
    viewport.append(this.preview.element);

    const copy = document.createElement('div');
    copy.className = 'character-picker__identity';
    const position = document.createElement('span');
    position.className = 'character-picker__position';
    position.textContent = `${this.definitions.findIndex(({ id }) => id === definition.id) + 1} / ${this.definitions.length}`;
    const name = document.createElement('h2');
    name.textContent = definition.displayName;
    const id = document.createElement('code');
    id.textContent = definition.id;
    const status = document.createElement('p');
    status.className = 'character-picker__preview-status';
    status.dataset.pickerPreviewStatus = '';
    status.setAttribute('aria-live', 'polite');
    status.textContent = this.statusText(availability);
    const animation = document.createElement('p');
    animation.className = 'character-picker__animation';
    animation.dataset.previewAnimation = '';
    animation.textContent = `Pose · ${displayAnimation(this.preview.getSnapshot().animation)}`;
    copy.append(position, name, id, status, animation);
    panel.append(viewport, copy);
    return panel;
  }

  private statusText(availability: AvailabilityEntry): string {
    if (availability.status === 'checking') {
      return 'Checking local model · loading live preview…';
    }
    if (availability.status === 'unavailable') {
      this.previewState = 'unavailable';
      return availability.reason ?? 'Character unavailable.';
    }
    if (this.previewState === 'loading') return 'Loading live 3D preview…';
    if (this.previewState === 'failed') return 'Preview failed to load.';
    if (
      this.previewState === 'fallback' ||
      availability.status === 'fallback'
    ) {
      return availability.reason ?? 'Emergency fallback preview active.';
    }
    return 'Local model ready · 24 embedded animations';
  }

  private arrowButton(
    label: string,
    action: 'previous' | 'next',
    accessibleName: string,
  ): HTMLButtonElement {
    const button = this.actionButton(label, action, 'arrow');
    button.setAttribute('aria-label', accessibleName);
    return button;
  }

  private actionButton(
    label: string,
    action: string,
    style: 'primary' | 'quiet' | 'arrow',
    disabled = false,
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `character-picker__button character-picker__button--${style}`;
    button.dataset.action = action;
    button.textContent = label;
    button.disabled = disabled;
    return button;
  }

  private definitionById(id: string): CharacterDefinition | undefined {
    return this.definitions.find((definition) => definition.id === id);
  }

  private isSelectable(id: string): boolean {
    const status = this.availability.get(id)?.status;
    return status === 'available' || status === 'fallback';
  }

  private focusAction(action: string): void {
    this.element
      .querySelector<HTMLButtonElement>(`button[data-action="${action}"]`)
      ?.focus({ preventScroll: true });
  }

  private updateAnimationLabel(): void {
    const label = this.element.querySelector<HTMLElement>(
      '[data-preview-animation]',
    );
    if (label) {
      label.textContent = `Pose · ${displayAnimation(this.preview.getSnapshot().animation)}`;
    }
  }

  private readonly onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;
    switch (action) {
      case 'previous':
        this.previous();
        this.focusAction('previous');
        break;
      case 'next':
        this.next();
        this.focusAction('next');
        break;
      case 'preview-animation':
        this.playNextPreviewAnimation();
        this.focusAction('preview-animation');
        break;
      case 'confirm':
        this.confirm();
        break;
      case 'cancel':
        this.cancel();
        break;
    }
  };
}

function idsWithStatus(
  entries: readonly [string, AvailabilityEntry][],
  status: CharacterAvailabilityStatus,
): string[] {
  return entries
    .filter(([, value]) => value.status === status)
    .map(([id]) => id);
}

function displayAnimation(name: string): string {
  if (name === 'previewIdle') return 'Neutral idle';
  return name.charAt(0).toUpperCase() + name.slice(1);
}
