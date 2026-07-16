# NPC foundation

NPCs are data-defined static district actors. `NpcSystem` listens to level load/unload events, resolves each definition's authored NPC spawn, loads its shared `CharacterDefinition`, adds one `NpcEntity` to `GameObjectWorld`, and registers one generic Talk interaction. It does not implement navigation, schedules, combat, missions, dialogue UI, or camera behavior.

## Debug district roster

| NPC  | Character definition | Poly Pizza model                            | Portrait asset      | Spawn                | Conversation                     |
| ---- | -------------------- | ------------------------------------------- | ------------------- | -------------------- | -------------------------------- |
| Mack | `npc-worker`         | Worker, Ultimate Modular Men Pack           | `portrait.npc-mack` | `spawn.npc-mechanic` | `conversation.mack.introduction` |
| Nox  | `npc-hoodie`         | Hoodie Character, Ultimate Modular Men Pack | `portrait.npc-nox`  | `spawn.npc-alley`    | `conversation.nox.placeholder`   |
| Raze | `npc-punk`           | Punk, Ultimate Modular Men Pack             | `portrait.npc-raze` | `spawn.npc-deck`     | `conversation.raze.placeholder`  |

The source pack is [Ultimate Modular Men Pack by Quaternius on Poly Pizza](https://poly.pizza/bundle/Ultimate-Modular-Men-Pack-ZiH8muWqwQ), listed as CC0 and containing 11 characters with 24 animations. Runtime files and portraits are intentionally not committed. Missing GLBs use the generated character placeholder and a static valid pose; missing portraits are harmless because this branch has no dialogue UI.

Expected optional files are:

```text
public/assets/characters/ultimate-modular-men/worker.glb
public/assets/characters/ultimate-modular-men/hoodie-character.glb
public/assets/characters/ultimate-modular-men/punk.glb
public/assets/portraits/npcs/mack.webp
public/assets/portraits/npcs/nox.webp
public/assets/portraits/npcs/raze.webp
```

## Registering another NPC

1. Register the model and portrait URLs as logical IDs in `src/assets/catalog.ts`.
2. Add a `CharacterDefinition` to `npcCharacterDefinitions` in `src/npcs/npcs.ts`. Map its logical `idle` animation to candidate embedded clip names; `required: true` produces a clear development warning when none match.
3. Add a `kind: 'npc'` spawn to the level's `spawns` array. The spawn owns position and optional idle rotation.
4. Add a small `npc-occupancy` static collider when the actor should block the current static player collision backend.
5. Add a conversation definition or placeholder reference to `src/conversations/conversations.ts`.
6. Add the `NpcDefinition` to `npcDefinitions`, referencing only logical character, portrait, spawn, and conversation IDs.

`validateNpcDefinitions` rejects duplicate/invalid IDs, missing character definitions, missing conversation definitions, blank labels/animations, and non-positive radii. Appearance, placement, prompt, conversation, idle orientation, and ambient yaw all remain data rather than NPC behavior branches.

## Conversation boundary

`ConversationCoordinator.start(conversationId, npcId)` synchronously publishes `conversation:started`, locks every NPC interaction, and transitions the existing game state to `dialogue` after the initiating interaction completes. A future dialogue UI subscribes to the coordinator's typed events, renders the supplied `ConversationDefinition`, and calls `end()` when finished. Mack's definition contains a complete short demonstration exchange; Nox and Raze intentionally point to validated placeholders.

During the active session, the matching NPC smoothly faces `PlayerControllerSystem.getWorldPose()` through the public `WorldPoseSource` contract. Ending returns it toward authored idle yaw plus a small ambient variation. No player transform is mutated. The development panel exposes session IDs and an **End conversation** command until dialogue UI exists.

## Ownership and unloading

`GameObjectWorld` owns NPC scene attachment and per-frame updates. `NpcSystem` owns registrations and level synchronization. On level unload it unregisters Talk targets, removes entities, stops/uncaches animation mixers, disposes character instances, cancels a conversation belonging to the unloaded roster, and lets `WorldCollisionSystem` clear level-owned occupancy colliders.
