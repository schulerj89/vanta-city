import { EventBus } from '../src/core/events';
import type { StateEvents } from '../src/core/gameState';
import { GameStateMachine } from '../src/core/gameState';
import type { DialogueEvents } from '../src/dialogue/DialogueEvents';
import { PlayerMoneyAccount } from '../src/economy/PlayerMoneyAccount';
import { CharacterEquipment } from '../src/equipment/CharacterEquipment';
import { isEquipmentId } from '../src/equipment/EquipmentDefinition';
import type { HealthEvents } from '../src/health/Health';
import type { InteractionEvents } from '../src/interactions/Interactable';
import {
  MissionSystem,
  type MissionPersistenceSnapshot,
} from '../src/missions/MissionSystem';
import {
  ashfallInitialMissionFacts,
  missionDefinitions,
} from '../src/missions/missions';
import { DefinitionLevelLocations } from '../src/world/LevelQueries';
import { testDistrict } from '../src/world/levels/testDistrict';

function harness() {
  const stateEvents = new EventBus<StateEvents>();
  const state = new GameStateMachine(stateEvents);
  state.transition('playing');
  const interactions = new EventBus<InteractionEvents>();
  const dialogue = new EventBus<DialogueEvents>();
  const health = new EventBus<HealthEvents>();
  const money = new PlayerMoneyAccount('player');
  const equipment = new CharacterEquipment('player');
  const position = { x: 2, y: 0.22, z: 19 };
  const locations = new DefinitionLevelLocations(testDistrict.definition);
  const missions = new MissionSystem(
    missionDefinitions,
    ashfallInitialMissionFacts,
    {
      state,
      player: {
        getWorldPose: () => ({
          position: { ...position },
          forward: { x: 0, y: 0, z: -1 },
          radius: 0.38,
        }),
      },
      level: {
        activeLevel: testDistrict.definition,
        resolveLocation: (world) => locations.resolveLocation(world),
      },
      interactions,
      dialogue,
      health,
      money,
      equipment: {
        owns: (itemId) => isEquipmentId(itemId) && equipment.owns(itemId),
        acquire: (itemId) => isEquipmentId(itemId) && equipment.acquire(itemId),
      },
    },
  );
  missions.init();
  return {
    dialogue,
    equipment,
    health,
    interactions,
    missions,
    money,
    position,
    state,
  };
}

function emitHook(dialogue: EventBus<DialogueEvents>, hookId: string): void {
  dialogue.emit('dialogue:hook', {
    conversationId: 'conversation.mack.introduction',
    lineId: 'conversation.mack.introduction.warning',
    lineIndex: 3,
    speakerId: 'mack',
    phase: 'completion',
    hook: { id: hookId },
  });
}

function completeInteraction(
  interactions: EventBus<InteractionEvents>,
  id: string,
): void {
  interactions.emit('interaction:completed', {
    target: { id, prompt: 'Test interaction' },
  });
}

