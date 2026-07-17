import { Euler, Quaternion, Vector3 } from 'three';
import type { StaticColliderDefinition } from './StaticCollider';

export interface CharacterShape {
  readonly radius: number;
  readonly height: number;
  readonly stepHeight: number;
  readonly maxSlopeAngle: number;
  readonly groundSnapDistance: number;
}

interface StaticBoxCollider {
  readonly id: string;
  readonly min: Readonly<Vector3>;
  readonly max: Readonly<Vector3>;
}

interface StaticOrientedBoxCollider {
  readonly id: string;
  readonly center: Readonly<Vector3>;
  readonly halfSize: Readonly<Vector3>;
  readonly yaw: number;
  readonly cosine: number;
  readonly sine: number;
  readonly inverseRotation: Readonly<Quaternion>;
  readonly tags: readonly string[];
  readonly ramp: boolean;
}

interface StaticRampCollider {
  readonly id: string;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  /** Height at minX/minZ. */
  readonly baseHeight: number;
  readonly slopeX: number;
  readonly slopeZ: number;
}

export interface GroundHit {
  readonly height: number;
  readonly normal: Readonly<Vector3>;
  readonly colliderId: string;
}

export interface CharacterMoveResult {
  readonly position: Vector3;
  readonly grounded: boolean;
  readonly groundNormal: Vector3;
  readonly groundColliderId: string;
  readonly blocked: boolean;
  readonly hitCeiling: boolean;
}

export interface CameraCastResult {
  readonly fraction: number;
  readonly obstructed: boolean;
  readonly colliderId?: string;
}

export interface CollisionDebugSnapshot {
  readonly colliderCount: number;
  readonly orientedBoxCount: number;
  readonly rampCount: number;
  readonly lastCameraHitId: string | undefined;
  readonly lastCharacterBlockIds: readonly string[];
  readonly lastGroundColliderId: string;
}

export interface SegmentCastOptions {
  readonly radius?: number;
  readonly ignoreColliderIds?: readonly string[];
  /** Ignore tagged volumes only when the sweep origin is already inside them. */
  readonly ignoreInitialOverlapTags?: readonly string[];
}

export interface SegmentCastResult extends CameraCastResult {
  readonly colliderId: string | undefined;
}

export interface CollisionWorld {
  moveCharacter(
    position: Readonly<Vector3>,
    displacement: Readonly<Vector3>,
    shape: CharacterShape,
    wasGrounded: boolean,
  ): CharacterMoveResult;
  castCamera(
    from: Readonly<Vector3>,
    to: Readonly<Vector3>,
    radius: number,
    options?: Pick<
      SegmentCastOptions,
      'ignoreColliderIds' | 'ignoreInitialOverlapTags'
    >,
  ): CameraCastResult;
  /** Casts against authored world geometry and returns the nearest obstruction. */
  castSegment(
    from: Readonly<Vector3>,
    to: Readonly<Vector3>,
    options?: SegmentCastOptions,
  ): SegmentCastResult;
}

const UP = new Vector3(0, 1, 0);
const EPSILON = 1e-5;

/**
 * Small deterministic collision world for authored static city geometry.
 * It deliberately sits behind CollisionWorld so a later physics backend can
 * replace it without leaking physics-library types into player code.
 */
export class StaticCollisionWorld implements CollisionWorld {
  private readonly boxes = new Map<string, StaticOrientedBoxCollider>();
  private readonly ramps = new Map<string, StaticRampCollider>();
  private lastCameraHitId: string | undefined;
  private lastCharacterBlockIds: readonly string[] = [];
  private lastGroundColliderId = 'world-floor';

  public constructor(private readonly floorHeight = 0) {}

