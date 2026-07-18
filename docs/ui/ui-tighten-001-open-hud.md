# UI-TIGHTEN-001 — Open instrument HUD

## Purpose and diagnosis

This pass answers four player questions with four visibly different instruments:
“Where am I going?”, “What condition am I in?”, “How much money do I have?”,
and “What changed in the mission?” The current UI-SYSTEM-001 screenshots show
money, health, mission objective, location, and minimap using the same dark
rectangular backplate, amber leading stripe, border, chamfer, and dropped shadow.
That repeated card silhouette makes secondary money as visually heavy as health,
makes a transient mission update resemble a persistent objective, and turns the
navigation corner into two stacked dashboard widgets. The square map inside a
square panel compounds the card-on-card reading.

The design decision is an **open instrument rail**: typography, calibrated rules,
registration ticks, shaped apertures, edge anchoring, and negative space carry the
hierarchy. These surfaces keep restrained local contrast underlays for gameplay
legibility, but no longer share a panel family. This is not a rounding pass and no
surface becomes a pill.

## Hierarchy, zones, and authority

1. Navigation remains the fastest spatial read in `navigation`. The minimap is an
   octagonal harbor plotting aperture with the existing north-up geometry,
   markers, heading, location naming, and public snapshot unchanged. An octagon
   removes the square silhouette while retaining more useful corner geography
   than a circle and avoiding a recognizable franchise radar composition.
2. Health remains in `player-status` and becomes a bracketed condition scale.
   Its numeric capacity and segmented rule are the primary player-status read.
   Low, critical, and depleted states add words and pattern/shape changes so
   urgency never depends on color.
3. The persistent mission objective remains in `objectives` as an edge-anchored
   annotation: vertical registration spine, short top rule, mission identity,
   and readable instruction over a fading underlay rather than a closed panel.
4. Transient mission updates remain in `notifications` as a centered signal band
   with open ends and upper/lower rules. Their live-region urgency and bounded
   lifetime remain distinct from the persistent objective.
5. Money remains in `player-status` but becomes a compact, right-aligned ledger
   line labelled `FUNDS`. It is secondary at rest; credit/debit deltas and the
   existing short count animation provide the transient cue.

`ScreenSpaceLayoutSystem` remains the only placement, safe-area, visibility, and
zone authority. `HealthComponent`, `PlayerMoneyAccount`, and `MissionSystem`
remain the only domain sources. `MinimapHudSystem` continues to project the
immutable level map and public player pose. No DOM state becomes simulation truth,
and no new input, focus, camera, game-state, or browser listener is introduced.
The modal full-world map is explicitly unchanged.

## Component states and content limits

- Money: steady, credit, debit, counting, reduced-motion, and disposed. One
  balance plus one transient signed delta; no ledger history or permanent card.
- Player health: steady (`CONDITION`), low (`CONDITION · LOW`), critical
  (`CONDITION · CRITICAL`), and depleted (`CONDITION · DEPLETED`). One numeric
  value and one segmented scale. The existing accessible progressbar retains its
  label and min/max/now values. World target health stays a separate projected
  indicator and is not restyled into the player instrument.
- Objective: hidden or active; one progress kicker, one mission title, and one
  objective sentence. Long text wraps within the existing bounded measure.
- Mission update: started, objective-completed, completed, cancelled, failed,
  retry-ready, hidden after the existing bounded lifetime, and reduced-motion.
  Failure retains assertive `alert`; other kinds remain polite `status`.
- Minimap: hidden, gameplay, paused, layer variants, narrow, and restored after
  dialogue/map. It remains north-up. The octagonal mask clips decorative corners,
  not the authoritative map projection; the map boundary itself adopts the same
  eight-sided silhouette.

## Tokens, motion, and assets

Reuse `--ash-font-display`, `--ash-font-interface`, `--ash-font-data`, ink,
muted ink, night, copper, amber, danger, rule, safe-area, motion, and layer tokens.
Add only semantic open-HUD derivatives for a faint instrument underlay, strong
instrument rule, and shadow used by the owned selectors. Do not add a font,
breakpoint, z-index family, icon set, image, or second panel token system.

Motion stays informative: money count/delta and the mission update reveal remain
short and interruptible; health fill changes use the existing fast transition.
Reduced-motion makes every owned transition static. The minimap aperture and
objective annotation have no ambient sweep, pulse, scan, or rotation.

All geometry is CSS or repository-native SVG generated from existing authored
data. There are no network-loaded runtime assets, external fonts/icons, new
license dependencies, brands, or copied franchise treatments.

## Responsive, accessibility, and restoration

- 1280×720: open status rail stays below Help; objective and update do not
  collide; the navigation group remains bottom-left.
- 390×844: player status keeps a readable capped measure rather than becoming a
  full-width card; objectives and notifications wrap inside simulated safe-area
  insets; navigation and loadout remain disjoint.
- 1920×800: instruments remain edge-anchored and do not drift or stretch into
  wide dashboard bars.
