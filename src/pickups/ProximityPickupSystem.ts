import { CylinderGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import type { GameSystem } from '../core/lifecycle';
import type { GameContext } from '../game/GameRuntime';
import type {
  WorldPose,
  WorldPoseSource,
  WorldPosition,
} from '../world/Spatial';

export interface ProximityPickup<TPayload = unknown> {
  readonly id: string;
  readonly position: WorldPosition;
  /** Horizontal trigger radius around the pickup center. */
  readonly radius: number;
  /** Vertical distance accepted from the player's ground pose. */
  readonly halfHeight?: number;
  readonly payload: TPayload;
  /** Return false to reject collection and leave the pickup available. */
  readonly collect: (payload: TPayload) => boolean;
}

export interface ProximityPickupDiagnostic {
  readonly id: string;
  readonly state: 'available' | 'collecting';
  readonly position: WorldPosition;
  readonly radius: number;
  readonly halfHeight: number;
  readonly surfaceDistance: number | undefined;
}

export interface ProximityPickupSnapshot {
  readonly count: number;
  readonly collectedCount: number;
  readonly visualizationVisible: boolean;
  readonly pickups: readonly ProximityPickupDiagnostic[];
}

interface PickupVolume {
  readonly id: string;
  readonly position: WorldPosition;
  readonly radius: number;
  readonly halfHeight?: number;
}

interface RegisteredPickup {
  readonly definition: PickupVolume & { readonly collect: () => boolean };
  readonly helper: Mesh;
  collecting: boolean;
  surfaceDistance: number | undefined;
}

const DEFAULT_PLAYER_RADIUS = 0.38;
const DEFAULT_HALF_HEIGHT = 0.75;

/**
 * One shared swept-overlap registry for walk-through items. It deliberately
 * owns no inventory/economy state: payload callbacks commit to those systems.
 */
export class ProximityPickupSystem implements GameSystem<GameContext> {
  public readonly id = 'proximity-pickups';
  public readonly updateMode = 'always' as const;

  private readonly pickups = new Map<string, RegisteredPickup>();
  private readonly helpers = new Group();
  private state: GameContext['state'] | undefined;
  private previousPose: WorldPose | undefined;
  private collectedCount = 0;
  private visualizationVisible = false;
  private disposed = false;

  public constructor(private readonly player: WorldPoseSource) {
    this.helpers.name = 'debug.proximity-pickups';
    this.helpers.visible = false;
  }

  public init(context: GameContext): void {
    if (this.disposed) throw new Error('Proximity pickup system is disposed');
    this.state = context.state;
    this.previousPose = clonePose(this.player.getWorldPose());
  }

  public register<TPayload>(definition: ProximityPickup<TPayload>): () => void {
    if (this.disposed) throw new Error('Proximity pickup system is disposed');
    if (this.pickups.has(definition.id)) {
      throw new Error(`Duplicate proximity pickup: ${definition.id}`);
    }
    assertVolume(definition);
    const helper = createHelper(definition);
    this.helpers.add(helper);
    if (this.pickups.size === 0) {
      this.previousPose = clonePose(this.player.getWorldPose());
    }
    this.pickups.set(definition.id, {
      definition: {
        id: definition.id,
        position: definition.position,
        radius: definition.radius,
        ...(definition.halfHeight === undefined
          ? {}
          : { halfHeight: definition.halfHeight }),
        collect: () => definition.collect(definition.payload),
      },
      helper,
      collecting: false,
      surfaceDistance: undefined,
    });
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.remove(definition.id);
    };
  }

  public update(): void {
    if (this.pickups.size === 0) {
      this.previousPose = undefined;
      return;
    }
    const current = this.player.getWorldPose();
    if (!current) {
      this.previousPose = undefined;
      return;
    }
    const previous = this.previousPose ?? current;
    this.previousPose = clonePose(current);
    if (this.state?.current !== 'playing') return;

    for (const pickup of [...this.pickups.values()]) {
      const definition = pickup.definition;
      const playerRadius = current.radius ?? DEFAULT_PLAYER_RADIUS;
      const distance = pointToSegmentDistanceXZ(
        definition.position,
        previous.position,
        current.position,
      );
      pickup.surfaceDistance = distance - playerRadius - definition.radius;
      const verticalDistance = Math.min(
        Math.abs(definition.position.y - previous.position.y),
        Math.abs(definition.position.y - current.position.y),
      );
      if (
        pickup.collecting ||
        pickup.surfaceDistance > 0 ||
        verticalDistance > (definition.halfHeight ?? DEFAULT_HALF_HEIGHT)
      ) {
        continue;
      }

      // Mark first so re-entrant updates/callbacks cannot collect twice.
      pickup.collecting = true;
      let accepted = false;
      try {
        accepted = definition.collect();
      } finally {
        if (!accepted && this.pickups.get(definition.id) === pickup) {
          pickup.collecting = false;
        }
      }
      if (accepted && this.pickups.get(definition.id) === pickup) {
        this.collectedCount += 1;
        this.remove(definition.id);
      }
    }
  }

  public setVisualizationVisible(visible: boolean): void {
    this.visualizationVisible = visible;
    this.helpers.visible = visible;
  }

  public getVisualization(): Group {
    return this.helpers;
  }

  public getSnapshot(): ProximityPickupSnapshot {
    return {
      count: this.pickups.size,
      collectedCount: this.collectedCount,
      visualizationVisible: this.visualizationVisible,
      pickups: [...this.pickups.values()].map((pickup) => ({
        id: pickup.definition.id,
        state: pickup.collecting ? 'collecting' : 'available',
        position: { ...pickup.definition.position },
        radius: pickup.definition.radius,
        halfHeight: pickup.definition.halfHeight ?? DEFAULT_HALF_HEIGHT,
        surfaceDistance: pickup.surfaceDistance,
      })),
    };
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const id of [...this.pickups.keys()]) this.remove(id);
    this.helpers.removeFromParent();
    this.state = undefined;
    this.previousPose = undefined;
  }

  private remove(id: string): boolean {
    const pickup = this.pickups.get(id);
    if (!pickup) return false;
    this.pickups.delete(id);
    pickup.helper.removeFromParent();
    pickup.helper.geometry.dispose();
    (pickup.helper.material as MeshBasicMaterial).dispose();
    return true;
  }
}

