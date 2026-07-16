# Architecture

## Direction

Vanta City uses TypeScript, Vite, and Three.js without a UI framework. The current UI is small and DOM-native; adding a framework now would add runtime and ownership complexity without solving a foundation requirement. Modules are organized by responsibility rather than by speculative feature layers.

No third-party physics library is installed. The first vertical slice uses a deterministic game-owned `StaticCollisionWorld` behind the narrower `CollisionWorld` query contract. Authored `StaticColliderDefinition` data is shared by level loading and the collision adapter; player and camera code do not depend on level files or a physics package.

## Runtime lifecycle

`GameRuntime` owns the animation frame, `GameClock`, `GameStateMachine`, event bus, and ordered `SystemRegistry`. `init()` initializes registered systems in registration order, transitions `booting` to `playing`, and starts the frame loop. `dispose()` stops the loop, disposes systems in reverse registration order, then clears events.

Every frame, the clock converts milliseconds to seconds and caps delta at 0.1 seconds. Its baseline resets after resume, preventing a backgrounded or paused tab from creating a large simulation step. The registry runs all `update` hooks, then all `lateUpdate` hooks. Systems default to simulation updates; systems declaring `updateMode = 'always'` continue while paused. Rendering, input edge cleanup, the follow camera, and the development panel use this mode.

`pause()` and `resume()` transition state and notify every system through optional lifecycle hooks. The animation frame continues while paused so input, state UI, and rendering remain responsive, while simulation systems stop.

## Systems and game objects

Implement `GameSystem<GameContext>` and register the instance before `runtime.init()`. IDs must be unique. Keep a system focused on one concern and inject its dependencies through construction or the narrow `GameContext`; do not introduce a service-locator singleton.

Use `GameObject` for individually addressable scene actors. It requires a stable ID and Three.js `Object3D`, with optional update/dispose hooks. `GameObjectWorld` owns scene attachment and object lifetimes. This convention provides identity and composition without committing the project to a large ECS. Revisit an ECS only if profiling or broad data-oriented behavior demonstrates a need.

## Input actions

`InputReader` is the gameplay-facing API: `isDown`, `wasPressed`, and `wasReleased` accept action names. `defaultBindings` is the sole default keyboard map. DOM event and key-code handling stays inside `InputSystem`; gameplay systems must never subscribe to keyboard events or test raw codes. Add gamepad or rebinding support behind `InputReader` rather than changing consumers.

Pressed and released edges last for one frame and are cleared during `lateUpdate`. Window blur clears all input to prevent stuck movement.

## Events and state

`EventBus<Events>` provides typed `on`, `off`, and `emit`, and `on` returns an unsubscribe function. Extend a shared event-map interface with plain, immutable payloads. Events are for facts crossing independent system boundaries, not for per-frame queries or hidden command chains. Owners should expose direct methods for commands.

`GameStateMachine` represents `booting`, `playing`, `paused`, `dialogue`, and `cinematic`, validates transitions, and emits `game-state:changed`. New state transitions belong in the explicit transition table. Feature systems should react to state events or lifecycle policy rather than maintaining competing global mode flags.

## Assets and rendering

`AssetCatalog` validates logical IDs for models, animations, and textures. `GameAssetLoader` exposes cached source loads, progress/error status, and independent model instances. `ThreeAssetLoader` deduplicates concurrent and completed loads, evicts failed requests so they can be retried, and owns disposal of cached GPU resources. Cached glTF scenes are source data and must never be inserted into the live scene; consumers use `instantiateModel()` or `CharacterLoader.instantiate()` and dispose the returned instance. Gameplay code supplies asset IDs and must not scatter URLs through feature code.

`CharacterDefinition` separates identity, display name, model/animation asset IDs, clip mappings, transform corrections, and optional attachment/material variation metadata. `CharacterSelectionStore` persists its choice in session storage. `CharacterPlayerVisual` consumes the read-only selection and `CharacterLoader`, replacing only presentation when selection changes and guaranteeing the primitive fallback path. Preview/selector components remain reusable development utilities but are not separate actors in the district runtime.

`RenderSystem` exclusively owns the Three.js renderer, scene, camera, canvas, resize observer, and render call. It caps device pixel ratio at two. Future third-person camera logic should update the injected camera from its own simulation system; it should not create another renderer or animation loop.

