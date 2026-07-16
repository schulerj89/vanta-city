import type { AssetLoadStatus, GameAssetLoader } from '../assets/AssetLoader';
import type { GameSystem } from '../core/lifecycle';
import type { CharacterDefinition } from '../characters/CharacterDefinition';
import type { CharacterPreviewController } from '../characters/CharacterPreviewSystem';
import type { CharacterSelectionStore } from '../characters/CharacterSelection';

export class CharacterSelectorSystem implements GameSystem {
  public readonly id = 'character-selector';
  public readonly updateMode = 'always' as const;

  private readonly element = document.createElement('section');
  private readonly select = document.createElement('select');
  private readonly status = document.createElement('p');
  private readonly rotation = document.createElement('input');
  private readonly autoRotate = document.createElement('input');
  private unsubscribeAssetStatus: (() => void) | undefined;
  private unsubscribeSelection: (() => void) | undefined;

  public constructor(
    private readonly mount: HTMLElement,
    private readonly selection: CharacterSelectionStore,
    private readonly assets: GameAssetLoader,
    private readonly preview?: CharacterPreviewController,
  ) {}

  public init(): void {
    this.element.className = 'character-selector';
    this.element.setAttribute(
      'aria-label',
      this.preview ? 'Character preview controls' : 'Character controls',
    );

    const heading = document.createElement('h1');
    heading.textContent = this.preview ? 'Character Preview' : 'Character';
    const characterLabel = document.createElement('label');
    characterLabel.textContent = 'Character';
    characterLabel.append(this.select);

    for (const definition of this.selection.definitions) {
      const option = document.createElement('option');
      option.value = definition.id;
      option.textContent = definition.displayName;
      this.select.append(option);
    }
    this.select.value = this.selection.getSelectedId();

    const rotationLabel = document.createElement('label');
    rotationLabel.textContent = 'Rotation';
    this.rotation.type = 'range';
    this.rotation.min = String(-Math.PI);
    this.rotation.max = String(Math.PI);
    this.rotation.step = '0.01';
    this.rotation.value = '0';
    rotationLabel.append(this.rotation);

    const autoLabel = document.createElement('label');
    autoLabel.className = 'character-selector__toggle';
    this.autoRotate.type = 'checkbox';
    this.autoRotate.checked = true;
    autoLabel.append(this.autoRotate, document.createTextNode('Auto rotate'));

    this.status.className = 'character-selector__status';
    this.element.append(heading, characterLabel);
    if (this.preview) this.element.append(rotationLabel, autoLabel);
    this.element.append(this.status);
    this.mount.append(this.element);

    this.select.addEventListener('change', this.onCharacterChange);
    if (this.preview) {
      this.rotation.addEventListener('input', this.onRotationInput);
      this.autoRotate.addEventListener('change', this.onAutoRotateChange);
    }
    this.unsubscribeSelection = this.selection.onSelectionChanged(
      (definition) => {
        this.select.value = definition.id;
        this.updateStatus(definition);
      },
    );
    this.unsubscribeAssetStatus = this.assets.onStatus((status) => {
      this.updateAssetStatus(status);
    });
    this.updateStatus(this.selection.getSelectedDefinition());
  }

  public dispose(): void {
    this.select.removeEventListener('change', this.onCharacterChange);
    this.rotation.removeEventListener('input', this.onRotationInput);
    this.autoRotate.removeEventListener('change', this.onAutoRotateChange);
    this.unsubscribeSelection?.();
    this.unsubscribeAssetStatus?.();
    this.element.remove();
  }

  private readonly onCharacterChange = (): void => {
    this.selection.select(this.select.value);
  };

  private readonly onRotationInput = (): void => {
    this.preview?.setRotation(Number(this.rotation.value));
  };

  private readonly onAutoRotateChange = (): void => {
    this.preview?.setAutoRotate(this.autoRotate.checked);
  };

  private updateStatus(definition: CharacterDefinition): void {
    if (!definition.modelAssetId) {
      this.status.textContent = 'Repository-safe primitive preview';
      return;
    }
    try {
      this.updateAssetStatus(this.assets.getStatus(definition.modelAssetId));
    } catch {
      this.status.textContent = 'Model unavailable — showing placeholder';
    }
  }

  private updateAssetStatus(status: AssetLoadStatus): void {
    const selected = this.selection.getSelectedDefinition();
    if (selected.modelAssetId !== status.id) return;
    switch (status.phase) {
      case 'idle':
        this.status.textContent = 'Model ready to load';
        break;
      case 'loading':
        this.status.textContent =
          status.progress > 0
            ? `Loading model ${Math.round(status.progress * 100)}%`
            : 'Loading model…';
        break;
      case 'loaded':
        this.status.textContent = 'Model loaded';
        break;
      case 'error':
        this.status.textContent = 'Model unavailable — showing placeholder';
        break;
    }
  }
}
