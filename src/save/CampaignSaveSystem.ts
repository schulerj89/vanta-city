import type { CharacterEquipment } from '../equipment/CharacterEquipment';
import type { PlayerMoneyAccount } from '../economy/PlayerMoneyAccount';
import type { HealthComponent } from '../health/Health';
import type { MissionSystem } from '../missions/MissionSystem';
import type { PlayerControllerSystem } from '../player/PlayerControllerSystem';
import { TITLE_STARTED_STORAGE_KEY } from '../ui/TitleScreen';
import type { LevelSystem } from '../world/LevelSystem';
import type { EventBus } from '../core/events';
import type { WorldEvents } from '../world/WorldEvents';
import {
  CAMPAIGN_SAVE_SCHEMA_VERSION,
  CAMPAIGN_SAVE_STORAGE_KEY,
  parseCampaignSave,
  type CampaignSaveSnapshot,
  type CampaignSaveValidationContext,
} from './CampaignSaveSchema';

export interface CampaignStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface CampaignSaveStatus {
  readonly available: boolean;
  readonly hasSave: boolean;
  readonly valid: boolean;
  readonly restored: boolean;
  readonly schemaVersion: number | undefined;
  readonly pendingWrite: boolean;
  readonly writeCount: number;
  readonly lastError: string | undefined;
  readonly readResult: 'empty' | 'valid' | 'invalid' | 'unavailable';
  readonly readError: string | undefined;
}

export interface CampaignRestoreTargets {
  readonly missions: MissionSystem;
  readonly money: PlayerMoneyAccount;
  readonly equipment: CharacterEquipment;
  readonly health: HealthComponent;
  readonly player: PlayerControllerSystem;
}

export interface CampaignLiveSources extends CampaignRestoreTargets {
  readonly player: PlayerControllerSystem;
  readonly levels: LevelSystem;
  readonly worldEvents: EventBus<WorldEvents>;
}

/** One browser-storage authority for validated campaign state and write coalescing. */
export class CampaignSaveSystem {
  public readonly id = 'campaign-save';
  private snapshot: CampaignSaveSnapshot | undefined;
  private sources: CampaignLiveSources | undefined;
  private unsubscribers: (() => void)[] = [];
  private writeTimer: ReturnType<typeof setTimeout> | undefined;
  private available = true;
  private restored = false;
  private writeCount = 0;
  private lastError: string | undefined;
  private readResult: CampaignSaveStatus['readResult'] = 'empty';
  private readError: string | undefined;
  private lastObservedRaw: string | null | undefined;
  private exitFlushSuppressed = false;
  private lastSpawnId: string | undefined;
  private homeUnlocked = false;
  private respawnPreference: CampaignSaveSnapshot['world']['respawnPreference'] =
    'home';

  public constructor(
    private readonly storage: CampaignStorage | undefined,
    private readonly validation: CampaignSaveValidationContext,
  ) {
    this.read();
  }

  public hasSave(): boolean {
    return this.snapshot !== undefined;
  }

  public getSnapshot(): CampaignSaveSnapshot | undefined {
    return this.snapshot;
  }

  public getStatus(): CampaignSaveStatus {
    return Object.freeze({
      available: this.available,
      hasSave: this.hasSave(),
      valid: this.snapshot !== undefined,
      restored: this.restored,
      schemaVersion: this.snapshot?.schemaVersion,
      pendingWrite: this.writeTimer !== undefined,
      writeCount: this.writeCount,
      lastError: this.lastError,
      readResult: this.readResult,
      readError: this.readError,
    });
  }

  /** Applies only a fully validated snapshot and must run before mission init. */
  public restoreBeforeInit(targets: CampaignRestoreTargets): boolean {
    if (!this.snapshot || this.restored) return false;
    targets.missions.restore(this.snapshot.mission);
    targets.money.restoreBalance(this.snapshot.money.balance);
    targets.equipment.restore(this.snapshot.equipment);
    targets.player.restoreCampaignHealthBeforeInit(this.snapshot.player.health);
    this.lastSpawnId = this.snapshot.world.lastSpawnId;
    this.homeUnlocked = this.snapshot.world.homeUnlocked;
    this.respawnPreference = this.snapshot.world.respawnPreference;
    this.restored = true;
    return true;
  }