describe('MissionSystem', () => {
  it('runs the canonical first mission through world and typed event hooks', () => {
    const h = harness();
    const initial = h.missions.getSnapshot();
    expect(initial).toMatchObject({
      schemaVersion: 1,
      activeMissionId: undefined,
      facts: {
        'orin-status': 'missing',
        'mack-trust': 'guarded',
        'pager-code-compromised': true,
      },
    });
    expect(initial.missions[0]).toMatchObject({
      id: 'ash-001-walk-the-block',
      status: 'available',
      attempt: 0,
    });

    Object.assign(h.position, { x: 0, y: 0.22, z: 0 });
    h.missions.update();
    expect(h.missions.getSnapshot()).toMatchObject({
      activeMissionId: 'ash-001-walk-the-block',
      highlights: [
        {
          target: { kind: 'spawn', referenceId: 'spawn.npc-mechanic' },
          channels: ['world'],
        },
      ],
    });
    expect(h.missions.getSnapshot().missions[0]).toMatchObject({
      status: 'active',
      currentObjectiveId: 'ash-001-talk-to-mack',
      canCancel: true,
    });

    emitHook(h.dialogue, 'conversation.mack-introduction.completed');
    expect(h.missions.getSnapshot().missions[0]).toMatchObject({
      currentObjectiveId: 'ash-001-check-signal-corner',
      canCancel: false,
    });
    expect(h.missions.getSnapshot().highlights[0]).toMatchObject({
      channels: ['world', 'map'],
      target: {
        kind: 'interaction',
        referenceId: 'interaction.signal-controller',
      },
    });

    completeInteraction(h.interactions, 'interaction.signal-controller');
    expect(h.missions.getSnapshot().missions[0]?.currentObjectiveId).toBe(
      'ash-001-walk-south-approach',
    );
    expect(h.missions.getSnapshot().highlights[0]).toMatchObject({
      channels: ['map'],
      target: {
        kind: 'landmark',
        referenceId: 'landmark.south-approach',
      },
    });

    Object.assign(h.position, { x: 0, y: 0.22, z: -21 });
    h.missions.update();
    expect(h.missions.getSnapshot().missions[0]?.currentObjectiveId).toBe(
      'ash-001-return-to-mack',
    );
    completeInteraction(h.interactions, 'interaction.npc.mack');

    const complete = h.missions.getSnapshot();
    expect(complete.activeMissionId).toBeUndefined();
    expect(complete.missions[0]).toMatchObject({
      status: 'completed',
      rewardGranted: true,
      currentObjectiveId: undefined,
    });
    expect(complete.facts).toMatchObject({
      'rook-arrived-in-ashfall': true,
      'junction-surveillance-checked': true,
      'mack-trust': 'conditional',
    });
    expect(h.money.balance).toBe(575);

    completeInteraction(h.interactions, 'interaction.npc.mack');
    expect(h.money.balance).toBe(575);
    h.missions.dispose();
  });

  it('supports cancellation, failure, retry-ready state, and immutable persistence', () => {
    const h = harness();
    expect(h.missions.start('ash-001-walk-the-block')).toBe(true);
    expect(h.missions.cancel()).toBe(true);
    expect(h.money.balance).toBe(500);
    expect(h.missions.getSnapshot().facts).not.toHaveProperty(
      'rook-arrived-in-ashfall',
    );

    expect(h.missions.start('ash-001-walk-the-block')).toBe(true);
    expect(h.missions.completeCurrentObjective()).toBe(true);
    emitHook(h.dialogue, 'conversation.mack-introduction.completed');
    expect(h.missions.cancel()).toBe(false);
    expect(h.missions.fail('ash-001-walk-the-block', 'player-depleted')).toBe(
      true,
    );
    expect(h.missions.getSnapshot().missions[0]).toMatchObject({
      status: 'failed',
      retryReady: true,
      failureReason: 'player-depleted',
    });
    expect(h.missions.retry('ash-001-walk-the-block')).toBe(true);
    expect(h.missions.getSnapshot().missions[0]).toMatchObject({
      status: 'active',
      attempt: 3,
      currentObjectiveId: 'ash-001-enter-junction',
    });

    const persistence = h.missions.getPersistenceSnapshot();
    expect(Object.isFrozen(persistence)).toBe(true);
    expect(Object.isFrozen(persistence.missions[0]?.objectiveStatuses)).toBe(
      true,
    );
    const serialized = JSON.parse(
      JSON.stringify(persistence),
    ) as MissionPersistenceSnapshot;
    h.missions.dispose();

    const restored = harness();
    restored.missions.dispose();
    const locations = new DefinitionLevelLocations(testDistrict.definition);
    const fresh = new MissionSystem(
      missionDefinitions,
      ashfallInitialMissionFacts,
      {
        state: restored.state,
        player: {
          getWorldPose: () => ({
            position: { ...restored.position },
            forward: { x: 0, y: 0, z: -1 },
            radius: 0.38,
          }),
        },
        level: {
          activeLevel: testDistrict.definition,
          resolveLocation: (world) => locations.resolveLocation(world),
        },
        interactions: restored.interactions,
        dialogue: restored.dialogue,
        health: restored.health,
        money: restored.money,
        equipment: {
          owns: (itemId) =>
            isEquipmentId(itemId) && restored.equipment.owns(itemId),
          acquire: (itemId) =>
            isEquipmentId(itemId) && restored.equipment.acquire(itemId),
        },
      },
    );
    fresh.restore(serialized);
    fresh.init();
    expect(fresh.getSnapshot()).toMatchObject({
      activeMissionId: 'ash-001-walk-the-block',
      revision: persistence.revision,
    });
    expect(fresh.getSnapshot().missions[0]).toMatchObject({
      status: 'active',
      attempt: 3,
      currentObjectiveId: 'ash-001-enter-junction',
    });
    fresh.dispose();
    expect(() =>
      fresh.dispatch({
        type: 'world-trigger-entered',
        triggerId: 'trigger.intersection-center',
      }),
    ).toThrow('Mission system is disposed');
  });
});
