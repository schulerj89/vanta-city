# Interaction API

`InteractionSystem` is the single registry, query, selection, and execution owner for nearby interactions. Interactable definitions are plain gameplay data; they do not need a Three.js model or an update method.

## Registering an interactable

```ts
const unregister = interactions.register({
  id: 'garage-door',
  prompt: 'Open',
  location: () => doorWorldLocation,
  range: 2.5,
  requiredStates: ['playing'],
  repeatable: true,
  isAvailable: ({ gameState }) => gameState === 'playing' && hasPower,
  interact: async ({ signal }) => doorController.open(signal),
});
```

`id`, `prompt`, `location`, and `interact` are required. `location` may be a fixed world location or a function for moving targets. Optional fields are:

- `range` (default `2.5` world units)
- `priority` (default `0`)
- `enabled` (default `true`)
- `requiredStates` (default `['playing']`)
- `repeatable` (default `true`)
- `isAvailable`, a synchronous predicate owned by another gameplay system

Keep the returned unregister function with the target owner and invoke it before removing that owner. `unregister(id)` and `setEnabled(id, value)` are also available. Removing or disabling a running target aborts it safely.

## Player query and selection

Inject a `PlayerInteractionQuery` that returns the player's current world position and forward direction. This keeps interaction detection independent from the player's entity, camera, physics implementation, and any interactable model.

The centralized system evaluates registrations once per simulation frame. It rejects unavailable, out-of-range, behind-the-player (dot product below `-0.25`), and invisible targets. An optional injected `InteractionVisibilityQuery` supplies line-of-sight decisions.

Candidates score as:

```text
priority * 100 + normalized-closeness * 10 + normalized-facing
```

Higher scores win. Equal scores use the target id as a deterministic tie-break. Only the highest-ranked target is active and emits `interaction:target-changed`, so only one prompt is displayed.

## Execution, cancellation, and events

The existing named `interact` input action (`E` by default) starts the active target. A handler may return immediately or return a promise. Promise resolution emits completion. The supplied `AbortSignal` is aborted if the player leaves range, the required game state no longer matches, availability becomes false, the target is disabled or removed, or the system is disposed. Late promise settlement after cancellation is ignored.

Subscribe through `interactions.events` without importing UI code:

- `interaction:target-changed`
- `interaction:started`
- `interaction:completed`
- `interaction:cancelled`
- `interaction:enabled`
- `interaction:disabled`

The prompt UI is only one subscriber. Dialogue, missions, analytics, audio, and other gameplay systems may subscribe directly to the same typed event bus.

## Future gameplay integration

- NPC dialogue registers a `Talk` interaction. Its handler requests the dialogue state and resolves when the conversation ends; its availability predicate reads NPC/dialogue conditions.
- Vehicles register `Enter` or `Exit` interactions and delegate to the vehicle-control owner. That owner changes control targets; the interaction system does not implement seats or driving.
- Missions register or enable generic mission-object interactions and consume started/completed events by stable target id. Mission state stays outside the interactable and UI.
- Pickups, doors, switches, and inspectable props use the same contract, placing inventory, animation, or inspection behavior in their injected handlers.

The test scene uses a fixed demo pose because this foundation checkout has no player query implementation. Replace that adapter in `main.ts` with the player controller's world pose query when the player feature is integrated.
