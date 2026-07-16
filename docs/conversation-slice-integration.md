# Conversation-slice integration decisions

The July 2026 conversation slice integrates `feat/character-picker`, `feat/npc-foundation`, `feat/camera-controls`, and `feat/dialogue-ui` on `integration/conversation-slice`.

## Authoritative contracts

- `CharacterDefinition` and `CharacterSelectionStore` own playable identity. The picker edits that existing store and never recreates the player simulation.
- `NpcDefinition` owns NPC identity, appearance references, spawn, portrait reference, interaction label, and conversation reference. Mack's only Talk target is registered by `NpcSystem` through `InteractionSystem`.
- `src/conversations/ConversationDefinition.ts` is the single conversation schema and catalog. Lines contain speaker IDs and presentation data only; no loaded model is stored in dialogue data.
- `ConversationCoordinator` accepts NPC conversation requests and owns the shared lifecycle/game-state transition. `DialogueSessionController` observes that session and owns only ordered line progression, hooks, and presentation state.
- `ThirdPersonCameraSystem` is the only camera transform writer. Dialogue requests a priority-owned conversation handle using the initiating NPC's public `WorldPoseSource` and definition-selected conversation profile, then releases it on completion or cancellation.
- Dialogue speakers are derived from NPC metadata. The `rook` speaker resolves through the currently selected playable character definition and its optional portrait metadata.

## Resolved overlaps

The dialogue worker's second `ConversationDefinition`, standalone Mack conversation file, and direct `interaction.mack-conversation` were removed. Mack's NPC-authored `interaction.npc.mack` remains repeatable and requests `conversation.mack.introduction` from the shared catalog. Worker edits to `main.ts`, input bindings, browser instrumentation, CSS, and smoke coverage were composed rather than resolved by taking one branch wholesale.

Missing local GLBs remain selectable when a definition explicitly declares the generated placeholder fallback. The confirmed logical character ID is retained while `CharacterPlayerVisual` reports whether the asset or fallback was loaded. Model transforms remain presentation-only under the simulation root; character switching does not recreate or move player simulation.

## Current presentation

Mack, Nox, and Raze use their committed local Quaternius Animated Men GLBs; Casual and Punk use the committed Ultimate Modular Men GLBs. No character model requires a network request. Optional portrait WebP files are not committed, so dialogue deliberately resolves to named, accessible initials until local art is supplied.

Conversation framing uses the camera system's participant-relative profile mechanism: Mack selects `close`, Nox inherits `default`, and Raze selects `wide`. The camera computes each two-shot from the live player/NPC positions, can choose the clearer shoulder around an obstruction, and restores the exact captured gameplay-camera relationship after completion or cancellation. This is intentionally not a per-conversation cinematic timeline.
