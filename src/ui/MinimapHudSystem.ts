import type { GameState } from '../core/gameState';
import type { GameSystem } from '../core/lifecycle';
import type { FrameTime } from '../core/time';
import type { GameContext } from '../game/GameRuntime';
import type {
  LevelDefinition,
  LevelMapBoundsDefinition,
  LevelMapLayer,
} from '../world/LevelDefinition';
import type { ResolvedLevelLocation } from '../world/LocationResolver';
import type { WorldPoseSource, WorldPosition } from '../world/Spatial';
import {
  headingDegreesFromForward,
  levelMapViewSize,
  projectWorldToMap,
  resolveLevelMapGeometry,
  resolveLevelMapMarkers,
} from './LevelMapPresentation';

export {
  headingDegreesFromForward,
  projectWorldToMap,
} from './LevelMapPresentation';

const svgNamespace = 'http://www.w3.org/2000/svg';
const mapSize = levelMapViewSize;
const updateInterval = 0.1;
const layerOrder: readonly LevelMapLayer[] = [
  'roads',
  'structures',
  'landmarks',
  'interactions',
  'spawns',
];

export interface MinimapLevelSource {
  readonly activeLevel: LevelDefinition | undefined;
  resolveLocation(position: WorldPosition): ResolvedLevelLocation;
}

export interface MinimapHudSnapshot {
  readonly visible: boolean;
  readonly orientation: 'north-up';
  readonly levelId: string | undefined;
  readonly locationName: string | undefined;
  readonly position: WorldPosition | undefined;
  readonly projected: { readonly x: number; readonly y: number } | undefined;
  readonly headingDegrees: number | undefined;
  readonly bounds: LevelMapBoundsDefinition | undefined;
  readonly layers: Readonly<Record<LevelMapLayer, boolean>>;
  readonly updateCount: number;
}

/** Lightweight north-up SVG observer driven only by level data and public pose. */
export class MinimapHudSystem implements GameSystem<GameContext> {
  public readonly id = 'minimap-hud';
  public readonly updateMode = 'always' as const;

  private readonly root = document.createElement('aside');
  private readonly title = document.createElement('strong');
  private readonly svg = document.createElementNS(svgNamespace, 'svg');
  private readonly player = document.createElementNS(svgNamespace, 'path');
  private readonly accessibleStatus = document.createElement('span');
  private readonly layerVisibility: Record<LevelMapLayer, boolean> = {
    roads: true,
    structures: true,
    landmarks: true,
    interactions: true,
    spawns: false,
  };
  private readonly groups = new Map<LevelMapLayer, SVGGElement>();
  private state: GameContext['state'] | undefined;
  private renderedLevel: LevelDefinition | undefined;
  private lastPosition: WorldPosition | undefined;
  private lastLocation: ResolvedLevelLocation | undefined;
  private lastProjected: { readonly x: number; readonly y: number } | undefined;
  private lastHeading: number | undefined;
  private elapsedSinceSample = Number.POSITIVE_INFINITY;
  private updateCount = 0;

  public constructor(
    private readonly mount: HTMLElement,
    private readonly pose: WorldPoseSource,
    private readonly level: MinimapLevelSource,
  ) {
    this.root.className = 'minimap-hud';
    this.root.dataset.testid = 'minimap-hud';
    this.root.setAttribute('aria-label', 'District minimap');
    this.root.hidden = true;
    this.title.className = 'minimap-hud__title';
    this.svg.classList.add('minimap-hud__map');
    this.svg.setAttribute('viewBox', `0 0 ${mapSize} ${mapSize}`);
    this.svg.setAttribute('role', 'img');
    this.svg.setAttribute('aria-hidden', 'true');
    const boundary = document.createElementNS(svgNamespace, 'rect');
    boundary.classList.add('minimap-hud__boundary');
    boundary.setAttribute('x', '0.75');
    boundary.setAttribute('y', '0.75');
    boundary.setAttribute('width', '98.5');
    boundary.setAttribute('height', '98.5');
    boundary.setAttribute('rx', '2');
    const north = document.createElementNS(svgNamespace, 'text');
    north.classList.add('minimap-hud__north');
    north.setAttribute('x', '50');
    north.setAttribute('y', '7');
    north.setAttribute('text-anchor', 'middle');
    north.textContent = 'N';
    for (const layer of layerOrder) {
      const group = document.createElementNS(svgNamespace, 'g');
      group.dataset.layer = layer;
      this.groups.set(layer, group);
      this.svg.append(group);
    }
    this.svg.append(boundary, north);
    this.player.classList.add('minimap-hud__player');
    this.player.setAttribute('d', 'M 0 -4 L 3.2 3 L 0 1.7 L -3.2 3 Z');
    this.player.dataset.testid = 'minimap-player';
    this.svg.append(this.player);
    this.accessibleStatus.className = 'visually-hidden';
    this.root.append(this.title, this.svg, this.accessibleStatus);
  }

  public init(context: GameContext): void {
    this.state = context.state;
    this.mount.append(this.root);
  }

