import { AnimationClip, Group, Scene } from 'three';
import type { LoadedCharacter } from '../src/characters/CharacterLoader';
import type { CharacterDefinition } from '../src/characters/CharacterDefinition';
import { ConversationCoordinator } from '../src/conversations/ConversationCoordinator';
import type { ConversationSession } from '../src/conversations/ConversationCoordinator';
import { conversationCatalog } from '../src/conversations/conversations';
import { EventBus } from '../src/core/events';
import { GameStateMachine } from '../src/core/gameState';
import type { StateEvents } from '../src/core/gameState';
import { GameObjectWorld } from '../src/entities/GameObjectWorld';
import type { Interactable } from '../src/interactions/Interactable';
import {
  NpcEntity,
  calculateFacingYaw,
  smoothFacingYaw,
} from '../src/npcs/NpcEntity';
import type { NpcCharacterLoader } from '../src/npcs/NpcEntity';
import { NpcSystem } from '../src/npcs/NpcSystem';
import type { NpcInteractionRegistry } from '../src/npcs/NpcSystem';
import { npcCharacterDefinitions, npcDefinitions } from '../src/npcs/npcs';
import type { WorldEvents } from '../src/world/WorldEvents';
import { testDistrict } from '../src/world/levels/testDistrict';

function stateHarness(): {
  readonly events: EventBus<StateEvents>;
  readonly state: GameStateMachine;
} {
  const events = new EventBus<StateEvents>();
  const state = new GameStateMachine(events);
  state.transition('playing');
  return { events, state };
}

function characterLoader(
  source: LoadedCharacter['source'] = 'placeholder',
  animationClips: ReadonlyMap<string, AnimationClip> = new Map(),
): NpcCharacterLoader & { readonly disposals: ReturnType<typeof vi.fn>[] } {
  const disposals: ReturnType<typeof vi.fn>[] = [];
  return {
    disposals,
    instantiate: async (
      definition: CharacterDefinition,
    ): Promise<LoadedCharacter> => {
      const dispose = vi.fn();
      disposals.push(dispose);
      return {
        definition,
        root: new Group(),
        animationClips,
        discoveredClipNames: [...animationClips.values()].map(
          ({ name }) => name,
        ),
        source,
        warnings: [],
        dispose,
      };
    },
  };
}

function npcAnimationClips(): ReadonlyMap<string, AnimationClip> {
  return new Map([
    ['idle', new AnimationClip('HumanArmature|Man_Idle', 1, [])],
    ['gesture', new AnimationClip('HumanArmature|Man_Clapping', 0.6, [])],
  ]);
}

function interactionRegistry(): NpcInteractionRegistry & {
  readonly entries: Map<string, Interactable>;
} {
  const entries = new Map<string, Interactable>();
  return {
    entries,
    register: (interactable) => {
      entries.set(interactable.id, interactable);
      return () => entries.delete(interactable.id);
    },
  };
}

