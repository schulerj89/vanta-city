import type { Vector3Tuple } from '../world/Spatial';

/** Authored static collision shared by level data and collision backends. */
export interface StaticColliderDefinition {
  readonly id: string;
  readonly position: Vector3Tuple;
  readonly size: Vector3Tuple;
  readonly rotation?: Vector3Tuple;
  readonly tags?: readonly string[];
}
