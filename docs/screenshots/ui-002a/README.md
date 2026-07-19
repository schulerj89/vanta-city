# UI-002A bounded visual review

This directory records the design consultation for `NAV-001`, `UI-SAVE-001`,
and `LOADOUT-001` on base commit
`78ff0b83069a406ffb6669238c224977a8e9b6d0`. The authoritative decisions are
in `docs/ui/ui-002-navigation-persistence-loadout.md`.

The review is deliberately split between the deterministic UI composition lab
and the live game. Lab frames isolate layout and accessibility stress; live
frames confirm the actual title art, world contrast, camera projection, map
state, death presentation, and restoration behavior. Screenshots are review
evidence, not runtime fixtures.

## Reproduction

Install and start the local app:

```sh
pnpm install --frozen-lockfile
pnpm dev --host 127.0.0.1 --port 4174 --strictPort
```

The inspected routes were:

- `http://127.0.0.1:4174/?debug=0` for title and live-game frames;
- `http://127.0.0.1:4174/?sandbox=ui-composition-lab&uiState=<state>&uiBackground=<background>&labPanel=0`
  for deterministic composition states;
- the same live URL with BrowserTestBridge public commands for loading the
  representative level, starting gameplay, setting player pose, activating
  the current mission, toggling the map, and forcing the existing death test
  state.

The browser was tested at 1280×720, 390×844, and 1920×800. Narrow enlarged
captures used the existing accessibility preference fixtures plus
`prefers-reduced-motion: reduce` and safe-area emulation. The explicit browser
text stress set the document root to 32 px only after the app mounted; it is a
diagnostic of current whole-HUD behavior, not an accepted supported baseline.

Returning-title frames used only the current public title-run marker fixture.
No save payload, equipment ownership, or campaign state was synthesized in the
DOM. Live map, mission, equipment, and death observations came from public
snapshots/commands exposed by BrowserTestBridge.

## Evidence index

### Deterministic composition lab

| File                                                            | Review question                                                             | Result                                                                                 |
| --------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `lab-objective-bright-1280x720.png`                             | Does the existing objective hierarchy survive a bright background?          | Instruction and state remain legible; the proposed sounding must stay secondary.       |
| `lab-objective-dark-safe-large-reduced-390x844.png`             | Does the documented narrow 125% path respect safe areas and reduced motion? | Pass: no owned-zone collisions or clipping.                                            |
| `lab-objective-noisy-1920x800.png`                              | Does the HUD remain bounded on ultrawide/noisy art?                         | Pass: edge anchoring and capped blocks remain readable.                                |
| `lab-objective-noisy-browser-text-200-safe-reduced-390x844.png` | What happens under true 200% root-font stress?                              | Current defect: truncated objective copy and ten intersecting region pairs. See below. |
| `lab-keyboard-focus-dark-1280x720.png`                          | Is keyboard focus visible without color alone?                              | Pass: the Help control has a visible focus treatment.                                  |

### Live navigation and map

| File                                           | Review question                                                                  | Result                                                                                                                   |
| ---------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `live-objective-ahead-map-closed-1280x720.png` | How does the existing projected objective read on screen?                        | It is legible but small and supplies no distance. The closed HUD has no pointer-visible map control.                     |
| `live-objective-behind-offscreen-1280x720.png` | What does the player see when the same target is behind the camera?              | Nothing: the public snapshot reported `worldIndicatorVisible: false`, motivating the proposed edge/behind bearing state. |
| `live-objective-night-390x844.png`             | Does live world guidance remain readable at narrow size/night contrast?          | Legible at the supported size, though vertical competition is already tight.                                             |
| `live-objective-noisy-1920x800.png`            | Does live traffic/noise defeat the HUD?                                          | Current backing protects copy; new guidance must use the same bounded contrast discipline.                               |
| `live-map-open-1280x720.png`                   | Does keyboard map entry have a clear close/restoration path?                     | Pass: Close receives focus; public snapshot reports map state and preserved camera owner.                                |
| `live-map-open-safe-large-reduced-390x844.png` | Is the full map usable narrow with safe area, enlarged text, and reduced motion? | Pass: control is reachable and map content reflows.                                                                      |
| `live-map-open-1920x800.png`                   | Does the map over-expand on ultrawide?                                           | Pass: map surface remains capped and centered.                                                                           |

