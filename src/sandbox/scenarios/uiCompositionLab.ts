import './uiCompositionLab.css';
import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
} from 'three';
import type { BufferGeometry, Material, Object3D } from 'three';
import type { GameSystem } from '../../core/lifecycle';
import type { GameContext } from '../../game/GameRuntime';
import type { ScreenSpaceLayoutSystem } from '../../ui/ScreenSpaceLayoutSystem';
import type { SandboxContext, SandboxScenario } from '../SandboxScenario';
import { uiCompositionPresentationFixtures } from './uiCompositionFixtures';
import type { UiLabState } from './uiCompositionFixtures';

export { uiCompositionPresentationFixtures } from './uiCompositionFixtures';
export type { UiLabState } from './uiCompositionFixtures';
export type UiLabBackground = 'bright' | 'dark' | 'noisy';

export interface UiCompositionLabSnapshot {
  readonly state: UiLabState;
  readonly background: UiLabBackground;
  readonly enlargedText: boolean;
  readonly reducedMotion: boolean;
  readonly safeArea: boolean;
  readonly unavailableReason: string | undefined;
}

export interface UiCompositionLabApi {
  snapshot(): UiCompositionLabSnapshot;
  apply(options: Partial<UiCompositionLabSnapshot>): void;
}

declare global {
  interface Window {
    __VANTA_UI_LAB__?: UiCompositionLabApi;
  }
}

class UiCompositionLabSystem implements GameSystem<GameContext> {
  public readonly id = 'sandbox-ui-composition-lab';
  private readonly stage = new Group();
  private readonly layout: ScreenSpaceLayoutSystem;
  private readonly panel = document.createElement('form');
  private readonly live = document.createElement('p');
  private fixtureRoots: HTMLElement[] = [];
  private current: UiCompositionLabSnapshot = {
    state: 'exploration',
    background: 'bright',
    enlargedText: false,
    reducedMotion: false,
    safeArea: false,
    unavailableReason: undefined,
  };

  public constructor(private readonly context: SandboxContext) {
    this.layout = context.uiLayout;
  }

  public init(): void {
    this.installStage();
    this.buildPanel();
    this.context.mount.classList.add('ui-composition-lab-active');
    this.context.mount.append(this.panel);
    const params = new URLSearchParams(window.location.search);
    this.current = {
      ...this.current,
      state: parseState(params.get('uiState')),
      background: parseBackground(params.get('uiBackground')),
      enlargedText: params.get('uiText') === 'large',
      reducedMotion: params.get('uiMotion') === 'reduced',
      safeArea: params.get('uiSafeArea') === '1',
    };
    if (params.get('labPanel') === '0') this.panel.hidden = true;
    this.apply(this.current);
    window.__VANTA_UI_LAB__ = {
      snapshot: () => ({ ...this.current }),
      apply: (options) => this.apply(options),
    };
  }

  public dispose(): void {
    delete window.__VANTA_UI_LAB__;
    this.panel.remove();
    this.context.mount.classList.remove('ui-composition-lab-active');
    this.context.mount.removeAttribute('data-ui-lab-background');
    this.context.scene.remove(this.stage);
    disposeTree(this.stage);
  }

  private apply(options: Partial<UiCompositionLabSnapshot>): void {
    const state = options.state ?? this.current.state;
    this.current = {
      ...this.current,
      ...options,
      state,
      unavailableReason:
        uiCompositionPresentationFixtures[state].unavailableReason,
    };
    this.context.mount.dataset.uiLabBackground = this.current.background;
    this.layout.element.dataset.labState = this.current.state;
    this.layout.element.dataset.labReducedMotion = String(
      this.current.reducedMotion,
    );
    this.layout.element.dataset.labSafeArea = String(this.current.safeArea);
    this.layout.element.style.setProperty(
      '--ui-text-scale',
      this.current.enlargedText ? '1.25' : '1',
    );
    this.syncStage();
    this.renderFixtures();
    this.syncPanel();
    this.live.textContent = `${label(state)} composition selected${uiCompositionPresentationFixtures[state].supported ? '' : ', unavailable'}.`;
  }

