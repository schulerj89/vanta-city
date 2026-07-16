import { Box3, Matrix4, Vector3 } from 'three';
import type { Object3D } from 'three';

export interface VerticalBounds {
  readonly minY: number;
  readonly maxY: number;
}

export interface CharacterVisualAlignment {
  readonly computedHeight: number;
  readonly computedMinimumY: number;
  readonly appliedVisualOffset: number;
  readonly alignedLowestY: number;
  readonly usedExplicitOffset: boolean;
}

export interface CharacterAlignmentReport extends CharacterVisualAlignment {
  readonly characterId: string;
  /** Bounds after authored model transforms, before alignment translation. */
  readonly modelBounds: Box3;
}

export function calculateCharacterVisualAlignment(
  bounds: VerticalBounds,
  explicitVerticalOffset?: number,
  groundContactY = 0,
): CharacterVisualAlignment {
  if (!Number.isFinite(bounds.minY) || !Number.isFinite(bounds.maxY)) {
    throw new Error('Character bounds must be finite');
  }
  if (bounds.maxY < bounds.minY) {
    throw new Error('Character maximum Y must not be below minimum Y');
  }
  if (
    explicitVerticalOffset !== undefined &&
    !Number.isFinite(explicitVerticalOffset)
  ) {
    throw new Error('Character vertical offset must be finite');
  }

  const appliedVisualOffset =
    explicitVerticalOffset ?? groundContactY - bounds.minY;
  return {
    computedHeight: bounds.maxY - bounds.minY,
    computedMinimumY: bounds.minY,
    appliedVisualOffset,
    alignedLowestY: bounds.minY + appliedVisualOffset,
    usedExplicitOffset: explicitVerticalOffset !== undefined,
  };
}

/** Measures a fully transformed model in the coordinate space of its parent. */
export function measureModelBounds(modelRoot: Object3D): Box3 {
  modelRoot.updateWorldMatrix(true, true);
  const bounds = new Box3().setFromObject(modelRoot, true);
  if (bounds.isEmpty()) return new Box3(new Vector3(), new Vector3());

  const parent = modelRoot.parent;
  if (parent) {
    parent.updateWorldMatrix(true, false);
    bounds.applyMatrix4(new Matrix4().copy(parent.matrixWorld).invert());
  }
  return bounds;
}
