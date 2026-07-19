import type { EquipmentId } from '../equipment/EquipmentDefinition';
import { equipmentById, isEquipmentId } from '../equipment/EquipmentDefinition';
import type {
  MissionDefinition,
  MissionFactValue,
} from '../missions/MissionDefinition';
import type {
  MissionObjectiveStatus,
  MissionPersistenceSnapshot,
  MissionStatus,
} from '../missions/MissionSystem';

export const CAMPAIGN_SAVE_STORAGE_KEY = 'vanta-city:campaign-save';
export const CAMPAIGN_SAVE_SCHEMA_VERSION = 1 as const;

export interface CampaignSaveSnapshot {
  readonly schemaVersion: 1;
  readonly savedAt: number;
  readonly mission: MissionPersistenceSnapshot;
  readonly money: { readonly balance: number };
  readonly equipment: {
    readonly ownedIds: readonly EquipmentId[];
    readonly equippedId: EquipmentId | undefined;
    readonly ammunition: Readonly<Partial<Record<EquipmentId, number>>>;
  };
  readonly player: {
    readonly health: number;
    readonly position: readonly [number, number, number];
    readonly facingYaw: number;
  };
  readonly world: {
    readonly levelId: string;
    readonly lastSpawnId: string | undefined;
    readonly homeUnlocked: boolean;
    readonly respawnPreference: 'home' | 'clinic' | 'default';
  };
}

export interface CampaignSaveValidationContext {
  readonly missions: readonly MissionDefinition[];
  readonly hasLevel: (id: string) => boolean;
  readonly maximumMoney: number;
  readonly maximumHealth: number;
}

export type CampaignSaveParseResult =
  | { readonly ok: true; readonly snapshot: CampaignSaveSnapshot }
  | { readonly ok: false; readonly reason: string };

export function parseCampaignSave(
  input: string,
  context: CampaignSaveValidationContext,
): CampaignSaveParseResult {
  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch {
    return invalid('malformed-json');
  }
  if (!record(value)) return invalid('invalid-root');
  if (value.schemaVersion !== CAMPAIGN_SAVE_SCHEMA_VERSION) {
    return invalid('unsupported-version');
  }
  if (!safeInteger(value.savedAt, 0)) return invalid('invalid-saved-at');
  const mission = parseMission(value.mission, context.missions);
  if (!mission.ok) return mission;
  if (!record(value.money) || !safeInteger(value.money.balance, 0)) {
    return invalid('invalid-money');
  }
  if (value.money.balance > context.maximumMoney) {
    return invalid('invalid-money');
  }
  const equipment = parseEquipment(value.equipment);
  if (!equipment.ok) return equipment;
  if (!record(value.player)) return invalid('invalid-player');
  const position = tuple3(value.player.position);
  if (
    !position ||
    position.some((coordinate) => Math.abs(coordinate) > 100_000) ||
    !finite(value.player.facingYaw) ||
    !finite(value.player.health) ||
    value.player.health <= 0 ||
    value.player.health > context.maximumHealth
  ) {
    return invalid('invalid-player');
  }
  if (
    !record(value.world) ||
    typeof value.world.levelId !== 'string' ||
    !context.hasLevel(value.world.levelId) ||
    (value.world.lastSpawnId !== undefined &&
      typeof value.world.lastSpawnId !== 'string') ||
    typeof value.world.homeUnlocked !== 'boolean' ||
    !['home', 'clinic', 'default'].includes(
      value.world.respawnPreference as string,
    )
  ) {
    return invalid('invalid-world');
  }
  return {
    ok: true,
    snapshot: freeze({
      schemaVersion: CAMPAIGN_SAVE_SCHEMA_VERSION,
      savedAt: value.savedAt,
      mission: mission.snapshot,
      money: { balance: value.money.balance },
      equipment: equipment.snapshot,
      player: {
        health: value.player.health,
        position,
        facingYaw: value.player.facingYaw,
      },
      world: {
        levelId: value.world.levelId,
        lastSpawnId: value.world.lastSpawnId,
        homeUnlocked: value.world.homeUnlocked,
        respawnPreference: value.world
          .respawnPreference as CampaignSaveSnapshot['world']['respawnPreference'],
      },
    }),
  };
}