  public update(time: FrameTime): void {
    const activeLevel = this.level.activeLevel;
    const visible =
      isGameplayHudState(this.state?.current) && !!activeLevel?.mapPresentation;
    this.root.hidden = !visible;
    if (!visible || !activeLevel?.mapPresentation) return;
    if (this.renderedLevel !== activeLevel) this.renderLevel(activeLevel);
    this.elapsedSinceSample += time.delta;
    if (this.elapsedSinceSample < updateInterval) return;
    this.elapsedSinceSample %= updateInterval;
    const worldPose = this.pose.getWorldPose();
    if (!worldPose) {
      this.root.hidden = true;
      return;
    }
    const position = { ...worldPose.position };
    const projected = projectWorldToMap(
      position,
      activeLevel.mapPresentation.bounds,
    );
    const heading = headingDegreesFromForward(worldPose.forward);
    const location = this.level.resolveLocation(position);
    const transform = `translate(${projected.x.toFixed(3)} ${projected.y.toFixed(3)}) rotate(${heading.toFixed(3)})`;
    if (this.player.getAttribute('transform') !== transform) {
      this.player.setAttribute('transform', transform);
    }
    if (this.title.textContent !== activeLevel.name) {
      this.title.textContent = activeLevel.name;
    }
    const accessibleText = `${activeLevel.name} map, ${location.name}. Player at X ${position.x.toFixed(1)}, Z ${position.z.toFixed(1)}, heading ${cardinalHeading(heading)}. Map bounds X ${activeLevel.mapPresentation.bounds.minX} to ${activeLevel.mapPresentation.bounds.maxX}, Z ${activeLevel.mapPresentation.bounds.minZ} to ${activeLevel.mapPresentation.bounds.maxZ}.`;
    if (this.accessibleStatus.textContent !== accessibleText) {
      this.accessibleStatus.textContent = accessibleText;
    }
    this.lastPosition = position;
    this.lastProjected = projected;
    this.lastHeading = heading;
    this.lastLocation = location;
    this.updateCount += 1;
  }

  public setLayerVisible(layer: LevelMapLayer, visible: boolean): void {
    this.layerVisibility[layer] = visible;
    const group = this.groups.get(layer);
    if (group) group.style.display = visible ? '' : 'none';
  }

  public getSnapshot(): MinimapHudSnapshot {
    return {
      visible: this.root.isConnected && !this.root.hidden,
      orientation: 'north-up',
      levelId: this.renderedLevel?.id,
      locationName: this.lastLocation?.name,
      position: this.lastPosition ? { ...this.lastPosition } : undefined,
      projected: this.lastProjected ? { ...this.lastProjected } : undefined,
      headingDegrees: this.lastHeading,
      bounds: this.renderedLevel?.mapPresentation?.bounds,
      layers: { ...this.layerVisibility },
      updateCount: this.updateCount,
    };
  }

  public dispose(): void {
    this.state = undefined;
    this.renderedLevel = undefined;
    this.root.remove();
  }

  private renderLevel(level: LevelDefinition): void {
    const map = level.mapPresentation;
    if (!map) return;
    for (const group of this.groups.values()) group.replaceChildren();
    for (const primitive of resolveLevelMapGeometry(level)) {
      if (primitive.kind === 'path') {
        const path = document.createElementNS(svgNamespace, 'path');
        path.setAttribute(
          'd',
          primitive.points
            .map(
              (point, index) =>
                `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`,
            )
            .join(' '),
        );
        path.setAttribute('stroke-width', String(primitive.strokeWidth));
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        path.dataset.entryId = primitive.entryId;
        this.groups.get(primitive.layer)?.append(path);
        continue;
      }
      const rect = document.createElementNS(svgNamespace, 'rect');
      rect.setAttribute('x', String(primitive.x));
      rect.setAttribute('y', String(primitive.y));
      rect.setAttribute('width', String(primitive.width));
      rect.setAttribute('height', String(primitive.height));
      rect.setAttribute('rx', primitive.layer === 'roads' ? '1.5' : '2.5');
      if (Math.abs(primitive.rotationDegrees) > 1e-6) {
        rect.setAttribute(
          'transform',
          `rotate(${primitive.rotationDegrees} ${primitive.center.x} ${primitive.center.y})`,
        );
      }
      rect.dataset.entryId = primitive.entryId;
      this.groups.get(primitive.layer)?.append(rect);
    }
    for (const primitive of resolveLevelMapMarkers(level)) {
      const marker = document.createElementNS(svgNamespace, 'circle');
      marker.setAttribute('cx', String(primitive.point.x));
      marker.setAttribute('cy', String(primitive.point.y));
      marker.setAttribute('r', primitive.layer === 'landmarks' ? '1.8' : '2.2');
      marker.dataset.entryId = primitive.entryId;
      this.groups.get(primitive.layer)?.append(marker);
    }
    for (const layer of layerOrder)
      this.setLayerVisible(layer, this.layerVisibility[layer]);
    this.title.textContent = level.name;
    this.renderedLevel = level;
  }
}

function cardinalHeading(degrees: number): string {
  return ['north', 'east', 'south', 'west'][Math.round(degrees / 90) % 4]!;
}

function isGameplayHudState(state: GameState | undefined): boolean {
  return (
    state !== undefined &&
    state !== 'booting' &&
    state !== 'map' &&
    state !== 'character-select'
  );
}
