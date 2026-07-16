import type { Object3D } from 'three';
import type { FrameTime } from '../core/time';

export interface GameObject {
  readonly id: string;
  readonly object3d: Object3D;
  update?(time: FrameTime): void;
  dispose?(): void;
}
