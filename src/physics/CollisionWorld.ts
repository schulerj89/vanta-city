import { Vector3 } from 'three';

export interface CharacterShape {
  readonly radius: number;
  readonly height: number;
  readonly stepHeight: number;
  readonly maxSlopeAngle: number;
  readonly groundSnapDistance: number;
}

export interface StaticBoxCollider {
  readonly id: string;
  readonly min: Readonly<Vector3>;
  readonly max: Readonly<Vector3>;
}

export interface StaticRampCollider {
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
  readonly blocked: boolean;
  readonly hitCeiling: boolean;
}

export interface CameraCastResult {
  readonly fraction: number;
  readonly obstructed: boolean;
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
  ): CameraCastResult;
}

const UP = new Vector3(0, 1, 0);
const EPSILON = 1e-5;

/**
 * Small deterministic collision world for authored static city geometry.
 * It deliberately sits behind CollisionWorld so a later physics backend can
 * replace it without leaking physics-library types into player code.
 */
export class StaticCollisionWorld implements CollisionWorld {
  private readonly boxes = new Map<string, StaticBoxCollider>();
  private readonly ramps = new Map<string, StaticRampCollider>();

  public constructor(private readonly floorHeight = 0) {}

  public addBox(collider: StaticBoxCollider): void {
    if (this.boxes.has(collider.id)) {
      throw new Error(`Duplicate static collider: ${collider.id}`);
    }
    this.boxes.set(collider.id, {
      id: collider.id,
      min: collider.min.clone(),
      max: collider.max.clone(),
    });
  }

  public remove(id: string): boolean {
    return this.boxes.delete(id) || this.ramps.delete(id);
  }

  public addRamp(collider: StaticRampCollider): void {
    if (this.boxes.has(collider.id) || this.ramps.has(collider.id)) {
      throw new Error(`Duplicate static collider: ${collider.id}`);
    }
    this.ramps.set(collider.id, { ...collider });
  }

