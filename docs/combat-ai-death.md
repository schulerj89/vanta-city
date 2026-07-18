# Debug combat opponent and player death

## Scope and activation

This slice is development-only and reuses the existing sparring target fixture. It does not create production NPC AI, weapon queries, missions, or navigation. Activate the target with the `sparring-target.active` debug toggle and its fight-back policy with `sparring-target.hostile`. Browser fixtures may opt in with `sparringFixture=1&hostileOpponent=1`.

## Decisions and contracts

- `CombatOpponentDecision` is a pure deterministic state machine: `idle → engage → approach → attack → recover`, with `dead` terminal until reset. It consumes distance, facing, health, game availability, and path-clear facts; it owns no transforms, collision, animation, or health.
- `SparringTargetSystem` remains the fixture lifecycle owner. It applies decision output through its existing entity, model loader, health, collision, player-pose, camera-focus, and game-state hooks. Approach movement stops at an authored separation and stops when the shared static segment query reports an obstacle.
- Opponent attacks mutate only `player.health`. Damage occurs once at the authored attack windup and never while paused, in dialogue, out of range, when either participant is depleted, or when the fixture/toggle is inactive.
- NPC hit and death presentation use logical clips when available. Missing clips keep deterministic timing and expose a `fallback` animation label without blocking health changes. Fixture reset revives and returns the NPC to its authored spawn policy; deactivation disposes it completely.
- `PlayerDeathSystem` observes the existing player `HealthComponent`. Depletion disables player control, requests existing cinematic camera ownership at the current pose, and shows an accessible modal. It never moves the player simulation transform. `CharacterPlayerVisual` continues to own native death-clip selection and its existing material-fade fallback.
- Revive calls the authoritative player reset, resets the debug opponent, releases death camera ownership, snaps the gameplay camera to the restored player, restores the prior control-enabled value, and hides the modal. The debug command is `player.revive`; the overlay button is “Revive & restart.”
- The overlay uses original Vanta City wording and layout. Motion is CSS-only and disabled by `prefers-reduced-motion`; semantic dialog labeling and a focused native button provide keyboard and assistive-technology access.

## Browser observability

The existing test bridge adds `playerDeath` and `sparringTarget.opponent` snapshots. They expose presentation/lifecycle sequences and state without adding listeners or simulation authority. Owned screenshots live in `docs/screenshots/combat-death/`.

## Known limitations and integration risks

- Obstacle handling is intentionally stop-only. There is no pathfinding, detouring, crowd steering, navigation mesh, or production NPC scheduling.
- The debug opponent has one close-range attack and deterministic fixed tuning. It consumes no weapon hit volumes or shooting systems.
- Static fixture collision is re-authored as the opponent moves. A future production mover should use a dedicated dynamic body, but adding one here would duplicate collision ownership beyond this debug slice.
- The opponent shares the sparring target asset and authored test-district spawn, so it is unavailable in other levels by design.
- Player revive resets to the authoritative player spawn rather than the place of depletion. This is deliberate and deterministic for debug recovery.