  /** Attaches after bootstrap so restore and init cannot trigger duplicate writes. */
  public attach(sources: CampaignLiveSources): void {
    if (this.sources)
      throw new Error('Campaign save system is already attached');
    this.sources = sources;
    this.unsubscribers = [
      sources.missions.events.on('changed', () => this.requestSave()),
      sources.money.events.on('balanceChanged', () => this.requestSave()),
      sources.equipment.events.on('changed', () => this.requestSave()),
      sources.equipment.events.on('ownershipChanged', () => this.requestSave()),
      sources.equipment.events.on('ammunitionChanged', () =>
        this.requestSave(),
      ),
      sources.health.events.on('changed', ({ alive }) => {
        if (alive) this.requestSave();
      }),
      sources.worldEvents.on('level:loaded', () => this.requestSave()),
    ];
    if (typeof window !== 'undefined') {
      const flush = (): void => {
        this.saveOnExit();
      };
      const flushWhenHidden = (): void => {
        if (document.visibilityState === 'hidden') this.saveOnExit();
      };
      window.addEventListener('pagehide', flush);
      document.addEventListener('visibilitychange', flushWhenHidden);
      this.unsubscribers.push(
        () => window.removeEventListener('pagehide', flush),
        () => document.removeEventListener('visibilitychange', flushWhenHidden),
      );
    }
  }