  public addDefinition(collider: StaticColliderDefinition): void {
    const [x, y, z] = collider.position;
    const [width, height, depth] = collider.size;
    const tags = collider.tags ?? [];
    const isRamp = tags.includes('ramp');
    this.addOrientedBox({
      id: collider.id,
      center: new Vector3(x, y, z),
      halfSize: new Vector3(width / 2, height / 2, depth / 2),
      yaw: collider.rotation?.[1] ?? 0,
      rotation: collider.rotation ?? [0, 0, 0],
      tags,
      ramp: isRamp,
    });

    if (isRamp) {
      const angle = collider.rotation?.[0] ?? 0;
      const run = depth * Math.cos(angle);
      const rise = depth * Math.sin(angle);
      const topFaceZOffset = (height / 2) * Math.sin(angle);
      this.addRamp({
        id: collider.id,
        minX: x - width / 2,
        maxX: x + width / 2,
        minZ: z - run / 2 + topFaceZOffset,
        maxZ: z + run / 2 + topFaceZOffset,
        // The simulation foot plane follows the visible upper face of the
        // rotated box, not its centre plane.
        baseHeight: y + rise / 2 + (height / 2) * Math.cos(angle),
        slopeX: 0,
        slopeZ: -rise / run,
      });
    }
  }

  public addDefinitions(colliders: readonly StaticColliderDefinition[]): void {
    for (const collider of colliders) this.addDefinition(collider);
  }

  /** Compatibility helper for tests and procedural axis-aligned geometry. */
  public addBox(collider: StaticBoxCollider): void {
    this.addOrientedBox({
      id: collider.id,
      center: collider.min.clone().add(collider.max).multiplyScalar(0.5),
      halfSize: collider.max.clone().sub(collider.min).multiplyScalar(0.5),
      yaw: 0,
      rotation: [0, 0, 0],
      tags: [],
      ramp: false,
    });
  }

  public remove(id: string): boolean {
    const boxRemoved = this.boxes.delete(id);
    const rampRemoved = this.ramps.delete(id);
    return boxRemoved || rampRemoved;
  }

  public addRamp(collider: StaticRampCollider): void {
    if (this.ramps.has(collider.id)) {
      throw new Error(`Duplicate static ramp: ${collider.id}`);
    }
    this.ramps.set(collider.id, { ...collider });
  }

  public clear(): void {
    this.boxes.clear();
    this.ramps.clear();
    this.lastCameraHitId = undefined;
    this.lastCharacterBlockIds = [];
    this.lastGroundColliderId = 'world-floor';
  }

  public getColliderCount(): number {
    return this.boxes.size;
  }

  public getDebugSnapshot(): CollisionDebugSnapshot {
    return {
      colliderCount: this.getColliderCount(),
      orientedBoxCount: [...this.boxes.values()].filter(
        ({ yaw }) => Math.abs(yaw) > EPSILON,
      ).length,
      rampCount: this.ramps.size,
      lastCameraHitId: this.lastCameraHitId,
      lastCharacterBlockIds: [...this.lastCharacterBlockIds],
      lastGroundColliderId: this.lastGroundColliderId,
    };
  }

  public moveCharacter(
    position: Readonly<Vector3>,
    displacement: Readonly<Vector3>,
    shape: CharacterShape,
    wasGrounded: boolean,
  ): CharacterMoveResult {
    const result = position.clone();
    let blocked = false;
    let stepped = false;
    const blockedIds = new Set<string>();
    const horizontalLength = Math.hypot(displacement.x, displacement.z);
    const steps = Math.max(
      1,
      Math.ceil(horizontalLength / (shape.radius * 0.5)),
    );

    for (let index = 0; index < steps; index += 1) {
      const previous = result.clone();
      result.x += displacement.x / steps;
      result.z += displacement.z / steps;
      const resolution = this.resolveHorizontal(result, shape);
      blocked ||= resolution.blocked;
      stepped ||= resolution.stepped;
      for (const id of resolution.blockedIds) blockedIds.add(id);

      const ground = this.groundAt(result.x, result.z);
      const walkable = ground.normal.y >= Math.cos(shape.maxSlopeAngle);
      if (!walkable && ground.height > previous.y + EPSILON) {
        result.copy(previous);
        blocked = true;
        blockedIds.add(ground.colliderId);
      } else if (
        wasGrounded &&
        walkable &&
        Math.abs(ground.height - result.y) <= shape.stepHeight
      ) {
        result.y = ground.height;
      }
    }

    let hitCeiling = false;
    const verticalTarget = result.y + displacement.y;
    if (displacement.y > 0) {
      const ceiling = this.ceilingAt(result, shape);
      if (ceiling !== undefined && verticalTarget + shape.height > ceiling) {
        result.y = ceiling - shape.height;
        hitCeiling = true;
      } else {
        result.y = verticalTarget;
      }
    } else {
      result.y = verticalTarget;
    }

    const ground = this.groundAt(result.x, result.z);
    const walkable = ground.normal.y >= Math.cos(shape.maxSlopeAngle);
    const snapDistance = wasGrounded || stepped ? shape.groundSnapDistance : 0;
    const crossingGround =
      displacement.y <= 0 &&
      result.y <= ground.height + snapDistance &&
      position.y >= ground.height - shape.stepHeight;
    const grounded = walkable && crossingGround;
    if (grounded) result.y = ground.height;
    this.lastGroundColliderId = ground.colliderId;
    this.lastCharacterBlockIds = [...blockedIds].sort();

    return {
      position: result,
      grounded,
      groundNormal: ground.normal.clone(),
      groundColliderId: ground.colliderId,
      blocked,
      hitCeiling,
    };
  }

