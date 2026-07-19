# WORLD-004 — four-side Ashfall growth and enterable interiors

## Outcome and expansion math

The machine authority is [`plans/world-004-four-side-interiors.json`](plans/world-004-four-side-interiors.json). The prior map is centered at `(7, 0)` with half-extents `43.75m × 35m`. WORLD-004 multiplies both half-extents by exactly `1.25`, producing `54.6875m × 43.75m` and moving every boundary outward:

- X `[-47.6875, 61.6875]`, 109.375m wide;
- Z `[-43.75, 43.75]`, 87.5m deep;
- 9,570.3125m² total rectangular playable area;
- exactly 25% linear growth per axis and 56.25% area growth;
- 12 new catalog building placements, increasing 25 to 37;
- eight new side sectors, increasing 14 to 22.

The minimum and maximum permitted half-extent multipliers are 1.20 and 1.30, so the authored 1.25 target is compliant on west, east, north, and south independently. The runtime authority remains `junctionGrowth.ts` composed once into `testDistrict.ts`; the JSON is a validation and integration record, not a second runtime geometry model.

## Shared geometry, roads, collision, traffic, maps, and streaming

Four 12m straight road continuations and eight paired visual/collision sidewalk slabs fill the new side bands. The inherited East Quay spline remains the curved shared road authority; its east traffic paths continue straight from the sampled curve through the added band. North, south, east, and west traffic endpoints now stop 3m inside the new bounds. The existing central signal phases and lane ownership are unchanged.

The existing continuous player/vehicle boundary IDs move to the exact new edges. The north pedestrian exit is re-authored against the new bounds on a visibly supported sidewalk that extends 0.7m beyond the edge, enough for 0.4m authored clearance plus the 0.3m pedestrian body radius. Every new visual and collider has exactly one of eight new sector owners. Adaptive selection, adjacency, mission protection, hysteresis, retry, LOD, texture cloning, and disposal stay in `LevelSystem` and `AdaptiveSectorStreamingPolicy`.

`LevelDefinition.mapPresentation` now names the exact bounds, ten roads, 37 catalog structures, and two interior footprints. The minimap and full map consume those immutable references without UI-owned transforms. Home, clinic, Nightglass, and Rook's flat use existing marker layers.

## Building and streetscape decisions

The 12 new shells use the existing Ashfall building kit and maintain outer-band frontage without entering the inherited or extended 12m road corridors. Smaller kiosk/arcade forms are used where the 8.75m north/south band meets older frontage, preventing footprint overlap and narrow traps. West/east service forms face inward; north/south forms face their sidewalks. No shell, texture, or name copies a real building, brand, franchise, or protected layout.

The clinic fallback is a raised, ceramic-tiled six-by-four-metre foyer apron at `spawn.player.clinic`. It is deliberately a legible safe exterior/foyer spawn, not a third claimed interior. `spawn.player.home` is inside Rook's flat on its distinct raised floor.

## Interior construction and lighting grammar

`AshfallInteriorKit.ts` constructs both rooms from the same reusable piece grammar: raised textured floor, segmented entrance wall, three enclosing walls, camera-collidable roof, furnishing blocks, fixture block, semantic location, safe spawn where applicable, generic camera anchors, and a bounded light fixture. The rooms are ordinary sector-owned visuals/colliders, so no portal scene, duplicate collision world, or interior renderer exists.

- `location.ashfall.night-venue` / Nightglass Room: 8.5m × 12m, west-facing 3m opening, charcoal terrazzo, service bar, booth, low table, small stage, amber fixture, and two generic anchors. The service occupant honestly alternates the existing verified walk and idle mappings; there is no dance or applause claim.
- `location.ashfall.rook-home` / Rook's Flat: 8.5m × 10m, east-facing 3m opening, worn olive linoleum, bed, kitchen block, table, bookcase, warm fixture, safe home spawn, and two generic anchors. Its occupant performs the same verified modest idle/walk intent.

Both floors rise 0.2m above the surrounding slab, below the shared 0.28m step limit. Roof colliders carry the existing `roof` semantic so collision treats them as head/camera cover rather than ground. The only public visual extension is optional `BoxVisualDefinition.materialName`, allowing code-native fixture boxes to participate in the existing time-of-day emissive binder. The two point lights bring the existing level maximum to four and remain shadow-free.

## Pedestrian and population ownership

`PedestrianSystem` remains the only ambient population, mixer, movement, collision, visibility, and disposal owner. `PedestrianRouteDefinition.purpose` adds a narrow optional `interior` case. Such routes must loop, reference a `pedestrian-interior` collider in their own sector, and otherwise use the same cap, asset, collision, pause, animation, snapshot, and disposal contracts. The cap increases from 16 to 18 for exactly one resident per room.

This is existing-cast occupancy only. `INTERIOR-POP-001` remains the handoff for NPC-002 cast replacement and genuine venue performance. No global character catalog, NPC definition, performance controller, applause mapping, or second actor simulation changes here.

## Texture provenance

`venue-terrazzo.procedural.jpg` and `home-linoleum.procedural.jpg` are deterministic 512px project originals created by the checked-in local generator. They add no runtime requests. Prompt/model/date metadata is inapplicable because GPT Image 2 was deliberately not used. Exact hashes, byte counts, visual review, license, and purpose are recorded beside the assets and enforced by `validate:buildings`.

## Validation and evidence

`pnpm validate:world-004` checks plan/runtime/map agreement, exact dimensions, counts, local texture metadata, unique interior ownership, level validity, and four traffic endpoints. Unit tests cover bounds, paired collision, outer walls, spawns, camera clearance, interior furnishing/shell metrics, occupant routes, lighting, maps, traffic, and previous milestones.

Focused live evidence is written to `docs/screenshots/world-004`: every boundary in daylight; both interiors by day/night; narrow Nightglass; clinic spawn; desktop/narrow full map; local walkthrough and performance videos; console/page/request findings; three repeated home/venue/core streaming cycles; renderer/asset/pedestrian ownership; and frame-pacing captures. The dedicated reference run used a 20-second warmup followed by 60 measured seconds at 1280×720. It recorded 550.86 average FPS, 277.78 one-percent-low FPS, 3ms p95 browser frame time, 2.3ms p95 renderer frame time, 12,446 triangles, 24.5MB peak reported JS heap, and no asset failures or external runtime requests. These numbers are machine-specific acceptance evidence rather than a cross-device performance prediction.

## Known limitations and integration risks

- Nightglass has a small stage but no dance claim. Its one service walker uses only verified walk/idle. NPC-002 and INTERIOR-POP-001 own the expanded cast and genuine performance follow-up.
- The two interior point lights are level lighting fixtures under the existing four-light ceiling; room geometry, textures, collision, furnishings, and occupants are sector-owned. A future per-sector light authority should replace level fixtures only if profiling justifies that shared contract change.
- `testDistrict.ts`, `junctionGrowth.ts`, `TrafficSimulation.ts`, building asset validation, map snapshots, and pedestrian population expectations are integration hot files. Concurrent world, traffic, map, or NPC population branches require semantic review rather than mechanical conflict resolution.
