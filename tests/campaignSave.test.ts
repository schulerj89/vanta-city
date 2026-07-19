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
  });

  it('reports storage failures and resets only campaign/title progress', () => {
    const storage = new MemoryStorage();
    storage.setItem(CAMPAIGN_SAVE_STORAGE_KEY, JSON.stringify(validSnapshot()));
    storage.setItem(TITLE_STARTED_STORAGE_KEY, '1');
    storage.setItem('vanta-city:audio', 'preserve');
    const saves = new CampaignSaveSystem(storage, validation);
    expect(saves.hasSave()).toBe(true);
    expect(saves.reset()).toBe(true);
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
    const sources = {
      missions: {
        events: missionEvents,
        getPersistenceSnapshot: () => validSnapshot().mission,
      },
      money: Object.assign(money, { events: moneyEvents }),
      equipment: Object.assign(equipment, { events: equipmentEvents }),
      health: { current: 100, events: healthEvents },
      player: {
        getWorldPose: () => ({ position: { x: 1, y: 0.22, z: 2 } }),
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
    saves.dispose();
    expect(saves.getStatus().writeCount).toBe(2);
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
});
