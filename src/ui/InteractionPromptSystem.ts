import type { GameSystem } from '../core/lifecycle';
import type { InteractionSystem } from '../interactions/InteractionSystem';
import { bindingLabel } from '../input/defaultBindings';

export class InteractionPromptSystem implements GameSystem {
  public readonly id = 'interaction-prompt';
  public readonly updateMode = 'always' as const;

  private readonly element = document.createElement('div');
  private unsubscribe: (() => void) | undefined;

  public constructor(
    private readonly mount: HTMLElement,
    private readonly interactions: InteractionSystem,
  ) {}

  public init(): void {
    this.element.className = 'interaction-prompt';
    this.element.hidden = true;
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-live', 'polite');
    this.mount.append(this.element);
    this.unsubscribe = this.interactions.events.on(
      'interaction:target-changed',
      ({ target }) => {
        this.element.hidden = target === undefined;
        this.element.textContent = target
          ? `[${bindingLabel('interact')}] ${target.prompt}`
          : '';
      },
    );
  }

  public dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.element.remove();
  }
}
