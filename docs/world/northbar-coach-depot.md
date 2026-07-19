# Northbar Coach Depot production location

`northbar-coach-depot` is the bounded, opening-only source level for CINEMATIC-002. It occupies 48 × 36 metres (1,728m²) and remains physically and visually separate from Ashfall Junction. The level module is exported for later registry/travel integration; this slice does not change bootstrap, the level registry, cinematic runtime, NPC ownership, or travel state.

## Architectural decisions

- A single always-loaded 48 × 36m wet-concrete collider owns continuous grounding. Arrival and departure detail can stream without opening a collision seam under a participant or camera pad.
- The 1970s annex is expressed with a glazed-brick waiting-room shell, zinc transfer canopy, alternating sawtooth roof bands, a covered baggage walk, Marrow's inset counter, timetable, pay phones, and warm bay lamps. Existing local Ashfall textures are reused; there are no runtime network assets.
- Bay Two sits west of the participant triangle. The waiting-room counter is north-east and Mack's pillar is deliberately south-west of it, preserving the established Rook/Mack/Della depth relationship while keeping the counter service opening clear.
- The hall's south entrance is 5m clear, the baggage walk is 4m wide, participant camera pads use a 4m minimum, and the coach-step mark is 1.2m from the platform edge.
- Mack's wagon begins in the 6m departure lane. Its authored path travels east behind `c.transition-divider`; the divider is real collision and visual cover for truthful destination readiness, not a timer or full-screen fake.
- Vehicle silhouettes are original code-native low-poly geometry with local material variation. They are intentional staging assets owned by the level and are distinct from debug helpers; later vehicle/NPC work may replace them only through the same stable IDs and measured footprints.

## Cinematic support

The module publishes all six canonical blocking marks, both canonical vehicle IDs, the manifest/carbon/timetable props, the wagon path, arrival/departure triggers, and authored safe anchors for establishing, two-shot, Mack close, Della close, three-way cover, Rook close, ticket choice, wagon entry, and departure. Overhead and platform-clearance anchors are development review views, not shot definitions and do not own camera transforms.

## Sector ownership

- `sector.northbar.infrastructure`: always-loaded ground, platform, baggage walk, canopy, columns, lamps, and visible outer boundary.
- `sector.northbar.arrival`: waiting room, counter, paper/timetable/pay-phone props, and coach staging.
- `sector.northbar.departure`: service wagon and transition divider.

Every environment visual and static collider belongs to exactly one sector. The shared `LevelSystem` remains responsible for root creation, loading, collision commit, unloading, generated resource disposal, and stable loader-owned texture sources.

## Integration limits

The public `LevelDefinition` currently has no vehicle-path type, so `northbarVehiclePaths` is exported alongside the level module and `path.northbar.wagon-exit` is also exposed as a semantic mission location. Runtime cinematic performance, participant assets, vehicle doors/seating, destination transaction, loading UI, and `camera.ash-001.junction-arrival` remain owned by their assigned integration slices.
