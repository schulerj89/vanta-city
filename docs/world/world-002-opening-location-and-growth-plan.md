# WORLD-002 — opening location, Junction growth, and visibility plan

## Decision status and authority

This is an implementation plan, not a runtime or canon change. It is based on
`origin/main` commit `3e148217f1867058eba007f8c46984f0d6c04fc7` and the machine-readable
companion [plan](plans/world-002-opening-location-plan.json).

The stable technical opening-level ID is `ash-001-opening-site`. Its player-facing
name, exact story location ID, participant list, dialogue, props that carry story
meaning, and reason for travel remain **story-owned**. The world team owns the
level boundary, construction envelope, staging clearance, sector ownership,
collision, map measurements, local environmental assets, and readiness facts.
The cinematic team owns shots, camera requests, actor blocking, skip behavior,
and presentation. An implementation must reconcile this plan with the approved
replacement `cinematic.ash-001.opening` brief before creating production content.

## Outcome

1. Build the opening as a separate production `LevelModule`, not a decorative
   sector attached to Ashfall Junction. This makes the arrival visibly and
   spatially different, lets its full scene become ready before the first shot,
   and keeps it out of Junction growth accounting.
2. Use a compact covered transfer shed and platform as the **technical world
   typology**: an enclosed linear arrival space, service yard, loading edge, and
   departure lane instead of another open four-way street. The story director
   may name and motivate it without changing the technical level ID.
3. Grow Ashfall Junction in two independent map milestones. The first increases
   east/west width by 25%; the second increases north/south depth by 25%. Each
   milestone is exactly +25% area, and together the final map is 25% larger in
   both linear dimensions with every outer bound moved outward.
4. Extend the existing Ashfall building catalog and visual lab; do not create an
   opening-only building renderer, asset loader, LOD owner, or placement system.
5. Benchmark visibility only after the new geometry is present. Compare the
   current `26m load / 32m unload / 24m detail` policy with measured farther
   profiles, retaining the farthest profile that passes visual, frame-time,
   memory, and three-cycle ownership gates.

## Audited current truth

| Concern         | Current authority and measured state                                                                                                                                            | Consequence for WORLD-002                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Level lifecycle | `LevelRegistry` validates modules; `LevelSystem` owns one loaded root and its sectors. `load(id)` currently unloads the active level before the replacement finishes.           | Extend this authority with staged readiness/commit or equivalent rollback. Never add a second level manager.                                                          |
| Junction        | Runtime ID `test-district`, display name Ashfall Junction, bounds X `[-28, 42]`, Z `[-28, 28]`, 70m × 56m, 3,920m², 10 placed building shells, and 6 sectors.                   | This 3,920m² state is the next-growth baseline. The 3,136m² value in `worldGrowth.baseline` is historical pre-WORLD-001 data.                                         |
| Measurement     | WORLD-001 uses the rectangular playable-bounds convention, not collision-subtracted floor area.                                                                                 | Continue the same convention so percentages are comparable; also validate continuous walking surfaces separately.                                                     |
| Streaming       | Four quadrants and East Quay load at 26m and unload at 32m; `sector.core` is always loaded.                                                                                     | Profile sector centers and residency with new geometry before selecting farther distances.                                                                            |
| LOD             | `LevelSystem` hides building roof/cornice objects beyond a hard-coded 24m. Building shells and collision remain.                                                                | Move the single policy into authored level/streaming data if tuning needs to vary; do not add building-local distance loops.                                          |
| Buildings       | `AshfallBuildingKit` has 18 variants, 4 wall materials, 4 massing profiles, 7 local 512px textures, one renderer, and one development lab. Ten variants are placed in Junction. | Extend the same catalog, renderer, validator, asset manifest, and lab. Preserve full-footprint collision and map references.                                          |
| Maps            | Minimap and full map resolve immutable `LevelDefinition.mapPresentation` references, even when sectors are inactive.                                                            | Every new road and structure is referenced by stable entry ID; no second set of map coordinates. Opening omits map presentation because it is a cinematic-only level. |
| Roads/traffic   | East Quay rendering, collision, two lane paths, and map path derive from one spline. Other traffic lanes remain Junction-specific module data.                                  | Extend shared road construction data and make traffic level-aware. Never author cinematic traffic on a parallel path.                                                 |
| NPCs            | `NpcSystem` clears and respawns from one global active definition list on level events; every definition currently requires its spawn in every loaded level.                    | Opening production roster/placements must become level-scoped without duplicating NPC identity or character assets.                                                   |
| Cinematics      | `CinematicCoordinator` requires one active level and static anchor IDs, then restores exact prior ownership.                                                                    | Cross-level travel needs an application transaction composed around existing owners. World supplies readiness and landing facts, not camera transforms.               |
| Bootstrap       | Player construction and the initial level ID are hard-coded from `testDistrict`; several interactions and traffic assumptions are Junction-only.                                | Select the registered initial level first, resolve its default spawn through the registry, and qualify Junction-only consumers by active level.                       |

