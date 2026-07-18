# MAP-001 full-world map design brief

## Purpose and ownership

**Feature ID:** `MAP-001` / `full-world-map`.

The map answers three low-urgency planning questions while the player has
deliberately paused action: “Where am I?”, “How is Ashfall connected?”, and
“Which authored places or active mission targets matter next?” It is a modal,
on-demand screen opened by the named `toggleMap` input action, not a larger
minimap and not persistent HUD. `FullWorldMapSystem` owns presentation and the
temporary `map` game state; the immutable active `LevelDefinition`, public
player pose, and read-only mission-highlight source remain authoritative.

Opening from `playing` or `paused` records the exact prior state and focused
element, releases pointer lock, freezes simulation through the runtime's state
policy, and focuses the map's close control. Closing returns to that exact
state, consumes UI-owned action edges, restores focus when its target still
exists, and requests the previous pointer-lock intent. The map never changes a
camera transform or requests camera ownership, so gameplay and vehicle camera
handles remain untouched. The shared screen-space layout hides every non-modal
HUD zone while `map` owns the modal layer.

## Information hierarchy and content limits

1. **District identity and current place:** Ashfall Junction, current resolved
   location, north-up orientation, and a concise `FULL DISTRICT SURVEY` label.
2. **Map field:** complete authored bounds, sector extents, roads including the
   East Quay spline, building footprints, landmark/location markers, active
   mission highlights, and player position/heading.
3. **Selected/focused facts:** accessible marker labels and a bounded place
   index. The map shows authored names only; raw world IDs stay diagnostic.
4. **Controls and scale:** close, zoom in/out/reset, four-direction pan, current
   zoom percentage, keyboard/gamepad hints, and a compact legend.

The place index is limited to authored landmarks and named locations. Mission
highlights are limited to read-only entries whose channels include `map` and
resolve target reference IDs through active authored level entries; unknown,
entity-only, or off-level IDs are ignored safely. No mission text,
objective definitions, route solving, discovered-state fiction, or scene
objects are manufactured here.

## Data and integration contracts

- `LevelSystem.activeLevel` supplies the complete immutable definition even
  when visual sectors are unloaded.
- `LevelMapPresentationDefinition` supplies authoritative bounds and entry
  references; box/building transforms and sampled spline geometry remain the
  single map/world source.
- `LevelDefinition.streaming.sectors` supplies sector centers and distances
  for the full-map sector layer without reading runtime sector residency.
- `WorldPoseSource.getWorldPose()` supplies player position and forward.
- `MissionHighlightSource` exposes immutable mission/objective/highlight IDs,
  channels, an ID-only target, display label, priority, and subscription.
- `GameStateMachine`, `InputSystem`, `ScreenSpaceLayoutSystem`, and the camera's
  existing public owner snapshot define state, input, HUD, and restoration.

## Visual language, zone, and tokens

The map occupies the authoritative `modal` zone. Its original Ashfall language
resembles a municipal harbor survey plotted on a phosphor-backed drafting
table: deep blue-black field, copper sector rules, cream road ink, oxidized
teal landmarks, amber active facts, clipped/chamfered panels, index numbers,
and subtle registration lines. It deliberately avoids franchise-style black
and white street tiles, full-screen tab bars, radar iconography, and copied
menu composition.

Reuse `--ash-font-display`, `--ash-font-interface`, `--ash-font-data`, ink,
night, panel, copper, amber, danger, rule, safe-area, motion, and layer tokens.
The implementation may add only map-semantic derivatives for survey grid,
sector fill, road casing, structure fill, and highlight halo; they derive from
existing Ashfall colors and do not introduce another font, breakpoint, icon
asset, z-index system, or panel family. Icons are accessible CSS/SVG geometry
generated from authored data, with no external asset or license dependency.

## States and transitions

