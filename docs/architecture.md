# Architecture

## Direction

Vanta City uses TypeScript, Vite, and Three.js without a UI framework. The current UI is small and DOM-native; adding a framework now would add runtime and ownership complexity without solving a foundation requirement. Modules are organized by responsibility rather than by speculative feature layers.

No physics library is installed yet. A floor and primitive verification scene do not require one, and character/vehicle requirements should drive that choice. Future collision code must sit behind a game-owned `PhysicsWorld`/`PhysicsBody` contract and exchange plain game data at its boundary. Player, vehicle, mission, or NPC code must not import a physics package directly.

## Runtime lifecycle

`GameRuntime` owns the animation frame, `GameClock`, `GameStateMachine`, event bus, and ordered `SystemRegistry`. `init()` initializes registered systems in registration order, transitions `booting` to `playing`, and starts the frame loop. `dispose()` stops the loop, disposes systems in reverse registration order, then clears events.

Every frame, the clock converts milliseconds to seconds and caps delta at 0.1 seconds. Its baseline resets after resume, preventing a backgrounded or paused tab from creating a large simulation step. The registry runs all `update` hooks, then all `lateUpdate` hooks. Systems default to simulation updates; systems declaring `updateMode = 'always'` continue while paused. Rendering, input edge cleanup, and the debug overlay use this mode.

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

`GameAssetLoader` exposes logical-ID texture and glTF loads. `ThreeAssetLoader` resolves those IDs through one injected manifest, deduplicates concurrent loads, and evicts failed requests. Gameplay code supplies asset IDs; it must not scatter URLs through feature code. Asset definitions can later be split into authored manifests without changing consumers.

`RenderSystem` exclusively owns the Three.js renderer, scene, camera, canvas, resize observer, and render call. It caps device pixel ratio at two. Future third-person camera logic should update the injected camera from its own simulation system; it should not create another renderer or animation loop.

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
- `DebugDataSource.getPlayerPosition`
- `RenderSystem.scene`, `.camera`, and `.renderer` (renderer configuration only; do not start another loop)

Changes to these contracts should be coordinated and documented. Feature branches should add narrow event maps and constructor-injected dependencies rather than expanding `GameRuntime` into a general manager.
