export type CinematicCompletionResult =
  'completed' | 'skipped' | 'cancelled' | 'failed';

export interface CinematicSubtitleRequest {
  readonly speakerId: string;
  readonly text: string;
  readonly startSeconds: number;
  readonly endSeconds: number;
}

export interface CinematicShotDefinition {
  readonly id: string;
  readonly purpose: string;
  readonly cameraAnchorId: string;
  readonly durationSeconds: number;
  readonly transition: 'cut' | 'ease';
  readonly transitionSeconds: number;
  readonly obstructionPolicy: 'shared-camera-collision';
  readonly participantIds: readonly string[];
  readonly subtitle: CinematicSubtitleRequest;
  readonly safeFrame: {
    readonly minSubjectMarginPercent: number;
    readonly narrowFieldOfView?: number;
  };
}

export interface CinematicDefinition {
  readonly id: string;
  readonly storyBeatId: string;
  readonly missionId: string;
  readonly participantIds: readonly string[];
  readonly speakerIds: readonly string[];
  readonly entryEventId: string;
  readonly completionEventId: string;
  readonly shots: readonly CinematicShotDefinition[];
  readonly skipPolicy: 'confirm';
  readonly dependencies: {
    readonly levelId: string;
    readonly locationId: string;
    readonly cameraAnchorIds: readonly string[];
    readonly assetIds: readonly string[];
    readonly animationIds: readonly string[];
    readonly worldFactIds: readonly string[];
  };
  readonly restorationPolicy: 'exact-prior-gameplay';
}

export class CinematicCatalog {
  private readonly definitions: ReadonlyMap<string, CinematicDefinition>;

  public constructor(definitions: readonly CinematicDefinition[]) {
    this.definitions = new Map(
      definitions.map((definition) => {
        validateCinematicDefinition(definition);
        return [definition.id, definition];
      }),
    );
    if (this.definitions.size !== definitions.length) {
      throw new Error('Cinematic definitions require unique IDs');
    }
  }

  public get(id: string): CinematicDefinition | undefined {
    return this.definitions.get(id);
  }
}

export function validateCinematicDefinition(
  definition: CinematicDefinition,
): void {
  if (!definition.id || !definition.storyBeatId || !definition.missionId) {
    throw new Error('Cinematic definitions require stable IDs and references');
  }
  if (definition.shots.length === 0) {
    throw new Error(`Cinematic "${definition.id}" requires at least one shot`);
  }
  const shotIds = new Set<string>();
  for (const shot of definition.shots) {
    if (!shot.id || shotIds.has(shot.id)) {
      throw new Error(`Cinematic "${definition.id}" has a duplicate shot ID`);
    }
    shotIds.add(shot.id);
    if (!Number.isFinite(shot.durationSeconds) || shot.durationSeconds <= 0) {
      throw new Error(`Cinematic shot "${shot.id}" has an invalid duration`);
    }
    const subtitle = shot.subtitle;
    if (
      !subtitle.text.trim() ||
      subtitle.startSeconds < 0 ||
      subtitle.endSeconds <= subtitle.startSeconds ||
      subtitle.endSeconds > shot.durationSeconds
    ) {
      throw new Error(
        `Cinematic shot "${shot.id}" has invalid subtitle timing`,
      );
    }
  }
}
