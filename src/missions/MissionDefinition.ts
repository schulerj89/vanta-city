import type {
  MissionHighlightChannel,
  MissionTargetKind,
} from './MissionHighlight';

export type MissionFactValue = string | number | boolean;

export interface MissionFactRequirement {
  readonly id: string;
  readonly equals: MissionFactValue;
}

export type MissionRuntimeEvent =
  | { readonly type: 'world-trigger-entered'; readonly triggerId: string }
  | { readonly type: 'world-location-entered'; readonly locationId: string }
  | {
      readonly type: 'interaction-completed';
      readonly interactionId: string;
    }
  | {
      readonly type: 'entity-interaction-completed';
      readonly entityId: string;
    }
  | { readonly type: 'dialogue-completed'; readonly conversationId: string }
  | { readonly type: 'event-hook'; readonly hookId: string };

export type MissionCondition =
  | { readonly type: 'world-trigger-entered'; readonly triggerId: string }
  | { readonly type: 'world-location-entered'; readonly locationId: string }
  | {
      readonly type: 'interaction-completed';
      readonly interactionId: string;
    }
  | {
      readonly type: 'entity-interaction-completed';
      readonly entityId: string;
    }
  | { readonly type: 'dialogue-completed'; readonly conversationId: string }
  | { readonly type: 'event-hook'; readonly hookId: string };

export interface MissionHighlightDefinition {
  readonly id: string;
  readonly channels: readonly MissionHighlightChannel[];
  readonly target: {
    readonly kind: MissionTargetKind;
    readonly referenceId: string;
  };
  readonly label: string;
  readonly priority: 'primary' | 'secondary';
}

export interface MissionObjectiveDefinition {
  readonly id: string;
  readonly summary: string;
  readonly condition: MissionCondition;
  readonly highlights?: readonly MissionHighlightDefinition[];
}

export interface MissionContentRequestDefinition {
  readonly kind: 'cinematic' | 'dialogue';
  readonly referenceId: string;
  readonly optional: boolean;
  readonly phase: 'started' | 'objective-completed' | 'completed';
  readonly objectiveId?: string;
}

export interface MissionRewardDefinition {
  readonly id: string;
  readonly moneyAmount?: number;
  readonly equipmentIds?: readonly string[];
  readonly factChanges: Readonly<Record<string, MissionFactValue>>;
}

export interface MissionDefinition {
  readonly id: string;
  readonly title: string;
  readonly narrativePurpose: string;
  readonly prerequisiteMissionIds: readonly string[];
  readonly prerequisiteFacts: readonly MissionFactRequirement[];
  readonly startCondition: MissionCondition;
  readonly startLocationId: string;
  readonly objectives: readonly MissionObjectiveDefinition[];
  readonly contentRequests?: readonly MissionContentRequestDefinition[];
  /** Cancellation remains available until this objective has completed. */
  readonly cancellationUntilObjectiveId?: string;
  readonly reward: MissionRewardDefinition;
  readonly persistentFactIds: readonly string[];
}

const idPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

