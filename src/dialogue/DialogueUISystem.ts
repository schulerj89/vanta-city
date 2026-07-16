import type { GameSystem } from '../core/lifecycle';
import type { DialoguePortraitResolver } from './DialoguePortraitResolver';
import type { ResolvedDialoguePortrait } from './DialoguePortraitResolver';
import type { DialogueSessionController } from './DialogueSessionController';

export interface DialogueUIDebugSnapshot {
  readonly visible: boolean;
  readonly speakerName: string;
  readonly portraitResolution: string;
  readonly renderedText: string;
}

export class DialogueUISystem implements GameSystem {
  public readonly id = 'dialogue-ui';
  public readonly updateMode = 'always' as const;

  private readonly element = document.createElement('section');
  private readonly speakerName = document.createElement('h2');
  private readonly portrait = document.createElement('div');
  private readonly text = document.createElement('p');
  private readonly controls = document.createElement('div');
  private readonly continueButton = document.createElement('button');
  private readonly cancelButton = document.createElement('button');
  private renderedLineId: string | undefined;
  private portraitResolution = 'none';

  public constructor(
    private readonly mount: HTMLElement,
    private readonly session: DialogueSessionController,
    private readonly portraits: DialoguePortraitResolver,
  ) {}

  public init(): void {
    this.element.className = 'dialogue-box';
    this.element.hidden = true;
    this.element.dataset.testid = 'dialogue-box';
    this.element.setAttribute('aria-label', 'Dialogue');

    this.portrait.className = 'dialogue-box__portrait';
    this.portrait.setAttribute('aria-hidden', 'true');
    this.speakerName.className = 'dialogue-box__speaker';
    this.speakerName.dataset.testid = 'dialogue-speaker';
    this.text.className = 'dialogue-box__text';
    this.text.dataset.testid = 'dialogue-text';
    this.text.setAttribute('aria-live', 'polite');
    this.controls.className = 'dialogue-box__controls';
    this.continueButton.className = 'dialogue-box__continue';
    this.continueButton.type = 'button';
    this.continueButton.dataset.testid = 'dialogue-continue';
    this.continueButton.addEventListener('click', this.advance);
    this.cancelButton.className = 'dialogue-box__cancel';
    this.cancelButton.type = 'button';
    this.cancelButton.textContent = 'Cancel';
    this.cancelButton.setAttribute('aria-label', 'Cancel dialogue');
    this.cancelButton.dataset.testid = 'dialogue-cancel';
    this.cancelButton.addEventListener('click', this.cancel);
    for (const control of [this.continueButton, this.cancelButton]) {
      // Dialogue controls call the public session API directly. Keep their
      // mouse and keyboard edges out of the global gameplay input reader so a
      // single activation cannot also advance the next line or lock the camera.
      control.addEventListener('mousedown', stopPropagation);
      control.addEventListener('mouseup', stopPropagation);
      control.addEventListener('keydown', stopPropagation);
      control.addEventListener('keyup', stopPropagation);
    }
    this.controls.append(this.cancelButton, this.continueButton);

    const content = document.createElement('div');
    content.className = 'dialogue-box__content';
    content.append(this.speakerName, this.text, this.controls);
    this.element.append(this.portrait, content);
    this.mount.append(this.element);
  }

  public update(): void {
    const snapshot = this.session.getSnapshot();
    this.element.dataset.dialogueState = snapshot.state;
    if (snapshot.state === 'idle') {
      this.element.hidden = true;
      this.renderedLineId = undefined;
      this.portraitResolution = 'none';
      delete this.element.dataset.conversationId;
      delete this.element.dataset.lineIndex;
      delete this.element.dataset.speakerId;
      delete this.element.dataset.portraitResolution;
      return;
    }

    this.element.hidden = false;
    this.element.dataset.conversationId = snapshot.conversationId;
    this.element.dataset.lineIndex = String(snapshot.lineIndex);
    this.element.dataset.speakerId = snapshot.speakerId;
    if (snapshot.lineId !== this.renderedLineId) {
      this.renderedLineId = snapshot.lineId;
      const line = this.session.getCurrentLine();
      if (line) {
        this.speakerName.textContent = this.portraits.getSpeakerName(
          line.speakerId,
        );
        this.renderPortrait(this.portraits.resolve(line));
      }
    }
    this.text.textContent = snapshot.visibleText;
    const typing = snapshot.state === 'typing';
    this.continueButton.textContent = typing ? 'Reveal text' : 'Continue  ›';
    this.continueButton.dataset.action = typing ? 'reveal' : 'advance';
    this.continueButton.setAttribute(
      'aria-label',
      typing ? 'Reveal full dialogue line' : 'Continue dialogue',
    );
    this.cancelButton.hidden = !snapshot.canCancel;
  }

  public getDebugSnapshot(): DialogueUIDebugSnapshot {
    return {
      visible: !this.element.hidden,
      speakerName: this.speakerName.textContent ?? '',
      portraitResolution: this.portraitResolution,
      renderedText: this.text.textContent ?? '',
    };
  }

  public dispose(): void {
    this.element.remove();
    this.renderedLineId = undefined;
  }

  private renderPortrait(resolution: ResolvedDialoguePortrait): void {
    this.portrait.replaceChildren();
    this.portraitResolution = `${resolution.kind}:${resolution.source}`;
    this.element.dataset.portraitResolution = this.portraitResolution;
    if (resolution.kind === 'image' && resolution.src) {
      const image = document.createElement('img');
      image.src = resolution.src;
      image.alt = resolution.alt;
      image.addEventListener('error', () => {
        this.renderFallback(resolution.initials, 'fallback:image-error');
      });
      this.portrait.append(image);
      return;
    }
    this.renderFallback(resolution.initials, this.portraitResolution);
  }

  private renderFallback(initials: string, result: string): void {
    this.portrait.replaceChildren();
    const fallback = document.createElement('span');
    fallback.className = 'dialogue-box__portrait-fallback';
    fallback.textContent = initials;
    this.portrait.append(fallback);
    this.portraitResolution = result;
    this.element.dataset.portraitResolution = result;
  }

  private readonly advance = (): void => {
    // Honor the action that was visible when the user activated the control.
    // The typewriter may finish between a rendered "Reveal" label and click.
    if (this.continueButton.dataset.action === 'reveal') {
      this.session.skipTypewriter();
      return;
    }
    this.session.advance();
  };

  private readonly cancel = (): void => {
    this.session.cancel();
  };
}

function stopPropagation(event: Event): void {
  event.stopPropagation();
}