- **Closed:** no DOM visibility, no focus/input ownership, zero map updates.
- **Open from playing:** simulation paused under `map`; complete map visible.
- **Open from paused:** remains pause-safe and returns to `paused` exactly.
- **No active mission:** legend says “No active objective signal”; no fake pin.
- **Mission source update:** marker/index refresh in place; polite status names
  the changed active count without stealing focus.
- **Unavailable level/map data:** bounded explanatory panel with a working close
  control; never a placeholder map.
- **Zoom/pan/reset:** clamped deterministic viewport changes, no inertial drift.
- **Restoration:** prior state/focus/pointer intent and unchanged camera owner;
  all ordinary HUD regions resume according to layout state.

Appearing and zoom changes use the shared fast/slow motion durations. Reduced
motion removes entry/viewport interpolation and decorative scan movement.

## Input, focus, and accessibility

- `M` / gamepad LT toggles the map; `Esc` / gamepad B closes it.
- Arrow/WASD map actions pan; `+`/`-` and gamepad bumpers zoom; `0` resets.
- Visible HTML buttons mirror every operation and support touch/click.
- The modal uses `role="dialog"`, `aria-modal="true"`, a labelled heading,
  concise instructions, visible focus rings, and a deterministic focus loop.
- The SVG uses an accessible district summary. Marker buttons expose place,
  type, and map coordinates; mission emphasis has text/shape as well as color.
- A polite live region reports zoom, pan, and mission-highlight changes.
- Contrast remains readable without color; roads use line weight, structures
  use fill plus outline, sectors use dashed rules, and missions use a diamond
  plus labelled index entry.

## Responsive behavior

- **1280×720 desktop:** header, large square-ish field, right place/legend rail,
  and bottom control strip fit within safe areas.
- **390×844 narrow:** full-height sheet; header stays compact, map remains the
  first major region, place index becomes a short horizontal/scrolling rail,
  and controls wrap into large touch targets without clipping.
- **1920×800 ultrawide:** centered capped shell; map grows vertically while the
  rail stays a readable width rather than stretching copy.
- **Safe-area simulation:** the modal shell uses all four `--ash-safe-*`
  gutters; no control or text enters the simulated inset.
- **125% text:** rail and controls scroll/wrap; map keeps a minimum usable area.
- **Reduced motion:** no entry sweep, animated grid, or smooth viewport change.

## Screenshot and acceptance matrix

Intentional baselines and live captures:

1. UI composition lab `pause-map`, bright, 1280×720.
2. Live map, daytime/noisy gameplay, 1280×720, default zoom.
3. Live map, nighttime, 390×844, 125% text, safe area, reduced motion.
4. Live map, noisy street, 1920×800, panned and zoomed.
5. Restoration capture after closing, proving ordinary HUD visibility.

Accept only when the authored East Quay curve, ten structures, six sectors,
named places, and player marker are legible; no visible element overlaps or
escapes safe areas; focus order and keyboard/gamepad controls work; all map
labels are accessible; no mission placeholder appears; prior game state,
camera owner, focus, pointer intent, controls, and HUD restore; repeated
open/close does not add listeners or retain DOM; reduced motion is static; and
the browser console/page-error list is empty. Baseline changes are intentional
because `pause-map` moves from a documented unavailable dependency to the first
production full-map composition.

## Implementation and baseline decisions

- The shared MISSION-001 contract was consumed from contract-only commit
  `e8266c7`; MAP does not define mission state or a parallel highlight type.
- Sector coverage uses each authored `loadDistance` as a faint dashed ellipse,
  with center and logical label retained for recognition at default zoom.
- The place index remains HTML for focus and text scaling while the map field is
  SVG generated from the same immutable level references as the minimap.
- Reviewed live baselines are `full-map-desktop`, `full-map-narrow`, and
  `full-map-ultrawide`; the reviewed lab baseline is `pause-map-desktop`.
  Desktop/ultrawide stay bounded; narrow shows the final place and all controls.