  public clear(): void {
    this.boxes.clear();
    this.ramps.clear();
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

      const ground = this.groundAt(result.x, result.z, shape.radius);
      const walkable = ground.normal.y >= Math.cos(shape.maxSlopeAngle);
      if (!walkable && ground.height > previous.y + EPSILON) {
        result.copy(previous);
        blocked = true;
      } else if (resolution.stepped) {
        result.y = resolution.stepHeight;
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

    const ground = this.groundAt(result.x, result.z, shape.radius * 0.75);
    const walkable = ground.normal.y >= Math.cos(shape.maxSlopeAngle);
    const snapDistance = wasGrounded || stepped ? shape.groundSnapDistance : 0;
    const crossingGround =
      displacement.y <= 0 &&
      result.y <= ground.height + snapDistance &&
      position.y >= ground.height - shape.stepHeight;
    const grounded = walkable && crossingGround;
    if (grounded) result.y = ground.height;

    return {
      position: result,
      grounded,
      groundNormal: ground.normal.clone(),
      blocked,
      hitCeiling,
    };
  }

  public castCamera(
    from: Readonly<Vector3>,
    to: Readonly<Vector3>,
    radius: number,
  ): CameraCastResult {
    let fraction = 1;
    for (const box of this.boxes.values()) {
      const hit = segmentBoxFraction(from, to, box, radius);
      if (hit !== undefined) fraction = Math.min(fraction, hit);
    }

    const directionY = to.y - from.y;
    if (to.y < this.floorHeight + radius && directionY < -EPSILON) {
      const floorFraction = (this.floorHeight + radius - from.y) / directionY;
      if (floorFraction >= 0) fraction = Math.min(fraction, floorFraction);
    }
    return { fraction: Math.max(0, fraction), obstructed: fraction < 1 };
  }

  private resolveHorizontal(
    position: Vector3,
    shape: CharacterShape,
  ): { blocked: boolean; stepped: boolean; stepHeight: number } {
    let blocked = false;
    let stepped = false;
    let stepHeight = position.y;

    for (const box of this.boxes.values()) {
      if (position.y >= box.max.y - EPSILON) continue;
      if (position.y + shape.height <= box.min.y + EPSILON) continue;
      if (!circleOverlapsBox(position.x, position.z, shape.radius, box))
        continue;

      const rise = box.max.y - position.y;
      if (
        rise >= -EPSILON &&
        rise <= shape.stepHeight + EPSILON &&
        !this.hasHeadObstruction(position, box.max.y, shape, box.id)
      ) {
        stepped = true;
        stepHeight = Math.max(stepHeight, box.max.y);
        continue;
      }

      blocked = true;
      pushCircleOutsideBox(position, shape.radius, box);
    }
    return { blocked, stepped, stepHeight };
  }

  private groundAt(x: number, z: number, inset: number): GroundHit {
    let height = this.floorHeight;
    let colliderId = 'world-floor';
    for (const box of this.boxes.values()) {
      if (
        x >= box.min.x + inset &&
        x <= box.max.x - inset &&
        z >= box.min.z + inset &&
        z <= box.max.z - inset &&
        box.max.y > height
      ) {
        height = box.max.y;
        colliderId = box.id;
      }
    }
    let normal: Readonly<Vector3> = UP;
    for (const ramp of this.ramps.values()) {
      if (
        x < ramp.minX + inset ||
        x > ramp.maxX - inset ||
        z < ramp.minZ + inset ||
        z > ramp.maxZ - inset
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
      if (!circleOverlapsBox(position.x, position.z, shape.radius, box))
        continue;
      if (box.min.y < position.y + shape.height - EPSILON) continue;
      ceiling =
        ceiling === undefined ? box.min.y : Math.min(ceiling, box.min.y);
    }
    return ceiling;
  }

  private hasHeadObstruction(
    position: Readonly<Vector3>,
    footHeight: number,
    shape: CharacterShape,
    ignoredId: string,
  ): boolean {
    return [...this.boxes.values()].some(
      (box) =>
        box.id !== ignoredId &&
        circleOverlapsBox(position.x, position.z, shape.radius, box) &&
        box.max.y > footHeight &&
        box.min.y < footHeight + shape.height,
    );
  }
}

function circleOverlapsBox(
  x: number,
  z: number,
  radius: number,
  box: StaticBoxCollider,
): boolean {
  const closestX = Math.max(box.min.x, Math.min(x, box.max.x));
  const closestZ = Math.max(box.min.z, Math.min(z, box.max.z));
  const dx = x - closestX;
  const dz = z - closestZ;
  return dx * dx + dz * dz < radius * radius - EPSILON;
}

function pushCircleOutsideBox(
  position: Vector3,
  radius: number,
  box: StaticBoxCollider,
): void {
  const closestX = Math.max(box.min.x, Math.min(position.x, box.max.x));
  const closestZ = Math.max(box.min.z, Math.min(position.z, box.max.z));
  const dx = position.x - closestX;
  const dz = position.z - closestZ;
  const distance = Math.hypot(dx, dz);
  if (distance > EPSILON) {
    const correction = (radius - distance) / distance;
    position.x += dx * correction;
    position.z += dz * correction;
    return;
  }

  const choices = [
    {
      distance: Math.abs(position.x - box.min.x),
      x: box.min.x - radius,
      z: position.z,
    },
    {
      distance: Math.abs(box.max.x - position.x),
      x: box.max.x + radius,
      z: position.z,
    },
    {
      distance: Math.abs(position.z - box.min.z),
      x: position.x,
      z: box.min.z - radius,
    },
    {
      distance: Math.abs(box.max.z - position.z),
      x: position.x,
      z: box.max.z + radius,
    },
  ];
  choices.sort((a, b) => a.distance - b.distance);
  const nearest = choices[0];
  if (nearest) position.set(nearest.x, position.y, nearest.z);
}

function segmentBoxFraction(
  from: Readonly<Vector3>,
  to: Readonly<Vector3>,
  box: StaticBoxCollider,
  padding: number,
): number | undefined {
  let near = 0;
  let far = 1;
  const axes = ['x', 'y', 'z'] as const;
  for (const axis of axes) {
    const start = from[axis];
    const direction = to[axis] - start;
    const min = box.min[axis] - padding;
    const max = box.max[axis] + padding;
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