## Ownership rules

- `LevelRegistry` remains the sole level catalog.
- `LevelSystem` remains the sole owner of loaded level roots, generated world
  resources, sector state, and level/sector lifecycle events.
- `ThreeAssetLoader` remains the sole cache/source owner; level sectors own only
  instantiated models and generated resources.
- A single runtime construction module for Ashfall Junction must feed rendered
  roads, spline samples, collision, traffic lanes, map references, and bounds.
  The checked-in JSON in `docs/world/plans` is an acceptance record, not a
  second runtime data source.
- `AshfallBuildingKit` and `AshfallBuildingRenderer` remain building catalog and
  rendering authority. All variants use local logical texture IDs.
- `WorldCollisionSystem` continues consuming level/sector events. Travel code
  must not add colliders directly.
- `ThirdPersonCameraSystem` remains the only camera-transform owner.
- `CinematicCoordinator` remains shot/progression owner; it requests travel but
  does not build a level, teleport the player directly, or retain loaded assets.
- One application-level travel transaction may coordinate existing owners. It
  owns only transaction order and result; it does not become a second world,
  camera, input, HUD, traffic, NPC, or mission authority.

### Expected public contract changes (implementation work, not this branch)

- Add a staged replacement seam to `LevelSystem` that prepares a registered
  definition and its initially desired sectors without publishing them, then
  commits or disposes that prepared ownership exactly once. The concrete API
  may be `prepare`/`commit` or one transactional `replace`; its snapshot must
  expose preparing/ready/committing/failed state without exposing scene roots.
- Add an optional authored detail-LOD distance to
  `LevelStreamingDefinition`, defaulting to the current 24m for old definitions.
  `LevelSystem` remains the only per-frame distance evaluator.
- Move multi-level NPC placement out of the one global `NpcDefinition.spawnId`
  assumption. Prefer a level-owned NPC spawn reference to the stable NPC entity
  ID (for example an `entityId` field on NPC `SpawnPointDefinition`) so one NPC
  identity can have one placement in the opening and another in Junction
  without cloning its definition.
- Inject the active level's derived lane set into `TrafficSimulation` instead
  of importing `ashfallTrafficLanes` as a global. `TrafficSystem` observes
  existing level events, clears old vehicles, and binds either the Junction
  lane data or an empty opening set. Lane points continue to derive from the
  authoritative road construction.
- Select the initial level definition through `LevelRegistry` before player
  construction and resolve the player spawn through `findSpawn`. Remove direct
  bootstrap dependence on `testDistrict.definition`.

These changes are intentionally narrow. They do not add another scene, asset
catalog, collision world, camera, NPC identity registry, traffic renderer, or
loading screen.

## Opening level construction contract

### Technical identity and contrast

- **Level ID:** `ash-001-opening-site` (stable technical ID).
- **Working typology:** covered municipal transfer shed and arrival platform.
- **Story-owned fields:** display name, canonical location ID, participant and
  speaker IDs, story props, date/time copy, journey method, and why Rook is
  there.
