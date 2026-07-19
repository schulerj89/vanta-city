# BUILDINGS-002 — catalog and authoritative visual-lab brief

## Purpose and ownership

- **Stable feature ID:** `BUILDINGS-002`.
- **Player/developer purpose:** make Ashfall's 1997 street fabric read as a coherent coastal-industrial city while giving world authors one inspectable, production-backed catalog for choosing shells. The lab answers: which variant is this, where is local +Z frontage, what is its exact footprint/collision envelope, which materials does it use, and which pieces remain at each gameplay LOD?
- **Frequency and urgency:** the building silhouettes and frontage are persistent world scenery with low interaction urgency. The lab is a development-only inspection surface, opened intentionally and never mounted during gameplay.
- **Authority:** `AshfallBuildingKit` owns immutable variant/material metadata and geometry construction; `ThreeAssetLoader` owns cached texture sources; a sector renderer owns generated geometries/materials; `LevelSystem` remains the only gameplay distance evaluator; the sandbox owns its camera, diagnostics, DOM, and public `window.__VANTA_BUILDING_LAB__` bridge.
- **Boundaries:** no interiors, functional doors, navigation, simulation state, level placement, map geometry, alternate collision, streaming-distance changes, or private scene mutation. Local +Z is frontage before authored placement rotation.

## Visual direction and production assets

The catalog extends Ashfall's original Atlantic neon-deco / weathered coastal-industrial language into eight distinct 1997 uses: municipal transfer shed, ticket arcade, repair garage, print shop, boarding court, corner chemist, cold store, and municipal annex. Broad architectural principles are repeated structural bays, shallow recessed-looking entrances, geometric concrete scoring, flat/parapet rooflines, salt wear, painted shopfront panels, glass block, ceramic base tile, and ribbed zinc. No real building, brand, readable sign, protected architecture, or franchise composition is referenced.

The existing seven local generated textures remain authoritative. Up to four new original-project-owned, deterministic procedural 512px JPEG albedos may add ribbed zinc, ceramic tile, glass block, and painted shopfront families. They must be local-only, seamless at the repeat boundary, free of baked perspective/light/text/logos, fully hashed and documented, and keep all building textures at or below 1.1 MiB. Runtime variants reference logical IDs only.

## Hierarchy and content limits

1. **Viewport:** the inspected production geometry is primary and remains visible behind the panel.
2. **Header/status:** live catalog and material counts, selected variant, active view/LOD, bounds and collision state.
3. **Controls:** views, LOD state, focused variant, bounds toggle, collision toggle. Every control has an accessible name and pressed/selected state.
4. **Catalog table:** one catalog-derived row per variant: name, W×D×H, frontage, wall/frontage material, profile, UV repeat. No hand-maintained counts or variant copy.
5. **Material inventory:** all local wall, frontage, roof, sidewalk, and curb families, derived from the asset catalog.

At narrow width the viewport keeps the upper 58% for geometry and the panel becomes a bottom sheet capped at 42vh. Controls wrap, remain at least 36px high, and the table scrolls horizontally/vertically within the sheet. The panel never captures gameplay input because this sandbox has no gameplay owner.

## States and transitions

- **Loading:** local textures in flight; controls may render but the public snapshot reports `ready: false`.
- **Ready/default:** overview, all variants, near-detail, bounds and collision visible.
- **Focused:** one selected variant is composed for close inspection while the catalog remains the authoritative selector.
- **Views:** deterministic `overview`, `close`, `street`, `overhead`, and `materials` camera poses.
- **LOD:** `near-detail` shows shell, roof/cornice, and frontage detail; `far-detail` hides frontage detail but retains roof/cornice; `shell-only` hides every tagged detail while retaining the collision-equivalent shell mass.
- **Diagnostics:** bounds and collision can be independently shown/hidden; neither changes production globals or catalog data.
- **Failure:** required local asset failure remains an actual sandbox load failure surfaced by existing runtime error handling; the lab does not invent a production-looking fallback.
- **Disposal/restoration:** unloading removes the bridge, panel, stage, helpers, handlers, generated materials/geometries, and references exactly once. Loader-cached texture sources remain loader-owned.

Camera changes are immediate and deterministic; there is no decorative motion. `prefers-reduced-motion` therefore needs no alternate animation. Focus stays on the activated control or select across rerenders. Keyboard Tab/Shift+Tab reaches all controls in DOM order, Space/Enter activate buttons, and arrow-key behavior remains native for selects.

## Presentation tokens

