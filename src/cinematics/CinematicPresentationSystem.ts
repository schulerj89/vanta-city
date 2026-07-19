import type { GameSystem } from '../core/lifecycle';
import type { CinematicCoordinator } from './CinematicCoordinator';

export class CinematicPresentationSystem implements GameSystem {
  public readonly id = 'cinematic-presentation';
  public readonly updateMode = 'always' as const;
  private readonly root = document.createElement('section');
  private readonly speaker = document.createElement('p');
  private readonly text = document.createElement('p');
  private readonly skipHint = document.createElement('p');
  private readonly confirm = document.createElement('section');
  private readonly confirmButton = document.createElement('button');
  private readonly cancelButton = document.createElement('button');
  private readonly confirmationActions = document.createElement('div');
  private focusedConfirmation = false;

  public constructor(
    private readonly presentationMount: HTMLElement,
    private readonly modalMount: HTMLElement,
    private readonly coordinator: CinematicCoordinator,
    private readonly speakerName: (id: string) => string,
  ) {}

  public init(): void {
    this.root.className = 'cinematic-presentation';
    this.root.hidden = true;
    this.root.dataset.testid = 'cinematic-presentation';
    this.root.setAttribute('aria-label', 'Cinematic subtitles');
    this.speaker.className = 'cinematic-presentation__speaker';
    this.text.className = 'cinematic-presentation__text';
    this.text.setAttribute('aria-live', 'polite');
    this.skipHint.className = 'cinematic-presentation__hint';
    this.skipHint.textContent = 'Esc · Skip scene';
    this.root.append(this.speaker, this.text, this.skipHint);

    this.confirm.className = 'cinematic-skip-confirmation';
    this.confirm.hidden = true;
    this.confirm.dataset.testid = 'cinematic-skip-confirmation';
    this.confirm.setAttribute('role', 'dialog');
    this.confirm.setAttribute('aria-modal', 'true');
    this.confirm.setAttribute('aria-labelledby', 'cinematic-skip-title');
    const title = document.createElement('h2');
    title.id = 'cinematic-skip-title';
    title.textContent = 'Skip this scene?';
    const detail = document.createElement('p');
    detail.textContent =
      'The current mission remains active. Only this presentation will end.';
    this.confirmButton.type = 'button';
    this.confirmButton.textContent = 'Skip scene';
    this.confirmButton.dataset.testid = 'cinematic-skip-confirm';
    this.cancelButton.type = 'button';
    this.cancelButton.textContent = 'Keep watching';
    this.cancelButton.dataset.testid = 'cinematic-skip-cancel';
    this.confirmButton.addEventListener('click', this.confirmSkip);
    this.cancelButton.addEventListener('click', this.cancelSkip);
    this.confirmationActions.className = 'cinematic-skip-confirmation__actions';
    this.confirmationActions.append(this.confirmButton, this.cancelButton);
    this.confirm.append(title, detail, this.confirmationActions);
    this.presentationMount.append(this.root);
    this.modalMount.append(this.confirm);
  }

  public update(): void {
    const snapshot = this.coordinator.getSnapshot();
    const active = snapshot.state !== 'idle';
    const landing = snapshot.state === 'landing';
    const destinationShotVisible =
      landing && snapshot.destinationReadiness === 'ready';
    this.root.hidden = !active || destinationShotVisible;
    this.root.dataset.state = snapshot.state;
    this.root.dataset.shotId = snapshot.shotId ?? '';
    this.speaker.textContent = landing
      ? 'Ashfall Junction'
      : snapshot.speakerId
        ? this.speakerName(snapshot.speakerId)
        : '';
    this.text.textContent = landing
      ? snapshot.destinationReadiness === 'failed'
        ? 'The local destination could not be prepared.'
        : 'Preparing the local district, collision, and arrival point…'
      : snapshot.subtitleText;
    this.skipHint.hidden = landing;
    const confirming = snapshot.state === 'confirming-skip';
    this.confirm.hidden = !confirming;
    if (confirming && !this.focusedConfirmation) {
      this.focusedConfirmation = true;
      this.cancelButton.focus({ preventScroll: true });
    } else if (!confirming) this.focusedConfirmation = false;
  }

  public dispose(): void {
    this.confirmButton.removeEventListener('click', this.confirmSkip);
    this.cancelButton.removeEventListener('click', this.cancelSkip);
    this.root.remove();
    this.confirm.remove();
  }

  private readonly confirmSkip = () => this.coordinator.confirmSkip();
  private readonly cancelSkip = () => this.coordinator.cancelSkip();
}