- **Contrast with Junction:** a 48m-long, 36m-deep bounded linear composition;
  overhead structure, repeated platform bays, constrained service edge, strong
  foreground layers, and one clear departure direction. It must not reuse the
  Junction intersection, Signal Corner, four-approach silhouette, or existing
  opening anchors as scenery.
- **Playable bounds:** X `[-24, 24]`, Z `[-18, 18]`, 1,728m². This number is
  reported for collision/streaming budgets and explicitly excluded from every
  Ashfall Junction map-growth percentage.

The production build should include one arrival hall shell, one ticket/service
annex, one covered platform, one service wall, a departure-lane surface, a
4m-wide continuous pedestrian route, visible/collidable outer termination, and
locally stored environmental props selected only after provenance review.
Opaque building entrances are presentation details in this milestone; no
interior, door state, or navigation system is implied.

### Stable world entries

The implementation may add detail entries, but these semantic roles and IDs
must remain stable once the story brief is reconciled:

| ID                                    | Kind                  | Contract                                                                                                                        |
| ------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `spawn.player-default`                | player spawn          | Opening arrival pose, constrained within 4m of the level origin; exact transform is authored after participant blocking review. |
| `test-district::spawn.player-default` | destination reference | Existing Junction north/default landing at `[0, 0.02, 19]`, yaw π unless the reviewed story brief deliberately changes it.      |
| `location.ash-001-arrival-platform`   | location              | Story label is resolved separately; gives mission/cinematic definitions an ID-only location reference.                          |
| `trigger.ash-001-departure-ready`     | trigger               | Marks world-space readiness for the final travel beat; it never completes a mission by itself.                                  |
| `camera.ash-001-opening.establishing` | anchor                | Wide platform/shed family; cinematic data owns whether it is used.                                                              |
| `camera.ash-001-opening.two-shot`     | anchor                | Participant-relative two-shot fallback with 4m rear camera clearance.                                                           |
| `camera.ash-001-opening.close-a`      | anchor                | 1.4–2.0m subject distance family with unobstructed shoulder/background separation.                                              |
| `camera.ash-001-opening.close-b`      | anchor                | Reverse close family with matching eyeline and no wall clipping.                                                                |
| `camera.ash-001-opening.departure`    | anchor                | Clear view down the departure lane; no Junction geometry is visible.                                                            |

Camera anchors are data requests only. Final participant-relative framing,
animation timing, and camera collision behavior belong to the cinematic and NPC
performance contracts.

### Staging and collision dimensions

- Preserve a continuous 4m public route from arrival edge to departure trigger.
- Keep every represented entrance at least 1.8m clear, with a 2.4m × 2.4m
  participant standing pad and a 1.2m circulation route behind each close-up
  mark.
- Reserve a 4m-radius two-shot camera pad and two 3m × 2m reverse close-up pads.
  Static collision may border these pads but cannot intrude into their swept
  camera paths.
- Keep platform edge collision visible and at least 0.8m from any participant
  mark. A dangerous edge may read visually; it may not rely on an invisible
  blocker.
- Keep departure-lane vehicle clearance at least 3m from actor marks and 1.5m
  from static props. Staged traffic is frozen/absent during close-up coverage.
- Author world, collision, debug bounds, and screenshot anchors from the same
  placement definitions. No invisible screenshot-only scenery.

### Opening sectors

Use three sectors so ownership and failure paths are exercised without allowing
the compact scene to pop during the cinematic:

| Sector                          | Center X/Z | Initial policy         | Responsibility                                                                |
| ------------------------------- | ---------: | ---------------------- | ----------------------------------------------------------------------------- |
| `sector.opening.infrastructure` |   `[0, 0]` | always loaded; 1m / 2m | Ground, bounds, platform collision, primary shed, required lighting fixtures. |
| `sector.opening.arrival`        | `[-12, 0]` | load 40m / unload 48m  | Arrival hall, close-up background, arrival props.                             |
| `sector.opening.departure`      |  `[12, 0]` | load 40m / unload 48m  | Annex, service edge, departure lane and props.                                |