  private renderFixtures(): void {
    for (const root of this.fixtureRoots) root.remove();
    this.fixtureRoots = [];
    if (this.current.unavailableReason) {
      this.add(
        'objectives',
        html(`
          <section class="ui-lab-unavailable" role="status">
            <p class="ui-lab-kicker">Dependency pending · unavailable</p>
            <h1>${label(this.current.state)}</h1>
            <p>${this.current.unavailableReason}</p>
          </section>`),
      );
      return;
    }

    this.add(
      'player-status',
      html(`<div class="player-hud-cluster" aria-label="Player status">
        <section class="money-hud"><output class="money-hud__balance">$ 001,984</output></section>
        <section class="health-hud__bar health-hud__player" aria-label="Player health: ${this.current.state === 'combat' ? '28' : '82'} of 100" data-depleted="false">
          <strong>${this.current.state === 'combat' ? 'HEALTH · WARNING' : 'HEALTH'}</strong>
          <div class="health-hud__track"><div class="health-hud__fill" style="transform:scaleX(${this.current.state === 'combat' ? '.28' : '.82'})"></div></div>
        </section>
      </div>`),
    );
    this.add(
      'navigation',
      html(`<div class="ui-lab-navigation-fixture"><aside class="minimap-hud" aria-label="District minimap">
        <strong class="minimap-hud__title">Ashfall Junction</strong>
        <svg class="minimap-hud__map" viewBox="0 0 100 100" role="img" aria-label="North-up map, player near Relay Row">
          <path d="M0 58h100M44 0v100" stroke="#525d5d" stroke-width="16"/>
          <path d="M0 58h100M44 0v100" stroke="#a8a58e" stroke-width="2" stroke-dasharray="5 5"/>
          <path class="minimap-hud__player" d="M44 41l4 8-4-2-4 2z"/>
        </svg>
      </aside>
      <aside class="location-hud" aria-label="Current location"><strong class="location-hud__name">Relay Row</strong><output class="location-hud__coordinates">X +4.2 · Z −11.8</output></aside></div>`),
    );
    this.add(
      'loadout',
      html(`<section class="quickbar" aria-label="Equipment quickbar">
        <div class="quickbar__slot" data-selected="true" data-owned="true"><kbd>1</kbd><span class="quickbar__icon quickbar__icon--knife" aria-hidden="true"></span><span class="quickbar__label">Knife</span></div>
        <div class="quickbar__slot" data-selected="false" data-owned="false"><kbd>2</kbd><span class="quickbar__label">Locked</span></div>
      </section>`),
    );
    this.add(
      'modal',
      html(
        '<button class="help-button" type="button" aria-haspopup="dialog" aria-expanded="false">Help</button>',
      ),
    );

    if (this.current.state === 'combat') {
      this.add(
        'notifications',
        html(
          `<p class="ui-lab-warning" role="alert"><strong>!</strong> LOW HEALTH · Break line of sight</p>`,
        ),
      );
    }
    if (this.current.state === 'exploration') {
      this.add(
        'interaction',
        html(
          `<div class="interaction-prompt" role="status">[ E ] Inspect signal controller</div>`,
        ),
      );
    }
    if (this.current.state === 'dialogue') {
      this.add(
        'conversation',
        html(`<section class="dialogue-box" aria-label="Dialogue">
          <div class="dialogue-box__portrait" role="img" aria-label="Mack portrait fallback"><span class="dialogue-box__portrait-fallback">MC</span></div>
          <div class="dialogue-box__content"><h2 class="dialogue-box__speaker">Mack Calder</h2><p class="dialogue-box__text" aria-live="polite">Storm took the east relay. Keep to the lit side of the viaduct.</p><div class="dialogue-box__controls"><button class="dialogue-box__cancel" type="button">Cancel</button><button class="dialogue-box__continue" type="button" autofocus>Continue ›</button></div></div>
        </section>`),
      );
    }
    if (this.current.state === 'restoration') {
      this.add(
        'notifications',
        html(
          `<p class="ui-lab-restored" role="status"><strong>✓</strong> CONTROL RESTORED · Exploration view resumed</p>`,
        ),
      );
    }
  }

  private add(
    zone: Parameters<ScreenSpaceLayoutSystem['zone']>[0],
    root: HTMLElement,
  ): void {
    this.fixtureRoots.push(root);
    this.layout.zone(zone).append(root);
  }

