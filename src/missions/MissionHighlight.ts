export type MissionHighlightChannel = 'world' | 'map';

export type MissionTargetKind =
  'entity' | 'spawn' | 'location' | 'interaction' | 'trigger' | 'landmark';

/** ID-only request shared by mission, world-indicator, minimap, and full map. */
export interface MissionHighlightSnapshot {
  readonly id: string;
  readonly missionId: string;
  readonly objectiveId: string;
  readonly channels: readonly MissionHighlightChannel[];
  readonly target: {
    readonly kind: MissionTargetKind;
    readonly referenceId: string;
  };
  readonly label: string;
  readonly priority: 'primary' | 'secondary';
}

/** Read-only observation boundary; rendering and coordinate resolution stay local. */
export interface MissionHighlightSource {
  getHighlights(): readonly MissionHighlightSnapshot[];
  subscribe(listener: () => void): () => void;
}