All three sectors are inside the default spawn radius and must be active before
the opening cinematic can enter. Their generous distances are a compact-level
readiness choice, not the Junction visibility tuning result. Every environment
and collision entry has exactly one sector owner.

Opening lighting may use at most the current four local lamp fixtures. New
lighting primitives, animated crowds, navigation, functional train/ferry
simulation, or dynamic interiors are not implied.

## World-travel and landing contract

### Required transaction

The opening starts only after `ash-001-opening-site`, its required sectors,
production participants, required animations, and required local assets report
ready. The last beat requests one travel transaction to:

```text
levelId: test-district
spawnId: spawn.player-default
reason: cinematic.ash-001.opening
landingEventId: cinematic.ash-001.opening.junction-ready
```

Before revealing Ashfall Junction, the transaction must prove:

1. the destination definition validates and all initially desired sectors are
   built;
2. the destination world root and sector colliders commit together through
   `LevelSystem`/`WorldCollisionSystem` events;
3. the player is teleported to and grounded at the destination spawn through
   `PlayerControllerSystem`;
4. destination NPC placements have settled or a required-participant failure
   has been reported;
5. Junction traffic lanes are bound and opening traffic/props have no runtime
   owner left;
6. level location, minimap/full-map source, lighting, mission location queries,
   and camera obstruction all resolve against `test-district`;
7. the gameplay camera can resume from the authored landing pose, and all
   loading progress reflects real readiness rather than a fixed timer.

The present `LevelSystem.load()` removes the current level before the new one is
ready. Implementation should add a staged prepare/commit seam (or equivalent
rollback inside `LevelSystem`) so a destination load failure cannot expose an
empty scene or leave mixed collisions. A prepared level must not emit active
sector collision events until commit and must dispose every staged resource on
cancel/failure.

### Normal, skip, failure, and restoration

- Normal completion, confirmed skip, and a cinematic participant/animation/
  shot failure all call the same destination transaction and land at the same
  spawn, yaw, mission fact boundary, and camera handoff.
- Cancelling the skip prompt resumes the exact opening shot without travel.
- A destination-world asset failure cannot honestly “land.” It keeps the real
  loading error/retry surface visible and commits neither level. Retrying the
  same transaction is the only success path.
- The journey may intentionally replace level and player transform. Everything
  else—mission state, money/equipment, accessibility preferences, HUD policy,
  focus, pointer intent, controls, input edges, audio preference, and non-travel
  camera ownership—restores through its existing authority.
- Completion or skip emits the landing event once. Repeated playback cannot
  duplicate story facts, rewards, actors, traffic slots, listeners, roots,
  sectors, asset instances, or map DOM.

## Ashfall Junction growth milestones

### Why two milestones

A literal 25% addition to each dimension in one area-growth milestone would be
56.25% area growth, outside the repository's 20–30% milestone gate. Two exact
+25%-area milestones satisfy both rules without misreporting the measurement:
first widen east/west, then deepen north/south.

| State                      | Bounds X          | Bounds Z    | Width × depth |    Area | Growth from prior | Buildings | Sectors |
| -------------------------- | ----------------- | ----------- | ------------: | ------: | ----------------: | --------: | ------: |
| Current WORLD-001          | `[-28, 42]`       | `[-28, 28]` |     70m × 56m | 3,920m² |                 — |        10 |       6 |
| WORLD-002A east/west rim   | `[-36.75, 50.75]` | `[-28, 28]` |   87.5m × 56m | 4,900m² |              +25% |        16 |      10 |
| WORLD-002B north/south rim | `[-36.75, 50.75]` | `[-35, 35]` |   87.5m × 70m | 6,125m² |              +25% |        22 |      14 |

Final result relative to WORLD-001: width +25%, depth +25%, gross area +56.25%,
west/east bounds move 8.75m outward, and north/south bounds move 7m outward.
The map center stays `[7, 0]`, so existing world orientation and central
intersection facts do not drift.

