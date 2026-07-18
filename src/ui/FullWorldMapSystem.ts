import type { GameState } from '../core/gameState';
import type { GameSystem } from '../core/lifecycle';
import type { FrameTime } from '../core/time';
import type { GameContext } from '../game/GameRuntime';
import type { InputReader, PointerInputReader } from '../input/InputSystem';
import type {
  MissionHighlightSnapshot,
  MissionHighlightSource,
} from '../missions/MissionHighlight';
import type { LevelDefinition } from '../world/LevelDefinition';
import type { ResolvedLevelLocation } from '../world/LocationResolver';
import type { WorldPoseSource, WorldPosition } from '../world/Spatial';
import {
  headingDegreesFromForward,
  projectTupleToMap,
  projectWorldToMap,
  resolveLevelMapGeometry,
} from './LevelMapPresentation';

const svgNamespace = 'http://www.w3.org/2000/svg';
const minZoom = 1;
const maxZoom = 4;
const poseInterval = 0.1;
const emptyMissionHighlights: MissionHighlightSource = {
  getHighlights: () => [],
  subscribe: () => () => undefined,
};

type MapReturnState = Extract<GameState, 'playing' | 'paused'>;

export interface FullWorldMapRuntime {
  readonly state: GameContext['state'];
  enterMap(): MapReturnState | undefined;
  exitMap(returnState: MapReturnState): void;
}

export interface FullWorldMapLevelSource {
  readonly activeLevel: LevelDefinition | undefined;
  resolveLocation(position: WorldPosition): ResolvedLevelLocation;
}

export interface FullWorldMapSnapshot {
  readonly open: boolean;
  readonly priorState: MapReturnState | undefined;
  readonly levelId: string | undefined;
  readonly zoom: number;
  readonly center: Readonly<{ x: number; y: number }>;
  readonly viewBox: string;
  readonly position: WorldPosition | undefined;
  readonly locationName: string | undefined;
  readonly geometryCount: number;
  readonly roadCount: number;
  readonly structureCount: number;
  readonly sectorCount: number;
  readonly placeCount: number;
  readonly highlightCount: number;
  readonly focusedTestId: string | undefined;
  readonly pointerWasLocked: boolean;
  readonly updateCount: number;
}

/** Pause-safe district map driven only by public pose and immutable level data. */
export class FullWorldMapSystem implements GameSystem<GameContext> {
  public readonly id = 'full-world-map';
  public readonly updateMode = 'always' as const;

  private readonly root = document.createElement('section');
  private readonly svg = document.createElementNS(svgNamespace, 'svg');
  private readonly player = document.createElementNS(svgNamespace, 'path');
  private readonly locationLabel = document.createElement('span');
  private readonly places = document.createElement('ol');
  private readonly indexedPoints: { readonly x: number; readonly y: number }[] =
    [];
  private input: InputReader | undefined;
  private renderedLevel: LevelDefinition | undefined;
  private unsubscribeHighlights: (() => void) | undefined;
  private highlightsDirty = true;
  private priorState: MapReturnState | undefined;
  private priorFocus: HTMLElement | undefined;
  private pointerWasLocked = false;
  private zoomLevel = 1;
  private center = { x: 50, y: 50 };
  private lastPosition: WorldPosition | undefined;
  private lastLocation: ResolvedLevelLocation | undefined;
  private elapsedSincePose = Number.POSITIVE_INFINITY;
  private updateCount = 0;
  private geometryCount = 0;
  private roadCount = 0;
  private structureCount = 0;
  private sectorCount = 0;
  private placeCount = 0;
  private highlightCount = 0;

