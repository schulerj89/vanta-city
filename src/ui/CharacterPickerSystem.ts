import type { AssetCatalog } from '../assets/AssetCatalog';
import type { GameState, GameStateMachine } from '../core/gameState';
import type { GameSystem } from '../core/lifecycle';
import type { GameContext } from '../game/GameRuntime';
import type { InputReader } from '../input/InputSystem';
import type {
  CharacterAvailabilityProbe,
  CharacterAvailabilityResult,
  CharacterAvailabilityStatus,
} from '../characters/CharacterAvailability';
import { resolveCharacterPortrait } from '../characters/CharacterAvailability';
import type { CharacterDefinition } from '../characters/CharacterDefinition';
import type { CharacterSelectionStore } from '../characters/CharacterSelection';

export type CharacterPickerPreviewState =
  'idle' | 'checking' | 'loading' | 'ready' | 'unavailable' | 'failed';

export interface CharacterPickerSnapshot {
  readonly open: boolean;
  readonly registeredCharacterIds: readonly string[];
  readonly availableCharacterIds: readonly string[];
  readonly unavailableCharacterIds: readonly string[];
  readonly focusedCharacterId: string;
  readonly selectedCharacterId: string;
  readonly confirmedCharacterId: string;
  readonly previewState: CharacterPickerPreviewState;
}

interface AvailabilityEntry {
  readonly status: CharacterAvailabilityStatus;
  readonly reason?: string;
}

export class CharacterPickerSystem implements GameSystem {
  public readonly id = 'character-picker';
  public readonly updateMode = 'always' as const;