### WORLD-002A — east/west rim

- Extend the west straight approach to X=-36.75 and the East Quay corridor to
  X=50.75. The exact centerline construction owns surface rendering, sampled
  collision, incoming/outgoing lane paths, endpoints, barriers, and minimap/
  full-map geometry.
- Retain a 12m road width, 3m traffic lanes, a 3m endpoint body inset, and at
  least 4m continuous pedestrian clearance between road edge and facade.
- Replace west/east termination barriers at the new bounds. Remove the old
  barriers in the same definition edit; no internal invisible boundary remains.
- Add exactly six building placements, three addressing the west rim and three
  addressing the east rim, for 16 total. Existing stable `c.ruin-*` IDs stay;
  any transform change receives collision/camera regression coverage.
- Add four sectors: `sector.west-rim-north`, `sector.west-rim-south`,
  `sector.east-rim-north`, and `sector.east-rim-south`. Existing East Quay
  connector entries may be reassigned only through the validated one-owner
  sector list.
- Extend traffic paths without increasing the six-vehicle population cap until
  the measured benchmark justifies it. Spawn/despawn points remain inside the
  visible/collidable road termination.

### WORLD-002B — north/south rim

- Extend the north/south road and both lane paths to Z=±35 using the same
  construction authority. Move north/south barriers to the final bounds.
- Add exactly six building placements, three north and three south, for 22
  total. Facades remain at the outside of sidewalks and preserve authored
  entrances, corner camera recovery, named spawns, and traffic sight lines.
- Add four sectors: `sector.north-rim-west`, `sector.north-rim-east`,
  `sector.south-rim-west`, and `sector.south-rim-east`.
- Expand `zone.ashfall-junction` around the unchanged center to
  `[87.5, 10, 70]`. Add/relocate perimeter landmarks only through story-approved
  names; existing landmark IDs and priorities remain stable.
- Update map bounds and complete geometry references. Sector residency never
  changes the full-map representation.

### Placement gates for both milestones

- Every building collider matches its rotated full footprint and carries
  `obstacle`, `camera`, and `building` tags.
- Every street-facing entrance has 1.8m clear in front; every sidewalk has a
  continuous 4m band; every traffic lane has at least 1.5m vehicle half-width
  clearance plus the existing static sweep requirement.
- Building footprints do not overlap each other, protected spawns, mission/
  interaction points, cinematic pads, traffic paths, or boundary collision.
- The player can traverse each road/sidewalk connection, ground at every named
  spawn, and recover the camera at each outer corner.
- Curves, if added, derive visual strip, collision boxes, traffic lanes, and map
  samples from one spline. Visual-only road bends fail acceptance.

## Building-catalog expansion

### Catalog slice

Add eight production variants to the existing 18, for 26 total. Names are
technical catalog uses, not new canon locations.

| Variant ID        |     W × D × H | Intended frontage/profile | Primary use                              |
| ----------------- | ------------: | ------------------------- | ---------------------------------------- |
| `arrival-shed`    |  22 × 12 × 9m | transit / sawtooth        | Opening platform enclosure               |
| `ticket-arcade`   |   14 × 8 × 7m | institutional / stepped   | Opening service frontage                 |
| `garage-six-bay`  |  20 × 10 × 8m | service-bays / flat       | Wider perimeter repair use               |
| `print-house`     |  16 × 9 × 10m | shopfront / stepped       | Narrow commercial-industrial street      |
| `boarding-court`  | 12 × 16 × 15m | residential / setback     | Deep north/south lot                     |
| `corner-chemist`  |   9 × 11 × 9m | corner-shop / stepped     | Small corner infill without a real brand |
| `cold-store`      | 20 × 14 × 12m | service-bays / setback    | Large outer industrial silhouette        |
| `municipal-annex` | 16 × 12 × 16m | institutional / tower     | Civic-industrial perimeter landmark      |

