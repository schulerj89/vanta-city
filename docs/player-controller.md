# Player controller

## Responsibilities

The on-foot feature keeps four concerns separate:

- `PlayerIntent` translates named `InputReader` actions into normalized movement intent.
- `PlayerMovementSimulation` owns acceleration, velocity, gravity, jumping, collision, grounding, steps, slope limits, and movement-state decisions. It never reads DOM input.
- `CharacterPlayerVisual` mirrors the simulated transform, loads the selected character, and applies decisions from the game-owned animation graph without changing simulation. The graph owns locomotion/airborne/action/reaction priority and restoration; the visual owns mixer playback and primitive fallback.
- `ThirdPersonCameraSystem` owns orbit, pitch/zoom limits, smooth follow, delayed/manual re-centering, and obstruction response. Pointer events remain inside `InputSystem`.

Player and camera input are accepted only in the `playing` game state. Pause uses the foundation's simulation pause. Dialogue and cinematic states continue the lifecycle but feed no player intent and ignore camera input. `setControlEnabled(false)` provides an additional direct lock for feature-owned transitions.

## Controls

| Action                | Default binding                                              |
| --------------------- | ------------------------------------------------------------ |
| Move forward/backward | `W` / `S` or up/down arrows                                  |
| Strafe left/right     | `A` / `D` or left/right arrows                               |
| Walk/run mode         | `R` toggles persistent run mode                              |
| Jump                  | `Space`                                                      |
| Orbit                 | Pointer lock after clicking the canvas, or left-drag         |
| Keyboard orbit        | Hold `Q` / `E` for left / right                              |
| Camera distance       | Mouse wheel                                                  |
| Camera re-center      | `C` (automatic after the configured idle delay while moving) |
| Camera shoulder       | `V`                                                          |
| Interact              | `G`                                                          |
| Punch / kick          | `J` / `L` (each alternates left and right)                   |
| Controls help         | `H` or the top-right Help button                             |
| Pause                 | `P` (`Escape` closes the active modal UI)                    |
| Debug overlay         | Backtick                                                     |

Bindings and display metadata live only in `src/input/defaultBindings.ts`. Prompts, the help overlay, debug snapshots, and tests consume the same named-action data. `G` keeps interaction away from the `Q`/`E` camera pair and dialogue's `F` reveal key; `V` is a mnemonic for view/shoulder and does not overlap movement or modal navigation.

## Tuning

`defaultPlayerMovementConfig` in `src/player/PlayerMovement.ts` is the single movement tuning object. It contains capsule radius/height, walk and run speed, ground/air acceleration, deceleration, gravity, jump speed, terminal velocity, step height, ground snap distance, maximum slope angle, landing duration, animation-state thresholds, and a `0.24s` facing smoothing time.

Facing uses an exact critically damped angular step toward the current horizontal velocity heading after acceleration. This makes the result effectively frame-rate independent for fixed targets and stable across 30/60/120 Hz while naturally following a continuously orbiting camera. The smoothed heading is authoritative for simulation/action direction and `getWorldPose()`; position and collision continue to use unchanged velocity. Conversation framing may temporarily rotate only `visualRoot`, then restores the current smoothed simulation heading. Debug output reports desired/current heading, signed error, angular turn rate, and whether smoothing is active.

`defaultThirdPersonCameraConfig` in `src/camera/ThirdPersonCameraSystem.ts` contains target height, pitch limits, orbit/zoom sensitivity, distance limits, smoothing sharpness, re-center timing, camera collision radius/padding, and teleport snap distance. Both systems accept a complete replacement config through their constructors.

## Public integration APIs

The `PlayerControllerSystem` instance is the stable owner other branches should receive by constructor injection:

- `getPlayerPosition()` returns a copied plain `{ x, y, z }` value.
- `getWorldPose()` returns the shared copied position/forward contract consumed by interactions and future location-based systems.
- `getDebugSnapshot()` returns copied velocity, grounded state, movement state, collision-blocked state, persistent run mode, and heading-smoothing diagnostics.
- `teleport(position, facingYaw?)` clears velocity and re-probes the ground.
- `reset()` returns to the configured spawn and clears movement.
- `setControlEnabled(enabled)` and `isControlEnabled()` provide an explicit feature lock.
- `triggerCharacterAction(action, source)` requests a presentation-only one-shot; `getCharacterActionState()` exposes acceptance, source, active action, and deterministic sequence.
- `movement.state` exposes `idle`, `walking`, `running`, `airborne`, and `landing` for a future animation adapter. Animation code should observe it, not mutate simulation.

The camera exposes `getYaw()`, `obstructed`, `snapToPlayer()`, and its read-only config. `WorldCollisionSystem` consumes the level's shared `StaticColliderDefinition` list and keeps `StaticCollisionWorld` synchronized across reloads; player code depends only on the narrower `CollisionWorld` interface.

## Integration risks

- The collision backend handles the world floor, axis-aligned and yaw-oriented static boxes, and bounded planar pitch ramps. Arbitrary meshes, moving platforms, and non-ramp pitch/roll remain outside the `CollisionWorld` boundary.
- Static collider IDs must be unique and collider registration must occur before the player initializes. Large-world streaming will need ownership-aware add/remove calls later.
- Character animation targets only the loaded model subtree and derives logical state from movement. Bounds alignment establishes the feet-at-contact convention at the alignment root. Scene-root translation tracks are filtered and the authored model offset is restored after mixer updates; deliberate root motion needs a coordinated API that feeds simulation instead of moving visual ancestors.
- Camera obstruction tests the full oriented thickness of the same boxes and ramps used by the level. Extremely tight clearance can force the safety-minimum camera close enough for the avatar to occlude the view; avatar fading or a first-person fallback is not implemented.
- Teleport validates ground height but does not search outward from a point embedded deep inside arbitrary geometry. Callers should provide known spawn markers from the world branch.