  private readonly element = document.createElement('section');
  private readonly availability = new Map<string, AvailabilityEntry>();
  private readonly portraitStatus = new Map<
    string,
    'unknown' | 'ready' | 'failed'
  >();
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
    private readonly catalog: AssetCatalog,
    private readonly availabilityProbe: CharacterAvailabilityProbe,
  ) {
    this.focusedId = selection.getSelectedId();
    this.selectedId = selection.getSelectedId();
    for (const definition of selection.definitions) {
      this.availability.set(definition.id, { status: 'checking' });
      this.portraitStatus.set(definition.id, 'unknown');
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
      if (!this.openState) {
        this.focusedId = this.selection.getSelectedId();
        this.selectedId = this.selection.getSelectedId();
      }
      if (this.openState) this.render();
    });
    this.startAvailabilityChecks();
  }

  public update(): void {
    if (!this.input) return;
    if (!this.openState) {
      if (this.input.wasPressed('openCharacterPicker')) this.open();
      return;
    }
    if (this.input.wasPressed('pickerPrevious')) this.previous();
    if (this.input.wasPressed('pickerNext')) this.next();
    if (this.input.wasPressed('pickerSelect')) this.selectFocused();
    if (this.input.wasPressed('pickerConfirm')) this.confirm();
    if (this.input.wasPressed('pickerCancel')) this.cancel();
  }

  public open(): void {
    if (this.openState || !this.state) return;
    const current = this.state.current;
    if (current === 'booting' || current === 'character-select') return;
    this.returnState = current;
    this.focusedId = this.selection.getSelectedId();
    this.selectedId = this.selection.getSelectedId();
    this.openState = true;
    this.element.hidden = false;
    this.mount.classList.add('character-picker-open');
    this.state.transition('character-select');
    void document.exitPointerLock?.();
    this.render();
    this.focusCard();
  }

  public previous(): void {
    this.moveFocus(-1);
  }

  public next(): void {
    this.moveFocus(1);
  }

  public focusCharacter(id: string): void {
    if (!this.definitionById(id)) return;
    this.focusedId = id;
    this.render();
    this.focusCard();
  }

  public selectFocused(): void {
    if (!this.isAvailable(this.focusedId)) return;
    this.selectedId = this.focusedId;
    this.render();
    this.focusCard();
  }

  public confirm(): void {
    if (!this.openState || !this.isAvailable(this.selectedId)) return;
    this.selection.select(this.selectedId);
    this.close();
  }

  public cancel(): void {
    if (!this.openState) return;
    this.selectedId = this.selection.getSelectedId();
    this.focusedId = this.selectedId;
    this.close();
  }

  public getSnapshot(): CharacterPickerSnapshot {
    const entries = [...this.availability.entries()];
    return {
      open: this.openState,
      registeredCharacterIds: this.selection.definitions.map(({ id }) => id),
      availableCharacterIds: entries
        .filter(([, value]) => value.status === 'available')
        .map(([id]) => id),
      unavailableCharacterIds: entries
        .filter(([, value]) => value.status === 'unavailable')
        .map(([id]) => id),
      focusedCharacterId: this.focusedId,
      selectedCharacterId: this.selectedId,
      confirmedCharacterId: this.selection.getSelectedId(),
      previewState: this.previewState,
    };
  }

  public dispose(): void {
    this.disposed = true;
    this.previewVersion += 1;
    this.unsubscribeSelection?.();
    this.element.removeEventListener('click', this.onClick);
    this.element.remove();
    this.mount.classList.remove('character-picker-open');
    this.input = undefined;
    this.state = undefined;
  }

  private startAvailabilityChecks(): void {
    for (const definition of this.selection.definitions) {
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
    if (this.openState) this.render();
  }

  private close(): void {
    if (!this.openState || !this.state) return;
    this.openState = false;
    this.previewVersion += 1;
    this.previewState = 'idle';
    this.element.hidden = true;
    this.mount.classList.remove('character-picker-open');
    this.state.transition(this.returnState);
  }

  private moveFocus(step: number): void {
    const definitions = this.selection.definitions;
    const index = definitions.findIndex(({ id }) => id === this.focusedId);
    const nextIndex =
      (index + (step % definitions.length) + definitions.length) %
      definitions.length;
    this.focusedId = definitions[nextIndex]!.id;
    this.render();
    this.focusCard();
  }

  private render(): void {
    if (!this.openState) return;
    const version = ++this.previewVersion;
    const selected = this.definitionById(this.selectedId)!;
    const focused = this.definitionById(this.focusedId)!;
    const selectedAvailability = this.availability.get(selected.id)!;

    this.element.replaceChildren();
    const shell = document.createElement('div');
    shell.className = 'character-picker__shell';

    const header = document.createElement('header');
    header.className = 'character-picker__header';
    const titleGroup = document.createElement('div');
    const eyebrow = document.createElement('p');
    eyebrow.className = 'character-picker__eyebrow';
    eyebrow.textContent = 'Vanta City resident registry';
    const title = document.createElement('h1');
    title.id = 'character-picker-title';
    title.textContent = 'Choose your character';
    const intro = document.createElement('p');
    intro.textContent =
      'Pick a registered resident before entering the debug district.';
    titleGroup.append(eyebrow, title, intro);
    const closeButton = this.actionButton('Cancel', 'cancel', 'quiet');
    closeButton.setAttribute('aria-label', 'Close character picker');
    header.append(titleGroup, closeButton);

    const content = document.createElement('div');
    content.className = 'character-picker__content';
    const preview = this.createPreview(selected, selectedAvailability, version);
    const browser = document.createElement('div');
    browser.className = 'character-picker__browser';
    const browserHeading = document.createElement('div');
    browserHeading.className = 'character-picker__browser-heading';
    const heading = document.createElement('h2');
    heading.textContent = 'Registered characters';
    const count = document.createElement('span');
    count.textContent = `${this.selection.definitions.length} options`;
    browserHeading.append(heading, count);

    const grid = document.createElement('div');
    grid.className = 'character-picker__grid';
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', 'Registered characters');
    for (const definition of this.selection.definitions) {
      grid.append(this.createCard(definition));
    }

    const browseControls = document.createElement('div');
    browseControls.className = 'character-picker__browse-controls';
    browseControls.append(
      this.actionButton('← Previous', 'previous', 'quiet'),
      this.actionButton(
        focused.id === selected.id
          ? 'Selected'
          : `Select ${focused.displayName}`,
        'select',
        'secondary',
        !this.isAvailable(focused.id) || focused.id === selected.id,
      ),
      this.actionButton('Next →', 'next', 'quiet'),
    );
    browser.append(browserHeading, grid, browseControls);
    content.append(preview, browser);

    const footer = document.createElement('footer');
    footer.className = 'character-picker__footer';
    const hints = document.createElement('p');
    hints.className = 'character-picker__hints';
    hints.textContent =
      '← → browse  ·  Space select  ·  Enter confirm  ·  Esc cancel';
    const footerActions = document.createElement('div');
    footerActions.append(
      this.actionButton('Return to district', 'cancel', 'quiet'),
      this.actionButton(
        `Enter as ${selected.displayName}`,
        'confirm',
        'primary',
        selectedAvailability.status !== 'available',
      ),
    );
    footer.append(hints, footerActions);
    shell.append(header, content, footer);
    this.element.append(shell);
  }

  private createPreview(
    definition: CharacterDefinition,
    availability: AvailabilityEntry,
    version: number,
  ): HTMLElement {
    const panel = document.createElement('article');
    panel.className = 'character-picker__preview';
    panel.dataset.characterId = definition.id;
    const portrait = this.createPortrait(
      definition,
      availability.status === 'available',
      version,
    );
    portrait.classList.add('character-picker__portrait--large');

    const copy = document.createElement('div');
    const label = document.createElement('p');
    label.className = 'character-picker__eyebrow';
    label.textContent = 'Current selection';
    const name = document.createElement('h2');
    name.textContent = definition.displayName;
    const id = document.createElement('code');
    id.textContent = definition.id;
    const status = document.createElement('p');
    status.className = 'character-picker__preview-status';
    status.dataset.pickerPreviewStatus = '';
    status.setAttribute('aria-live', 'polite');
    copy.append(label, name, id, status);
    panel.append(portrait, copy);

    if (availability.status === 'checking') {
      this.previewState = 'checking';
      status.textContent = 'Checking local character files…';
      panel.setAttribute('aria-busy', 'true');
    } else if (availability.status === 'unavailable') {
      this.previewState = 'unavailable';
      status.textContent = availability.reason ?? 'Character unavailable.';
      panel.classList.add('is-unavailable');
    } else {
      const portraitSource = resolveCharacterPortrait(definition, this.catalog);
      const portraitStatus = this.portraitStatus.get(definition.id);
      if (portraitSource.kind === 'asset' && portraitStatus !== 'ready') {
        this.previewState = portraitStatus === 'failed' ? 'failed' : 'loading';
        status.textContent =
          portraitStatus === 'failed'
            ? 'Portrait failed to load — using generated treatment.'
            : 'Loading portrait…';
      } else {
        this.previewState = 'ready';
        status.textContent =
          portraitSource.kind === 'asset'
            ? 'Portrait ready · character available'
            : 'Generated portrait · character available';
      }
    }
    return panel;
  }

  private createCard(definition: CharacterDefinition): HTMLButtonElement {
    const availability = this.availability.get(definition.id)!;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'character-picker__card';
    card.dataset.action = 'character';
    card.dataset.characterId = definition.id;
    card.setAttribute('aria-label', this.cardLabel(definition, availability));
    card.setAttribute(
      'aria-current',
      definition.id === this.selectedId ? 'true' : 'false',
    );
    card.setAttribute(
      'aria-pressed',
      definition.id === this.selectedId ? 'true' : 'false',
    );
    card.setAttribute(
      'aria-disabled',
      availability.status === 'unavailable' ? 'true' : 'false',
    );
    if (availability.status === 'checking')
      card.setAttribute('aria-busy', 'true');
    card.classList.toggle('is-focused', definition.id === this.focusedId);
    card.classList.toggle('is-selected', definition.id === this.selectedId);
    card.classList.toggle(
      'is-unavailable',
      availability.status === 'unavailable',
    );

    const portrait = this.createPortrait(
      definition,
      false,
      this.previewVersion,
    );
    const copy = document.createElement('span');
    copy.className = 'character-picker__card-copy';
    const name = document.createElement('strong');
    name.textContent = definition.displayName;
    const status = document.createElement('small');
    status.textContent =
      availability.status === 'checking'
        ? 'Checking files…'
        : availability.status === 'unavailable'
          ? 'Unavailable'
          : definition.id === this.selectedId
            ? 'Selected'
            : 'Available';
    copy.append(name, status);
    card.append(portrait, copy);
    return card;
  }

  private createPortrait(
    definition: CharacterDefinition,
    trackPreview: boolean,
    version: number,
  ): HTMLElement {
    const frame = document.createElement('span');
    frame.className = 'character-picker__portrait';
    frame.style.setProperty('--portrait-hue', String(hueFor(definition.id)));

    const generated = document.createElement('span');
    generated.className = 'character-picker__portrait-generated';
    generated.setAttribute('aria-hidden', 'true');
    const silhouette = document.createElement('span');
    silhouette.className = 'character-picker__silhouette';
    const initials = document.createElement('span');
    initials.className = 'character-picker__initials';
    initials.textContent = initialsFor(definition.displayName);
    generated.append(silhouette, initials);
    frame.append(generated);

    const source = resolveCharacterPortrait(definition, this.catalog);
    if (
      source.kind !== 'asset' ||
      this.portraitStatus.get(definition.id) === 'failed'
    ) {
      return frame;
    }
    const image = document.createElement('img');
    image.alt = `${definition.displayName} portrait`;
    image.loading = trackPreview ? 'eager' : 'lazy';
    image.src = source.url!;
    image.addEventListener('load', () => {
      this.portraitStatus.set(definition.id, 'ready');
      frame.classList.add('has-image');
      if (trackPreview && version === this.previewVersion) {
        this.previewState = 'ready';
        this.updatePreviewStatus('Portrait ready · character available');
      }
    });
    image.addEventListener('error', () => {
      this.portraitStatus.set(definition.id, 'failed');
      frame.classList.remove('has-image');
      if (trackPreview && version === this.previewVersion) {
        this.previewState = 'failed';
        this.updatePreviewStatus(
          'Portrait failed to load — using generated treatment.',
        );
      }
    });
    frame.append(image);
    return frame;
  }

  private actionButton(
    label: string,
    action: string,
    style: 'primary' | 'secondary' | 'quiet',
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

  private cardLabel(
    definition: CharacterDefinition,
    availability: AvailabilityEntry,
  ): string {
    const state =
      availability.status === 'checking'
        ? 'checking availability'
        : availability.status;
    const selected = definition.id === this.selectedId ? ', selected' : '';
    return `${definition.displayName}, ${state}${selected}`;
  }

  private definitionById(id: string): CharacterDefinition | undefined {
    return this.selection.definitions.find(
      (definition) => definition.id === id,
    );
  }

  private isAvailable(id: string): boolean {
    return this.availability.get(id)?.status === 'available';
  }

  private focusCard(): void {
    const card = this.element.querySelector<HTMLButtonElement>(
      `button[data-character-id="${this.focusedId}"]`,
    );
    card?.focus({ preventScroll: true });
  }

  private updatePreviewStatus(message: string): void {
    const status = this.element.querySelector<HTMLElement>(
      '[data-picker-preview-status]',
    );
    if (status) status.textContent = message;
  }

  private readonly onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const control = target.closest<HTMLElement>('[data-action]');
    const action = control?.dataset.action;
    if (!action) return;
    switch (action) {
      case 'character': {
        const id = control.dataset.characterId;
        if (!id) return;
        this.focusedId = id;
        if (this.isAvailable(id)) this.selectedId = id;
        this.render();
        this.focusCard();
        break;
      }
      case 'previous':
        this.previous();
        break;
      case 'next':
        this.next();
        break;
      case 'select':
        this.selectFocused();
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

function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function hueFor(id: string): number {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return Math.abs(hash) % 360;
}
