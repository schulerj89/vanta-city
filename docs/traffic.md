# Ashfall Junction traffic foundation

## Scope and geometry

Traffic is intentionally limited to deterministic civilian vehicles driving
straight through Ashfall Junction. There is no navigation mesh, route planning,
turning, signaling, pedestrian logic, vehicle entry, damage, mission state, or
runtime network access.

The authored road cross is 12 m wide with 3 m lanes and an outer edge at 28 m.
Vehicle paths use the right-hand lane centers at ±1.5 m. Models normalize to
4.4 m long, simulation width is 1.8 m, and path centers therefore leave 0.6 m
on either side inside a lane. Centers spawn at 24.5 m (inside the visible road
boundary at 27.5 m) and despawn at the opposite 24.5 m center. The static world
query remains authoritative along each path.

## Behavior and ownership

- The default population is enabled, capped at six, seeded with `0x415348`, and
  attempts one deterministic spawn every four simulation seconds. URL
  parameters `traffic=0`, `trafficSeed`, `trafficCadence`, `trafficMax` (capped
  at 12), and `trafficSpeed` support controlled development runs.
- Existing `e2e=1` fixtures keep traffic inactive with a zero-size pool unless
  they explicitly pass `traffic=1`; this prevents unrelated visual and timing
  suites from gaining moving content. Normal gameplay remains enabled.
- Cars keep 2 m beyond their 4.4 m body length. A central conflict reservation
  admits only one road axis at a time; opposite lanes on the same axis can pass.
- The player publishes a live capsule through `CollisionWorld`'s dynamic query
  boundary. Traffic sweeps its detector against that boundary and stops before
  contact. Vehicles never move or shove the player. Player movement remains the
  authoritative character simulation.
- Traffic updates only in `playing`. Pause and character selection are already
  simulation-gated by `GameRuntime`; traffic additionally freezes during
  dialogue and cinematics, then resumes without accumulating wall-clock time.
- A six-instance model pool is loaded once. Spawn/despawn only assigns hidden
  instances. Disposal clears occupancy, unregisters debug entries, removes
  scene/debug nodes, releases every instance, and disposes owned helper geometry
  and materials. There are no browser listeners or independent timers.

## Development controls and evidence

The developer panel provides `traffic.enabled`, spawn-on-each-approach, clear,
and deterministic step commands. World/collision values report population,
lane, progress, speed, and stopping reason. The standard Navigation / movement
helper displays cyan lane paths and orange detection volumes.

Normal traffic defaults to enabled because the conservative cap stayed within
the software-rendered browser bounds used by the feature suite: fewer than 150
total draw calls, fewer than 150,000 total rendered triangles, and traffic update
p95 below 5 ms at the six-model cap. The two local assets contribute at most
28,494 model triangles when the alternating six-slot pool is visible. Gameplay
tests also verified two repeated four-approach spawn-to-despawn cycles, player
stop/resume, pause/resume, central occupancy, cleanup, and no page/console errors.

## Visual review

- [Overhead lanes and occupancy](screenshots/traffic-overhead.png)
- [Street-level vehicle and detector](screenshots/traffic-street-level.png)
- [Narrow viewport](screenshots/traffic-narrow.png)

The overhead view verifies the ±1.5 m lane centers and perpendicular conflict
separation. The street view checks vehicle scale and stopping volume relative to
the player. The narrow view verifies that traffic adds no viewport-specific UI
and that existing debug/HUD surfaces remain usable.

Asset provenance, hashes, sizes, triangle/material/texture counts, and license
links are recorded in
`public/assets/vehicles/quaternius-cars/README.md` and `docs/ATTRIBUTIONS.md`.
