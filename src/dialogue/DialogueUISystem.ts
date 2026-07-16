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
  private readonly continueIndicator = document.createElement('span');
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
    this.continueIndicator.className = 'dialogue-box__continue';
    this.continueIndicator.textContent = 'Continue  ›';
    this.continueIndicator.dataset.testid = 'dialogue-continue';

    const content = document.createElement('div');
    content.className = 'dialogue-box__content';
    content.append(this.speakerName, this.text, this.continueIndicator);
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
    this.continueIndicator.hidden = snapshot.state !== 'ready';
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
}
