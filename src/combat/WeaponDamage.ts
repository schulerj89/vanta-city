import { Vector3 } from 'three';
import type { HealthComponent, HealthChange } from '../health/Health';
import type { CollisionWorld } from '../physics/CollisionWorld';
import type { WorldPose } from '../world/Spatial';

export interface WeaponDamageTarget {
  readonly id: string;
  readonly ownerId: string;
  readonly enabled: boolean;
  readonly health: HealthComponent;
  getWorldPose(): WorldPose;
  getHurtVolume(): { readonly radius: number; readonly height: number };
  getCollisionIgnoreIds?(): readonly string[];
  receiveWeaponDamage?(impact: WeaponDamageImpact): boolean;
}

export interface WeaponDamageImpact {
  readonly attackerId: string;
  readonly itemId: 'handgun' | 'knife';
  readonly damage: number;
  readonly source: string;
  readonly point: Readonly<Vector3>;
}

export interface AimRay {
  readonly origin: Readonly<Vector3>;
  readonly direction: Readonly<Vector3>;
}

export interface GunAttackRequest extends AimRay {
  readonly attackerId: string;
  readonly damage: number;
  readonly range: number;
  readonly source: string;
}

export interface KnifeAttackRequest {
  readonly attackerId: string;
  readonly actor: WorldPose;
  readonly damage: number;
  readonly forwardOffset: number;
  readonly reach: number;
  readonly radius: number;
  readonly minimumY: number;
  readonly maximumY: number;
  readonly source: string;
}

export type WeaponAttackOutcome =
  'hit' | 'miss' | 'obstructed' | 'out-of-range';

export interface WeaponAttackResult {
  readonly outcome: WeaponAttackOutcome;
  readonly targetId: string | undefined;
  readonly obstructionId: string | undefined;
  readonly distance: number | undefined;
  readonly damage: number;
  readonly healthChange: HealthChange | undefined;
}

interface TargetHit {
  readonly target: WeaponDamageTarget;
  readonly distance: number;
  readonly point: Vector3;
}

export function resolveGunAttack(
  request: GunAttackRequest,
  targets: readonly WeaponDamageTarget[],
  collision?: Pick<CollisionWorld, 'castSegment'>,
): WeaponAttackResult {
  const direction = new Vector3().copy(request.direction);
  if (direction.lengthSq() <= 1e-9) return miss('miss');
  direction.normalize();
  const candidates = targets
    .filter((target) => target.ownerId !== request.attackerId)
    .filter((target) => target.enabled && target.health.alive)
    .map((target) => intersectTarget(request.origin, direction, target))
    .filter((hit): hit is TargetHit => hit !== undefined)
    .sort((left, right) => left.distance - right.distance);
  const hit = candidates[0];
  if (!hit) return miss('miss');
  if (hit.distance > request.range) {
    return {
      ...miss('out-of-range'),
      targetId: hit.target.id,
      distance: hit.distance,
    };
  }
  const obstruction = collision?.castSegment(request.origin, hit.point, {
    ignoreColliderIds: hit.target.getCollisionIgnoreIds?.(),
  });
  if (obstruction?.obstructed && obstruction.fraction < 1 - 1e-5) {
    return {
      ...miss('obstructed'),
      targetId: hit.target.id,
      obstructionId: obstruction.colliderId,
      distance: hit.distance,
    };
  }
  return applyImpact(hit, {
    attackerId: request.attackerId,
    itemId: 'handgun',
    damage: request.damage,
    source: request.source,
    point: hit.point,
  });
}