  public castCamera(
    from: Readonly<Vector3>,
    to: Readonly<Vector3>,
    radius: number,
    options: Pick<
      SegmentCastOptions,
      'ignoreColliderIds' | 'ignoreInitialOverlapTags'
    > = {},
  ): CameraCastResult {
    const segment = this.castSegment(from, to, { ...options, radius });
    let fraction = segment.fraction;
    let colliderId = segment.colliderId;
    const directionY = to.y - from.y;
    if (to.y < this.floorHeight + radius && directionY < -EPSILON) {
      const floorFraction = (this.floorHeight + radius - from.y) / directionY;
      if (floorFraction >= 0 && floorFraction < fraction) {
        fraction = floorFraction;
        colliderId = 'world-floor';
      }
    }
    fraction = Math.max(0, fraction);
    this.lastCameraHitId = fraction < 1 ? colliderId : undefined;
    return {
      fraction,
      obstructed: fraction < 1,
      ...(colliderId === undefined ? {} : { colliderId }),
    };
  }

  private addOrientedBox(collider: {
    readonly id: string;
    readonly center: Readonly<Vector3>;
    readonly halfSize: Readonly<Vector3>;
    readonly yaw: number;
    readonly rotation: readonly [number, number, number];
    readonly tags: readonly string[];
    readonly ramp: boolean;
  }): void {
    if (this.boxes.has(collider.id) || this.ramps.has(collider.id)) {
      throw new Error(`Duplicate static collider: ${collider.id}`);
    }
    this.boxes.set(collider.id, {
      ...collider,
      center: collider.center.clone(),
      halfSize: collider.halfSize.clone(),
      cosine: Math.cos(collider.yaw),
      sine: Math.sin(collider.yaw),
      inverseRotation: new Quaternion()
        .setFromEuler(new Euler(...collider.rotation))
        .invert(),
      tags: [...collider.tags],
    });
  }

  private castBoxes(
    from: Readonly<Vector3>,
    to: Readonly<Vector3>,
    padding: number,
    ignore: (box: StaticOrientedBoxCollider) => boolean = () => false,
  ): { readonly fraction: number; readonly colliderId: string } | undefined {
    let nearest:
      { readonly fraction: number; readonly colliderId: string } | undefined;
    for (const box of this.boxes.values()) {
      if (ignore(box)) continue;
      const fraction = segmentOrientedBoxFraction(from, to, box, padding);
      if (
        fraction !== undefined &&
        (nearest === undefined || fraction < nearest.fraction)
      ) {
        nearest = { fraction, colliderId: box.id };
      }
    }
    return nearest;
  }

