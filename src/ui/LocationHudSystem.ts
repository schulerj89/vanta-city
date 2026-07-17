import type { GameState } from '../core/gameState';
import type { GameSystem } from '../core/lifecycle';
import type { FrameTime } from '../core/time';
import type { GameContext } from '../game/GameRuntime';
import type { ResolvedLevelLocation } from '../world/LocationResolver';
import type { WorldPoseSource, WorldPosition } from '../world/Spatial';

export interface LevelLocationSource {
  readonly activeLevel: { readonly id: string } | undefined;
  resolveLocation(position: WorldPosition): ResolvedLevelLocation;
}

export interface LocationHudSnapshot {
  readonly visible: boolean;
  readonly locationId: string | undefined;
  readonly locationName: string | undefined;
  readonly locationKind: ResolvedLevelLocation['kind'] | undefined;
  readonly coordinates: string | undefined;
  readonly position: WorldPosition | undefined;
  readonly updateCount: number;
}

const updateInterval = 0.1;

/** Read-only gameplay HUD driven by public level and world-pose APIs. */
export class LocationHudSystem implements GameSystem<GameContext> {
  public readonly id = 'location-hud';
  public readonly updateMode = 'always' as const;

  private readonly root = document.createElement('aside');
  private readonly name = document.createElement('strong');
  private readonly coordinates = document.createElement('output');
  private state: GameContext['state'] | undefined;
  private elapsedSinceSample = Number.POSITIVE_INFINITY;
  private lastPosition: WorldPosition | undefined;
  private lastLocation: ResolvedLevelLocation | undefined;
  private updateCount = 0;

  public constructor(
    private readonly mount: HTMLElement,
    private readonly pose: WorldPoseSource,
    private readonly level: LevelLocationSource,
  ) {
    this.root.className = 'location-hud';
    this.root.setAttribute('aria-label', 'Current location');
    this.root.setAttribute('aria-live', 'polite');
    this.root.hidden = true;
    this.name.className = 'location-hud__name';
    this.coordinates.className = 'location-hud__coordinates';
    this.root.append(this.name, this.coordinates);
  }

  public init(context: GameContext): void {
    this.state = context.state;
    this.mount.append(this.root);
  }

  public update(time: FrameTime): void {
    const visible =
      isGameplayHudState(this.state?.current) && !!this.level.activeLevel;
    this.root.hidden = !visible;
    if (!visible) return;

    this.elapsedSinceSample += time.delta;
    if (this.elapsedSinceSample < updateInterval) return;
    this.elapsedSinceSample %= updateInterval;

    const worldPose = this.pose.getWorldPose();
    if (!worldPose) {
      this.root.hidden = true;
      return;
    }
    const position = { ...worldPose.position };
    const location = this.level.resolveLocation(position);
    this.lastPosition = position;
    this.lastLocation = location;
    this.name.textContent = location.name;
    this.coordinates.value = formatWorldCoordinates(position);
    this.coordinates.textContent = this.coordinates.value;
    this.updateCount += 1;
  }

  public getSnapshot(): LocationHudSnapshot {
    return {
      visible: this.root.isConnected && !this.root.hidden,
      locationId: this.lastLocation?.id,
      locationName: this.lastLocation?.name,
      locationKind: this.lastLocation?.kind,
      coordinates: this.lastPosition
        ? formatWorldCoordinates(this.lastPosition)
        : undefined,
      position: this.lastPosition ? { ...this.lastPosition } : undefined,
      updateCount: this.updateCount,
    };
  }

  public dispose(): void {
    this.state = undefined;
    this.root.remove();
  }
}

export function formatWorldCoordinates(position: WorldPosition): string {
  return `X ${formatCoordinate(position.x)} · Y ${formatCoordinate(position.y)} · Z ${formatCoordinate(position.z)}`;
}

function formatCoordinate(value: number): string {
  const normalized = Math.abs(value) < 0.05 ? 0 : value;
  const rounded = Math.round((normalized + Number.EPSILON) * 10) / 10;
  return `${rounded >= 0 ? '+' : ''}${rounded.toFixed(1)}`;
}

function isGameplayHudState(state: GameState | undefined): boolean {
  return (
    state !== undefined && state !== 'booting' && state !== 'character-select'
  );
}