function parseMission(
  value: unknown,
  definitions: readonly MissionDefinition[],
):
  | { readonly ok: true; readonly snapshot: MissionPersistenceSnapshot }
  | { readonly ok: false; readonly reason: string } {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    !safeInteger(value.revision, 0) ||
    (value.activeMissionId !== undefined &&
      typeof value.activeMissionId !== 'string') ||
    !record(value.facts) ||
    !Array.isArray(value.missions) ||
    value.missions.length !== definitions.length
  ) {
    return invalid('invalid-mission');
  }
  const facts: Record<string, MissionFactValue> = {};
  for (const [id, fact] of Object.entries(value.facts)) {
    if (
      !id.trim() ||
      !['string', 'number', 'boolean'].includes(typeof fact) ||
      (typeof fact === 'number' && !Number.isFinite(fact))
    ) {
      return invalid('invalid-mission-fact');
    }
    facts[id] = fact as MissionFactValue;
  }
  const statuses: readonly MissionStatus[] = [
    'locked',
    'available',
    'active',
    'completed',
    'cancelled',
    'failed',
  ];
  const objectiveStatuses: readonly MissionObjectiveStatus[] = [
    'locked',
    'active',
    'completed',
  ];
  const missionValues = value.missions as unknown[];
  const parsed = definitions.map((definition) => {
    const item = missionValues.find(
      (candidate) => record(candidate) && candidate.id === definition.id,
    );
    if (
      !record(item) ||
      !statuses.includes(item.status as MissionStatus) ||
      !safeInteger(item.attempt, 0) ||
      !Array.isArray(item.objectiveStatuses) ||
      item.objectiveStatuses.length !== definition.objectives.length ||
      item.objectiveStatuses.some(
        (status) =>
          !objectiveStatuses.includes(status as MissionObjectiveStatus),
      ) ||
      typeof item.rewardGranted !== 'boolean' ||
      (item.failureReason !== undefined &&
        typeof item.failureReason !== 'string')
    ) {
      return undefined;
    }
    const restoredObjectiveStatuses = (
      item.objectiveStatuses as unknown[]
    ).filter(isMissionObjectiveStatus);
    return {
      id: definition.id,
      status: item.status as MissionStatus,
      attempt: item.attempt,
      objectiveStatuses: restoredObjectiveStatuses,
      rewardGranted: item.rewardGranted,
      failureReason: item.failureReason,
    };
  });
  if (parsed.some((item) => item === undefined)) {
    return invalid('invalid-mission-progress');
  }
  const active = parsed.filter((item) => item?.status === 'active');
  if (
    active.length > 1 ||
    (active[0]?.id ?? undefined) !== value.activeMissionId
  ) {
    return invalid('invalid-active-mission');
  }
  return {
    ok: true,
    snapshot: freeze({
      schemaVersion: 1,
      revision: value.revision,
      activeMissionId: value.activeMissionId,
      facts,
      missions: parsed as MissionPersistenceSnapshot['missions'],
    }),
  };
}

function parseEquipment(
  value: unknown,
):
  | { readonly ok: true; readonly snapshot: CampaignSaveSnapshot['equipment'] }
  | { readonly ok: false; readonly reason: string } {
  if (
    !record(value) ||
    !Array.isArray(value.ownedIds) ||
    value.ownedIds.some((id) => typeof id !== 'string' || !isEquipmentId(id)) ||
    new Set(value.ownedIds).size !== value.ownedIds.length ||
    (value.equippedId !== undefined &&
      (typeof value.equippedId !== 'string' ||
        !isEquipmentId(value.equippedId) ||
        !value.ownedIds.includes(value.equippedId))) ||
    !record(value.ammunition)
  ) {
    return invalid('invalid-equipment');
  }
  const ammunition: Partial<Record<EquipmentId, number>> = {};
  const ownedIds = (value.ownedIds as unknown[]).filter(isEquipmentValue);
  const equippedId = isEquipmentValue(value.equippedId)
    ? value.equippedId
    : undefined;
  for (const definition of equipmentById.values()) {
    if (!definition.ammunition) continue;
    const current = value.ammunition[definition.id];
    if (!safeInteger(current, 0) || current > definition.ammunition.capacity) {
      return invalid('invalid-ammunition');
    }
    ammunition[definition.id] = current;
  }
  return {
    ok: true,
    snapshot: freeze({
      ownedIds,
      equippedId,
      ammunition,
    }),
  };
}

function invalid(reason: string): {
  readonly ok: false;
  readonly reason: string;
} {
  return { ok: false, reason };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isMissionObjectiveStatus(
  value: unknown,
): value is MissionObjectiveStatus {
  return value === 'locked' || value === 'active' || value === 'completed';
}

function isEquipmentValue(value: unknown): value is EquipmentId {
  return typeof value === 'string' && isEquipmentId(value);
}

function safeInteger(value: unknown, minimum: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum;
}

function tuple3(value: unknown): [number, number, number] | undefined {
  return Array.isArray(value) && value.length === 3 && value.every(finite)
    ? [value[0]!, value[1]!, value[2]!]
    : undefined;
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      freeze(nested);
    }
  }
  return value;
}