The lab keeps its existing development-only family rather than changing shared UI tokens: deep blue-green panel (`#111c1f` at high opacity), muted steel borders (`#53777a`), paper-mint text (`#e8f0e9`), mint diagnostics (`#73f3d1`), amber collision/selection (`#ffb347`), and the existing system/monospace stacks. Color is never the only cue: bounds and collision have labels and independent named toggles; LOD/view/focus are text values and native selected/pressed states. Focus uses a visible pale outline with offset. Content contrast targets WCAG AA for normal text.

## Responsive and accessibility contract

- **Desktop 1280×720 / 1440×900:** right-side panel, unobstructed focused geometry, all controls reachable without page scrolling.
- **Narrow 390×844:** bottom sheet, wrapped controls, contained table scrolling, no horizontal document overflow, selected geometry visible above it.
- **Ultrawide:** camera framing is aspect-aware through the existing perspective camera; panel width remains bounded.
- **Safe areas:** panel insets add `env(safe-area-inset-*)` to their base spacing.
- **Enlarged text:** panel and controls grow naturally; inner scrolling prevents clipping.
- **Reduced motion:** no camera tween, pulse, or animated status.
- **Semantics:** labelled complementary region, labelled nav/control groups, native buttons/selects, output status, table headers, clear `aria-pressed` state, and a descriptive selected-variant status. No live region is warranted because changes are user-initiated and reflected by focused controls/output.
- **Assets/type:** local JPEG textures only; no icons, external fonts, network assets, or runtime credentials.

## Public API and data contract

`BuildingLabApi` exposes `snapshot`, `setView`, `setFocusedVariant`, `setLodState`, `setBoundsVisible`, and `setCollisionVisible`. Its snapshot contains the catalog/material counts, selected variant, active view/LOD/toggles, exact variant dimensions, local frontage vector, material IDs, profile, UV repeat, world bounds, collision bounds, and visible LOD-piece counts. It never returns or accepts `Object3D` references.

The production catalog keeps stable existing IDs and `getAshfallBuildingVariant(id)`. New metadata is immutable: frontage kind, frontage material (when present), entrance definitions on the local +Z face, and LOD tags. The full footprint remains the collision/bounds authority; shallow entrance/frontage detail stays within that footprint and owns no collider.

## Screenshot and objective acceptance matrix

All captures use `/?sandbox=building-visual-lab&e2e=1`, production local textures, disabled animation, and a ready public snapshot.

| Capture    | Viewport | State                               | Objective acceptance                                                     |
| ---------- | -------- | ----------------------------------- | ------------------------------------------------------------------------ |
| overview   | 1440×900 | all 26, near-detail, diagnostics on | every variant present; no overlap; counts catalog-derived                |
| close      | 1280×720 | focused `arrival-shed`, near-detail | entrance/frontage faces camera; no UV smear or clipping                  |
| street     | 1280×720 | all 26, near-detail                 | coherent 1997 material rhythm and readable silhouettes                   |
| overhead   | 1280×720 | diagnostics on                      | bounds and collision equivalent; footprints do not overlap               |
| materials  | 1280×720 | all material swatches               | every local family visible once and free of obvious seams/errors         |
| far-detail | 1280×720 | focused `municipal-annex`           | frontage detail hidden, shell and roof/cornice retained                  |
| shell-only | 1280×720 | focused `cold-store`                | all tagged details hidden; full collision-equivalent shell remains       |
| narrow     | 390×844  | focused `corner-chemist`, close     | controls usable, panel contained, geometry visible, no document overflow |

Browser acceptance iterates all 26 variants through the public focus API, verifies finite/equivalent bounds, +Z entrance definitions, LOD counts, independent diagnostic toggles, keyboard-visible controls, zero console/page errors, zero failed requests, and zero unexpected external requests. Unit/validator acceptance covers uniqueness, exact dimensions, valid frontage/entrances, local hashes/provenance, 1.1 MiB budget, shared one-load material promises, LOD tags, and deterministic resource disposal.

## Recorded baseline rationale and risks

The intentional baseline change is catalog expansion from 18 to 26 variants, seven to at most eleven local material textures, explicit frontage/entrance geometry, and public focus/LOD/diagnostic controls. Existing screenshot names are retained where their semantic view remains the same; new close, LOD, bounds/collision, and 390×844 captures are added.

Risks are texture repetition, shallow details extending outside collision, accumulated draw calls, promise-cached materials surviving sector disposal, and narrow-panel occlusion. Mitigations are repeat-aware UVs, details inset to the footprint, bounded low-poly bay geometry, one material promise per renderer/material family, sector-owned material/geometry disposal tests, and deterministic narrow screenshots. Functional doors and mathematically seamless photoreal surfaces remain explicitly out of scope.
