import type {
  BoxVisualDefinition,
  BuildingVisualDefinition,
  LevelDefinition,
  LevelMapBoundsDefinition,
  LevelMapLayer,
  SplineRoadVisualDefinition,
  TransformDefinition,
} from '../world/LevelDefinition';
import type { WorldPosition } from '../world/Spatial';
import { getAshfallBuildingVariant } from '../world/buildings/AshfallBuildingKit';
import { sampleSplineRoad } from '../world/levels/SplineRoadGeometry';

export const levelMapViewSize = 100;

export type LevelMapGeometryPrimitive =
  | {
      readonly kind: 'path';
      readonly entryId: string;
      readonly layer: Extract<LevelMapLayer, 'roads' | 'structures'>;
      readonly points: readonly { readonly x: number; readonly y: number }[];
      readonly strokeWidth: number;
    }
  | {
      readonly kind: 'rect';
      readonly entryId: string;
      readonly layer: Extract<LevelMapLayer, 'roads' | 'structures'>;
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly rotationDegrees: number;
      readonly center: { readonly x: number; readonly y: number };
    };

export interface LevelMapMarkerPrimitive {
  readonly entryId: string;
  readonly layer: Extract<
    LevelMapLayer,
    'landmarks' | 'interactions' | 'spawns'
  >;
  readonly point: { readonly x: number; readonly y: number };
}

/** Resolves immutable authored map references without reading rendered scenes. */
export function resolveLevelMapGeometry(
  level: LevelDefinition,
): readonly LevelMapGeometryPrimitive[] {
  const map = level.mapPresentation;
  if (!map) return [];
  const geometry = new Map(
    level.environment
      .filter(
        (
          entry,
        ): entry is
          | BoxVisualDefinition
          | BuildingVisualDefinition
          | SplineRoadVisualDefinition =>
          entry.kind === 'box' ||
          entry.kind === 'building' ||
          entry.kind === 'spline-road',
      )
      .map((entry) => [entry.id, entry]),
  );
  return map.geometry.flatMap((reference): LevelMapGeometryPrimitive[] => {
    const entry = geometry.get(reference.entryId);
    if (!entry) return [];
    if (entry.kind === 'spline-road') {
      return [
        {
          kind: 'path',
          entryId: entry.id,
          layer: reference.layer,
          points: sampleSplineRoad(entry).map(({ position }) =>
            projectTupleToMap(position, map.bounds),
          ),
          strokeWidth:
            (entry.width / (map.bounds.maxX - map.bounds.minX)) *
            levelMapViewSize,
        },
      ];
    }
    const rectangular = mapGeometry(entry);
    const topLeft = projectWorldToMap(
      {
        x: rectangular.position[0] - rectangular.size[0] / 2,
        z: rectangular.position[2] + rectangular.size[2] / 2,
      },
      map.bounds,
    );
    const bottomRight = projectWorldToMap(
      {
        x: rectangular.position[0] + rectangular.size[0] / 2,
        z: rectangular.position[2] - rectangular.size[2] / 2,
      },
      map.bounds,
    );
    return [
      {
        kind: 'rect',
        entryId: entry.id,
        layer: reference.layer,
        x: topLeft.x,
        y: topLeft.y,
        width: bottomRight.x - topLeft.x,
        height: bottomRight.y - topLeft.y,
        rotationDegrees: ((rectangular.rotation?.[1] ?? 0) * 180) / Math.PI,
        center: projectTupleToMap(rectangular.position, map.bounds),
      },
    ];
  });
}

export function resolveLevelMapMarkers(
  level: LevelDefinition,
): readonly LevelMapMarkerPrimitive[] {
  const map = level.mapPresentation;
  if (!map) return [];
  return map.markers.flatMap((reference): LevelMapMarkerPrimitive[] => {
    const entry = findMapEntry(level, reference.entryId);
    return entry
      ? [
          {
            entryId: reference.entryId,
            layer: reference.layer,
            point: projectTupleToMap(entry.position, map.bounds),
          },
        ]
      : [];
  });
}

export function projectWorldToMap(
  position: Pick<WorldPosition, 'x' | 'z'>,
  bounds: LevelMapBoundsDefinition,
): { readonly x: number; readonly y: number } {
  return {
    x:
      ((position.x - bounds.minX) / (bounds.maxX - bounds.minX)) *
      levelMapViewSize,
    y:
      ((bounds.maxZ - position.z) / (bounds.maxZ - bounds.minZ)) *
      levelMapViewSize,
  };
}

export function projectTupleToMap(
  position: readonly [number, number, number],
  bounds: LevelMapBoundsDefinition,
): { readonly x: number; readonly y: number } {
  return projectWorldToMap({ x: position[0], z: position[2] }, bounds);
}

export function headingDegreesFromForward(
  forward: Pick<WorldPosition, 'x' | 'z'>,
): number {
  const degrees = (Math.atan2(forward.x, forward.z) * 180) / Math.PI;
  return (degrees + 360) % 360;
}

function mapGeometry(
  entry: BoxVisualDefinition | BuildingVisualDefinition,
): TransformDefinition & {
  readonly id: string;
  readonly size: readonly [number, number, number];
} {
  if (entry.kind === 'box') return entry;
  const variant = getAshfallBuildingVariant(entry.variantId);
  return {
    ...entry,
    size: [variant.footprint[0], variant.height, variant.footprint[1]],
  };
}

function findMapEntry(
  level: LevelDefinition,
  id: string,
): TransformDefinition | undefined {
  return [...level.landmarks, ...level.locations, ...level.spawns].find(
    (entry) => entry.id === id,
  );
}