  public castSegment(
    from: Readonly<Vector3>,
    to: Readonly<Vector3>,
    options: SegmentCastOptions = {},
  ): SegmentCastResult {
    const ignored = new Set(options.ignoreColliderIds);
    const initialOverlapTags = new Set(options.ignoreInitialOverlapTags);
    const radius = options.radius ?? 0;
    const hit = this.castBoxes(
      from,
      to,
      radius,
      ({ id, tags }) =>
        ignored.has(id) ||
        (tags.some((tag) => initialOverlapTags.has(tag)) &&
          this.boxContainsPoint(from, id, radius)),
    );
    const fraction = hit?.fraction ?? 1;
    return {
      fraction,
      obstructed: fraction < 1,
      colliderId: hit?.colliderId,
    };
  }

  private boxContainsPoint(
    point: Readonly<Vector3>,
    id: string,
    padding: number,
  ): boolean {
    const box = this.boxes.get(id);
    return (
      box !== undefined &&
      segmentOrientedBoxFraction(point, point, box, padding) === 0
    );
  }

  private resolveHorizontal(
    position: Vector3,
    shape: CharacterShape,
  ): {
    blocked: boolean;
    stepped: boolean;
    blockedIds: readonly string[];
  } {
    let blocked = false;
    let stepped = false;
    const blockedIds: string[] = [];

    for (const box of this.boxes.values()) {
      if (box.ramp) continue;
      const minY = box.center.y - box.halfSize.y;
      const maxY = box.center.y + box.halfSize.y;
      if (position.y >= maxY - EPSILON) continue;
      if (position.y + shape.height <= minY + EPSILON) continue;
      if (!circleOverlapsOrientedBox(position, shape.radius, box)) continue;

      const rise = maxY - position.y;
      if (
        rise >= -EPSILON &&
        rise <= shape.stepHeight + EPSILON &&
        !this.hasHeadObstruction(position, maxY, shape, box.id)
      ) {
        stepped = true;
        continue;
      }

      blocked = true;
      blockedIds.push(box.id);
      pushCircleOutsideOrientedBox(position, shape.radius, box);
    }
    return { blocked, stepped, blockedIds };
  }

  private groundAt(x: number, z: number): GroundHit {
    let height = this.floorHeight;
    let colliderId = 'world-floor';
    for (const box of this.boxes.values()) {
      if (box.ramp || !pointInsideOrientedBox(x, z, box)) continue;
      const top = box.center.y + box.halfSize.y;
      if (top >= height - EPSILON) {
        height = top;
        colliderId = box.id;
      }
    }
    let normal: Readonly<Vector3> = UP;
    for (const ramp of this.ramps.values()) {
      if (
        x < ramp.minX - EPSILON ||
        x > ramp.maxX + EPSILON ||
        z < ramp.minZ - EPSILON ||
        z > ramp.maxZ + EPSILON
      ) {
        continue;
      }
      const rampHeight =
        ramp.baseHeight +
        ramp.slopeX * (x - ramp.minX) +
        ramp.slopeZ * (z - ramp.minZ);
      if (rampHeight >= height) {
        height = rampHeight;
        colliderId = ramp.id;
        normal = new Vector3(-ramp.slopeX, 1, -ramp.slopeZ).normalize();
      }
    }
    return { height, normal, colliderId };
  }

  private ceilingAt(
    position: Readonly<Vector3>,
    shape: CharacterShape,
  ): number | undefined {
    let ceiling: number | undefined;
    for (const box of this.boxes.values()) {
      if (box.ramp || !circleOverlapsOrientedBox(position, shape.radius, box))
        continue;
      const minY = box.center.y - box.halfSize.y;
      if (minY < position.y + shape.height - EPSILON) continue;
      ceiling = ceiling === undefined ? minY : Math.min(ceiling, minY);
    }
    return ceiling;
  }

  private hasHeadObstruction(
    position: Readonly<Vector3>,
    footHeight: number,
    shape: CharacterShape,
    ignoredId: string,
  ): boolean {
    return [...this.boxes.values()].some((box) => {
      const minY = box.center.y - box.halfSize.y;
      const maxY = box.center.y + box.halfSize.y;
      return (
        box.id !== ignoredId &&
        !box.ramp &&
        circleOverlapsOrientedBox(position, shape.radius, box) &&
        maxY > footHeight &&
        minY < footHeight + shape.height
      );
    });
  }
}