Extend the existing catalog rather than special-casing these shapes in level
code. If the renderer needs `sawtooth` or frontage metadata, add it to
`AshfallBuildingVariant` and render it through `AshfallBuildingRenderer`.
Frontage details are shallow visual geometry, share catalog materials, and do
not create interior/collision ownership. Local +Z is the documented frontage;
placement rotation turns it toward the authored sidewalk.

### Texture and resource policy

- Reuse the current seven textures where they fit. Add no more than four 512px
  albedo textures in this slice: `ribbed-zinc`, `ceramic-tile`, `glass-block`,
  and `painted-shopfront` are proposed families, subject to art review.
- Keep aggregate building texture bytes at or below 1.1MB (current set about
  640KB; incremental budget 460KB). Profile decoding/GPU counts as well as file
  bytes.
- Assets must be local at runtime and licensed CC0-1.0, public domain, or
  original-project-owned. Record source/prompt, creator, license, retrieval or
  generation date, model/provider metadata when applicable, SHA-256, source and
  runtime resolution, crop/seam work, intended material, and review result.
- Runtime code references logical texture IDs only. No CDN, data URL, provider
  call, secret, or asset URL belongs in a building variant.
- Keep one material promise per texture/family per sector renderer. No
  per-building texture clone or material allocation.
- `shell` mass remains visible while its sector is resident. Mark silhouette
  and street-detail pieces through the one `LevelSystem` LOD policy; do not
  attach per-building update listeners.
- Dispose generated geometry/materials with the sector. Loader-cached texture
  sources remain loader-owned and must show stable references after priming.

### Building visual lab contract

Extend `building-visual-lab`; do not add a second lab. It must expose:

- all 26 variants and every wall/roof/ground texture family;
- exact footprint, height, local frontage direction, profile, UV repeat,
  material IDs, world bounds, and collision footprint;
- deterministic `overview`, `close`, `street`, `overhead`, and `materials`
  views plus narrow 390×844 behavior;
- one focused-variant control and a public snapshot that can iterate through all
  variants without private scene access;
- `near-detail`, `far-detail`, and `shell-only` LOD states using the same tagged
  pieces as gameplay;
- independent visible toggles for bounds and collision, with no effect on
  production runtime globals;
- clean disposal when the sandbox unloads.

The lab’s table must derive counts and copy from the catalog. Hard-coded
“18 variants / 7 textures” strings and test assertions are updated from live
catalog values. A baseline update is accepted only with the catalog expansion
reason recorded in the visual review.

## Measured visibility and streaming benchmark

### Candidate profiles

Run the same final WORLD-002B geometry and deterministic camera route under all
profiles; do not compare different maps.

| Profile    | Load | Unload | Street-detail LOD | Hysteresis | Purpose                                                             |
| ---------- | ---: | -----: | ----------------: | ---------: | ------------------------------------------------------------------- |
| `baseline` |  26m |    32m |               24m |         6m | Current behavior on the larger world.                               |
| `far-1`    |  30m |    38m |               28m |         8m | Conservative improvement.                                           |
| `far-2`    |  32m |    40m |               30m |         8m | Target candidate: roughly one additional street frontage.           |
| `far-3`    |  36m |    46m |               34m |        10m | Upper bound; accept only if counters and visual benefit justify it. |

These are candidates, not a preselected shipping value. Sector shells remain
frustum culled by Three.js. The benchmark records which sectors are resident,
which detail pieces are hidden, and which far buildings are actually visible
from each shot; “more loaded” without a visible improvement is not a win.

### Route and evidence

1. Prime asset and renderer caches with one complete north/south/east/west
   traversal.
2. Capture at default spawn, Junction center, each final cardinal road endpoint,
   East Quay curve, and all four final outer corners, facing both inward and
   outward where useful.
3. Repeat a deterministic south → north → west → east → north baseline cycle
   three times. At the same final pose, scene objects, sector-owned resources,
   model instances, collider count, loader source references, and live asset
   instances equal the primed baseline with no monotonic renderer growth.
4. Run the hardware performance lane at 1280×720 after 20s warmup and 60s
   measurement for the baseline and each candidate. Keep video/trace disabled.
