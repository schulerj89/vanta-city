import type { GameSystem } from '../core/lifecycle';
import type { GameContext, GameRuntime } from '../game/GameRuntime';
import type { HelpControlEntry } from '../input/defaultBindings';
import type { AccessibilityPreferenceStore } from '../accessibility/AccessibilityPreferences';
import type {
  HelpOverlaySnapshot,
  HelpOverlaySystem,
} from './HelpOverlaySystem';

export interface HelpOverlayController {
  open(): void;
  close(): void;
  getSnapshot(): HelpOverlaySnapshot;
}

/** Keeps the help panel out of the startup graph until the player requests it. */
export class LazyHelpOverlaySystem
  implements GameSystem<GameContext>, HelpOverlayController
{
  public readonly id = 'help-overlay';
  public readonly updateMode = 'always' as const;

  private readonly button = document.createElement('button');
  private context: GameContext | undefined;
  private delegate: HelpOverlaySystem | undefined;
  private loading: Promise<HelpOverlaySystem | undefined> | undefined;
  private unsubscribeState: (() => void) | undefined;
  private disposed = false;

  public constructor(
    private readonly mount: HTMLElement,
    private readonly runtime: GameRuntime,
    private readonly controls: readonly HelpControlEntry[],
    private readonly preferences?: AccessibilityPreferenceStore,
  ) {}

  public init(context: GameContext): void {
    this.context = context;
    this.button.type = 'button';
    this.button.className = 'help-button';
    this.button.textContent = 'Help';
    this.button.setAttribute('aria-haspopup', 'dialog');
    this.button.addEventListener('click', this.openFromButton);
    this.mount.append(this.button);
    this.unsubscribeState = context.events.on(
      'game-state:changed',
      this.updateAvailability,
    );
    this.updateAvailability();
  }

  public update(): void {
    this.delegate?.update();
    if (!this.delegate && this.context?.input.wasPressed('toggleHelp')) {
      this.open();
    }
  }

  public open(): void {
    if (!this.canOpen()) return;
    if (this.delegate) {
      this.delegate.open();
      return;
    }
    void this.loadAndOpen();
  }

  public close(): void {
    this.delegate?.close();
  }

  public getSnapshot(): HelpOverlaySnapshot {
    return (
      this.delegate?.getSnapshot() ?? {
        open: false,
        openedFromPlaying: false,
        focusedElement: undefined,
        preferences: this.preferences?.current,
      }
    );
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeState?.();
    this.unsubscribeState = undefined;
    this.button.removeEventListener('click', this.openFromButton);
    this.button.remove();
    this.delegate?.dispose();
    this.delegate = undefined;
    this.context = undefined;
  }

  private async loadAndOpen(): Promise<void> {
    if (!this.loading) {
      this.loading = import('./HelpOverlaySystem').then(
        ({ HelpOverlaySystem }) => {
          if (this.disposed || !this.context) return undefined;
          this.button.remove();
          const help = new HelpOverlaySystem(
            this.mount,
            this.runtime,
            this.controls,
            this.preferences,
          );
          help.init(this.context);
          this.delegate = help;
          return help;
        },
      );
    }
    const help = await this.loading;
    if (!help || this.disposed || !this.canOpen()) return;
    this.mount.querySelector<HTMLButtonElement>('.help-button')?.focus();
    help.open();
  }

  private canOpen(): boolean {
    return (
      !this.disposed &&
      (this.runtime.state.current === 'playing' ||
        this.runtime.state.current === 'paused')
    );
  }

  private readonly openFromButton = (event: MouseEvent): void => {
    event.stopPropagation();
    this.open();
  };

  private readonly updateAvailability = (): void => {
    this.button.disabled = !this.canOpen();
    this.button.hidden = !this.canOpen();
  };
}
