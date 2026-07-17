# Interaction API

`InteractionSystem` is the single registry, query, selection, and execution owner for nearby interactions. Interactable definitions are plain gameplay data; they do not need a Three.js model or an update method.

## Registering an interactable

```ts
const unregister = interactions.register({
  id: 'garage-door',
  prompt: 'Open',
  location: () => doorWorldLocation,
  rangeProfile: 'inspect',
  requiredStates: ['playing'],
  repeatable: true,
  lineOfSightHeight: 1.2,
  collisionIgnoreIds: ['c.garage-door'],
  isAvailable: ({ gameState }) => gameState === 'playing' && hasPower,
  interact: async ({ signal }) => doorController.open(signal),
});
```

`id`, `prompt`, `location`, and `interact` are required. `location` may be a fixed world location or a function for moving targets. Optional fields are:

- `rangeProfile` (`talk`, `inspect`, `sign`, or `use`; default `use`)
- `range`, an exceptional surface-gap override for geometry that cannot use its profile
- `targetRadius`, an exceptional target-footprint override
- `priority` (default `0`)
- `enabled` (default `true`)
- `requiredStates` (default `['playing']`)
- `repeatable` (default `true`)
- `isAvailable`, a synchronous predicate owned by another gameplay system
- `lineOfSightHeight` (default `1.2`), added to both the player and target locations for the world collision segment
- `collisionIgnoreIds`, collider ids owned by the target itself (for example an NPC occupancy shape or the inspected prop)

Keep the returned unregister function with the target owner and invoke it before removing that owner. `unregister(id)` and `setEnabled(id, value)` are also available. Removing or disabling a running target aborts it safely.

## Player query and selection

Inject a `WorldPoseSource` that returns the current world position, forward direction, and authoritative horizontal capsule radius. This keeps interaction detection independent from the player's entity, camera, physics implementation, and any interactable model.

Range uses horizontal capsule-surface distance, not 3D center distance:

```text
surface distance = max(0, horizontal anchor distance - player radius - target radius)
```

The profile defaults are Talk `1.10` with a `0.38` target footprint, inspect `0.80`, sign `1.05`, and switch/use `0.70`. Thus Talk activates at `1.86` center separation for the current `0.38` player and NPC capsules, while an inspect point activates at `1.18`. Anchor height affects LOS but never silently inflates proximity. Current Mack, Nox, Raze, the garage prop, and reliability targets use profiles without range overrides.

The centralized system evaluates registrations once per simulation frame. It rejects unavailable, out-of-range, behind-the-player (dot product below `-0.25`), and occluded targets. LOS is not a visual hook: `InteractionSystem` calls the public `CollisionWorld.castSegment()` query used by world simulation. The cast returns the nearest blocking collider and supports only explicit target-owned collider ignores. This is the backend contract a future collision worker must preserve.

Candidates score as:

```text
priority * 100 + normalized-closeness * 10 + normalized-facing
```

Higher scores win. Equal scores use the target id as a deterministic tie-break. Only the highest-ranked target is active and emits `interaction:target-changed`, so only one prompt is displayed.

Selection has a `0.75` score hysteresis margin. A valid current target remains selected until a challenger beats it by that margin. Priority changes still dominate because one priority point contributes `100`; small position and facing noise therefore cannot make prompts flicker. An invalid current target (removed, disabled, unavailable, state-incompatible, out of range, behind the player, or occluded) is dropped immediately.

## Execution, cancellation, and events

The existing named `interact` input action (`G` by default) starts the active target. `G` avoids the camera-orbit `Q`/`E` pair and dialogue's `F` reveal action. A handler may return immediately or return a promise. Promise resolution emits completion. The supplied `AbortSignal` is aborted if the player leaves range, loses LOS, the required game state no longer matches, availability becomes false, the target is disabled or removed, or the system is disposed. Late promise settlement after cancellation is ignored. While a handler is running, no target prompt is exposed.

Subscribe through `interactions.events` without importing UI code:

- `interaction:target-changed`
- `interaction:started`
- `interaction:completed`
- `interaction:cancelled`
- `interaction:enabled`
- `interaction:disabled`

The prompt UI is only one subscriber. Dialogue, missions, analytics, audio, and other gameplay systems may subscribe directly to the same typed event bus.

## Diagnostics and reliability scenario

`getDebugSnapshot()` includes every registration, not only accepted candidates. Each target reports measured surface and center distance, allowed range, activation radius, profile/source, player/target radii, facing, score, LOS state, blocker id, and a deterministic rejection reason. The snapshot also reports selected id, challenger id, switch margin, and whether selection held or switched. The development panel exposes the same measurements. The interaction helper draws the exact center activation radius plus a white anchor marker; blocked LOS is red.

Open `/?e2e=1&debug=1&skipPicker=1&interactionScenario=1` to enable the compact reliability fixture. Teleport to `spawn.debug-interactions` to inspect two competing targets and one permanently occluded target. Its debug command makes the challenger decisively better, and its toggle inserts or removes an authoritative collision obstruction in front of the selected target. The fixture and its colliders are development-only and dispose with the runtime.

## Future gameplay integration

- NPC dialogue registers a `Talk` interaction. Its handler requests the dialogue state and resolves when the conversation ends; its availability predicate reads NPC/dialogue conditions.
- Vehicles register `Enter` or `Exit` interactions and delegate to the vehicle-control owner. That owner changes control targets; the interaction system does not implement seats or driving.
- Missions register or enable generic mission-object interactions and consume started/completed events by stable target id. Mission state stays outside the interactable and UI.
- Pickups, doors, switches, and inspectable props use the same contract, placing inventory, animation, or inspection behavior in their injected handlers.

The district runtime injects `PlayerControllerSystem` directly through the shared `getWorldPose()` contract. Level interaction markers provide positions; interaction code never searches the Three.js scene graph.