- Short-height landscape: compact vertical gaps and bounded notification copy
  protect gameplay view without making text unreadable.
- 125% text: labels and mission copy wrap or expand vertically without clipping
  or horizontal overflow. The minimap remains a stable minimum instrument size.
- Safe-area simulation: all visible zone roots clear all four insets. High
  contrast preserves rules, text, numeric values, and pattern cues. Bright,
  dark, and noisy backgrounds retain restrained local underlays rather than large
  opaque slabs.
- Focus order, pointer ownership, camera, input, game state, dialogue/map
  suppression, live-region semantics, and exact restoration behavior are
  unchanged.

## Composition-lab and screenshot matrix

The public presentation lab covers exploration, combat/low health, depleted
health, money transaction, mission update, dialogue, restoration, and the
existing full-map modal. Required review:

| State                                 | Background          | Viewport / stress                             |
| ------------------------------------- | ------------------- | --------------------------------------------- |
| Exploration                           | bright              | 1280×720                                      |
| Combat / low health                   | noisy               | 1280×720                                      |
| Health depleted                       | dark                | 1280×720, reduced motion                      |
| Money transaction                     | bright              | 1280×720                                      |
| Mission objective/update              | dark                | 1280×720                                      |
| Mission objective/update              | noisy               | 390×844, 125% text, safe area, reduced motion |
| Restoration                           | noisy               | 1920×800                                      |
| Exploration                           | bright              | 390×844, 125% text, safe area, reduced motion |
| Exploration                           | noisy               | 1920×800                                      |
| Live gameplay / transaction / mission | bright, dark, noisy | 1280×720, 390×844, 1920×800                   |

## Objective acceptance

- At a gameplay glance, the octagonal map reads first for navigation, health
  escalates when low/depleted, money remains secondary, and mission objective and
  update have different silhouettes and persistence.
- Money, player health, mission objective, mission update, and minimap no longer
  appear as matching closed rectangular cards. Large opaque backplates, repeated
  chamfers, repeated leading stripes, and card-on-card shadows are materially
  reduced.
- The minimap is visibly non-square while roads, structures, markers, north,
  player position/heading, and location naming remain legible. Full-world map
  markup, behavior, and styling remain unchanged.
- No owned roots overlap at 1280×720, 390×844, 1920×800, simulated safe-area,
  or existing short-height stress. Enlarged text has no clipping or horizontal
  scroll.
- Warning and depleted meaning survive grayscale through text and patterned
  scales; progress/live-region semantics and contrast remain correct.
- Existing `HealthHudSnapshot`, `MoneyHudSnapshot`, `MissionHudSnapshot`, and
  `MinimapHudSnapshot` contracts remain unchanged. Lab fixtures use only explicit
  public presentation definitions; BrowserTestBridge remains snapshot-only.
- Intentional visual-baseline changes are accepted only after manual bright,
  dark, noisy, narrow, and ultrawide review plus clean console/page-error,
  failed-request, overflow, focus, pointer, disposal, and restoration checks.

## Visual review record

The intentional composition-lab baseline change replaces the repeated closed
panel family with the open-instrument hierarchy documented above. Reviewed
baselines live in `e2e/ui-composition-lab.spec.ts-snapshots/`, including
`exploration-bright-desktop-darwin.png`, `combat-noisy-desktop-darwin.png`,
`health-depleted-dark-desktop-darwin.png`,
`money-transaction-bright-desktop-darwin.png`,
`mission-update-dark-desktop-darwin.png`,
`mission-update-narrow-large-safe-darwin.png`,
`mission-update-ultrawide-darwin.png`,
`exploration-noisy-ultrawide-darwin.png`, and
`exploration-noisy-short-ultrawide-darwin.png`. The existing full-map modal
baseline remains visually unchanged.

Reviewed live-game evidence is stored in `docs/screenshots/ui-tighten-001/`:

- `live-exploration-bright-1280x720.png`
- `live-money-credit-bright-1280x720.png`
- `live-low-health-noisy-1280x720.png`
- `live-mission-update-dark-1280x720.png`
- `live-mission-update-dark-390x844.png`
- `live-restored-noisy-1920x800.png`

Manual review confirmed readable roads, structures, markers, north, player
heading, location naming, condition value, transaction delta, objective/update
copy, and restoration at all required widths. A first narrow render exposed an
eight-pixel navigation/quickbar overlap; live mission validation then exposed a
few-pixel objective/update overlap. Both were corrected before these images and
baselines were accepted. The final geometry assertions report no owned-region
overlap, clipping, horizontal overflow, or unsafe viewport escape. Reduced-motion
and 125% text/safe-area lab captures remain static and legible.

The live acceptance path reported no console errors, page errors, or failed GET
requests. It observed the existing local-asset availability probes aborting 17
`HEAD` requests after their answers were no longer needed; each was an
`ERR_ABORTED` request under `/assets/`, and no unexpected request failure remained.
