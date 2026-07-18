import type { StaticColliderDefinition } from '../../physics/StaticCollider';
import type {
  SplineRoadVisualDefinition,
  Vector3Tuple,
} from '../LevelDefinition';

export interface SplineSample {
  readonly position: Vector3Tuple;
  /** Unit tangent in world X/Z. */
  readonly tangent: readonly [x: number, z: number];
  readonly distance: number;
}

/** Deterministically samples the authored cubic centerline by parameter. */
export function sampleSplineRoad(
  road: SplineRoadVisualDefinition,
): readonly SplineSample[] {
  const samples: SplineSample[] = [];
  let distance = 0;
  let previous: Vector3Tuple | undefined;
  for (let index = 0; index <= road.segments; index += 1) {
    const t = index / road.segments;
    const position = cubicPoint(road.controlPoints, t);
    if (previous)
      distance += Math.hypot(
        position[0] - previous[0],
        position[2] - previous[2],
      );
    const tangent = cubicTangent(road.controlPoints, t);
    samples.push({ position, tangent, distance });
    previous = position;
  }
  return samples;
}

/** Offsets samples to the left of centerline travel. */
export function offsetSplineSamples(
  samples: readonly SplineSample[],
  offset: number,
): readonly SplineSample[] {
  return samples.map((sample) => ({
    ...sample,
    position: [
      sample.position[0] - sample.tangent[1] * offset,
      sample.position[1],
      sample.position[2] + sample.tangent[0] * offset,
    ],
  }));
}

/** Walkable oriented boxes overlap slightly so sampled road collision has no seams. */
export function splineRoadColliders(
  road: SplineRoadVisualDefinition,
): readonly StaticColliderDefinition[] {
  const samples = sampleSplineRoad(road);
  return samples.slice(1).map((end, index) => {
    const start = samples[index]!;
    const dx = end.position[0] - start.position[0];
    const dz = end.position[2] - start.position[2];
    const length = Math.hypot(dx, dz);
    return {
      id: `c.${road.id.slice(2)}.segment-${String(index + 1).padStart(2, '0')}`,
      position: [
        (start.position[0] + end.position[0]) / 2,
        (start.position[1] + end.position[1]) / 2 - road.thickness / 2,
        (start.position[2] + end.position[2]) / 2,
      ],
      size: [road.width, road.thickness, length + 0.08],
      rotation: [0, Math.atan2(dx, dz), 0],
      tags: ['walkable', 'spline-road', road.id],
    };
  });
}

export function pointAlongSamples(
  samples: readonly SplineSample[],
  distance: number,
): SplineSample {
  const clamped = Math.max(0, Math.min(distance, samples.at(-1)!.distance));
  for (let index = 1; index < samples.length; index += 1) {
    const end = samples[index]!;
    if (end.distance < clamped) continue;
    const start = samples[index - 1]!;
    const span = end.distance - start.distance;
    const mix = span > 0 ? (clamped - start.distance) / span : 0;
    const x = start.position[0] + (end.position[0] - start.position[0]) * mix;
    const y = start.position[1] + (end.position[1] - start.position[1]) * mix;
    const z = start.position[2] + (end.position[2] - start.position[2]) * mix;
    const dx = end.position[0] - start.position[0];
    const dz = end.position[2] - start.position[2];
    const magnitude = Math.hypot(dx, dz) || 1;
    return {
      position: [x, y, z],
      tangent: [dx / magnitude, dz / magnitude],
      distance: clamped,
    };
  }
  return samples.at(-1)!;
}

function cubicPoint(
  [start, controlA, controlB, end]: SplineRoadVisualDefinition['controlPoints'],
  t: number,
): Vector3Tuple {
  const inverse = 1 - t;
  const component = (axis: 0 | 1 | 2): number =>
    inverse * inverse * inverse * start[axis] +
    3 * inverse * inverse * t * controlA[axis] +
    3 * inverse * t * t * controlB[axis] +
    t * t * t * end[axis];
  return [component(0), component(1), component(2)];
}

function cubicTangent(
  [start, controlA, controlB, end]: SplineRoadVisualDefinition['controlPoints'],
  t: number,
): readonly [number, number] {
  const inverse = 1 - t;
  const dx =
    3 * inverse * inverse * (controlA[0] - start[0]) +
    6 * inverse * t * (controlB[0] - controlA[0]) +
    3 * t * t * (end[0] - controlB[0]);
  const dz =
    3 * inverse * inverse * (controlA[2] - start[2]) +
    6 * inverse * t * (controlB[2] - controlA[2]) +
    3 * t * t * (end[2] - controlB[2]);
  const magnitude = Math.hypot(dx, dz) || 1;
  return [dx / magnitude, dz / magnitude];
}
