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

The 18 reusable shells span 6–18m footprints, 4.5–18m heights, four wall materials, and four massing profiles. Opaque window/storefront bays reveal no interiors and own no collision. The shells contain no interiors, readable text, brands, procedural placement, or simulation ownership.

## Runtime and material policy

- Seven 512×512 JPEG albedo textures form the controlled palette: four facade/service surfaces, one roof, one sidewalk, and one curb. `validate:buildings` caps aggregate size at 700KB; the current set is about 640KB.
- Textures load through the authoritative asset catalog and `GameAssetLoader`. Runtime URLs are local project paths; there is no runtime network dependency.
- Repeating UVs are encoded in box geometry. Facades repeat every 3–4m, the sidewalk every 6m, and the curb every 3m. Shared materials and loader-cached textures prevent per-building texture allocation.
- Shallow cornice bands and roof caps improve street and overhead silhouettes without creating alternate collision or lifecycle ownership.

## Junction placement decisions

Eight authored buildings form four outer-edge L-shaped corner groups. Each pair addresses both adjacent streets while leaving the whole inner sidewalk open. The closest facade is exactly 4m beyond the 12m road edge, matching `intersectionLayout.sidewalkWidth`.

- Stable `c.ruin-*` collision IDs remain on the primary corner structures because camera diagnostics and browser coverage treat those IDs as an API.
- Paired footprints touch only at boundary lines or retain open circulation; they never overlap and do not create narrow inaccessible slots.
- Northeast stays outside the signal controller and sparring pad clearance. Southwest and southeast keep NPC fixtures, interaction sight lines, every approach/corner spawn, and traffic lanes open.
- No footprint intersects a traffic lane. Roads, signals, barriers, spawns, trigger volumes, landmarks, map bounds, and zone ownership are unchanged.
- All eight minimap rectangles derive footprint and rotation from the same building definitions used by rendering and authored collision.
- Eight thin curb-face visuals stop at inside corners and sit 2cm above the existing sidewalk top, avoiding coplanar z-fighting without changing walkable collision.

## Visual lab and coverage

Run `pnpm lab:buildings` or open `/?sandbox=building-visual-lab&debug=1`. The development-only lab displays:

- all 18 live textured variants;
- mint world bounds and amber collision footprints;
- exact width × depth × height, material, massing profile, and UV repeat;
- all seven material swatches, including roof, sidewalk, and curb;
- deterministic overview, street, overhead, materials, and narrow-viewport coverage through the existing `window.__VANTA_BUILDING_LAB__` bridge.

Gameplay day/night coverage remains owned by the time-of-day suite. Placement tests enforce a 4m minimum walking band, footprint non-overlap, protected-point clearance, and traffic-lane clearance. Browser performance coverage caps the district below 120 draw calls and checks for local texture loading and runtime/console errors.

## Public contracts, risks, and boundaries

- Existing `LevelDefinition` box visuals gained optional `textureAssetId` and `uvMetersPerRepeat` fields. They resolve only through the existing asset loader; untextured boxes keep the previous color-material path.
- Generated images were prompted as seamless, but image generation does not mathematically guarantee edge identity. Large 3–6m repeats, regular bays, and stepped silhouettes reduce repetition. Deterministic seam synthesis is the next art step if later inspection exposes seams.
- Collision follows each full authored footprint, not rooftop setbacks, so the player/camera never enter apparent solid mass. Rooftop ledges remain inaccessible by design.
- Buildings have no LODs because production contains eight instances. Profile before increasing count and do not add procedural placement by default.
- The lab remains development-only and adds no runtime global listeners. Lifecycle, game state, input, player transform, health, collision, camera, debug registry, and browser bridge ownership are unchanged.
