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

function completeDialogue(
  dialogue: EventBus<DialogueEvents>,
  conversationId = 'conversation.mack.introduction',
): void {
  dialogue.emit('dialogue:completed', { conversationId });
}

describe('MissionSystem', () => {
  it('runs the canonical first mission through world and typed event hooks', () => {
    const h = harness();
    const contentRequests: string[] = [];
    h.missions.events.on('mission:content-requested', ({ referenceId }) =>
      contentRequests.push(referenceId),
    );
    const initial = h.missions.getSnapshot();
    expect(initial).toMatchObject({
      schemaVersion: 1,
      activeMissionId: undefined,
      facts: {
        'orin-status': 'missing',
        'mack-trust': 'guarded',
        'pager-code-compromised': true,
        'rook-arrived-in-ashfall': false,
        'rook-accepted-orin-search': false,
        'marrow-has-rook-arrival-time': false,
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
      currentObjectiveId: 'ash-001-hear-mack-out',
      canCancel: true,
    });
    expect(contentRequests).toEqual(['cinematic.ash-001.opening']);

    completeDialogue(h.dialogue);
    expect(h.missions.getSnapshot().missions[0]).toMatchObject({
      currentObjectiveId: 'ash-001-meet-yard-contact',
      canCancel: false,
    });
    expect(h.missions.getSnapshot().highlights[0]).toMatchObject({
      channels: ['world', 'map'],
      target: {
        kind: 'location',
        referenceId: 'location.ash-001.contact-yard',
      },
    });
    expect(contentRequests).toEqual([
      'cinematic.ash-001.opening',
      'cinematic.ash-001.destination-reveal',
    ]);

    h.missions.dispatch({
      type: 'world-location-entered',
      locationId: 'location.ash-001.contact-yard',
    });

    const complete = h.missions.getSnapshot();
    expect(complete.activeMissionId).toBeUndefined();
    expect(complete.missions[0]).toMatchObject({
      status: 'completed',
      rewardGranted: true,
      currentObjectiveId: undefined,
    });
    expect(complete.facts).toMatchObject({
      'rook-arrived-in-ashfall': true,
      'rook-accepted-orin-search': true,
      'marrow-has-rook-arrival-time': true,
      'contact-yard-meeting-completed': true,
      'orin-status': 'missing',
      'mack-trust': 'conditional',
    });
    expect(h.money.balance).toBe(575);

    h.missions.dispatch({
      type: 'world-location-entered',
      locationId: 'location.ash-001.contact-yard',
    });
    expect(h.money.balance).toBe(575);
    expect(contentRequests).toHaveLength(2);
    h.missions.dispose();
  });

  it('supports cancellation, failure, retry-ready state, and immutable persistence', () => {
    const h = harness();
    expect(h.missions.start('ash-001-walk-the-block')).toBe(true);
    expect(h.missions.cancel()).toBe(true);
    expect(h.money.balance).toBe(500);
    expect(h.missions.getSnapshot().facts['rook-arrived-in-ashfall']).toBe(
      false,
    );

    expect(h.missions.start('ash-001-walk-the-block')).toBe(true);
    completeDialogue(h.dialogue);
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
      currentObjectiveId: 'ash-001-hear-mack-out',
    });
    completeDialogue(h.dialogue);
    expect(h.missions.getSnapshot().missions[0]?.currentObjectiveId).toBe(
      'ash-001-meet-yard-contact',
    );

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
    const restoredContentRequests: string[] = [];
    fresh.events.on('mission:content-requested', ({ referenceId }) =>
      restoredContentRequests.push(referenceId),
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
      currentObjectiveId: 'ash-001-meet-yard-contact',
    });
    expect(restoredContentRequests).toEqual([]);
    fresh.dispose();
    expect(() =>
      fresh.dispatch({
        type: 'world-trigger-entered',
        triggerId: 'trigger.intersection-center',
      }),
    ).toThrow('Mission system is disposed');
  });
});