function createHelper(definition: PickupVolume): Mesh {
  const halfHeight = definition.halfHeight ?? DEFAULT_HALF_HEIGHT;
  const helper = new Mesh(
    new CylinderGeometry(
      definition.radius,
      definition.radius,
      halfHeight * 2,
      24,
      1,
      true,
    ),
    new MeshBasicMaterial({
      color: 0x55ff99,
      wireframe: true,
      depthTest: false,
    }),
  );
  helper.position.set(
    definition.position.x,
    definition.position.y + halfHeight,
    definition.position.z,
  );
  helper.renderOrder = 1000;
  helper.name = `pickup-volume:${definition.id}`;
  return helper;
}

function pointToSegmentDistanceXZ(
  point: WorldPosition,
  start: WorldPosition,
  end: WorldPosition,
): number {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  const projection =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((point.x - start.x) * dx + (point.z - start.z) * dz) /
              lengthSquared,
          ),
        );
  return Math.hypot(
    point.x - (start.x + dx * projection),
    point.z - (start.z + dz * projection),
  );
}

function clonePose(pose: WorldPose | undefined): WorldPose | undefined {
  return pose
    ? {
        position: { ...pose.position },
        forward: { ...pose.forward },
        ...(pose.radius === undefined ? {} : { radius: pose.radius }),
      }
    : undefined;
}

function assertVolume(definition: PickupVolume): void {
  if (!definition.id.trim()) throw new Error('Pickup id is required');
  if (!Number.isFinite(definition.radius) || definition.radius <= 0) {
    throw new Error('Pickup radius must be greater than zero');
  }
  if (
    definition.halfHeight !== undefined &&
    (!Number.isFinite(definition.halfHeight) || definition.halfHeight <= 0)
  ) {
    throw new Error('Pickup half-height must be greater than zero');
  }
}