  public constructor(
    private readonly mount: HTMLElement,
    private readonly runtime: FullWorldMapRuntime,
    private readonly pointer: PointerInputReader,
    private readonly pose: WorldPoseSource,
    private readonly level: FullWorldMapLevelSource,
    private readonly missionHighlights: MissionHighlightSource = emptyMissionHighlights,
  ) {
    this.root.className = 'full-world-map';
    this.root.dataset.testid = 'full-world-map';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'full-world-map-title');
    this.root.innerHTML = `
      <div class="full-world-map__frame">
        <header class="full-world-map__header">
          <div><span class="full-world-map__eyebrow">Municipal survey 94</span><h1 id="full-world-map-title">District map</h1></div>
          <button class="full-world-map__close" type="button" data-map-action="close" data-testid="map-close" aria-label="Close district map">Close <kbd>M</kbd></button>
        </header>
        <div class="full-world-map__body">
          <div class="full-world-map__canvas" data-testid="map-canvas"></div>
          <aside class="full-world-map__index" aria-label="Map index">
            <p class="full-world-map__coordinates"><span data-map-location>Location unavailable</span></p>
            <h2>Places</h2><ol data-map-places></ol>
            <p class="full-world-map__legend"><i class="full-world-map__legend-player"></i>You <i class="full-world-map__legend-place"></i>Place <i class="full-world-map__legend-objective"></i>Objective</p>
          </aside>
        </div>
        <footer class="full-world-map__controls" aria-label="Map controls">
          <span>Pan <kbd>WASD</kbd> / <kbd>D-pad</kbd></span>
          <div><button type="button" data-map-action="zoom-out" data-testid="map-zoom-out" aria-label="Zoom out">−</button><output data-map-zoom aria-live="polite">100%</output><button type="button" data-map-action="zoom-in" data-testid="map-zoom-in" aria-label="Zoom in">+</button><button type="button" data-map-action="reset" data-testid="map-reset">Reset</button></div>
        </footer>
      </div>`;
    this.root
      .querySelector('[data-map-location]')
      ?.replaceWith(this.locationLabel);
    this.root.querySelector('[data-map-places]')?.replaceWith(this.places);
    this.svg.classList.add('full-world-map__svg');
    this.svg.dataset.testid = 'full-world-map-svg';
    this.svg.setAttribute('role', 'img');
    this.svg.setAttribute('aria-label', 'North-up district map');
    this.player.classList.add('full-world-map__player');
    this.player.dataset.testid = 'full-world-map-player';
    this.player.setAttribute('d', 'M 0 -2.2 L 1.7 1.8 L 0 .9 L -1.7 1.8 Z');
    this.root.querySelector('.full-world-map__canvas')?.append(this.svg);
  }

  public init(context: GameContext): void {
    this.input = context.input;
    this.root.addEventListener('click', this.onClick);
    this.root.addEventListener('keydown', this.onKeyDown);
    this.mount.append(this.root);
    this.unsubscribeHighlights = this.missionHighlights.subscribe(() => {
      this.highlightsDirty = true;
    });
  }

  public update(time: FrameTime): void {
    if (!this.input) return;
    if (this.runtime.state.current !== 'map') {
      if (this.input.wasPressed('toggleMap')) this.open();
      return;
    }
    if (
      this.input.wasPressed('toggleMap') ||
      this.input.wasPressed('closeMap')
    ) {
      this.close();
      return;
    }
    if (this.input.wasPressed('mapZoomIn')) this.zoomBy(1);
    if (this.input.wasPressed('mapZoomOut')) this.zoomBy(-1);
    if (this.input.wasPressed('mapReset')) this.resetView();
    const panStep = (36 * time.delta) / this.zoomLevel;
    this.panBy(
      (Number(this.input.isDown('mapPanRight')) -
        Number(this.input.isDown('mapPanLeft'))) *
        panStep,
      (Number(this.input.isDown('mapPanDown')) -
        Number(this.input.isDown('mapPanUp'))) *
        panStep,
    );
    const activeLevel = this.level.activeLevel;
    if (activeLevel !== this.renderedLevel || this.highlightsDirty) {
      this.renderLevel(activeLevel);
    }
    this.elapsedSincePose += time.delta;
    if (this.elapsedSincePose >= poseInterval) {
      this.elapsedSincePose %= poseInterval;
      this.renderPose(activeLevel);
    }
  }

  public open(): void {
    if (!this.root.isConnected || !this.root.hidden) return;
    if (this.mount.querySelector('[aria-modal="true"]:not([hidden])')) return;
    const previous = this.runtime.state.current;
    if (previous !== 'playing' && previous !== 'paused') return;
    this.priorFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined;
    this.pointerWasLocked = this.pointer.isPointerLocked();
    this.priorState = this.runtime.enterMap();
    if (!this.priorState) return;
    this.pointer.releasePointerLock?.();
    this.resetView();
    this.renderedLevel = undefined;
    this.highlightsDirty = true;
    this.root.hidden = false;
    this.mount.classList.add('full-world-map-open');
    this.renderLevel(this.level.activeLevel);
    this.renderPose(this.level.activeLevel);
    this.root.querySelector<HTMLElement>('[data-map-action="close"]')?.focus();
  }

  public close(): void {
    if (this.root.hidden || !this.priorState) return;
    const returnState = this.priorState;
    const restoreFocus = this.priorFocus;
    const restorePointer = this.pointerWasLocked;
    this.root.hidden = true;
    this.mount.classList.remove('full-world-map-open');
    this.priorState = undefined;
    this.priorFocus = undefined;
    this.runtime.exitMap(returnState);
    if (restoreFocus?.isConnected) restoreFocus.focus();
    if (restorePointer && returnState === 'playing')
      this.pointer.requestPointerLock();
  }

  public panBy(x: number, y: number): void {
    if (x === 0 && y === 0) return;
    const half = 50 / this.zoomLevel;
    this.center.x = clamp(this.center.x + x, half, 100 - half);
    this.center.y = clamp(this.center.y + y, half, 100 - half);
    this.applyViewBox();
  }

  public zoomBy(direction: number): void {
    const next = clamp(
      this.zoomLevel * (direction > 0 ? 1.25 : 0.8),
      minZoom,
      maxZoom,
    );
    if (next === this.zoomLevel) return;
    this.zoomLevel = next;
    this.clampCenter();
    this.applyViewBox();
  }

  public resetView(): void {
    this.zoomLevel = 1;
    this.center = { x: 50, y: 50 };
    this.applyViewBox();
  }

  public getSnapshot(): FullWorldMapSnapshot {
    const focused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement.dataset.testid
        : undefined;
    return {
      open: this.root.isConnected && !this.root.hidden,
      priorState: this.priorState,
      levelId: this.renderedLevel?.id,
      zoom: this.zoomLevel,
      center: { ...this.center },
      viewBox: this.svg.getAttribute('viewBox') ?? '',
      position: this.lastPosition ? { ...this.lastPosition } : undefined,
      locationName: this.lastLocation?.name,
      geometryCount: this.geometryCount,
      roadCount: this.roadCount,
      structureCount: this.structureCount,
      sectorCount: this.sectorCount,
      placeCount: this.placeCount,
      highlightCount: this.highlightCount,
      focusedTestId: focused,
      pointerWasLocked: this.pointerWasLocked,
      updateCount: this.updateCount,
    };
  }

  public dispose(): void {
    if (!this.root.hidden) this.close();
    this.unsubscribeHighlights?.();
    this.root.removeEventListener('click', this.onClick);
    this.root.removeEventListener('keydown', this.onKeyDown);
    this.root.remove();
    this.input = undefined;
  }

  private renderLevel(level: LevelDefinition | undefined): void {
    this.renderedLevel = level;
    this.highlightsDirty = false;
    this.svg.replaceChildren();
    this.places.replaceChildren();
    this.indexedPoints.length = 0;
    this.geometryCount = this.roadCount = this.structureCount = 0;
    this.sectorCount = this.placeCount = this.highlightCount = 0;
    if (!level?.mapPresentation) return;
    const grid = svg('g', 'full-world-map__grid');
    for (let position = 0; position <= 100; position += 10) {
      const vertical = svg('line');
      vertical.setAttribute('x1', String(position));
      vertical.setAttribute('x2', String(position));
      vertical.setAttribute('y1', '0');
      vertical.setAttribute('y2', '100');
      const horizontal = svg('line');
      horizontal.setAttribute('x1', '0');
      horizontal.setAttribute('x2', '100');
      horizontal.setAttribute('y1', String(position));
      horizontal.setAttribute('y2', String(position));
      grid.append(vertical, horizontal);
    }
    const sectors = svg('g', 'full-world-map__sectors');
    for (const sector of level.streaming?.sectors ?? []) {
      const point = projectWorldToMap(
        { x: sector.center[0], z: sector.center[1] },
        level.mapPresentation.bounds,
      );
      const coverage = svg('ellipse', 'full-world-map__sector-coverage');
      coverage.setAttribute('cx', String(point.x));
      coverage.setAttribute('cy', String(point.y));
      coverage.setAttribute(
        'rx',
        String(
          (sector.loadDistance /
            (level.mapPresentation.bounds.maxX -
              level.mapPresentation.bounds.minX)) *
            100,
        ),
      );
      coverage.setAttribute(
        'ry',
        String(
          (sector.loadDistance /
            (level.mapPresentation.bounds.maxZ -
              level.mapPresentation.bounds.minZ)) *
            100,
        ),
      );
      coverage.dataset.sectorId = sector.id;
      const marker = svg('circle', 'full-world-map__sector-center');
      marker.setAttribute('cx', String(point.x));
      marker.setAttribute('cy', String(point.y));
      marker.setAttribute('r', sector.alwaysLoaded ? '2.6' : '1.7');
      const label = svg('text');
      label.setAttribute('x', String(point.x + 2.4));
      label.setAttribute('y', String(point.y - 2));
      label.textContent = sectorLabel(sector.id);
      sectors.append(coverage, marker, label);
      this.sectorCount += 1;
    }
    const roads = svg('g', 'full-world-map__roads');
    const structures = svg('g', 'full-world-map__structures');
    const geometry = resolveLevelMapGeometry(level);
    for (const primitive of geometry) {
      const parent = primitive.layer === 'roads' ? roads : structures;
      const element = primitive.kind === 'path' ? svg('path') : svg('rect');
      if (primitive.kind === 'path') {
        element.setAttribute(
          'd',
          primitive.points
            .map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`)
            .join(' '),
        );
        element.setAttribute('stroke-width', String(primitive.strokeWidth));
        element.setAttribute('fill', 'none');
      } else {
        element.setAttribute('x', String(primitive.x));
        element.setAttribute('y', String(primitive.y));
        element.setAttribute('width', String(primitive.width));
        element.setAttribute('height', String(primitive.height));
        if (Math.abs(primitive.rotationDegrees) > 1e-6)
          element.setAttribute(
            'transform',
            `rotate(${primitive.rotationDegrees} ${primitive.center.x} ${primitive.center.y})`,
          );
      }
      element.dataset.entryId = primitive.entryId;
      parent.append(element);
      if (primitive.layer === 'roads') this.roadCount += 1;
      else this.structureCount += 1;
    }
    this.geometryCount = geometry.length;
    const placeGroup = svg('g', 'full-world-map__places');
    const authoredPlaces = [
      ...level.landmarks.map((entry) => ({
        id: entry.id,
        name: entry.name,
        position: entry.position,
        kind: 'landmark',
      })),
      ...level.locations.map((entry) => ({
        id: entry.id,
        name: entry.name ?? humanize(entry.id),
        position: entry.position,
        kind: entry.kind,
      })),
    ];
    for (const [index, place] of authoredPlaces.entries()) {
      const point = projectTupleToMap(
        place.position,
        level.mapPresentation.bounds,
      );
      const marker = svg('circle');
      marker.setAttribute('cx', String(point.x));
      marker.setAttribute('cy', String(point.y));
      marker.setAttribute('r', '1.25');
      marker.dataset.placeId = place.id;
      placeGroup.append(marker);
      this.indexedPoints.push(point);
      const item = document.createElement('li');
      item.innerHTML = `<button type="button" data-place-index="${index}" aria-label="Center map on ${escapeHtml(place.name)}"><i></i><span>${escapeHtml(place.name)}</span><small>${escapeHtml(place.kind)}</small></button>`;
      this.places.append(item);
      this.placeCount += 1;
    }
    const objectiveGroup = svg('g', 'full-world-map__objectives');
    for (const highlight of this.missionHighlights.getHighlights()) {
      if (!highlight.channels.includes('map')) continue;
      const position = resolveHighlightPosition(level, highlight);
      if (!position) continue;
      const point = projectTupleToMap(position, level.mapPresentation.bounds);
      const marker = svg('rect');
      marker.setAttribute('x', String(point.x - 1.5));
      marker.setAttribute('y', String(point.y - 1.5));
      marker.setAttribute('width', '3');
      marker.setAttribute('height', '3');
      marker.setAttribute('transform', `rotate(45 ${point.x} ${point.y})`);
      marker.dataset.highlightId = highlight.id;
      marker.dataset.objectiveId = highlight.objectiveId;
      marker.setAttribute('aria-label', highlight.label);
      marker.classList.add(`is-${highlight.priority}`);
      objectiveGroup.append(marker);
      const index = this.indexedPoints.push(point) - 1;
      const item = document.createElement('li');
      item.innerHTML = `<button type="button" data-place-index="${index}" aria-label="Center map on objective ${escapeHtml(highlight.label)}"><i></i><span>${escapeHtml(highlight.label)}</span><small>objective</small></button>`;
      this.places.append(item);
      this.highlightCount += 1;
    }
    const boundary = svg('rect', 'full-world-map__boundary');
    boundary.setAttribute('x', '.4');
    boundary.setAttribute('y', '.4');
    boundary.setAttribute('width', '99.2');
    boundary.setAttribute('height', '99.2');
    const north = svg('text', 'full-world-map__north');
    north.setAttribute('x', '50');
    north.setAttribute('y', '5');
    north.setAttribute('text-anchor', 'middle');
    north.textContent = 'N';
    this.svg.append(
      grid,
      sectors,
      roads,
      structures,
      placeGroup,
      objectiveGroup,
      boundary,
      north,
      this.player,
    );
    this.root.querySelector('h1')!.textContent = `${level.name} map`;
    this.applyViewBox();
  }

  private renderPose(level: LevelDefinition | undefined): void {
    const pose = this.pose.getWorldPose();
    if (!level?.mapPresentation || !pose) {
      this.player.style.display = 'none';
      return;
    }
    const point = projectWorldToMap(
      pose.position,
      level.mapPresentation.bounds,
    );
    const heading = headingDegreesFromForward(pose.forward);
    this.player.style.display = '';
    this.player.setAttribute(
      'transform',
      `translate(${point.x} ${point.y}) rotate(${heading})`,
    );
    this.lastPosition = { ...pose.position };
    this.lastLocation = this.level.resolveLocation(pose.position);
    this.locationLabel.textContent = `${this.lastLocation.name} · X ${pose.position.x.toFixed(1)} / Z ${pose.position.z.toFixed(1)}`;
    this.updateCount += 1;
  }

  private applyViewBox(): void {
    const size = 100 / this.zoomLevel;
    this.svg.setAttribute(
      'viewBox',
      `${(this.center.x - size / 2).toFixed(3)} ${(this.center.y - size / 2).toFixed(3)} ${size.toFixed(3)} ${size.toFixed(3)}`,
    );
    const output =
      this.root.querySelector<HTMLOutputElement>('[data-map-zoom]');
    if (output) output.value = `${Math.round(this.zoomLevel * 100)}%`;
  }

  private clampCenter(): void {
    const half = 50 / this.zoomLevel;
    this.center.x = clamp(this.center.x, half, 100 - half);
    this.center.y = clamp(this.center.y, half, 100 - half);
  }

  private readonly onClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;
    const placeIndex = Number(
      target.closest<HTMLElement>('[data-place-index]')?.dataset.placeIndex,
    );
    const point = this.indexedPoints[placeIndex];
    if (point) {
      this.zoomLevel = Math.max(2, this.zoomLevel);
      this.center = { ...point };
      this.clampCenter();
      this.applyViewBox();
    }
    const action =
      target.closest<HTMLElement>('[data-map-action]')?.dataset.mapAction;
    if (action === 'close') this.close();
    if (action === 'zoom-in') this.zoomBy(1);
    if (action === 'zoom-out') this.zoomBy(-1);
    if (action === 'reset') this.resetView();
    event.stopPropagation();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Tab') {
      const focusable = Array.from(
        this.root.querySelectorAll<HTMLElement>('button:not([disabled])'),
      );
      const current = focusable.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey
        ? current <= 0
          ? focusable.length - 1
          : current - 1
        : (current + 1) % focusable.length;
      focusable[next]?.focus();
      event.preventDefault();
      event.stopPropagation();
    }
  };
}

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  className?: string,
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(svgNamespace, tag);
  if (className) element.classList.add(className);
  return element;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
function sectorLabel(id: string): string {
  return id
    .replace(/^sector\./, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function humanize(id: string): string {
  return (
    id
      .split('.')
      .at(-1)
      ?.replace(/-/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase()) ?? id
  );
}
function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!,
  );
}

/** Resolves IDs through the active authored level only; entities stay unresolved. */
function resolveHighlightPosition(
  level: LevelDefinition,
  highlight: MissionHighlightSnapshot,
): readonly [number, number, number] | undefined {
  const id = highlight.target.referenceId;
  switch (highlight.target.kind) {
    case 'location':
      return level.locations.find((entry) => entry.id === id)?.position;
    case 'interaction':
      return level.locations.find(
        (entry) => entry.kind === 'interaction' && entry.id === id,
      )?.position;
    case 'landmark':
      return level.landmarks.find((entry) => entry.id === id)?.position;
    case 'spawn':
      return level.spawns.find((entry) => entry.id === id)?.position;
    case 'trigger':
      return level.triggers.find((entry) => entry.id === id)?.position;
    case 'entity':
      return undefined;
  }
}