5. Capture desktop 1280×720 and narrow 390×844 screenshots for day, night, a
   long outward street view, a curve view, and a sector-boundary crossing. Use
   the existing performance bridge and authored camera/spawn commands.
6. Inspect console errors, page errors, runtime error reports, failed local
   requests, unexpected external requests, map/HUD overflow, collision gaps,
   and visible sector/detail pops.

### Selection gate

Choose the farthest profile that satisfies all of the following; if none does,
keep baseline and optimize geometry/sectoring before increasing distance:

- sustained/average FPS ≥50 and one-percent-low proxy ≥45;
- RAF frame-time p95 ≤20ms and no repeated long-frame cluster at a sector
  boundary;
- preferred peak working set ≤650MB and hard peak ≤900MB, with JS heap clearly
  labelled as a proxy when full process memory is unavailable;
- street gameplay ≤120 draw calls and ≤30,000 visible triangles at the worst
  audited pose, or a reviewed exception backed by the frame/memory capture;
- initial readiness and every transition finish with zero pending sectors and
  no failed required sector;
- all three cycles return to identical ownership counters at the same pose;
- the farther profile visibly removes objectionable near-field building/prop
  pop in at least two recorded approaches without keeping unseen sectors active;
- local assets only, no browser errors, no failed runtime requests, and no map,
  collision, traffic, or camera-regression finding.

Only then update authored load/unload/LOD values and the performance record.

## Implementation dependency order and ownership slices

1. **Approve story and performance intent.** Reconcile the story director’s
   final location name, scene purpose, participants, story props, and travel
   meaning with the technical ID and staging envelope. Reconcile the NPC audit’s
   verified animation/close-up constraints. No runtime worker guesses these.
2. **Close cross-level public gaps.** Keep `LevelSystem` authoritative while
   adding staged destination readiness/commit; select initial level/spawn from
   `LevelRegistry`; make NPC placement and traffic routes level-aware; qualify
   Junction-only interactions. Add focused rollback/disposal tests.
3. **Build `ash-001-opening-site`.** Author production geometry, collision,
   sectors, semantic IDs, staging pads, lighting, and local props. Validate it
   independently before cinematic shots are attached.
4. **Expand the building kit/assets/lab.** Add reviewed local textures,
   catalog variants, frontage/LOD metadata if needed, validators, all-variant
   lab controls, and visual evidence. Then replace any temporary structural
   choice in the opening with the accepted variants before approval; no
   placeholder ships.
5. **Implement WORLD-002A, then WORLD-002B.** Each receives its own plan-derived
   unit/map/collision/traffic evidence and exact +25% area record. Do not combine
   both percentages into one roadmap milestone.
6. **Tune visibility.** Run the candidate benchmark on final geometry and
   commit only the measured selected policy plus capture artifacts.
7. **Integrate the cinematic.** Consume the approved story, world readiness,
   building, NPC performance, camera, subtitle, skip, and landing contracts.
   Normal/skip/cinematic-failure use the same destination transaction.

The work can be split by these ownership boundaries, but map-growth workers
must be sequential because WORLD-002B depends on WORLD-002A bounds and
construction data. Streaming tuning depends on both geometry milestones.

## Acceptance and validation matrix

### Unit and data validation

- `validateLevelDefinition` accepts both levels and rejects duplicate/missing
  sector ownership, invalid bounds, references, distances, anchors, and spawns.
- Growth-plan tests recompute 3,920 → 4,900 → 6,125m², exactly 25% each, and
  final +25% width/depth.
- Road tests prove visual strip, collision, traffic lanes, barriers, and map
  samples derive from the same authored construction.
- Collision tests cover continuous ground, 4m sidewalks, 1.8m entrances,
  traffic clearance, camera pads, outer barriers, named spawns, and no building
  overlap.
- Building tests cover 26 unique variants, local licensed assets, catalog-driven
  counts, frontage orientation, UV policy, shared material loads, LOD tags,
  bounds/collision equivalence, and deterministic disposal.
