# Conversation-slice integration decisions

The July 2026 conversation slice integrates `feat/character-picker`, `feat/npc-foundation`, `feat/camera-controls`, and `feat/dialogue-ui` on `integration/conversation-slice`.

## Authoritative contracts

- `CharacterDefinition` and `CharacterSelectionStore` own playable identity. The picker edits that existing store and never recreates the player simulation.
- `NpcDefinition` owns NPC identity, appearance references, spawn, portrait reference, interaction label, and conversation reference. Mack's only Talk target is registered by `NpcSystem` through `InteractionSystem`.
- `src/conversations/ConversationDefinition.ts` is the single conversation schema and catalog. Lines contain speaker IDs and presentation data only; no loaded model is stored in dialogue data.
- `ConversationCoordinator` accepts NPC conversation requests and owns the shared lifecycle/game-state transition. `DialogueSessionController` observes that session and owns only ordered line progression, hooks, and presentation state.
- `ThirdPersonCameraSystem` is the only camera transform writer. Dialogue requests a priority-owned conversation handle using Mack's public `WorldPoseSource` and releases it on completion or cancellation.
- Dialogue speakers are derived from NPC metadata. The `rook` speaker resolves through the currently selected playable character definition and its optional portrait metadata.

## Resolved overlaps

The dialogue worker's second `ConversationDefinition`, standalone Mack conversation file, and direct `interaction.mack-conversation` were removed. Mack's NPC-authored `interaction.npc.mack` remains repeatable and requests `conversation.mack.introduction` from the shared catalog. Worker edits to `main.ts`, input bindings, browser instrumentation, CSS, and smoke coverage were composed rather than resolved by taking one branch wholesale.

Missing local GLBs remain selectable when a definition explicitly declares the generated placeholder fallback. The confirmed logical character ID is retained while `CharacterPlayerVisual` reports whether the asset or fallback was loaded. Model transforms remain presentation-only under the simulation root; character switching does not recreate or move player simulation.

## Current limitations

The optional NPC-specific Quaternius GLBs and portrait WebP files are not committed, so Mack, Nox, and Raze use generated character visuals and portrait image failures resolve to deterministic initials. The two playable Quaternius GLBs, Casual and Punk, are committed and load as real models. Conversation framing currently uses the camera system's generated two-shot rather than an authored per-conversation shot list.
