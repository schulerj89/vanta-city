import type { MissionFactValue } from '../missions/MissionDefinition';

export type CinematicCompletionResult =
  'completed' | 'skipped' | 'cancelled' | 'failed';

export interface CinematicSubtitleRequest {
  readonly id?: string;
  readonly speakerId: string;
  readonly text: string;
  readonly startSeconds: number;
  readonly endSeconds: number;
}

export type CinematicPerformanceIntent =
  | 'neutral-hold'
  | 'approach'
  | 'turn-to'
  | 'listen'
  | 'speak-restrained'
  | 'speak-emphatic'
  | 'indicate'
  | 'dismiss'
  | 'react-alert'
  | 'sit'
  | 'seated-hold'
  | 'stand'
  | 'dance'
  | 'prop-use';

export interface CinematicPerformanceRequest {
  readonly cueId: string;
  readonly shotId: string;
  readonly atSeconds: number;
  readonly participantId: string;
  readonly intent: CinematicPerformanceIntent;
  readonly phase: 'start' | 'hold' | 'release';
  readonly targetParticipantId?: string;
  readonly targetMarkId?: string;
  readonly propMarkId?: string;
  readonly missingPerformancePolicy: 'block' | 'neutral-fallback';
  readonly required?: boolean;
}

export interface CinematicBlockingRequest {
  readonly participantId: string;
  readonly markId: string;
  readonly facingParticipantId?: string;
  readonly maximumDisplacementMetres: number;
}

export interface CinematicPathRequest {
  readonly id: string;
  readonly visualIds: readonly string[];
  readonly pointIds: readonly string[];
  readonly startSeconds: number;
  readonly durationSeconds: number;
}

export interface CinematicShotDefinition {
  readonly id: string;
  readonly purpose: string;
  readonly cameraAnchorId: string;
  readonly alternateCameraAnchorId?: string;
  readonly durationSeconds: number;
  readonly transition: 'cut' | 'ease';
  readonly transitionSeconds: number;
  readonly obstructionPolicy: 'shared-camera-collision';
  readonly participantIds: readonly string[];
  /** Subjects that must pass the live projection/occlusion gate before filming. */
  readonly requiredSubjectIds?: readonly string[];
  /** Level-owned visuals that motivate an exterior/action shot without actor claims. */
  readonly requiredVisualIds?: readonly string[];
  /** Legacy one-cue authoring surface. Prefer subtitleCues for new scenes. */
  readonly subtitle?: CinematicSubtitleRequest;
  readonly subtitleCues?: readonly CinematicSubtitleRequest[];
  readonly performanceRequests?: readonly CinematicPerformanceRequest[];
  readonly pathRequests?: readonly CinematicPathRequest[];
  readonly safeFrame: {
    readonly minSubjectMarginPercent: number;
    readonly narrowFieldOfView?: number;
  };
}

export interface CinematicDestinationRequest {
  readonly id: string;
  readonly levelId: string;
  readonly locationId: string;
  readonly spawnId: string;
  readonly cameraAnchorId: string;
}