  public requestSave(): void {
    if (!this.sources || this.writeTimer !== undefined) return;
    this.exitFlushSuppressed = false;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = undefined;
      this.saveNow();
    }, 0);
  }

  public saveNow(): boolean {
    this.exitFlushSuppressed = false;
    const sources = this.sources;
    const levelId = sources?.levels.activeLevel?.id;
    if (!sources || !levelId) return false;
    const pose = sources.player.getWorldPose();
    const facingYaw = sources.player.getDebugSnapshot().facingYaw;
    const mission = sources.missions.getPersistenceSnapshot();
    const equipment = sources.equipment.getSnapshot();
    const facts = mission.facts;
    this.homeUnlocked =
      this.homeUnlocked ||
      facts['home-unlocked'] === true ||
      facts['rook-home-unlocked'] === true;
    const next: CampaignSaveSnapshot = {
      schemaVersion: CAMPAIGN_SAVE_SCHEMA_VERSION,
      savedAt: Date.now(),
      mission,
      money: { balance: sources.money.balance },
      equipment: {
        ownedIds: [...equipment.ownedIds],
        equippedId: equipment.equippedId,
        ammunition: Object.fromEntries(
          Object.entries(equipment.ammunition).map(([id, value]) => [
            id,
            value?.current,
          ]),
        ),
      },
      player: {
        health: Math.max(1, sources.health.current),
        position: [pose.position.x, pose.position.y, pose.position.z],
        facingYaw,
      },
      world: {
        levelId,
        lastSpawnId: this.lastSpawnId,
        homeUnlocked: this.homeUnlocked,
        respawnPreference: this.respawnPreference,
      },
    };
    try {
      const raw = JSON.stringify(next);
      this.storage?.setItem(CAMPAIGN_SAVE_STORAGE_KEY, raw);
      if (!this.storage) throw new Error('storage-unavailable');
      this.lastObservedRaw = raw;
      this.snapshot = deepFreeze(next);
      this.available = true;
      this.lastError = undefined;
      this.writeCount += 1;
      return true;
    } catch (error) {
      this.available = false;
      this.lastError = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  public recordRespawn(spawnId: string): void {
    this.lastSpawnId = spawnId;
    this.requestSave();
  }

  public setHomeUnlocked(unlocked: boolean): void {
    if (this.homeUnlocked === unlocked) return;
    this.homeUnlocked = unlocked;
    this.requestSave();
  }

  public setRespawnPreference(
    preference: CampaignSaveSnapshot['world']['respawnPreference'],
  ): void {
    if (this.respawnPreference === preference) return;
    this.respawnPreference = preference;
    this.requestSave();
  }

  public resolveRespawn(levels: LevelSystem): {
    readonly id: string;
    readonly position: {
      readonly x: number;
      readonly y: number;
      readonly z: number;
    };
    readonly facingYaw: number | undefined;
  } {
    const spawn = levels.resolveSafePlayerSpawn(this.respawnCandidates());
    return {
      id: spawn.id,
      position: {
        x: spawn.position[0],
        y: spawn.position[1],
        z: spawn.position[2],
      },
      facingYaw: spawn.rotation?.[1],
    };
  }

  public async prepareRespawn(
    levels: LevelSystem,
  ): Promise<ReturnType<CampaignSaveSystem['resolveRespawn']>> {
    const spawn = await levels.prepareSafePlayerRespawn(
      this.respawnCandidates(),
    );
    return {
      id: spawn.id,
      position: {
        x: spawn.position[0],
        y: spawn.position[1],
        z: spawn.position[2],
      },
      facingYaw: spawn.rotation?.[1],
    };
  }

  /** Deletes only campaign progress and the title's first-run marker. */
  public reset(): boolean {
    if (this.writeTimer !== undefined) clearTimeout(this.writeTimer);
    this.writeTimer = undefined;
    try {
      this.storage?.removeItem(CAMPAIGN_SAVE_STORAGE_KEY);
      this.storage?.removeItem(TITLE_STARTED_STORAGE_KEY);
      if (!this.storage) throw new Error('storage-unavailable');
      this.snapshot = undefined;
      this.restored = false;
      this.lastSpawnId = undefined;
      this.homeUnlocked = false;
      this.respawnPreference = 'home';
      this.available = true;
      this.lastError = undefined;
      this.readResult = 'empty';
      this.readError = undefined;
      this.lastObservedRaw = null;
      this.exitFlushSuppressed = true;
      return true;
    } catch (error) {
      this.available = false;
      this.lastError = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  public dispose(): void {
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
    if (this.writeTimer !== undefined) {
      clearTimeout(this.writeTimer);
      this.writeTimer = undefined;
    }
    if (this.sources) this.saveOnExit();
    this.writeTimer = undefined;
    this.sources = undefined;
  }

  private read(): void {
    try {
      const raw = this.storage?.getItem(CAMPAIGN_SAVE_STORAGE_KEY);
      if (raw === undefined) throw new Error('storage-unavailable');
      this.lastObservedRaw = raw;
      if (raw === null) return;
      const parsed = parseCampaignSave(raw, this.validation);
      if (!parsed.ok) {
        this.readResult = 'invalid';
        this.readError = parsed.reason;
        this.lastError = parsed.reason;
        return;
      }
      this.readResult = 'valid';
      this.snapshot = parsed.snapshot;
      this.homeUnlocked = parsed.snapshot.world.homeUnlocked;
      this.respawnPreference = parsed.snapshot.world.respawnPreference;
      this.lastSpawnId = parsed.snapshot.world.lastSpawnId;
    } catch (error) {
      this.available = false;
      this.readResult = 'unavailable';
      this.readError = error instanceof Error ? error.message : String(error);
      this.lastError = this.readError;
    }
  }

  private respawnCandidates(): readonly string[] {
    return this.respawnPreference === 'default'
      ? []
      : [
          ...(this.homeUnlocked && this.respawnPreference === 'home'
            ? ['spawn.player.home']
            : []),
          'spawn.player.clinic',
        ];
  }

  /** Avoids overwriting another tab or an intentional external corruption on exit. */
  private saveOnExit(): void {
    if (this.writeTimer !== undefined) {
      clearTimeout(this.writeTimer);
      this.writeTimer = undefined;
    }
    if (this.exitFlushSuppressed) return;
    try {
      if (
        this.storage?.getItem(CAMPAIGN_SAVE_STORAGE_KEY) !==
        this.lastObservedRaw
      ) {
        return;
      }
    } catch {
      // saveNow owns the normal storage error/status reporting path.
    }
    this.saveNow();
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}
