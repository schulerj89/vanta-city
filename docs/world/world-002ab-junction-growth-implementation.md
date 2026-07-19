# WORLD-002A/B — Ashfall Junction growth implementation

## Outcome and measurements

The runtime Junction authority was verified at 70m × 56m, 3,920m², 10
building placements, and 6 sectors before editing. WORLD-002A expands only X
to 87.5m × 56m = 4,900m² (+25%), with 16 buildings and 10 sectors.
WORLD-002B then expands only Z to 87.5m × 70m = 6,125m² (+25%), with 22
buildings and 14 sectors. The final width and depth are each exactly 25% larger
than the verified baseline, and every bound moves outward.

The machine-readable evidence is
[`plans/world-002ab-junction-growth.json`](plans/world-002ab-junction-growth.json).
The implementation authority is `src/world/levels/junctionGrowth.ts`; the JSON
is acceptance evidence, not a second runtime definition.

## Architecture decisions

- The existing `LevelSystem`, `WorldCollisionSystem`, map presentation, spline
  road utilities, traffic lane set, and `AshfallBuildingKit` remain the only
  lifecycle and construction owners.
- The central intersection, signal fixture transforms, and signal behavior are
  unchanged. Outer straight extensions, the longer East Quay spline, lane
  endpoints, colliders, map references, sector entries, and barriers share the
  plan-derived final bounds.
- Four WORLD-002A sector pairs own east/west rim entries; four WORLD-002B
  sector pairs own north/south entries. Existing sector ownership remains
  unique and full-map geometry remains immutable when sectors unload.
- All 12 new shells use approved variants from the 26-entry catalog, catalog
  frontage details, shared local textures, full rotated footprint collision,
  and `obstacle`, `camera`, and `building` tags.
- The baseline 26m load / 32m unload / 24m detail policy remains authored.
  Visual profiling found an inherited East Quay continuity pop at the final
  north/south approaches; splitting the long ground ownership between the rim
  sectors and moving the curve sector center removed it without increasing
  distance. No farther profile demonstrated additional visible benefit, so no
  distance increase is shipped.

## Map and UI design brief

The player question is unchanged: where am I, which roads connect, and where
is the named destination? The minimap remains the persistent `navigation`
instrument and the full map remains the pause-safe `modal` owner. No new UI
state, token, layout, focus, pointer, camera, motion, or input behavior is
introduced. Both views consume the final immutable level map references: six
roads, 22 structures, 14 sectors, and the Contact Yard marker. Desktop,
narrow, and ultrawide acceptance requires the expanded bounds to remain
legible with the existing accessible names, layer hierarchy, safe areas, and
restoration behavior.

## Mission integration facts

`location.ash-001.contact-yard`, `spawn.ash-001.contact`, and
`camera.ash-001.contact-reveal` are authored on the final north rim. The spawn
is grounded on continuous sidewalk collision and is more than 45m from the
existing Mack fixture. The camera entry is a static destination-reveal request;
world code does not own mission or cinematic progression.

## Visual and performance evidence

Final screenshot and performance artifact paths are recorded under
`docs/screenshots/world-002ab/`. Baselines are changed only because the
authoritative map bounds, roads, structures, sectors, and Contact Yard place
are intentionally expanded. Process memory is reported separately from the
browser JS-heap proxy when available.

The 1280×720 hardware lane used a 20-second warmup and 60-second measurement.
The streamed final map recorded 704.17 average FPS capacity, 357.14 FPS 1% low,
2.7ms frame-time p95, 38 draw calls, 12,891 triangles, and a 42.1MB peak browser
JS-heap proxy. These are uncapped capacity values, not display refresh. The
full-level comparison recorded 72 draw calls and 17,581 triangles. Three
south/north load cycles returned exactly 119 scene objects, 119 owned
resources, 5 sector model instances, 17 source references, and 8 asset instance
references at the same final pose. Console errors, page errors, failed requests,
and external requests were empty. Chromium did not expose full process working
set through the browser bridge, so the 42.1MB value is not represented as proof
of total process RSS; the tested proxy remains far below the 900MB ceiling.