export interface CinematicLandingTransaction {
  readonly id: string;
  readonly factChanges: Readonly<Record<string, MissionFactValue>>;
  readonly storyEffectIds: readonly string[];
  readonly missionHandoffIds: readonly string[];
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
  readonly blocking?: readonly CinematicBlockingRequest[];
  readonly skipPolicy: 'confirm';
  readonly dependencies: {
    readonly levelId: string;
    readonly locationId: string;
    readonly cameraAnchorIds: readonly string[];
    readonly assetIds: readonly string[];
    readonly animationIds: readonly string[];
    readonly worldFactIds: readonly string[];
  };
  readonly restorationPolicy:
    'exact-prior-gameplay' | 'authoritative-destination';
  readonly destination?: CinematicDestinationRequest;
  readonly destinationShot?: CinematicShotDefinition;
  readonly landingTransaction?: CinematicLandingTransaction;
  readonly participantFailurePolicy?:
    'fail-and-restore' | 'land-at-destination';
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
  const performanceCueIds = new Set<string>();
  for (const shot of definition.shots) {
    if (!shot.id || shotIds.has(shot.id)) {
      throw new Error(`Cinematic "${definition.id}" has a duplicate shot ID`);
    }
    shotIds.add(shot.id);
    if (!Number.isFinite(shot.durationSeconds) || shot.durationSeconds <= 0) {
      throw new Error(`Cinematic shot "${shot.id}" has an invalid duration`);
    }
    const subtitles = getCinematicSubtitleCues(shot);
    let priorEnd = -1;
    const cueIds = new Set<string>();
    for (const [index, subtitle] of subtitles.entries()) {
      const cueId = subtitle.id ?? `${shot.id}:subtitle:${index}`;
      if (cueIds.has(cueId)) {
        throw new Error(`Cinematic shot "${shot.id}" has duplicate cue IDs`);
      }
      cueIds.add(cueId);
      if (
        !subtitle.text.trim() ||
        subtitle.startSeconds < 0 ||
        subtitle.endSeconds <= subtitle.startSeconds ||
        subtitle.endSeconds > shot.durationSeconds ||
        subtitle.startSeconds <= priorEnd
      ) {
        throw new Error(
          `Cinematic shot "${shot.id}" has invalid subtitle timing`,
        );
      }
      priorEnd = subtitle.endSeconds;
    }
    for (const request of shot.performanceRequests ?? []) {
      if (
        !request.cueId ||
        performanceCueIds.has(request.cueId) ||
        request.shotId !== shot.id ||
        request.atSeconds < 0 ||
        request.atSeconds > shot.durationSeconds ||
        !shot.participantIds.includes(request.participantId) ||
        !performanceIntents.has(request.intent)
      ) {
        throw new Error(
          `Cinematic shot "${shot.id}" has an invalid performance request`,
        );
      }
      performanceCueIds.add(request.cueId);
    }
    for (const request of shot.pathRequests ?? []) {
      if (
        !request.id ||
        request.visualIds.length === 0 ||
        request.pointIds.length < 2 ||
        request.visualIds.some((id) => !id) ||
        request.pointIds.some((id) => !id) ||
        request.startSeconds < 0 ||
        request.durationSeconds <= 0 ||
        request.startSeconds + request.durationSeconds > shot.durationSeconds
      ) {
        throw new Error(
          `Cinematic shot "${shot.id}" has an invalid path request`,
        );
      }
    }
    if (
      shot.requiredSubjectIds?.some((id) => !shot.participantIds.includes(id))
    ) {
      throw new Error(
        `Cinematic shot "${shot.id}" requires an undeclared subject`,
      );
    }
  }
  if (definition.blocking) {
    const participants = new Set<string>();
    for (const request of definition.blocking) {
      if (
        !definition.participantIds.includes(request.participantId) ||
        participants.has(request.participantId) ||
        !request.markId ||
        request.maximumDisplacementMetres < 0
      ) {
        throw new Error(`Cinematic "${definition.id}" has invalid blocking`);
      }
      participants.add(request.participantId);
    }
  }
  const destinationPolicy =
    definition.restorationPolicy === 'authoritative-destination';
  if (
    destinationPolicy !==
    Boolean(definition.destination && definition.landingTransaction)
  ) {
    throw new Error(
      `Cinematic "${definition.id}" has an incomplete destination transaction`,
    );
  }
  if (definition.destination && definition.landingTransaction) {
    if (
      !definition.destination.id ||
      !definition.destination.levelId ||
      !definition.destination.locationId ||
      !definition.destination.spawnId ||
      !definition.destination.cameraAnchorId ||
      !definition.landingTransaction.id ||
      !validFactChanges(definition.landingTransaction.factChanges) ||
      hasEmptyOrDuplicate(definition.landingTransaction.storyEffectIds) ||
      hasEmptyOrDuplicate(definition.landingTransaction.missionHandoffIds)
    ) {
      throw new Error(
        `Cinematic "${definition.id}" has an invalid destination transaction`,
      );
    }
  }
  if (definition.destinationShot) {
    if (!definition.destination || !definition.landingTransaction) {
      throw new Error(
        `Cinematic "${definition.id}" has a destination shot without a destination`,
      );
    }
    validateDestinationShot(definition.destinationShot, definition);
  }
}

function validFactChanges(
  changes: Readonly<Record<string, MissionFactValue>>,
): boolean {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
    return false;
  }
  return Object.entries(changes).every(
    ([id, value]) =>
      id.trim().length > 0 &&
      (typeof value === 'string' ||
        typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value))),
  );
}

function validateDestinationShot(
  shot: CinematicShotDefinition,
  definition: CinematicDefinition,
): void {
  if (
    !shot.id ||
    shot.durationSeconds <= 0 ||
    shot.cameraAnchorId !== definition.destination?.cameraAnchorId ||
    shot.performanceRequests?.length ||
    shot.pathRequests?.length
  ) {
    throw new Error(
      `Cinematic "${definition.id}" has an invalid destination shot`,
    );
  }
}

const performanceIntents = new Set<CinematicPerformanceIntent>([
  'neutral-hold',
  'approach',
  'turn-to',
  'listen',
  'speak-restrained',
  'speak-emphatic',
  'indicate',
  'dismiss',
  'react-alert',
  'sit',
  'seated-hold',
  'stand',
  'dance',
  'prop-use',
]);

function hasEmptyOrDuplicate(ids: readonly string[]): boolean {
  return ids.some((id) => !id) || new Set(ids).size !== ids.length;
}

export function getCinematicSubtitleCues(
  shot: CinematicShotDefinition,
): readonly CinematicSubtitleRequest[] {
  if (shot.subtitleCues && shot.subtitle) {
    throw new Error(
      `Cinematic shot "${shot.id}" cannot declare subtitle and subtitleCues`,
    );
  }
  return shot.subtitleCues ?? (shot.subtitle ? [shot.subtitle] : []);
}
