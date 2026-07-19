import { EventBus } from '../src/core/events';
import { PlayerMoneyAccount } from '../src/economy/PlayerMoneyAccount';
import { CharacterEquipment } from '../src/equipment/CharacterEquipment';
import {
  ashfallInitialMissionFacts,
  missionDefinitions,
} from '../src/missions/missions';
import {
  CAMPAIGN_SAVE_STORAGE_KEY,
  parseCampaignSave,
  type CampaignSaveSnapshot,
} from '../src/save/CampaignSaveSchema';
import {
  CampaignSaveSystem,
  type CampaignLiveSources,
} from '../src/save/CampaignSaveSystem';
import { TITLE_STARTED_STORAGE_KEY } from '../src/ui/TitleScreen';
import { findSafePlayerSpawn } from '../src/world/LevelQueries';
import type { LevelDefinition } from '../src/world/LevelDefinition';

class MemoryStorage {
  public readonly values = new Map<string, string>();
  public getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  public setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
  public removeItem(key: string): void {
    this.values.delete(key);
  }
}

const validation = {
  missions: missionDefinitions,
  hasLevel: (id: string) => id === 'test-district',
  maximumMoney: 999_999_999,
  maximumHealth: 100,
};

function validSnapshot(): CampaignSaveSnapshot {
  return {
    schemaVersion: 1,
    savedAt: 1,
    mission: {
      schemaVersion: 1,
      revision: 0,
      activeMissionId: undefined,
      facts: ashfallInitialMissionFacts,
      missions: missionDefinitions.map((definition, index) => ({
        id: definition.id,
        status: index === 0 ? 'available' : 'locked',
        attempt: 0,
        objectiveStatuses: definition.objectives.map(() => 'locked'),
        rewardGranted: false,
        failureReason: undefined,
      })),
    },
    money: { balance: 500 },
    equipment: {
      ownedIds: [],
      equippedId: undefined,
      ammunition: { handgun: 8 },
    },
    player: { health: 100, position: [0, 0.22, 7], facingYaw: 0 },
    world: {
      levelId: 'test-district',
      lastSpawnId: undefined,
      homeUnlocked: false,
      respawnPreference: 'home',
    },
  };
}

describe('campaign save schema and storage authority', () => {
  it('accepts a complete version and rejects corrupt, partial, and future data', () => {
    expect(
      parseCampaignSave(JSON.stringify(validSnapshot()), validation).ok,
    ).toBe(true);
    expect(parseCampaignSave('{', validation)).toEqual({
      ok: false,
      reason: 'malformed-json',
    });
    expect(
      parseCampaignSave(
        JSON.stringify({ ...validSnapshot(), schemaVersion: 2 }),
        validation,
      ),
    ).toEqual({ ok: false, reason: 'unsupported-version' });
    expect(
      parseCampaignSave(
        JSON.stringify({ ...validSnapshot(), equipment: { ownedIds: [] } }),
        validation,
      ).ok,
    ).toBe(false);

    const appendedDefinition = {
      ...missionDefinitions[0]!,
      id: 'ash-002-appended',
      objectives: missionDefinitions[0]!.objectives.map((objective, index) => ({
        ...objective,
        id: `ash-002-objective-${index}`,
        highlights: undefined,
      })),
      reward: {
        ...missionDefinitions[0]!.reward,
        id: 'reward.ash-002-appended',
      },
    };
    const older = validSnapshot();
    expect(
      parseCampaignSave(JSON.stringify(older), {
        ...validation,
        missions: [...missionDefinitions, appendedDefinition],
      }).ok,
    ).toBe(true);
    expect(
      parseCampaignSave(
        JSON.stringify({
          ...older,
          mission: {
            ...older.mission,
            missions: [
              ...older.mission.missions,
              { ...older.mission.missions[0], id: 'unknown-mission' },
            ],
          },
        }),
        validation,
      ),
    ).toEqual({ ok: false, reason: 'invalid-mission-progress' });
  });

  it('reports storage failures and resets only campaign/title progress', () => {
    const storage = new MemoryStorage();
    storage.setItem(CAMPAIGN_SAVE_STORAGE_KEY, JSON.stringify(validSnapshot()));
    storage.setItem(TITLE_STARTED_STORAGE_KEY, '1');
    storage.setItem('vanta-city:audio', 'preserve');
    const saves = new CampaignSaveSystem(storage, validation);
    expect(saves.hasSave()).toBe(true);
    expect(saves.reset()).toBe(true);
    expect(saves.getStatus()).toMatchObject({
      readResult: 'empty',
      readError: undefined,
    });
    expect(storage.getItem(CAMPAIGN_SAVE_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(TITLE_STARTED_STORAGE_KEY)).toBeNull();
    expect(storage.getItem('vanta-city:audio')).toBe('preserve');
    expect(saves.reset()).toBe(true);

    const unavailable = new CampaignSaveSystem(
      {
        getItem: () => {
          throw new Error('denied');
        },
        setItem: () => {
          throw new Error('denied');
        },
        removeItem: () => {
          throw new Error('denied');
        },
      },
      validation,
    );
    expect(unavailable.getStatus()).toMatchObject({
      available: false,
      hasSave: false,
      lastError: 'denied',
      readResult: 'unavailable',
      readError: 'denied',
    });
    expect(unavailable.reset()).toBe(false);
  });

  it('coalesces meaningful events and removes listeners on dispose', () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    const missionEvents = new EventBus<{ changed: unknown }>();
    const moneyEvents = new EventBus<{ balanceChanged: unknown }>();
    const equipmentEvents = new EventBus<{
      changed: unknown;
      ownershipChanged: unknown;
      ammunitionChanged: unknown;
    }>();
    const healthEvents = new EventBus<{ changed: { alive: boolean } }>();
    const worldEvents = new EventBus<{
      'level:loaded': { level: LevelDefinition };
      'level:unloaded': { levelId: string };
      'sector:loaded': never;
      'sector:unloaded': never;
    }>();
    const equipment = new CharacterEquipment('player', []);
    const money = new PlayerMoneyAccount('player');
    const livePosition = { x: 1, y: 0.22, z: 2 };
    const sources = {
      missions: {
        events: missionEvents,
        getPersistenceSnapshot: () => validSnapshot().mission,
      },
      money: Object.assign(money, { events: moneyEvents }),
      equipment: Object.assign(equipment, { events: equipmentEvents }),
      health: { current: 100, events: healthEvents },
      player: {
        getWorldPose: () => ({ position: { ...livePosition } }),
        getDebugSnapshot: () => ({ facingYaw: 0.5 }),
      },
      levels: { activeLevel: { id: 'test-district' } },
      worldEvents,
    } as unknown as CampaignLiveSources;
    const saves = new CampaignSaveSystem(storage, validation);
    saves.attach(sources);
    missionEvents.emit('changed', {});
    moneyEvents.emit('balanceChanged', {});
    equipmentEvents.emit('ammunitionChanged', {});
    expect(saves.getStatus().pendingWrite).toBe(true);
    vi.runAllTimers();
    expect(saves.getStatus().writeCount).toBe(1);
    missionEvents.emit('changed', {});
    Object.assign(livePosition, { x: 42, z: -11 });
    saves.dispose();
    expect(saves.getStatus().writeCount).toBe(2);
    const stored = JSON.parse(
      storage.getItem(CAMPAIGN_SAVE_STORAGE_KEY)!,
    ) as CampaignSaveSnapshot;
    expect(stored.player.position).toEqual([42, 0.22, -11]);
    missionEvents.emit('changed', {});
    vi.runAllTimers();
    expect(saves.getStatus().writeCount).toBe(2);
    vi.useRealTimers();
  });
});