## Levels and static world collision

`LevelRegistry` validates data-only `LevelModule` exports and combines their logical asset manifests. `LevelSystem` loads one registered definition through the existing asset loader, owns a single scene root, publishes typed load/unload events, and releases its generated resources during lifecycle disposal. See [World levels](world-levels.md) for the schema and registration example.

Rendered geometry, plain collision boxes, semantic locations, trigger definitions, and debug helpers are separate concerns. Player, NPC, interaction, mission, dialogue, and camera systems query the `LevelLocations` API rather than traverse scene nodes. The plain rotated-box collision convention is the first implementation of the previously reserved game-owned physics boundary; a future physics adapter can consume it without leaking a physics package into feature code.

## Interactions

`InteractionSystem` centrally registers plain `Interactable` definitions, queries one injected player pose, ranks valid candidates, and executes the single selected target through the named `interact` action. Interactables have no per-frame hook and do not depend on a visual model. Immediate and promise-based handlers share typed lifecycle events and abort-signal cancellation. See [Interaction API](./interactions.md) for scoring, availability, and integration details.

Asset failures retain the logical ID, asset type, and resolved URL. System initialization failures retain the system ID and dispose systems that were already initialized, making partial startup failures actionable without leaving listeners or render resources attached.

## Development and sandbox APIs

Development builds dynamically load a generic `DebugRegistry`, panel, error reporter, visual-helper registry, and optional sandbox scenario. Production builds take the normal scene path and do not initialize dangerous development commands. Systems contribute debug values, toggles, commands, and visual-helper visibility callbacks through public APIs; the panel never reaches into private system state.

Sandbox scenarios implement the normal `GameSystem` lifecycle and replace the normal scene only when a development URL supplies `?sandbox=<id>`. This keeps isolated mechanic experiments representative of runtime lifecycle behavior without introducing a separate editor or story dependency. See [Developer tooling](developer-tooling.md) for extension examples.

## Future integration

- Player: implement a `GameObject` for presentation and a focused movement/controller system that reads `InputReader`, owns a physics abstraction body, and exposes a read-only position source to debugging/camera code.
- NPCs: use `GameObject` identity and separate presentation, locomotion, and behavior concerns when their complexity warrants it. Publish meaningful state changes through typed events rather than broadcasting every frame.
- Dialogue/cinematics: request validated state transitions and drive camera/UI systems while in `dialogue` or `cinematic`; content and presentation remain separate.
- Missions: keep objective data independent of rendering, consume typed world events, and emit objective changes. Do not reach into NPC or player internals.
- Vehicles: use the same game-owned physics boundary as characters, provide enter/exit commands, and swap the active control target rather than reading keys inside a vehicle object.

## Stable contracts for parallel worktrees

Parallel work may rely on these APIs:

- `GameSystem`, `SystemRegistry`, `UpdateMode`, and `FrameTime`
- `GameRuntime.register/init/pause/resume/dispose` and `GameContext`
- `InputReader` and named actions in `defaultBindings`
- `EventBus` and `StateEvents['game-state:changed']`
- `GameState` and `GameStateMachine.transition/current`
- `GameObject` and `GameObjectWorld.add/get/remove`
- `GameAssetLoader`, `AssetManifest`, and logical asset IDs
- `AssetCatalog`, `AssetLoadStatus`, `ModelInstance`, and `CharacterLoader`
- `CharacterDefinition`, `CharacterSelectionReader`, and `LoadedCharacter`
- `WorldPosition`, `WorldPose`, and `WorldPoseSource`
- `PlayerControllerSystem.getPlayerPosition/getWorldPose`
- `PlayerControllerSystem.teleport/reset/setControlEnabled/getDebugSnapshot`
- `CollisionWorld.moveCharacter/castCamera`
- `StaticColliderDefinition` and `WorldCollisionSystem`
- `DebugRegistry` registration and command APIs (development-only)
- `DebugVisualHelpers.register` and standard helper IDs (development-only)
- `RenderSystem.scene`, `.camera`, and `.renderer` (renderer configuration only; do not start another loop)
- `LevelDefinition`, `LevelRegistry`, `LevelSystem`, and `LevelLocations`

Changes to these contracts should be coordinated and documented. Feature branches should add narrow event maps and constructor-injected dependencies rather than expanding `GameRuntime` into a general manager.