For the live map restoration check, the before/open/after public snapshots
reported `playing → map → playing`, the same camera owner before and after,
map-scoped accepted actions while open, Close focus while open, and restoration
of minimap/location/quickbar visibility after close. Querying the closed
navigation region for a pointer map control returned no match.

### Live title and persistence entry

| File                                        | Review question                                       | Result                                                                             |
| ------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `title-first-run-1280x720.png`              | What does a fresh desktop title expose?               | `Start`; no Reset control.                                                         |
| `title-first-run-large-reduced-390x844.png` | Does first-run title survive narrow/enlarged/reduced? | Pass for current controls and title art.                                           |
| `title-first-run-1920x800.png`              | Does first-run title stay composed ultrawide?         | Pass: focal art and panel remain bounded.                                          |
| `title-returning-focus-1280x720.png`        | What does a returning keyboard user see?              | `Continue` receives the tested focus treatment; no Reset control exists.           |
| `title-returning-large-reduced-390x844.png` | Is returning title usable narrow/enlarged/reduced?    | Pass for current controls; the proposed tertiary reset must reflow below Continue. |
| `title-returning-1920x800.png`              | Does returning title stay composed ultrawide?         | Pass for current controls and art.                                                 |

The public title attributes reported `first-run`/`Start` and
`returning`/`Continue` respectively. A Reset-control query returned no match.
This review did not manufacture reset success/failure because SAVE-001 does not
yet expose those public outcomes.

### Live death and recovery entry

| File                      | Review question                                        | Result                                                                                         |
| ------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `live-death-1280x720.png` | What recovery information is currently presented?      | Generic `DOWNED`, `debug encounter`, and `Revive & restart`; no destination or storage result. |
| `live-death-390x844.png`  | Does the current death modal remain operable narrow?   | Pass: modal and focused action remain visible.                                                 |
| `live-death-1920x800.png` | Does the modal remain appropriately bounded ultrawide? | Pass.                                                                                          |

The death snapshot reported the overlay visible, gameplay controls suppressed,
and the death presentation as camera owner. These frames do not approve a
respawn destination rule; SAVE-001 and WORLD-004 own that choice and stable
location data.

### Concept geometry

`ui-002a-layout-icons.svg` is a docs-only vector construction sheet. It records
the proposed survey-sight grammar, folded map tab, issue-card handgun and knife
silhouettes, and their assigned screen zones at the three review sizes. It is
not a shippable asset and does not authorize raster imports or brand mimicry.

## Instrumented checks

The clean live rerun produced:

- page errors: 0;
- console errors: 0;
- external requests: 0;
- runtime error snapshot count: 0;
- failed requests: 26 expected same-origin aborted `HEAD` asset probes, with 0
  unexpected failures.

Other public-snapshot observations:

- objective ahead: resolved target and visible world indicator;
- objective behind: resolved target, not occluded, indicator hidden;
- first current map objective: zero map-channel highlights because its active
  highlight is intentionally world-only;
- current fresh live equipment fixture: Handgun not owned, Knife owned;
- current closed map: no pointer-visible map action;
- current title: no reset control;
- current death overlay: generic recovery copy only.

## Current 200% diagnostic

At 390×844 with a 32 px document root, safe-area emulation, and reduced motion,
the current composition lab did not create document scroll overflow, but it
reported ten region intersections:

1. player status / navigation;
2. player status / quickbar;
3. player status / objective;
4. navigation / quickbar;
5. navigation / objective;
6. navigation / notification;
7. navigation / world marker;
8. objective / notification;
9. objective / world marker;
10. notification / world marker.

The screenshot also shows truncated objective copy. UI-002A therefore treats
125% integrated narrow layout as the supported current acceptance path and
requires each new component/modal to pass isolated 200% checks. Whole-HUD 200%
repair is a foundation follow-up, not something these three implementations
may hide by suppressing useful information.

## Review boundaries

- No runtime source, save data, mission data, equipment definition, or level
  definition was changed for this consultation.
- No external network resource was loaded to create these frames.
- SAVE-001 and WORLD-004 outcomes do not exist on this base, so reset and
  home/clinic/fallback variants are specified in the brief but not presented as
  live evidence.
- BrowserTestBridge remains test-only. The design calls for production public
  ports rather than reusing bridge commands.
