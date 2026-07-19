# PERF-002 — Adaptive sector streaming

## Outcome

`LevelSystem` remains the only owner of sector scene objects, collision events,
model instances, failure state, and disposal. It now asks one pure
`AdaptiveSectorStreamingPolicy` for the desired sector set instead of applying
fixed center-distance filters itself. The policy gives nearby and mission-target
coverage priority over memory-driven trimming, so a soft or hard budget can
remove far prefetch but cannot create a hole around the player.

No map definitions, sector entry ownership, frustum culling, or distance LOD
rules changed. Runtime assets remain local.

## Selection order

Every evaluation produces one deterministic reason for every authored sector.
Reasons are ordered as follows:

1. always-loaded infrastructure;
2. current and hard-near player sectors;
3. critical neighbors of the current sector;
4. mission-near sectors and their critical neighbors;
5. authored load proximity;
6. movement-direction and proximity prefetch;
7. active-sector hysteresis;
8. soft, high, or hard memory trim; or ordinary outside-retention eviction.

Protected reasons (1–4) cannot be removed by memory pressure. This is the hard
anti-hole invariant. A teleport always selects the nearest streamable sector and
its landing safety ring, even when every authored center is outside its normal
load radius, and discards stale direction projection. Active sectors retain an
additional band outside their authored unload distance to prevent boundary
thrash until the hard memory ceiling is crossed.

## Tunable defaults

| Setting                          |                     Default | Purpose                                                         |
| -------------------------------- | --------------------------: | --------------------------------------------------------------- |
| Hard near radius                 |                        28 m | Non-negotiable player safety ring                               |
| Critical adjacency               |                        20 m | Protect genuinely contiguous current-sector centers             |
| Mission near radius              |                        30 m | Make destination surroundings resident before arrival           |
| Mission adjacency                |                        34 m | Protect destination-neighbor continuity                         |
| Low / medium prefetch            |                   46 / 36 m | Longer visibility when memory permits                           |
| Movement projection              |                        18 m | Look ahead in actual travel direction                           |
| Movement prefetch radius         |                        32 m | Select geometry around the projected point                      |
| Teleport threshold               |                        48 m | Reset stale movement direction                                  |
| Hysteresis                       |                         8 m | Prevent rapid load/unload at boundaries                         |
| Sector load concurrency          |                           2 | Bound asset and scene construction spikes                       |
| Retry cadence / limit            | 30 evaluations / 3 attempts | Avoid per-frame failure storms while recovering transient loads |
| Preferred / hard memory ceilings |                650 / 900 MB | Guardrails, never utilization targets                           |

Level preparation loads safety and authored-proximity coverage first; soft
prefetch continues through the normal update lifecycle after commit. Loads run
in deterministic definition-order batches. A failed desired sector preserves
its error and protected active coverage while unrelated no-longer-desired
sectors still unload, retries on the bounded cadence, and resets its failure
state after leaving the desired set. Disposal still releases model instances
first, then level-owned geometry/materials.

## Memory decision

The policy always consumes public renderer and asset diagnostics. When
`performance.memory` is available, used JS heap is added; when it is absent, a
96 MB deterministic base proxy is used. The proxy weights are calibrated for
the shipped low-poly/local-asset workload:

- geometry: 0.25 MB;
- renderer texture: 1.5 MB;
- cached asset source: 2 MB;
- live model instance: 1 MB;
- in-flight source: 4 MB.

These weights are conservative decision inputs, not claims of byte-accurate GPU
allocation. Medium pressure begins at 75% of the 650 MB preferred ceiling and
reduces the prefetch radius. High pressure at 650 MB disables soft prefetch.
Crossing 900 MB evicts unprotected hysteresis retention, but still cannot evict
always-loaded, player, or mission safety coverage.

The retained performance capture reports a 318.3 MB streamed estimate and a
23.1 MB peak JS heap sample, safely below both ceilings. See
`docs/screenshots/perf-002/performance-capture.json`.

## Public diagnostics

`LevelSystem.getStreamingSnapshot()` now includes:

- pressure, estimate source, estimated bytes/MB, and 650/900 MB ceilings;
- the desired sector ID set and teleport classification;
- a disposition, reason, distances, and protection flag for every sector;
- load-attempt counts alongside existing lifecycle states and ownership counts.

Development diagnostics display pressure/budget and desired/retained/evicted
reason summaries. The browser snapshot and timed performance capture expose the
same authoritative contract.

## Evidence

- Deterministic policy and lifecycle tests cover low/medium/high/hard pressure,
  current/near/adjacent selection, mission protection, hysteresis, direction,
  distant teleport landing, failure cooldown/retry, stale eviction during an
  exhausted failure, and two-sector load concurrency.
- Junction browser traversal covers ten internal/core/rim seam positions. At
  each position all protected sectors are active, transitions are settled,
  collision ownership matches the active definition, and the player is
  grounded.
- Three north/south load/unload cycles retain exactly 268 sector scene objects,
  290 owned resources, eight sector model instances, 20 cached sources, and 27
  total live model instances; renderer geometry/texture counters plateau at
  150/150 in the final two cycles. See
  `docs/screenshots/perf-002/three-cycle-leak-evidence.json`.
- Timed streamed capture: 267.6 FPS average, 89.3 FPS 1% low, 9.9 ms p95,
  13.4 ms maximum, 318.3 MB estimated working set, and 23.1 MB peak JS heap.
- Visual evidence:
  `ashfall-streaming-desktop.png`, `ashfall-streaming-narrow.png`, and the three
  retained `junction-seam-*.png` captures in `docs/screenshots/perf-002/`.

## Limitations

- WebGL does not expose portable exact GPU allocation. The renderer/asset proxy
  is deterministic and tunable, but should be recalibrated when texture
  resolution or model complexity changes materially.
- Mission prefetch resolves authored spawn, location, interaction, trigger, and
  landmark targets. Dynamic entity targets without an authored spawn do not
  currently provide a streaming interest position.
- A sector that exhausts all three load attempts remains failed until it leaves
  the desired set; protected active safety coverage is retained, unrelated
  stale sectors unload, and the error remains visible rather than retrying
  forever.
- The East Quay road opening visible near `(40, 14)` is also present with the
  synthetic full-level sector loaded. It is authored topology, not a streaming
  omission; reauthoring it is outside PERF-002's protected map scope.