  private buildPanel(): void {
    this.panel.className = 'ui-lab-panel';
    this.panel.setAttribute('aria-label', 'UI composition lab controls');
    this.panel.addEventListener('submit', (event) => event.preventDefault());
    this.panel.innerHTML = `<p class="ui-lab-kicker">UI-SYSTEM-001</p><h1>Composition lab</h1>`;
    this.panel.append(
      selectControl(
        'State',
        'state',
        Object.keys(uiCompositionPresentationFixtures),
      ),
      selectControl('Background', 'background', ['bright', 'dark', 'noisy']),
      checkboxControl('Enlarge text', 'enlargedText'),
      checkboxControl('Reduced motion', 'reducedMotion'),
      checkboxControl('Simulate safe area', 'safeArea'),
    );
    for (const input of Array.from(
      this.panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
        'input, select',
      ),
    )) {
      input.addEventListener('change', () => {
        const form = new FormData(this.panel);
        this.apply({
          state: parseState(readFormString(form, 'state')),
          background: parseBackground(readFormString(form, 'background')),
          enlargedText: form.has('enlargedText'),
          reducedMotion: form.has('reducedMotion'),
          safeArea: form.has('safeArea'),
        });
      });
    }
    this.live.className = 'visually-hidden';
    this.live.setAttribute('aria-live', 'polite');
    this.panel.append(this.live);
  }

  private syncPanel(): void {
    const set = (name: string, value: string | boolean): void => {
      const input = this.panel.elements.namedItem(name);
      if (input instanceof HTMLSelectElement) input.value = String(value);
      if (input instanceof HTMLInputElement) input.checked = Boolean(value);
    };
    set('state', this.current.state);
    set('background', this.current.background);
    set('enlargedText', this.current.enlargedText);
    set('reducedMotion', this.current.reducedMotion);
    set('safeArea', this.current.safeArea);
  }

  private installStage(): void {
    const floor = new Mesh(
      new PlaneGeometry(45, 45),
      new MeshStandardMaterial({ color: 0x48585a, roughness: 0.96 }),
    );
    floor.rotation.x = -Math.PI / 2;
    this.stage.add(floor, new AmbientLight(0xc9e4ff, 1.4));
    const sun = new DirectionalLight(0xffd9a2, 3.2);
    sun.position.set(-8, 12, 7);
    this.stage.add(sun);
    for (let index = 0; index < 18; index += 1) {
      const building = new Mesh(
        new BoxGeometry(2.5 + (index % 3), 2 + (index % 5), 3),
        new MeshStandardMaterial({ color: index % 2 ? 0x795244 : 0x345960 }),
      );
      building.position.set(
        (index % 9) * 4 - 16,
        building.scale.y,
        index < 9 ? -7 : 7,
      );
      this.stage.add(building);
    }
    this.context.camera.position.set(0, 6.5, 13);
    this.context.camera.lookAt(0, 1.7, 0);
    this.context.scene.add(this.stage);
  }

  private syncStage(): void {
    const colors: Record<UiLabBackground, number> = {
      bright: 0x92b4bd,
      dark: 0x07151e,
      noisy: 0xb26f46,
    };
    this.context.scene.background = new Color(colors[this.current.background]);
    this.stage.rotation.y = this.current.background === 'noisy' ? 0.18 : 0;
  }
}

function label(state: UiLabState): string {
  return uiCompositionPresentationFixtures[state].label;
}

function parseState(value: string | null): UiLabState {
  return value && value in uiCompositionPresentationFixtures
    ? (value as UiLabState)
    : 'exploration';
}

function parseBackground(value: string | null): UiLabBackground {
  return value === 'dark' || value === 'noisy' ? value : 'bright';
}

function html(markup: string): HTMLElement {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  return template.content.firstElementChild as HTMLElement;
}

function selectControl(
  label: string,
  name: string,
  options: readonly string[],
): HTMLElement {
  const wrapper = document.createElement('label');
  wrapper.textContent = label;
  const select = document.createElement('select');
  select.name = name;
  for (const value of options) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent =
      value in uiCompositionPresentationFixtures
        ? uiCompositionPresentationFixtures[value as UiLabState].label
        : labelCase(value);
    select.append(option);
  }
  wrapper.append(select);
  return wrapper;
}

function checkboxControl(label: string, name: string): HTMLElement {
  const wrapper = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.name = name;
  wrapper.append(input, document.createTextNode(label));
  return wrapper;
}

function labelCase(value: string): string {
  return value
    .replace(
      /(^|-)(\w)/g,
      (_match, _dash, letter: string) => ` ${letter.toUpperCase()}`,
    )
    .trim();
}

function readFormString(form: FormData, name: string): string | null {
  const value = form.get(name);
  return typeof value === 'string' ? value : null;
}

function isMesh(
  object: Object3D,
): object is Mesh<BufferGeometry, Material | Material[]> {
  return 'isMesh' in object && object.isMesh === true;
}

function disposeTree(root: Object3D): void {
  root.traverse((object) => {
    if (!isMesh(object)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) material.dispose();
  });
  root.clear();
}

export const uiCompositionLab: SandboxScenario = {
  id: 'ui-composition-lab',
  title: 'Ashfall UI composition lab',
  create: (context) => new UiCompositionLabSystem(context),
};
