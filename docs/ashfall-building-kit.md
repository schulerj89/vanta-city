# Ashfall building kit

## Identity and reference study

Ashfall Junction is **Atlantic neon-deco / weathered coastal industrial**: salt-faded concrete scoring, patched brick-and-stucco utility blocks, oxidized blue-green corrugated sheds, charcoal roof membranes, and restrained warm rust. The identity is fictional and place-specific. It borrows broad coastal infrastructure and geometric deco principles, not a real skyline, landmark, neighborhood, photograph, sign, or trademark.

The visual grammar was derived from authoritative architecture and preservation sources:

- The US National Park Service [Art Deco and Art Moderne design guidance](https://irma.nps.gov/DataStore/DownloadFile/581707) identifies vertical emphasis, geometric scoring, stepped towers/projections, horizontal grooves, smooth stucco, and flat parapet roofs.
- NPS [Preservation Brief 11: Rehabilitating Historic Storefronts](https://www.nps.gov/orgs/1739/upload/preservation-brief-11-storefronts.pdf) describes pier-and-bay rhythm, bulkheads and transoms, recessed entrances, the cornice/fascia separating storefront and upper stories, and the storefront's planar relationship to the street.
- NPS guidance on [common brick-masonry problems](https://www.nps.gov/articles/common-problems-with-brick-masonry.htm) grounds restrained mortar variation, salt/moisture wear, patches, and cracking around openings without turning deterioration into random noise.
- Historic England's [Maritime and Naval Buildings selection guide](https://historicengland.org.uk/images-books/publications/dlsg-maritime-naval-buildings/) establishes the functional dockyard/harbour context and the coexistence of warehouses, workshops, offices, and service structures.
- Historic England's [Streets for All guidance](https://historicengland.org.uk/advice/caring-for-heritage/streets-for-all/highway-engineers-and-designers/) treats surfacing and kerbs as integral, navigable parts of local character and recommends simple, uncluttered streetscape treatment.

Derived Ashfall principles are therefore: repeat structural bays at believable 2.5–4m intervals; distinguish street frontage from plain service treatment; use a strong fascia/cornice and readable sealed entrance bays; keep flat roofs behind parapet/coping lines; concentrate deco scoring at piers and roofline; weather masonry consistently at joints, bases, and water paths; use corrugated metal and concrete plinths for service walls; and keep scored sidewalk slabs and continuous aggregate kerbs aligned to street/building geometry.

The 26 reusable shells span 6–22m footprints, 4.5–18m heights, eight wall/frontage materials, seven frontage uses, and five massing profiles. Opaque window/storefront/entrance bays reveal no interiors and own no collision. All entrances face local +Z before authored placement rotation. The shells contain no interiors, readable text, brands, procedural placement, or simulation ownership.

## Runtime and material policy

- Eleven 512×512 JPEG albedo textures form the controlled palette: eight facade/frontage surfaces, one roof, one sidewalk, and one curb. Seven are the accepted image-generated originals; four BUILDINGS-002 surfaces are deterministic project-owned procedural originals. `validate:buildings` hash-pins every file and caps aggregate size at 1.1 MiB; the current set is 817,716 bytes.
- Textures load through the authoritative asset catalog and `GameAssetLoader`. Runtime URLs are local project paths; there is no runtime network dependency.
- Repeating UVs are encoded in box geometry. Facades repeat every 3–4m, the sidewalk every 6m, and the curb every 3m. Shared materials and loader-cached textures prevent per-building texture allocation.
- Shallow cornice bands, roof caps, frontage bands, and opaque entrance bays improve street readability without creating alternate collision or lifecycle ownership. All detail remains inside the authored footprint. `near-detail` frontage and `far-detail` roof/cornice pieces use the same object tags consumed by gameplay's existing LevelSystem LOD visibility policy.

## Junction placement decisions

Eight baseline buildings form four outer-edge L-shaped corner groups; WORLD-001 adds two East Quay shells flush with the expanded X=42 edge. The baseline pairs address both adjacent streets while leaving the whole inner sidewalk open, and the expansion shells retain at least 4m from the spline-derived road edge. The closest facade is exactly 4m beyond the 12m road edge, matching `intersectionLayout.sidewalkWidth`.

- Stable `c.ruin-*` collision IDs remain on the primary corner structures because camera diagnostics and browser coverage treat those IDs as an API.
- Paired footprints touch only at boundary lines or retain open circulation; they never overlap and do not create narrow inaccessible slots.
- Northeast stays outside the signal controller and sparring pad clearance. Southwest and southeast keep NPC fixtures, interaction sight lines, every approach/corner spawn, and traffic lanes open.
- No footprint intersects a traffic lane. The expansion revises the road, east barrier, map bounds, and district zone through the shared WORLD-001 plan while preserving signals, spawns, triggers, landmarks, and baseline ownership.
- All ten minimap rectangles derive footprint and rotation from the same building definitions used by rendering and authored collision.
- Eight thin curb-face visuals stop at inside corners and sit 2cm above the existing sidewalk top, avoiding coplanar z-fighting without changing walkable collision.

## Visual lab and coverage

Run `pnpm lab:buildings` or open `/?sandbox=building-visual-lab&debug=1`. The development-only lab displays:

- all 26 live textured variants;
- mint world bounds and amber collision footprints;
- exact width × depth × height, material, massing profile, and UV repeat;
- all eleven material swatches, including roof, sidewalk, and curb;
- deterministic overview, close, street, overhead, materials, near/far/shell LOD, focused selection, independent bounds/collision, and 390×844 narrow coverage through the existing `window.__VANTA_BUILDING_LAB__` bridge.

Gameplay day/night coverage remains owned by the time-of-day suite. Placement tests enforce a 4m minimum walking band, footprint non-overlap, protected-point clearance, and traffic-lane clearance. Browser performance coverage caps the district below 120 draw calls and checks for local texture loading and runtime/console errors.

## Public contracts, risks, and boundaries

- Existing `LevelDefinition` box visuals gained optional `textureAssetId` and `uvMetersPerRepeat` fields. They resolve only through the existing asset loader; untextured boxes keep the previous color-material path.
- Generated images were prompted as seamless, but image generation does not mathematically guarantee edge identity. Large 3–6m repeats, regular bays, and stepped silhouettes reduce repetition. Deterministic seam synthesis is the next art step if later inspection exposes seams.
- Collision follows each full authored footprint, not rooftop setbacks, so the player/camera never enter apparent solid mass. Rooftop ledges remain inaccessible by design.
- Buildings have no independent update loop or distance owner. Tagged frontage/roof/cornice pieces use the shared 24m LevelSystem policy; the lab exposes three deterministic inspection states without changing gameplay distance. Profile before increasing placed count and do not add procedural placement by default.
- The lab remains development-only and adds no runtime global listeners. Lifecycle, game state, input, player transform, health, collision, camera, debug registry, and browser bridge ownership are unchanged.
