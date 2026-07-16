# Player controller

## Responsibilities

The on-foot feature keeps four concerns separate:

- `PlayerIntent` translates named `InputReader` actions into normalized movement intent.
- `PlayerMovementSimulation` owns acceleration, velocity, gravity, jumping, collision, grounding, steps, slope limits, and movement-state decisions. It never reads DOM input.
- `PlaceholderPlayerVisual` mirrors the simulated transform and can be replaced by a character model without changing simulation.
- `ThirdPersonCameraSystem` owns orbit, pitch/zoom limits, smooth follow, delayed/manual re-centering, and obstruction response. Pointer events remain inside `InputSystem`.

Player and camera input are accepted only in the `playing` game state. Pause uses the foundation's simulation pause. Dialogue and cinematic states continue the lifecycle but feed no player intent and ignore camera input. `setControlEnabled(false)` provides an additional direct lock for feature-owned transitions.

## Controls

| Action                | Default binding                                              |
| --------------------- | ------------------------------------------------------------ |
| Move forward/backward | `W` / `S` or up/down arrows                                  |
| Strafe left/right     | `A` / `D` or left/right arrows                               |
| Sprint                | Left or right `Shift`                                        |
| Jump                  | `Space`                                                      |
| Orbit                 | Pointer lock after clicking the canvas, or left-drag         |
| Camera distance       | Mouse wheel                                                  |
| Camera re-center      | `C` (automatic after the configured idle delay while moving) |
| Pause                 | `Escape` or `P`                                              |
| Debug overlay         | Backtick                                                     |

Bindings live only in `src/input/defaultBindings.ts`.

## Tuning

`defaultPlayerMovementConfig` in `src/player/PlayerMovement.ts` is the single movement tuning object. It contains capsule radius/height, walk and run speed, ground/air acceleration, deceleration, gravity, jump speed, terminal velocity, step height, ground snap distance, maximum slope angle, landing duration, and animation-state thresholds.

`defaultThirdPersonCameraConfig` in `src/camera/ThirdPersonCameraSystem.ts` contains target height, pitch limits, orbit/zoom sensitivity, distance limits, smoothing sharpness, re-center timing, camera collision radius/padding, and teleport snap distance. Both systems accept a complete replacement config through their constructors.

## Public integration APIs

The `PlayerControllerSystem` instance is the stable owner other branches should receive by constructor injection:

- `getPlayerPosition()` returns a copied plain `{ x, y, z }` value.
- `getPlayerTransform()` returns copied position plus `facingYaw`.
- `getDebugSnapshot()` returns copied velocity, grounded state, movement state, and collision-blocked state.
- `teleport(position, facingYaw?)` clears velocity and re-probes the ground.
- `reset()` returns to the configured spawn and clears movement.
- `setControlEnabled(enabled)` and `isControlEnabled()` provide an explicit feature lock.
- `movement.state` exposes `idle`, `walking`, `running`, `airborne`, and `landing` for a future animation adapter. Animation code should observe it, not mutate simulation.

The camera exposes `getYaw()`, `obstructed`, `snapToPlayer()`, and its read-only config. Static world branches register axis-aligned boxes or planar ramps with `StaticCollisionWorld`; player code depends only on the narrower `CollisionWorld` interface.

## Integration risks

- The placeholder collision backend handles a floor, axis-aligned static boxes, and bounded planar ramps. The world branch must register authored collision geometry and may eventually replace this backend behind `CollisionWorld` for arbitrary meshes or moving platforms.
- Static collider IDs must be unique and collider registration must occur before the player initializes. Large-world streaming will need ownership-aware add/remove calls later.
- The character-animation branch should preserve the visual root's feet-at-origin convention and derive animation from movement state/velocity. Root motion must not directly move the visual or simulation and needs a coordinated API if introduced.
- Camera obstruction currently tests boxes and the world floor. Ramp geometry should be approximated by obstruction boxes if camera clipping there becomes visible, or supported by a future physics backend.
- Teleport validates ground height but does not search outward from a point embedded deep inside arbitrary geometry. Callers should provide known spawn markers from the world branch.
