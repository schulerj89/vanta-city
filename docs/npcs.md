# NPC foundation

NPCs are data-defined static district actors. `NpcSystem` listens to level load/unload events, resolves each definition's authored NPC spawn, loads its shared `CharacterDefinition` through the existing `CharacterLoader`, adds one `NpcEntity` to `GameObjectWorld`, and registers one generic Talk interaction. It does not implement navigation, schedules, combat, missions, traffic, or runtime network loading.

## Production pedestrian presentation library

`pedestrianCharacterDefinitions` provides four production-intended low-poly
ambient pedestrian models without introducing a second loader, identity,
animation, debug, or lifecycle abstraction. They join the authoritative
`npcCharacterDefinitions` presentation registry, so existing `CharacterLoader`
fallback/disposal behavior, character validation, and the character animation
lab apply unchanged.

| Definition            | Local model                   | Source model      |  Scale | Idle          | Explicit applause |
| --------------------- | ----------------------------- | ----------------- | -----: | ------------- | ----------------- |
| `pedestrian-casual`   | `animated-women/casual.glb`   | Woman Casual      | `0.38` | `Female_Idle` | `Female_Clapping` |
| `pedestrian-street`   | `animated-women/street.glb`   | Woman             | `0.38` | `Female_Idle` | `Female_Clapping` |
| `pedestrian-tank-top` | `animated-women/tank-top.glb` | Woman in Tank Top | `0.38` | `Female_Idle` | `Female_Clapping` |
| `pedestrian-dress`    | `animated-women/dress.glb`    | Woman in Dress    | `0.38` | `Female_Idle` | `Female_Clapping` |

