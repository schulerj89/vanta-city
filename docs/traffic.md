# Ashfall Junction traffic foundation

## Scope and geometry

Traffic is intentionally limited to deterministic civilian vehicles following
four authored lane paths through Ashfall Junction. North/south remain straight;
WORLD-001's east/west approaches follow offsets sampled from the authoritative
East Quay cubic spline. TRAFFIC-002 adds control only to the central crossing;
there is no navigation mesh, route planning, pedestrian logic, vehicle damage,
mission state, or runtime network access.

The authored road cross and curved corridor are 12 m wide with 3 m lanes.
Vehicle paths use right-hand centers offset ±1.5 m from the shared centerline. Catalog models
normalize to 4.4 m long, remain below 2.05 m wide, and use 1.8 m detectors.
Path centers therefore leave at least 0.47 m on either side inside a lane.
Baseline north/south centers spawn at 24.5 m inside the visible boundary at
27.5 m. East/west endpoints are derived by trimming the sampled spline offsets
3 m from the X=42 edge, retaining the same vehicle-body clearance. The static
world query sweeps along each polyline and remains authoritative. Each lane now
binds to an authored signal group, 12 m detector, stop line at the 6.5 m
intersection setback, entry, and exit. Four pale stop bars share those facts.

Four low-poly dark-metal assemblies sit at the curb corners. Each has a pole,
mast arm, and paired near/overhead three-aspect heads. Procedural emissive lenses
make red, yellow, and green readable in day and night without introducing a
second level-rendering or lighting authority. The traffic scene adapter reads
the simulation signal snapshot every sync; visual state cannot independently
advance.

## Behavior and ownership

- The default population is enabled, capped and pre-seeded at eight separated
  resident vehicles, seeded with `0x415348`, and attempts one deterministic
  collision-checked refill every 1.5 simulation seconds. A seeded start lane is
  tried first, then the remaining approaches in fixed order so a blocked rear
  does not waste the refill opportunity. URL
  parameters `traffic=0`, `trafficSeed`, `trafficCadence`, `trafficMax` (capped
  at 12), and `trafficSpeed` support controlled development runs.
- Existing `e2e=1` fixtures keep traffic inactive with a zero-size pool unless
  they explicitly pass `traffic=1`; this prevents unrelated visual and timing
  suites from gaining moving content. Normal gameplay remains enabled.
- Cars accelerate at 2.8 m/s² toward the lane speed and brake at 5.5 m/s².
  They keep 2 m beyond the two half-body extents, progressively brake to queues,
  and never teleport to a stop.
- `TrafficSignalController` is the only phase authority. Its fixed safe order is
  north/south green → yellow → all-red → east/west green → yellow → all-red.
  Defaults are 12 s green, 3 s yellow, and 1.5 s all-red and are constructor
  configurable. Both groups can be red; they can never both be green.
- Red/all-red traffic stops with its front bumper behind the line. A yellow
  decision is latched on first observation: cars inside the physical stopping
  distance commit and clear; cars with room latch stop and do not change their
  mind as the line approaches. A perpendicular occupant is a final
  blocked-intersection guard even during a nominal green.
- The player publishes a live capsule through `CollisionWorld`'s dynamic query
  boundary. Traffic sweeps its detector against that boundary and stops before
  contact. Vehicles never move or shove the player. Player movement remains the
  authoritative character simulation.
- Traffic updates only in `playing`. Pause and character selection are already
  simulation-gated by `GameRuntime`; traffic additionally freezes during
  dialogue and cinematics, then resumes without accumulating wall-clock time.
- `TrafficVehicleCatalog.ts` is the single ordered civilian-vehicle catalog.
  Each entry owns its asset ID, authored forward axis, target length, safe
  width/height, ground clearance, and detector dimensions. Selection cycles
  through that stable order and respects per-type pool quotas, preserving the
  lane seed and bounded population even when types despawn in a different order.
- An eight-instance model pool is loaded once, split deterministically across every
  catalog entry. Spawn/despawn only assigns a hidden instance of the selected
  type. Disposal clears occupancy, unregisters debug entries, removes
  scene/debug nodes, releases every instance, and disposes owned helper geometry
  and materials. There are no browser listeners or independent timers.

## Development controls and evidence

The developer panel provides `traffic.enabled`, spawn-on-each-approach, clear,
and deterministic step commands. World/collision values report population,
lane, progress, speed, and stopping reason. The standard Navigation / movement
helper displays cyan lane paths and orange detection volumes. Browser snapshots
also expose phase, remaining seconds, cycle count, both group indications, and
each vehicle's signal indication, control distance, queue position, yellow
decision, commitment, speed, and control reason.

Normal traffic defaults to enabled because the conservative cap stayed within
the software-rendered browser bounds used by the feature suite: fewer than 150
total draw calls, fewer than 150,000 total rendered triangles, and traffic update
p95 below 5 ms at the eight-model cap. The repository audit finds exactly two
compatible local civilian GLBs—Pickup Truck and Sports Car—and fails if a local
vehicle file or `civilian-traffic` manifest entry lacks a runtime catalog entry.
It also checks integrity, geometry counts, source and normalized safe bounds,
forward/ground presentation data, and detector dimensions. No variants were
created because the two source models are already materially distinct.

The two local assets contribute at most
37,992 model triangles when the alternating eight-slot pool is visible. Gameplay
tests verify every catalog type is pooled, spawned, moved, despawned, and
disposed across two repeated four-approach cycles, plus player stop/resume,
pause/resume, central occupancy, cleanup, and no page/console errors.

The TRAFFIC-002 1280×720 software-WebGL sample held six active residents after
120 runtime samples from the eight-slot pool: traffic update p95 0.30 ms
(0.12 ms average), 135 draw calls, 35,472 triangles, and a 31.2 MB browser heap
proxy. The dedicated 20 s warmup / 60 s performance gate recorded 652.3 average
FPS, 322.6 one-percent-low FPS, 2.8 ms frame-time p95, 42.1 MB peak heap proxy,
83 streamed draw calls, and 16,786 streamed triangles. Three sector cycles
returned to 106 scene objects, 120 owned resources, four sector model instances,
16 source references, and seven instance references every time; console errors,
failed requests, and external requests remained empty.

## Visual review

- [Four controlled approaches](screenshots/traffic-002/traffic-002-overhead-four-approaches.png)
- [Queued red](screenshots/traffic-002/traffic-002-red-queue.png)
- [Yellow decision](screenshots/traffic-002/traffic-002-yellow-decision.png)
- [Green release](screenshots/traffic-002/traffic-002-green-release.png)
- [Night signal readability](screenshots/traffic-002/traffic-002-night-signals.png)
- [Street-level](screenshots/traffic-002/traffic-002-street-level.png)
- [Narrow viewport](screenshots/traffic-002/traffic-002-narrow.png)

The overhead view verifies all four poles, eight heads, stop bars, ±1.5 m lane
centers, curved east/west paths, and eight resident vehicles. Phase captures
verify every indication, red queues, the all-red clearance, and green release.
The street and narrow views check vehicle scale and preserve the existing HUD.

Asset provenance, hashes, sizes, triangle/material/texture counts, and license
links are recorded in
`public/assets/vehicles/quaternius-cars/README.md` and `docs/ATTRIBUTIONS.md`.