- Level travel tests cover prepare, commit, cancel, destination load failure,
  retry, exact event order, player grounding, stale async rejection, and no old/
  new collision mixture.
- NPC/traffic level-change tests prove missing nonresident placements do not
  fail a level and no Junction traffic remains in the opening.

### Browser and gameplay validation

- Opening ready → cinematic start; normal journey → exact Junction landing.
- Skip request/cancel resumes exact shot; skip request/confirm → same landing.
- Participant or animation failure → same landing without story reward/objective
  duplication; destination asset fault → real retry UI with neither level
  partially committed.
- Three repeated opening/Junction journeys leave one level root, one participant
  set, one traffic pool, one presentation root, no extra listeners, and stable
  asset/sector counters.
- Full map and minimap show complete final Junction geometry after travel;
  opening never shows a fake or stale Junction map.
- Building lab iterates every variant through close/street/overhead/LOD states,
  including 390×844, with console and failed-request inspection.
- Targeted suites: level/world collision, map/minimap, traffic, NPC, cinematic,
  building lab, sector streaming, loading failure, smoke, then bounded
  integration after systems combine.

### Visual evidence

- Opening: establishing, two-shot, both close-up families, departure, platform
  edge/camera-clearance debug view, and Junction landing at 1280×720; one
  representative close-up and skip/loading state at 390×844. Final shot choices
  come from the cinematic brief.
- Buildings: overview, focused close, street, overhead, materials, shell-only,
  far-detail, bounds/collision, and narrow lab captures.
- WORLD-002A/B: day/night street, overhead bounds, each new rim, curve/road
  join, all four final boundaries, minimap, and full map.
- Streaming: baseline and selected candidate from identical long-view poses plus
  sector-boundary before/after frames.
- Every visual review records viewport, state, time/light, camera/anchor ID,
  selected visibility profile, console/page errors, failed/external requests,
  and the reason for any changed baseline.

### Build and performance commands

Run focused checks while implementing, then the proportional integration gate:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm validate:buildings
pnpm validate:intersection
pnpm validate:traffic
pnpm build:bundle
pnpm size
pnpm exec playwright test e2e/building-visual-lab.spec.ts
pnpm exec playwright test e2e/cinematic-sequence.spec.ts
pnpm exec playwright test e2e/full-world-map.spec.ts e2e/minimap-hud.spec.ts
pnpm exec playwright test e2e/sector-streaming-performance.spec.ts
pnpm test:e2e:smoke
pnpm test:e2e:integration
VANTA_PERF=1 pnpm exec playwright test e2e/sector-streaming-performance.spec.ts
```

The final visual/performance milestone also runs the relevant release visual
lane and manual browser/console review. Screenshot-heavy and 60-second
performance runs are not substitutes for unit or build checks.

## Known limitations and integration risks

- Story approval can change display name, participants, meaningful props, and
  blocking, but should not change the stable technical level ID without an
  explicit migration.
- Current static anchors cannot express all participant-relative close-up
  behavior; cinematic/NPC workers must resolve this without making the world
  own actor transforms or camera motion.
- Current building shells have no interiors, functional doors, or independent
  mesh LOD. This plan adds readable exterior frontage only.
- Current traffic is not level-aware and current NPC definitions require a spawn
  in every level. Both block a safe separate opening level.
- Current `LevelSystem.load()` is not atomic and bootstrap uses a hard-coded
  Junction spawn. Both block production travel and failure recovery.
- The existing building validator’s 15–20 variant cap and 700KB texture cap must
  be deliberately revised with the approved 26-variant/1.1MB budgets; silently
  weakening validation is not acceptable.
- Full process working-set measurement may not be available from browser JS.
  Keep the JS heap proxy labelled and collect external process memory when the
  harness supports it.
- A 25% final width/depth increase is intentionally delivered as two 25%-area
  milestones. Treating it as one milestone would violate the repository growth
  gate; treating “25% per side” as appending 25% of width at both sides would
  produce a 50% linear increase and is not this plan.
