# First-wave integration decisions

The first-wave feature branches all began at the same foundation commit and were integrated after their public contracts were compared. The integrated runtime is one vertical slice, not a collection of feature demos.

## Decisions

- `LevelSystem` is the single owner of the loaded district and named world metadata. The foundation `TestSceneSystem` remains sandbox-only.
- `StaticColliderDefinition` is the authored collision contract. `WorldCollisionSystem` listens to level load/unload facts and rebuilds the game-owned `StaticCollisionWorld`; player and camera share that query backend.
- `WorldPosition`, `WorldPose`, and `WorldPoseSource` replace the separate player-transform and interaction-location abstractions. `PlayerControllerSystem` supplies the pose directly to `InteractionSystem`.
- The default player spawn comes from the loaded level definition. Reset and debug teleport use the same named spawn API.
- `CharacterPlayerVisual` is presentation owned by the player controller. It loads the selected local character through `CharacterLoader` and retains the emergency placeholder guarantee if a licensed file becomes unreadable.
- Level interaction markers are metadata, while `InteractionSystem` owns availability, ranking, input, execution, cancellation, and events. The test garage-door interaction is registered from its named level location.
- `GameRuntime` and `GameStateMachine` remain the only pause/state authorities. Simulation stops only while paused; player and camera input additionally require `playing`.
- The production bootstrap contains no developer commands. Development dynamically imports one generic `DebugRegistry`/panel; mechanics contribute public values, commands, and visibility callbacks.

## Conflicts resolved

- Five competing `main.ts` bootstraps were replaced by one ordered lifecycle.
- The asset branch's rich loader retained ownership, caching, progress, and instancing; developer-tooling error context was folded into its `AssetLoadError` instead of keeping a second loader.
- Player and world collision definitions were unified instead of adapted through parallel box types.
- The interaction branch's fixed demo-player pose and test-scene objects were removed in favor of the real player and district marker.
- The player debug overlay and interaction-specific debug panel were removed in favor of the registry-driven developer panel.
- The character preview actor was not placed beside the playable character. The shared selector now drives the existing player's visual directly; preview rotation controls remain available only when the selector is paired with an isolated preview controller.

## Current limits

- Static collision supports authored axis-aligned boxes plus tagged planar ramps; arbitrary rotated meshes and moving platforms require a future backend behind `CollisionWorld`.
- The camera obstruction query uses the same static approximation and may need richer geometry in tight art-authored spaces.
- Character playback uses a compact priority graph for locomotion, explicit airborne/landing fallbacks, locked one-shot actions, target reactions, and deterministic restoration. The current playable assets still have no authored airborne or landing clips, and layered animation remains future work.
- Interaction visibility uses the shared collision-world segment query; range uses the player capsule and the target's profile footprint before facing and LOS rejection.
- The district is loaded as one unit; streaming and large-world ownership are future work.