All four come from Quaternius's
[Animated Women Pack](https://poly.pizza/bundle/Animated-Women-Pack-HHSKxnk1mY),
verified CC0/Public Domain on 2026-07-18. Detailed provenance, archive and file
hashes, complete animation inventory, forward axis, transforms, and
modifications are committed beside the assets in
`public/assets/characters/animated-women/README.md`.

These definitions are selected by the separate authoritative `PedestrianSystem`
for deterministic, sector-resident sidewalk walkers. They remain outside the
conversation NPC roster and never receive Talk, mission, cinematic-performance,
or applause-fallback behavior. See [Sidewalk pedestrian population](pedestrians.md).
The development Talk fixtures below remain separate.

## Development fixture roster

The production/default Ashfall Junction startup passes an empty definition list to `NpcSystem`, so no ordinary NPC model, Talk prompt, occupancy, or health UI is present. The reusable definitions below remain system-test fixtures and are instantiated only in a Vite development build when the URL explicitly contains `?npcFixtures=1`. Production ignores the parameter.

| NPC  | NPC character definition | Poly Pizza model                                       |   Scale | Portrait asset      | Camera profile | Spawn                | Conversation                     |
| ---- | ------------------------ | ------------------------------------------------------ | ------: | ------------------- | -------------- | -------------------- | -------------------------------- |
| Mack | `npc-worker`             | [Man in Long Sleeves](https://poly.pizza/m/DLptRuewTn) | `0.370` | `portrait.npc-mack` | `close`        | `spawn.npc-mechanic` | `conversation.mack.introduction` |
| Nox  | `npc-hoodie`             | [Man (layered shirt)](https://poly.pizza/m/fjHyMd5Wxw) | `0.368` | `portrait.npc-nox`  | `default`      | `spawn.npc-alley`    | `conversation.nox.check-in`      |
| Raze | `npc-punk`               | [Man in Suit](https://poly.pizza/m/mQnGoME1ez)         | `0.369` | `portrait.npc-raze` | `wide`         | `spawn.npc-deck`     | `conversation.raze.check-in`     |

All three are selected from Quaternius's [Animated Men Pack](https://poly.pizza/bundle/Animated-Men-Pack-DAC9SDgMQT), a CC0/Public Domain source distinct from the playable Casual/Punk **Ultimate Modular Men Pack**. The three self-contained GLBs, CC0 legal text, archive hash, individual hashes, sizes, and full clip inventory are committed under `public/assets/characters/animated-men/`. No model conversion was needed.

`npcDefinitions` remains authoritative for Mack, Nox, and Raze fixture identity, character reference, spawn, Talk prompt, conversation, and idle facing. `NpcSystem` applies the shared Talk range profile; `interactionRadius` exists only as an optional surface-gap override for exceptional geometry. `npcFixtureCharacterDefinitions` contains their non-selectable presentation definitions, while `npcCharacterDefinitions` is the aggregate NPC presentation registry consumed by validation and debug tooling. The playable `characterDefinitions` remains exactly Casual and Punk.

## Animation and grounding

Each NPC maps exact inspected embedded clips:

- logical `idle` → `HumanArmature|Man_Idle` (4.166667 seconds, looping);
- logical `applaud` → `HumanArmature|Man_Clapping` (1.666667 seconds, one shot).

Idle runs during gameplay and every Talk conversation remains neutral unless an
explicit cinematic performance request is accepted. Clapping is available only
through `applaud` / `requestApplause`; conversation start, failed Talk, listening,
and missing-performance paths never request it.

The shared Animated Men/Women rigs already face the runtime's local `+Z`
presentation direction, so their character definitions apply scale only. NPC
entity yaw is the sole body-facing seam; the visual alignment root remains at zero
yaw during idle, turning, conversation, and cinematic performance. This removes
the former dialogue-only π cancellation and its 180-degree entry discontinuity.

Animation mixers target only the loaded character subtree. Every update restores the authored model-root offset, and no animation or alignment code mutates the NPC world/simulation transform. Bounds are measured after the definition scale/rotation correction; a dedicated visual alignment root places the transformed minimum Y on the actor contact plane. Validated heights are approximately `1.780m`, `1.782m`, and `1.782m`, respectively.

The asset validator requires a skeleton, exact idle/applause mappings, valid bounds and ground alignment, root translation within `0.05` units, and three clone/disposal preview cycles. Browser debug snapshots expose model source, transformed bounds, grounded minimum Y, applied visual offset, current animation, action lifecycle/source/sequence, interaction state, conversation state, and the public cinematic-performance snapshot.

## Fallback behavior

`CharacterLoader` remains the only model loader and asset registry path. A missing or invalid NPC file resolves to the existing generated placeholder, produces `modelSource: placeholder`, and uses a static safe pose when idle/applause clips are unavailable. The NPC identity, spawn, prompt, interaction, and conversation reference remain intact. Disposal always stops and uncaches the mixer before disposing the loaded or fallback character instance.

Optional portrait files remain independent from the 3D models:

```text
public/assets/portraits/npcs/mack.webp
public/assets/portraits/npcs/nox.webp
public/assets/portraits/npcs/raze.webp
```

Missing portraits resolve through the dialogue UI's initials fallback.

## Registering another NPC

1. Register a local model and portrait URL as logical IDs in `src/assets/catalog.ts`.
2. Add a non-picker `CharacterDefinition` to `npcCharacterDefinitions` and map exact inspected idle and optional applause clip names.
3. Add a `kind: 'npc'` spawn to the level; the spawn owns position and optional idle rotation.
4. Add an `npc-occupancy` static collider if the actor should block the current static collision backend.
5. Add a conversation definition to `src/conversations/conversations.ts`.
6. Add the authoritative `NpcDefinition`, including `defaultAnimation` and optional `applauseAnimation`.

`validateNpcDefinitions` rejects duplicate/invalid IDs, missing character or conversation definitions, blank labels/animations, and any provided non-positive range override.

## Conversation and ownership boundary

`ConversationCoordinator.start(conversationId, npcId)` synchronously publishes `conversation:started`, locks every NPC interaction, and transitions the existing game state to `dialogue` after the initiating interaction completes only when the referenced definition contains dialogue lines. Mack has a short demonstration exchange; Nox and Raze each use a one-line check-in through the same catalog, coordinator, session, portrait, camera, and interaction contracts. Empty placeholders and missing IDs are rejected before acquiring dialogue ownership.

During any roster NPC's active session, the NPC smoothly faces the player through `WorldPoseSource`, while the playable visual root faces the NPC without mutating simulation yaw. Ending returns the NPC toward authored idle yaw plus ambient variation. `GameObjectWorld` owns scene attachment and per-frame updates; `NpcSystem` owns interaction registrations and level synchronization. Unloading unregisters Talk targets, removes entities, stops/uncaches mixers, disposes instances, and cancels a conversation belonging to the unloaded roster.
