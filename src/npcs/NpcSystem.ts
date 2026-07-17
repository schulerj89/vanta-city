import type { CharacterDefinition } from '../characters/CharacterDefinition';
import type { ConversationCoordinator } from '../conversations/ConversationCoordinator';
import type { EventBus } from '../core/events';
import type { GameSystem } from '../core/lifecycle';
import type { GameObjectWorld } from '../entities/GameObjectWorld';
import type { Interactable } from '../interactions/Interactable';
import type { WorldPoseSource } from '../world/Spatial';
import type { LevelDefinition } from '../world/LevelDefinition';
import type { WorldEvents } from '../world/WorldEvents';
import type { NpcDebugSnapshot } from './NpcEntity';
import { NpcEntity } from './NpcEntity';
import type { NpcCharacterLoader } from './NpcEntity';
import type { NpcDefinition } from './NpcDefinition';
import type { EquipmentId } from '../equipment/EquipmentDefinition';

export interface NpcInteractionRegistry {
  register(interactable: Interactable): () => void;
}

export interface ActiveLevelSource {
  readonly activeLevel: LevelDefinition | undefined;
}

interface SpawnedNpc {
  readonly entity: NpcEntity;
  readonly unregisterInteraction: () => void;
}

export class NpcSystem implements GameSystem {
  public readonly id = 'npcs';
  private readonly characters: ReadonlyMap<string, CharacterDefinition>;
  private readonly spawned = new Map<string, SpawnedNpc>();
  private readonly unsubscribeWorld: (() => void)[] = [];
  private loadVersion = 0;

  public constructor(
    private readonly definitions: readonly NpcDefinition[],
    characterDefinitions: readonly CharacterDefinition[],
    private readonly loader: NpcCharacterLoader,
    private readonly objects: GameObjectWorld,
    private readonly interactions: NpcInteractionRegistry,
    private readonly conversations: ConversationCoordinator,
    private readonly player: WorldPoseSource,
    private readonly levels: ActiveLevelSource,
    private readonly worldEvents: EventBus<WorldEvents>,
  ) {
    this.characters = new Map(
      characterDefinitions.map((definition) => [definition.id, definition]),
    );
  }

  public async init(): Promise<void> {
    this.unsubscribeWorld.push(
      this.conversations.events.on('conversation:started', ({ session }) => {
        const npc = this.spawned.get(session.npcId)?.entity;
        if (npc && npc.definition.conversationGesture !== false) {
          npc.triggerGesture(`conversation:${session.definition.id}`);
        }
      }),
      this.worldEvents.on('level:unloaded', () => this.clear()),
      this.worldEvents.on('level:loaded', ({ level }) => {
        void this.spawnLevel(level).catch((error: unknown) => {
          console.error(`Failed to spawn NPCs for level "${level.id}"`, error);
        });
      }),
    );
    const level = this.levels.activeLevel;
    if (!level) throw new Error('NPCs require an active level');
    await this.spawnLevel(level);
  }

  public getDebugSnapshot(id: string): NpcDebugSnapshot | undefined {
    return this.spawned.get(id)?.entity.getDebugSnapshot();
  }

  public getWorldPoseSource(id: string): WorldPoseSource | undefined {
    return this.spawned.get(id)?.entity;
  }

  public getDefinition(id: string): NpcDefinition | undefined {
    return this.definitions.find((definition) => definition.id === id);
  }

  public equip(id: string, itemId: EquipmentId): boolean {
    return this.spawned.get(id)?.entity.equip(itemId) ?? false;
  }

  public useEquipment(id: string, source = 'npc-debug'): boolean {
    return this.spawned.get(id)?.entity.useEquipment(source) ?? false;
  }

  public get count(): number {
    return this.spawned.size;
  }

  public dispose(): void {
    this.loadVersion += 1;
    for (const unsubscribe of this.unsubscribeWorld.splice(0)) unsubscribe();
    this.clear();
  }

  private async spawnLevel(level: LevelDefinition): Promise<void> {
    const version = ++this.loadVersion;
    this.clear(false);
    const constructing: NpcEntity[] = [];
    let entities: NpcEntity[];
    try {
      entities = await Promise.all(
        this.definitions.map(async (definition) => {
          const character = this.characters.get(definition.characterId);
          if (!character) {
            throw new Error(
              `NPC "${definition.id}" references unknown character "${definition.characterId}"`,
            );
          }
          const spawn = level.spawns.find(
            (candidate) =>
              candidate.id === definition.spawnId && candidate.kind === 'npc',
          );
          if (!spawn) {
            throw new Error(
              `NPC "${definition.id}" references missing NPC spawn "${definition.spawnId}"`,
            );
          }
          const entity = new NpcEntity(
            definition,
            spawn,
            character,
            this.loader,
            this.conversations,
            this.player,
          );
          constructing.push(entity);
          await entity.init();
          return entity;
        }),
      );
    } catch (error) {
      for (const entity of constructing) entity.dispose();
      throw error;
    }

    if (version !== this.loadVersion) {
      for (const entity of entities) entity.dispose();
      return;
    }
    try {
      for (const entity of entities) {
        this.objects.add(entity);
        const { definition } = entity;
        const unregisterInteraction = this.interactions.register({
          id: `interaction.npc.${definition.id}`,
          prompt: definition.interactionLabel,
          location: () => entity.getWorldPosition(),
          rangeProfile: 'talk',
          ...(definition.interactionRadius === undefined
            ? {}
            : { range: definition.interactionRadius }),
          collisionIgnoreIds: [`c.npc-${definition.id}`],
          requiredStates: ['playing'],
          isAvailable: () => this.conversations.active === undefined,
          interact: () => {
            const conversationStarted = this.conversations.start(
              definition.conversationId,
              definition.id,
            );
            if (!conversationStarted) {
              entity.triggerGesture(`interaction:${definition.id}`);
            }
          },
        });
        this.spawned.set(definition.id, { entity, unregisterInteraction });
      }
    } catch (error) {
      for (const entity of entities) {
        if (!this.spawned.has(entity.definition.id)) entity.dispose();
      }
      this.clear();
      throw error;
    }
  }

  private clear(invalidate = true): void {
    if (invalidate) this.loadVersion += 1;
    if (
      this.conversations.active &&
      this.spawned.has(this.conversations.active.npcId)
    ) {
      this.conversations.end('cancelled');
    }
    for (const { entity, unregisterInteraction } of this.spawned.values()) {
      unregisterInteraction();
      this.objects.remove(entity.id);
    }
    this.spawned.clear();
  }
}
