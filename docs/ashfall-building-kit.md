# Ashfall building kit

## Identity

Ashfall Junction is **Atlantic neon-deco / weathered coastal industrial**: salt-faded concrete scoring, patched brick-and-stucco utility blocks, oxidized blue-green corrugated sheds, charcoal roof membranes, and restrained warm rust. The identity is fictional and place-specific. It borrows broad coastal infrastructure and geometric deco principles, not a real city skyline, landmark, or neighborhood copy. “Neon” is expressed as the memory of teal and warm-orange civic color rather than live signage, which keeps the kit coherent with the post-apocalyptic low-poly street assets.

The 18 blank shells span 6–18m footprints, 4.5–18m heights, four wall materials, and four massing profiles. Selected civic/office variants use opaque smoked-window rows directly in their facade texture; the panes reveal no interiors and own no collision. The shells intentionally contain no interiors, doors, text, brands, procedural generation, or simulation ownership. Each instance remains authored level data with one conservative box collision footprint.

## Runtime and material policy

- Five 512×512 JPEG albedo textures form the entire palette: three opaque wall surfaces, one smoked-window facade, and one roof. Total committed transfer size is capped at 400KB by `validate:buildings`; the current set is about 374KB.
- Textures load through the authoritative asset catalog and `GameAssetLoader`. Runtime URLs are local project paths; there is no runtime network dependency.
- Repeating UVs are encoded in generated box geometry. Concrete and brick repeat every 4m; corrugated metal every 3m. Shared materials and loader-cached textures prevent one texture allocation per building.
- Shells use flat box massing with shared textured materials. The production placement is four instances and remains deliberately below the lab’s worst-case 18-variant draw-call load.

## Junction placement decisions

The four old colored ruin boxes are replaced by `seawall-court`, `breaker-block`, `freight-annex`, and `drydock-office`. Their street-facing edges sit roughly 6–11m behind the 12m road, closer and more intentional than the former sparse silhouettes while leaving the inner sidewalks traversable. Stable `c.ruin-*` collision IDs are retained because camera diagnostics and browser coverage treat those IDs as an API.

- Northwest preserves the former 14×12m footprint and center exactly, retaining its proven camera-obstruction pose while gaining a stepped 13m brick civic silhouette.
- Northeast stays north of the signal controller and sparring pad; its inner edge is kept at Z=15 so the pad’s north/south combat camera remains clear.
- Southwest and southeast use longer industrial/office forms pushed toward the outer boundary, keeping NPC conversation fixtures and all approach/corner spawns open.
- No footprint intersects the four traffic lane centerlines. Roads, signals, barriers, spawns, trigger volumes, landmarks, map bounds, and zone ownership are unchanged.
- Minimap structure rectangles now derive their footprint from the same reusable variant definitions used by rendering and collision authoring.

## Visual lab

Run `pnpm lab:buildings` or open `/?sandbox=building-visual-lab&debug=1`. The lab loads every variant in a single grid and displays:

- live textured massing;
- mint world bounds;
- amber collision footprints;
- exact width × depth × height;
- wall texture, massing profile, and UV metres per repeat;
- overview, street, and overhead camera presets through `window.__VANTA_BUILDING_LAB__` for deterministic browser coverage.

## Risks and boundaries

- Generated images are designed as seamless sources, but minor tonal seams may still be visible under extreme repetition. The larger 3–4m repeat and stepped silhouettes reduce repetition without extra textures.
- Collision deliberately follows the full blank footprint, not visual setbacks, so the camera/player never enter apparent solid mass. This is conservative and may leave inaccessible rooftop-setback ledges.
- Buildings do not have LODs because the entire authored district contains only four production instances. If the level grows, profile before increasing count; do not add procedural placement by default.
- The lab is development-only through the existing sandbox route and adds no global runtime listeners.
