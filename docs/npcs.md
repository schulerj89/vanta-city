# NPC foundation

NPCs are data-defined static district actors. `NpcSystem` listens to level load/unload events, resolves each definition's authored NPC spawn, loads its shared `CharacterDefinition` through the existing `CharacterLoader`, adds one `NpcEntity` to `GameObjectWorld`, and registers one generic Talk interaction. It does not implement navigation, schedules, combat, missions, traffic, or runtime network loading.

## Debug district roster

| NPC  | NPC character definition | Poly Pizza model                                       |   Scale | Spawn                | Conversation                     |
| ---- | ------------------------ | ------------------------------------------------------ | ------: | -------------------- | -------------------------------- |
| Mack | `npc-worker`             | [Man in Long Sleeves](https://poly.pizza/m/DLptRuewTn) | `0.370` | `spawn.npc-mechanic` | `conversation.mack.introduction` |
| Nox  | `npc-hoodie`             | [Man (layered shirt)](https://poly.pizza/m/fjHyMd5Wxw) | `0.368` | `spawn.npc-alley`    | `conversation.nox.placeholder`   |
| Raze | `npc-punk`               | [Man in Suit](https://poly.pizza/m/mQnGoME1ez)         | `0.369` | `spawn.npc-deck`     | `conversation.raze.placeholder`  |

All three are selected from Quaternius's [Animated Men Pack](https://poly.pizza/bundle/Animated-Men-Pack-DAC9SDgMQT), a CC0/Public Domain source distinct from the playable Casual/Punk **Ultimate Modular Men Pack**. The three self-contained GLBs, CC0 legal text, archive hash, individual hashes, sizes, and full clip inventory are committed under `public/assets/characters/animated-men/`. No model conversion was needed.

`npcDefinitions` remains authoritative for Mack, Nox, and Raze identity, character reference, spawn, Talk prompt, conversation, radius, and idle facing. `npcCharacterDefinitions` contains their non-selectable presentation definitions. The playable `characterDefinitions` remains exactly Casual and Punk.

## Animation and grounding

Each NPC maps exact inspected embedded clips:

- logical `idle` → `HumanArmature|Man_Idle` (4.166667 seconds, looping);
- logical `gesture` → `HumanArmature|Man_Clapping` (1.666667 seconds, one shot).

Idle runs during gameplay. A playable conversation start triggers the matching NPC gesture through the coordinator event, so Mack also gestures when dialogue starts from debug tooling. A placeholder/no-dialogue Talk triggers the same one shot directly; Nox and Raze retain gameplay state, gameplay camera, and input ownership. When a gesture finishes, the entity cross-fades back to idle.

Animation mixers target only the loaded character subtree. Every update restores the authored model-root offset, and no animation or alignment code mutates the NPC world/simulation transform. Bounds are measured after the definition scale/rotation correction; a dedicated visual alignment root places the transformed minimum Y on the actor contact plane. Validated heights are approximately `1.780m`, `1.782m`, and `1.782m`, respectively.

The asset validator requires a skeleton, exact idle/gesture mappings, valid bounds and ground alignment, root translation within `0.05` units, and three clone/disposal preview cycles. Browser debug snapshots expose model source, transformed bounds, grounded minimum Y, applied visual offset, current animation, gesture lifecycle/source/sequence, interaction state, and conversation state.

## Fallback behavior

`CharacterLoader` remains the only model loader and asset registry path. A missing or invalid NPC file resolves to the existing generated placeholder, produces `modelSource: placeholder`, and uses a static safe pose when idle/gesture clips are unavailable. The NPC identity, spawn, prompt, interaction, and conversation reference remain intact. Disposal always stops and uncaches the mixer before disposing the loaded or fallback character instance.

Optional portrait files remain independent from the 3D models:

```text
public/assets/portraits/npcs/mack.webp
public/assets/portraits/npcs/nox.webp
public/assets/portraits/npcs/raze.webp
```

Missing portraits resolve through the dialogue UI's initials fallback.

## Registering another NPC

1. Register a local model and portrait URL as logical IDs in `src/assets/catalog.ts`.
2. Add a non-picker `CharacterDefinition` to `npcCharacterDefinitions` and map exact inspected idle/gesture clip names.
3. Add a `kind: 'npc'` spawn to the level; the spawn owns position and optional idle rotation.
4. Add an `npc-occupancy` static collider if the actor should block the current static collision backend.
5. Add a conversation definition or explicit empty placeholder.
6. Add the authoritative `NpcDefinition`, including `defaultAnimation` and `gestureAnimation`.

`validateNpcDefinitions` rejects duplicate/invalid IDs, missing character or conversation definitions, blank labels/animations, and non-positive radii.

## Conversation and ownership boundary

`ConversationCoordinator.start(conversationId, npcId)` synchronously publishes `conversation:started`, locks every NPC interaction, and transitions the existing game state to `dialogue` only when the referenced definition contains lines. Mack's definition contains the demonstration exchange. Nox and Raze point to validated empty placeholders; their Talk interactions acquire no conversation, camera, or input ownership.

During Mack's active session, the NPC smoothly faces the player through `WorldPoseSource`. Ending returns it toward authored idle yaw plus ambient variation. `GameObjectWorld` owns scene attachment and per-frame updates; `NpcSystem` owns interaction registrations, conversation gesture routing, and level synchronization. Unloading unregisters Talk targets, removes entities, stops/uncaches mixers, disposes instances, and cancels a conversation belonging to the unloaded roster.
