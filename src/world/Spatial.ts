export type Vector3Tuple = readonly [x: number, y: number, z: number];

export interface WorldPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface WorldPose {
  readonly position: WorldPosition;
  readonly forward: WorldPosition;
  /** Horizontal collision radius used by proximity queries. */
  readonly radius?: number;
}

export interface WorldPoseSource {
  getWorldPose(): WorldPose | undefined;
}