describe('NPC foundation', () => {
  it('spawns level NPCs with Talk interactions and cleans up on unload', async () => {
    const scene = new Scene();
    const objects = new GameObjectWorld(scene);
    const interactions = interactionRegistry();
    const loader = characterLoader();
    const worldEvents = new EventBus<WorldEvents>();
    const { state } = stateHarness();
    const conversations = new ConversationCoordinator(
      conversationCatalog,
      state,
    );
    const system = new NpcSystem(
      npcDefinitions,
      npcCharacterDefinitions,
      loader,
      objects,
      interactions,
      conversations,
      {
        getWorldPose: () => ({
          position: { x: 0, y: 0, z: 0 },
          forward: { x: 0, y: 0, z: 1 },
        }),
      },
      { activeLevel: testDistrict.definition },
      worldEvents,
    );

    await system.init();

    expect(system.count).toBe(3);
    expect(objects.get('npc.mack')).toBeDefined();
    expect(objects.get('npc.nox')).toBeDefined();
    expect(objects.get('npc.raze')).toBeDefined();
    expect(
      [...interactions.entries.values()].map(({ prompt }) => prompt),
    ).toEqual(['Talk', 'Talk', 'Talk']);
    expect(system.getDebugSnapshot('mack')).toMatchObject({
      npcId: 'npc.mack',
      definitionId: 'mack',
      spawnId: 'spawn.npc-mechanic',
      currentAnimation: 'static (idle unavailable)',
      modelFallback: true,
    });

    worldEvents.emit('level:unloaded', { levelId: 'test-district' });

    expect(system.count).toBe(0);
    expect(interactions.entries.size).toBe(0);
    expect(scene.children).toHaveLength(0);
    expect(
      loader.disposals.every((dispose) => dispose.mock.calls.length === 1),
    ).toBe(true);
    system.dispose();
    conversations.dispose();
  });

  it('signals Mack conversation and blocks every NPC interaction while active', async () => {
    const scene = new Scene();
    const objects = new GameObjectWorld(scene);
    const interactions = interactionRegistry();
    const worldEvents = new EventBus<WorldEvents>();
    const { state } = stateHarness();
    const conversations = new ConversationCoordinator(
      conversationCatalog,
      state,
    );
    const started: ConversationSession[] = [];
    conversations.events.on('conversation:started', ({ session }) => {
      started.push(session);
    });
    const system = new NpcSystem(
      npcDefinitions,
      npcCharacterDefinitions,
      characterLoader('asset', npcAnimationClips()),
      objects,
      interactions,
      conversations,
      {
        getWorldPose: () => ({
          position: { x: -13, y: 0.2, z: 4 },
          forward: { x: 1, y: 0, z: 0 },
        }),
      },
      { activeLevel: testDistrict.definition },
      worldEvents,
    );
    await system.init();
    const mack = interactions.entries.get('interaction.npc.mack');
    if (!mack) throw new Error('Mack interaction was not registered');

    expect(
      mack.isAvailable?.({ gameState: 'playing', targetId: mack.id }),
    ).toBe(true);
    await mack.interact({
      gameState: 'playing',
      targetId: mack.id,
      signal: new AbortController().signal,
    });
    expect(started[0]?.npcId).toBe('mack');
    expect(started[0]?.definition.id).toBe('conversation.mack.introduction');
    for (const interaction of interactions.entries.values()) {
      expect(
        interaction.isAvailable?.({
          gameState: 'playing',
          targetId: interaction.id,
        }),
      ).toBe(false);
    }
    await Promise.resolve();
    expect(state.current).toBe('dialogue');
    expect(system.getDebugSnapshot('mack')).toMatchObject({
      interactionState: 'conversation',
      conversationState: 'active',
      currentAnimation: 'gesture',
      gestureActive: true,
      lastGestureSource: 'conversation:conversation.mack.introduction',
    });
    expect(system.getDebugSnapshot('nox')).toMatchObject({
      interactionState: 'blocked',
      conversationState: 'other-active',
    });

    conversations.end();
    expect(state.current).toBe('playing');
    system.dispose();
    conversations.dispose();
  });

  it('routes Nox and Raze through their registered conversations', async () => {
    const scene = new Scene();
    const objects = new GameObjectWorld(scene);
    const interactions = interactionRegistry();
    const worldEvents = new EventBus<WorldEvents>();
    const { state } = stateHarness();
    const conversations = new ConversationCoordinator(
      conversationCatalog,
      state,
    );
    const started = vi.fn();
    conversations.events.on('conversation:started', started);
    const system = new NpcSystem(
      npcDefinitions,
      npcCharacterDefinitions,
      characterLoader('asset', npcAnimationClips()),
      objects,
      interactions,
      conversations,
      {
        getWorldPose: () => ({
          position: { x: -13, y: 0.2, z: 4 },
          forward: { x: 1, y: 0, z: 0 },
        }),
      },
      { activeLevel: testDistrict.definition },
      worldEvents,
    );
    await system.init();
    for (const expected of [
      {
        npcId: 'nox',
        conversationId: 'conversation.nox.check-in',
        text: 'Alley’s clear. Keep moving.',
      },
      {
        npcId: 'raze',
        conversationId: 'conversation.raze.check-in',
        text: 'Deck’s quiet. Don’t make it loud.',
      },
    ]) {
      const interaction = interactions.entries.get(
        `interaction.npc.${expected.npcId}`,
      );
      if (!interaction) {
        throw new Error(`${expected.npcId} interaction was not registered`);
      }

      await interaction.interact({
        gameState: 'playing',
        targetId: interaction.id,
        signal: new AbortController().signal,
      });
      await Promise.resolve();

      expect(conversations.active).toMatchObject({
        npcId: expected.npcId,
        definition: {
          id: expected.conversationId,
          lines: [
            expect.objectContaining({
              speakerId: expected.npcId,
              text: expected.text,
            }),
          ],
        },
      });
      expect(state.current).toBe('dialogue');
      expect(system.getDebugSnapshot(expected.npcId)).toMatchObject({
        interactionState: 'conversation',
        conversationState: 'active',
        currentAnimation: 'gesture',
        gestureActive: true,
        lastGestureSource: `conversation:${expected.conversationId}`,
        lastGestureAccepted: true,
      });
      conversations.end();
      expect(state.current).toBe('playing');
    }
    expect(started).toHaveBeenCalledTimes(2);
    system.dispose();
    conversations.dispose();
  });

  it('calculates shortest-path facing and restores idle orientation', async () => {
    expect(
      calculateFacingYaw({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }),
    ).toBeCloseTo(Math.PI / 2);
    expect(
      Math.abs(smoothFacingYaw(Math.PI - 0.1, -Math.PI + 0.1, 0.1)),
    ).toBeGreaterThan(Math.PI - 0.1);

    const { state } = stateHarness();
    const conversations = new ConversationCoordinator(
      conversationCatalog,
      state,
    );
    const character = npcCharacterDefinitions[0]!;
    const idle = new AnimationClip('Idle', 1, []);
    const gesture = new AnimationClip('Gesture', 0.6, []);
    const dispose = vi.fn();
    const playerPose = {
      position: { x: -7, y: 0.2, z: 4 },
      forward: { x: 0, y: 0, z: 1 },
    };
    const entity = new NpcEntity(
      npcDefinitions[0]!,
      testDistrict.definition.spawns.find(
        ({ id }) => id === 'spawn.npc-mechanic',
      )!,
      character,
      {
        instantiate: vi.fn(async (): Promise<LoadedCharacter> => ({
          definition: character,
          root: new Group(),
          animationClips: new Map([
            ['idle', idle],
            ['gesture', gesture],
          ]),
          discoveredClipNames: ['Idle', 'Gesture'],
          source: 'asset',
          warnings: [],
          dispose,
        })),
      },
      conversations,
      { getWorldPose: () => playerPose },
    );
    await entity.init();
    const playerBefore = structuredClone(playerPose);
    conversations.start('conversation.mack.introduction', 'mack');
    entity.update({ delta: 0.25, elapsed: 0.25, frame: 1 });
    const facingPlayer = entity.object3d.rotation.y;
    expect(facingPlayer).not.toBeCloseTo(npcDefinitions[0]!.idleYaw!);
    expect(playerPose).toEqual(playerBefore);
    expect(entity.getDebugSnapshot().currentAnimation).toBe('idle');
    expect(entity.triggerGesture('unit-test')).toBe(true);
    entity.update({ delta: 0.2, elapsed: 0.45, frame: 2 });
    expect(entity.getDebugSnapshot()).toMatchObject({
      currentAnimation: 'gesture',
      gestureActive: true,
      lastGestureSource: 'unit-test',
      gestureSequence: 1,
    });
    entity.update({ delta: 0.5, elapsed: 0.95, frame: 3 });
    expect(entity.getDebugSnapshot()).toMatchObject({
      currentAnimation: 'idle',
      gestureActive: false,
      gestureSequence: 1,
    });

    conversations.end();
    for (let frame = 4; frame < 30; frame += 1) {
      entity.update({ delta: 0.1, elapsed: frame * 0.1, frame });
    }
    expect(
      Math.abs(entity.object3d.rotation.y - npcDefinitions[0]!.idleYaw!),
    ).toBeLessThanOrEqual(npcDefinitions[0]!.ambientYaw! + 0.001);
    entity.dispose();
    expect(dispose).toHaveBeenCalledOnce();
    conversations.dispose();
  });
});