function toLocalXZ(
  x: number,
  z: number,
  box: StaticOrientedBoxCollider,
): { readonly x: number; readonly z: number } {
  const dx = x - box.center.x;
  const dz = z - box.center.z;
  return {
    x: box.cosine * dx - box.sine * dz,
    z: box.sine * dx + box.cosine * dz,
  };
}

function pointInsideOrientedBox(
  x: number,
  z: number,
  box: StaticOrientedBoxCollider,
): boolean {
  const local = toLocalXZ(x, z, box);
  return (
    Math.abs(local.x) <= box.halfSize.x + EPSILON &&
    Math.abs(local.z) <= box.halfSize.z + EPSILON
  );
}

function circleOverlapsOrientedBox(
  position: Readonly<Vector3>,
  radius: number,
  box: StaticOrientedBoxCollider,
): boolean {
  const local = toLocalXZ(position.x, position.z, box);
  const closestX = Math.max(-box.halfSize.x, Math.min(local.x, box.halfSize.x));
  const closestZ = Math.max(-box.halfSize.z, Math.min(local.z, box.halfSize.z));
  const dx = local.x - closestX;
  const dz = local.z - closestZ;
  return dx * dx + dz * dz < radius * radius - EPSILON;
}

function pushCircleOutsideOrientedBox(
  position: Vector3,
  radius: number,
  box: StaticOrientedBoxCollider,
): void {
  const local = toLocalXZ(position.x, position.z, box);
  const closestX = Math.max(-box.halfSize.x, Math.min(local.x, box.halfSize.x));
  const closestZ = Math.max(-box.halfSize.z, Math.min(local.z, box.halfSize.z));
  const dx = local.x - closestX;
  const dz = local.z - closestZ;
  const distance = Math.hypot(dx, dz);
  let resolvedX: number;
  let resolvedZ: number;
  if (distance > EPSILON) {
    const correction = (radius - distance) / distance;
    resolvedX = local.x + dx * correction;
    resolvedZ = local.z + dz * correction;
  } else {
    const choices = [
      {
        distance: local.x + box.halfSize.x,
        x: -box.halfSize.x - radius,
        z: local.z,
      },
      {
        distance: box.halfSize.x - local.x,
        x: box.halfSize.x + radius,
        z: local.z,
      },
      {
        distance: local.z + box.halfSize.z,
        x: local.x,
        z: -box.halfSize.z - radius,
      },
      {
        distance: box.halfSize.z - local.z,
        x: local.x,
        z: box.halfSize.z + radius,
      },
    ].sort((a, b) => a.distance - b.distance);
    resolvedX = choices[0]!.x;
    resolvedZ = choices[0]!.z;
  }
  position.x = box.center.x + box.cosine * resolvedX + box.sine * resolvedZ;
  position.z = box.center.z - box.sine * resolvedX + box.cosine * resolvedZ;
}

function segmentOrientedBoxFraction(
  from: Readonly<Vector3>,
  to: Readonly<Vector3>,
  box: StaticOrientedBoxCollider,
  padding: number,
): number | undefined {
  const localFrom = new Vector3(
    from.x - box.center.x,
    from.y - box.center.y,
    from.z - box.center.z,
  ).applyQuaternion(box.inverseRotation);
  const localTo = new Vector3(
    to.x - box.center.x,
    to.y - box.center.y,
    to.z - box.center.z,
  ).applyQuaternion(box.inverseRotation);
  let near = 0;
  let far = 1;
  for (const [start, end, halfSize] of [
    [localFrom.x, localTo.x, box.halfSize.x],
    [localFrom.y, localTo.y, box.halfSize.y],
    [localFrom.z, localTo.z, box.halfSize.z],
  ] as const) {
    const direction = end - start;
    const min = -halfSize - padding;
    const max = halfSize + padding;
    if (Math.abs(direction) < EPSILON) {
      if (start < min || start > max) return undefined;
      continue;
    }
    const first = (min - start) / direction;
    const second = (max - start) / direction;
    near = Math.max(near, Math.min(first, second));
    far = Math.min(far, Math.max(first, second));
    if (near > far) return undefined;
  }
  return near >= 0 && near <= 1 ? near : undefined;
}
