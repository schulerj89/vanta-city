# WORLD-003 — Visible Ashfall Junction continuity

## Outcome

WORLD-003 does not expand Ashfall Junction again. The authoritative bounds stay
at X `[-36.75, 50.75]`, Z `[-35, 35]`: 87.5m × 70m = 6,125m². The implementation
makes that existing footprint read as one district by adding three catalog-driven
textured frontages, nine curb/centerline details on the straight rim approaches,
a raised textured Contact Yard apron, and a continuous East Quay ground/sidewalk
seam beneath the curved road. Building count changes from 22 to 25; the 14-sector
streaming topology and 26m/32m/24m visibility profile do not change.

The runtime construction authority is `src/world/levels/junctionGrowth.ts`,
composed once by `src/world/levels/testDistrict.ts`. The checked-in
[machine-readable record](plans/world-003-visible-junction.json) is evidence, not
a second runtime definition.

## Reproduction and diagnosis

The committed WORLD-002AB evidence was preserved unchanged. Before captures are
copied under `docs/screenshots/world-003/before/`; all new browser output is under
`docs/screenshots/world-003/after/`.

The pre-edit browser owner passed with no console errors, page errors, failed
requests, or external requests. Visual review classified the complaint as authored
geometry and camera readability, not projection or generic streaming:

- the full map already used the complete 87.5×70m bounds and immutable geometry;
- the south rim had long unfronted stretches and the straight extensions lacked
  the curb/centerline language of the central intersection;
- `location.ash-001.contact-yard` stood on the fallback world floor with no yard
  shell or raised arrival surface;
- `camera.ash-001.contact-reveal` was embedded in an existing building footprint,
  so shared camera collision collapsed the reveal to near-empty sky;
- sector ownership was unique, but coordinate-derived fallback ownership would
  have put new entries in old quadrant sectors, so WORLD-003 uses explicit owners.
- the East Quay curve reached the east-rim slabs over a visible sky-colored wedge;
  the repair needed authored ground, sidewalk overlap, and matching collision,
  not a streaming-policy exception.

No generic streaming policy or lifecycle code is added here.

## Authored construction

- Contact Yard: a south-facing textured office at the north edge, a 10m × 4m
  raised sidewalk apron, a grounded mission/spawn position with 2.4m frontage
  clearance, and an unobstructed frontal reveal anchor.
- South frontage: one canal office and one ticket arcade fill the two largest
  unfronted stretches without entering traffic lanes, intersecting existing
  shells, or reducing the established exact 4m minimum street clearance.
- Street language: paired curb faces continue the west, north, and south straight
  road edges; three center marks make those extensions readable at gameplay and
  overhead scale. These are visual streetscape details; road collision and lanes
  remain on their existing shared road definitions.
- East Quay continuity: a below-road 23m × 14m textured ground fill extends the
  inherited quay apron beneath the curve, while a raised 3.5m × 16m sidewalk
  overlap joins the east-rim walkable slab. Both have matching collision and one
  `sector.east-rim-north` owner. The curved road remains visually authoritative.
- Ownership: every new building visual/collider, apron visual/collider, curb, and
  marking names exactly one existing rim sector. The ordinary level validator and
  focused assertions reject missing or duplicate ownership.
- Pedestrians: three longer rim loops and one 30.9m production boundary route are
  added on authored sidewalk colliders. `route.north-rim-west` uses the
  PEDESTRIAN-003 `loop:false` union with one resident, a north exit, 0.4m terminal
  clearance, and `sector-reload` repopulation. Its one sidewalk surface extends
  to Z=35.7, supporting the terminal foot point at Z=35.4 plus the 0.3m body
  radius, and a 2m opening replaces the north wall at X=-15. The original four
  loops reduce from four to three residents each, preserving the 16-resident cap
  and one mixer per resident.

## Full-map design brief

Feature ID: `world-003-full-map-authoritative-geometry`.

The player question remains “where do these streets connect, where is the Contact
Yard, and which sector contains it?” The existing full map remains the pause-safe
`modal` owner and the minimap remains the persistent `navigation` instrument.
Both consume `LevelDefinition.mapPresentation`; WORLD-003 adds only the three new
building references to that existing source. Sector coverage continues to come
from the level streaming definition and the active mission highlight resolves the
existing Contact Yard location ID.

No new UI token, component, input listener, focus behavior, camera behavior,
breakpoint, motion, font, icon, or state is introduced. Keyboard and gamepad map
ownership, close/reset/zoom controls, pointer restoration, enlarged text,
reduced-motion behavior, and safe areas are unchanged. Acceptance covers
1280×720 and 390×844 live maps, complete bounds, six roads, 25 structures, 14
sectors, and the active Contact Yard objective. Full-map visual baselines change
only because the authoritative structure footprints intentionally increase from
22 to 25.

## Evidence and acceptance

Before: spawn/rims, overhead, Contact Yard, and full map are retained in
`docs/screenshots/world-003/before/`. After evidence includes spawn street, every
rim, day/night Contact Yard, overhead, desktop full map with the mission highlight,
narrow full map, and narrow night Contact Yard in
`docs/screenshots/world-003/after/`. The repeated `east-rim-curve-day.png` angle
now shows one supported asphalt/sidewalk corridor instead of the inherited void.
Sky outside the wall at X=50.75 is the intentional authoritative outer map edge;
it is distinct from the repaired interior seam between the quay and rim slabs.
Real production boundary approach, crossing, disposal, absence, sector unload,
reload, and repopulation evidence is under
`docs/screenshots/world-003/pedestrian-edge-contract/`.

The after capture report records complete bounds and empty console/page/network
fault lists. The final dedicated 1280×720 lane records 379.25 FPS average
capacity, 102.04 FPS 1% low, 8.9ms frame-time p95, 94 draw calls, 21,324
triangles, and a 37.3MB peak browser JS heap proxy after a 20-second warmup and
60-second sample.
These are uncapped software-WebGL capacity values, not display refresh. Three
south/north cycles return exactly 125 scene objects, 138 owned resources, four
sector model instances, 20 source references, and 14 asset instance references.
Console errors, failed requests, and external requests are empty. Artifacts are
under `docs/screenshots/world-003/performance/`.

## Known limitations and integration contract

- The existing East Quay curve remains the only curved corridor; WORLD-003 does
  not create a second lane or road authority.
- PEDESTRIAN-003 owns the lifecycle implementation; WORLD-003 supplies only the
  production north-exit route and the body-safe authored geometry it references.
- The full map displays sector load-radius coverage because the current public
  sector contract has centers and distances, not authored polygon boundaries.
  This is accurate to the public data and no decorative sector geometry is
  invented.