export function resolveKnifeAttack(
  request: KnifeAttackRequest,
  targets: readonly WeaponDamageTarget[],
  collision?: Pick<CollisionWorld, 'castSegment'>,
): WeaponAttackResult {
  const forward = new Vector3(
    request.actor.forward.x,
    0,
    request.actor.forward.z,
  );
  if (forward.lengthSq() <= 1e-9) forward.set(0, 0, 1);
  forward.normalize();
  const origin = new Vector3(
    request.actor.position.x,
    request.actor.position.y,
    request.actor.position.z,
  ).addScaledVector(forward, request.forwardOffset);
  const end = origin.clone().addScaledVector(forward, request.reach);
  const candidates = targets
    .filter((target) => target.ownerId !== request.attackerId)
    .filter((target) => target.enabled && target.health.alive)
    .map((target) => intersectKnifeVolume(request, origin, end, target))
    .filter((hit): hit is TargetHit => hit !== undefined)
    .sort((left, right) => left.distance - right.distance);
  const hit = candidates[0];
  if (!hit) return miss('miss');
  const obstruction = collision?.castSegment(origin, hit.point, {
    radius: request.radius,
    ignoreColliderIds: hit.target.getCollisionIgnoreIds?.(),
    ignoreInitialOverlapTags: ['walkable'],
  });
  if (obstruction?.obstructed && obstruction.fraction < 1 - 1e-5) {
    return {
      ...miss('obstructed'),
      targetId: hit.target.id,
      obstructionId: obstruction.colliderId,
      distance: hit.distance,
    };
  }
  return applyImpact(hit, {
    attackerId: request.attackerId,
    itemId: 'knife',
    damage: request.damage,
    source: request.source,
    point: hit.point,
  });
}

function intersectTarget(
  origin: Readonly<Vector3>,
  direction: Readonly<Vector3>,
  target: WeaponDamageTarget,
): TargetHit | undefined {
  const pose = target.getWorldPose();
  const hurt = target.getHurtVolume();
  const center = new Vector3(
    pose.position.x,
    pose.position.y + hurt.height / 2,
    pose.position.z,
  );
  const along = center.clone().sub(origin).dot(direction);
  if (along < 0) return undefined;
  const point = new Vector3().copy(direction).multiplyScalar(along).add(origin);
  const vertical = Math.abs(point.y - center.y);
  const horizontal = Math.hypot(point.x - center.x, point.z - center.z);
  if (vertical > hurt.height / 2 || horizontal > hurt.radius) return undefined;
  return { target, distance: along, point };
}

function intersectKnifeVolume(
  request: KnifeAttackRequest,
  start: Vector3,
  end: Vector3,
  target: WeaponDamageTarget,
): TargetHit | undefined {
  const pose = target.getWorldPose();
  const hurt = target.getHurtVolume();
  const segment = end.clone().sub(start);
  const center = new Vector3(pose.position.x, start.y, pose.position.z);
  const projection = Math.max(
    0,
    Math.min(
      1,
      center.clone().sub(start).dot(segment) /
        Math.max(segment.lengthSq(), 1e-9),
    ),
  );
  const point = start.clone().addScaledVector(segment, projection);
  const separation = Math.hypot(
    point.x - pose.position.x,
    point.z - pose.position.z,
  );
  const verticalOverlap =
    request.actor.position.y + request.maximumY > pose.position.y &&
    request.actor.position.y + request.minimumY < pose.position.y + hurt.height;
  if (separation > request.radius + hurt.radius || !verticalOverlap)
    return undefined;
  return { target, distance: start.distanceTo(point), point };
}

function applyImpact(
  hit: TargetHit,
  impact: WeaponDamageImpact,
): WeaponAttackResult {
  if (
    hit.target.receiveWeaponDamage &&
    !hit.target.receiveWeaponDamage(impact)
  ) {
    return { ...miss('miss'), targetId: hit.target.id, distance: hit.distance };
  }
  const healthChange = hit.target.health.damage(impact.damage, impact.source);
  return {
    outcome: 'hit',
    targetId: hit.target.id,
    obstructionId: undefined,
    distance: hit.distance,
    damage: healthChange ? -healthChange.delta : 0,
    healthChange,
  };
}

function miss(
  outcome: Exclude<WeaponAttackOutcome, 'hit'>,
): WeaponAttackResult {
  return {
    outcome,
    targetId: undefined,
    obstructionId: undefined,
    distance: undefined,
    damage: 0,
    healthChange: undefined,
  };
}