export function validateMissionDefinitions(
  definitions: readonly MissionDefinition[],
): readonly MissionDefinition[] {
  const missionIds = new Set<string>();
  const globalObjectiveIds = new Set<string>();
  const globalHighlightIds = new Set<string>();
  for (const definition of definitions) {
    assertId(definition.id, 'mission');
    if (missionIds.has(definition.id)) {
      throw new Error(`Duplicate mission id: ${definition.id}`);
    }
    missionIds.add(definition.id);
    if (!definition.title.trim() || !definition.narrativePurpose.trim()) {
      throw new Error(`Mission "${definition.id}" requires authored text`);
    }
    assertId(definition.startLocationId, 'start location');
    assertCondition(definition.startCondition);
    if (definition.objectives.length === 0) {
      throw new Error(`Mission "${definition.id}" has no objectives`);
    }
    const localObjectives = new Set<string>();
    for (const objective of definition.objectives) {
      assertId(objective.id, 'objective');
      if (!objective.summary.trim()) {
        throw new Error(`Objective "${objective.id}" requires authored text`);
      }
      if (
        localObjectives.has(objective.id) ||
        globalObjectiveIds.has(objective.id)
      ) {
        throw new Error(`Duplicate objective id: ${objective.id}`);
      }
      localObjectives.add(objective.id);
      globalObjectiveIds.add(objective.id);
      assertCondition(objective.condition);
      for (const highlight of objective.highlights ?? []) {
        assertId(highlight.id, 'highlight');
        assertId(highlight.target.referenceId, 'highlight target');
        if (globalHighlightIds.has(highlight.id)) {
          throw new Error(`Duplicate mission highlight id: ${highlight.id}`);
        }
        globalHighlightIds.add(highlight.id);
        if (highlight.channels.length === 0) {
          throw new Error(`Highlight "${highlight.id}" has no channels`);
        }
        if (!highlight.label.trim()) {
          throw new Error(`Highlight "${highlight.id}" requires a label`);
        }
      }
    }
    if (
      definition.cancellationUntilObjectiveId !== undefined &&
      !localObjectives.has(definition.cancellationUntilObjectiveId)
    ) {
      throw new Error(
        `Mission "${definition.id}" cancellation references an unknown objective`,
      );
    }
    assertId(definition.reward.id, 'reward');
    if (
      definition.reward.moneyAmount !== undefined &&
      (!Number.isSafeInteger(definition.reward.moneyAmount) ||
        definition.reward.moneyAmount <= 0)
    ) {
      throw new Error(`Mission "${definition.id}" has an invalid money reward`);
    }
    for (const factId of definition.persistentFactIds) assertId(factId, 'fact');
    for (const factId of Object.keys(definition.reward.factChanges)) {
      assertId(factId, 'reward fact');
      if (!definition.persistentFactIds.includes(factId)) {
        throw new Error(
          `Reward fact "${factId}" is not declared persistent by "${definition.id}"`,
        );
      }
    }
    for (const request of definition.contentRequests ?? []) {
      assertId(request.referenceId, `${request.kind} request`);
      if (request.phase === 'objective-completed') {
        if (
          request.objectiveId === undefined ||
          !localObjectives.has(request.objectiveId)
        ) {
          throw new Error(
            `Mission "${definition.id}" content request references an unknown objective`,
          );
        }
      } else if (request.objectiveId !== undefined) {
        throw new Error(
          `Mission "${definition.id}" content request has an unexpected objective`,
        );
      }
    }
  }
  for (const definition of definitions) {
    for (const prerequisite of definition.prerequisiteMissionIds) {
      if (!missionIds.has(prerequisite)) {
        throw new Error(
          `Mission "${definition.id}" references unknown prerequisite "${prerequisite}"`,
        );
      }
    }
    for (const fact of definition.prerequisiteFacts) assertId(fact.id, 'fact');
  }
  return Object.freeze([...definitions]);
}

export function missionConditionMatches(
  condition: MissionCondition,
  event: MissionRuntimeEvent,
): boolean {
  if (condition.type !== event.type) return false;
  switch (condition.type) {
    case 'world-trigger-entered':
      return condition.triggerId === (event as typeof condition).triggerId;
    case 'world-location-entered':
      return condition.locationId === (event as typeof condition).locationId;
    case 'interaction-completed':
      return (
        condition.interactionId === (event as typeof condition).interactionId
      );
    case 'entity-interaction-completed':
      return condition.entityId === (event as typeof condition).entityId;
    case 'dialogue-completed':
      return (
        condition.conversationId === (event as typeof condition).conversationId
      );
    case 'event-hook':
      return condition.hookId === (event as typeof condition).hookId;
  }
}

function assertCondition(condition: MissionCondition): void {
  const referenceId =
    'triggerId' in condition
      ? condition.triggerId
      : 'locationId' in condition
        ? condition.locationId
        : 'interactionId' in condition
          ? condition.interactionId
          : 'entityId' in condition
            ? condition.entityId
            : 'conversationId' in condition
              ? condition.conversationId
              : condition.hookId;
  assertId(referenceId, 'mission condition');
}

function assertId(id: string, kind: string): void {
  if (!idPattern.test(id)) throw new Error(`Invalid ${kind} id: ${id}`);
}
