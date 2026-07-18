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

    if (this.current.state === 'pause-map') {
      this.add(
        'modal',
        html(`<section class="full-world-map" role="dialog" aria-modal="true" aria-labelledby="full-world-map-title">
          <div class="full-world-map__frame">
            <header class="full-world-map__header"><div><span class="full-world-map__eyebrow">Municipal survey 94</span><h1 id="full-world-map-title">Ashfall Junction map</h1></div><button type="button">Close <kbd>M</kbd></button></header>
            <div class="full-world-map__body"><div class="full-world-map__canvas"><svg class="full-world-map__svg" viewBox="0 0 100 100" role="img" aria-label="North-up Ashfall Junction map"><g class="full-world-map__grid"><path d="M10 0v100M20 0v100M30 0v100M40 0v100M50 0v100M60 0v100M70 0v100M80 0v100M90 0v100M0 10h100M0 20h100M0 30h100M0 40h100M0 50h100M0 60h100M0 70h100M0 80h100M0 90h100"/></g><g class="full-world-map__roads"><path d="M0 56h100" stroke-width="13"/><path d="M42 0v100" stroke-width="11"/><path d="M58 58c9-12 21-15 42-18" stroke-width="8"/></g><g class="full-world-map__structures"><rect x="10" y="18" width="18" height="12"/><rect x="56" y="16" width="19" height="14"/><rect x="12" y="70" width="16" height="18"/><rect x="61" y="68" width="14" height="17"/><rect x="82" y="25" width="12" height="10"/></g><g class="full-world-map__places"><circle cx="24" cy="44" r="1.5"/><circle cx="68" cy="48" r="1.5"/><circle cx="86" cy="38" r="1.5"/></g><path class="full-world-map__player" d="M0-2.2L1.7 1.8 0 .9-1.7 1.8Z" transform="translate(48 55) rotate(35)"/><rect class="full-world-map__boundary" x=".4" y=".4" width="99.2" height="99.2"/><text class="full-world-map__north" x="50" y="5">N</text></svg></div><aside class="full-world-map__index"><p class="full-world-map__coordinates">Relay Row · X +4.2 / Z −11.8</p><h2>Places</h2><ol><li><button><i></i><span>Relay Row</span><small>landmark</small></button></li><li><button><i></i><span>Ashfall Crossing</span><small>mission</small></button></li><li><button><i></i><span>Signal Controller</span><small>interaction</small></button></li></ol></aside></div>
            <footer class="full-world-map__controls"><span>Pan <kbd>WASD</kbd> / <kbd>D-pad</kbd></span><div><button>−</button><output>100%</output><button>+</button><button>Reset</button></div></footer>
          </div></section>`),
      );
      return;
    }

    const health = healthFixture(this.current.state);
    const moneyTransaction = this.current.state === 'money-transaction';
    this.add(
      'player-status',
      html(`<div class="player-hud-cluster" aria-label="Player status">
        <section class="money-hud"${moneyTransaction ? ' data-direction="increase"' : ''}><span class="money-hud__label" aria-hidden="true">FUNDS</span><output class="money-hud__balance">${moneyTransaction ? '$2,084' : '$1,984'}</output>${moneyTransaction ? '<span class="money-hud__delta" data-kind="credit">+$100</span>' : ''}</section>
        <section class="health-hud__bar health-hud__player" aria-label="Player health: ${health.value} of 100" data-depleted="${health.depleted}" data-status="${health.status}">
          <span class="health-hud__label">${health.label}</span><span class="health-hud__value">${health.value} / 100</span>
          <div class="health-hud__track"><div class="health-hud__fill" style="transform:scaleX(${health.normalized})"></div></div>
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
          <path class="minimap-hud__boundary" d="M 18 .75 H 82 L 99.25 18 V 82 L 82 99.25 H 18 L .75 82 V 18 Z"/>
          <text class="minimap-hud__north" x="50" y="8" text-anchor="middle">N</text>
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

    if (this.current.state === 'mission-update') {
      this.add(
        'objectives',
        html(`<section class="mission-objective-hud" role="region" aria-label="Current mission objective">
          <p class="mission-objective-hud__kicker">MISSION · 3 / 5</p>
          <strong class="mission-objective-hud__title">Walk the Block</strong>
          <p class="mission-objective-hud__objective">Cross the south approach to test whether the same vehicle circles back.</p>
        </section>`),
      );
      this.add(
        'notifications',
        html(`<section class="mission-notification" role="status" aria-live="polite" data-kind="objective-completed">
          <strong class="mission-notification__kicker">OBJECTIVE UPDATED</strong>
          <span class="mission-notification__text">Cross the south approach to test whether the same vehicle circles back.</span>
        </section>`),
      );
      const indicator =
        html(`<div class="mission-world-indicator" aria-hidden="true">
        <span class="mission-world-indicator__marker"></span>
        <span class="mission-world-indicator__label">Inspect Signal Corner</span>
      </div>`);
      indicator.style.transform =
        'translate3d(62vw, 52vh, 0) translate(-50%, -100%)';
      this.add('world-indicator', indicator);
    }

    if (this.current.state === 'combat') {
      this.add(
        'notifications',
        html(
          `<p class="ui-lab-warning" role="alert"><strong>!</strong> LOW HEALTH · Break line of sight</p>`,
        ),
      );
    }
    if (this.current.state === 'health-depleted') {
      this.add(
        'notifications',
        html(
          `<p class="ui-lab-warning" role="alert"><strong>×</strong> CONDITION DEPLETED · Recovery required</p>`,
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

function healthFixture(state: UiLabState): {
  readonly value: number;
  readonly normalized: string;
  readonly depleted: boolean;
  readonly status: 'steady' | 'low' | 'depleted';
  readonly label: string;
} {
  if (state === 'combat') {
    return {
      value: 28,
      normalized: '.28',
      depleted: false,
      status: 'low',
      label: 'CONDITION · LOW',
    };
  }
  if (state === 'health-depleted') {
    return {
      value: 0,
      normalized: '0',
      depleted: true,
      status: 'depleted',
      label: 'CONDITION · DEPLETED',
    };
  }
  return {
    value: 82,
    normalized: '.82',
    depleted: false,
    status: 'steady',
    label: 'CONDITION',
  };
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