describe('campaign respawn resolution', () => {
  it('prefers present candidates, skips obstructed spawns, then uses default', () => {
    const level = {
      id: 'test-district',
      spawns: [
        { id: 'spawn.player.home', kind: 'player', position: [2, 0, 0] },
        { id: 'spawn.player.clinic', kind: 'player', position: [5, 0, 0] },
        {
          id: 'spawn.player-default',
          kind: 'player',
          default: true,
          position: [9, 0, 0],
        },
      ],
      staticCollision: [{ id: 'wall', position: [2, 1, 0], size: [1, 2, 1] }],
    } as unknown as LevelDefinition;
    expect(
      findSafePlayerSpawn(level, ['spawn.player.home', 'spawn.player.clinic'])
        .id,
    ).toBe('spawn.player.clinic');
    expect(findSafePlayerSpawn(level, ['missing']).id).toBe(
      'spawn.player-default',
    );
  });

  it('honors default preference and loads fallback residency after failure', async () => {
    const saves = new CampaignSaveSystem(new MemoryStorage(), validation);
    const refreshStreaming = vi
      .fn()
      .mockRejectedValueOnce(new Error('clinic sector failed'))
      .mockResolvedValue(undefined);
    const levels = {
      resolveSafePlayerSpawn: (candidates: readonly string[]) =>
        candidates.includes('spawn.player.clinic')
          ? {
              id: 'spawn.player.clinic',
              position: [40, 0.2, 0],
              rotation: [0, 1, 0],
            }
          : {
              id: 'spawn.player-default',
              position: [0, 0.2, 7],
              rotation: [0, 0, 0],
            },
      refreshStreaming,
    };
    saves.setRespawnPreference('clinic');
    await expect(saves.prepareRespawn(levels as never)).resolves.toMatchObject({
      id: 'spawn.player-default',
    });
    expect(refreshStreaming).toHaveBeenNthCalledWith(1, {
      x: 40,
      y: 0.2,
      z: 0,
    });
    expect(refreshStreaming).toHaveBeenNthCalledWith(2, {
      x: 0,
      y: 0.2,
      z: 7,
    });

    saves.setRespawnPreference('default');
    expect(saves.resolveRespawn(levels as never).id).toBe(
      'spawn.player-default',
    );
  });
});
