# UI-SYSTEM-001 — Ashfall interface foundation

## Design brief

**Purpose.** Answer the player's immediate questions—where am I, what condition and equipment do I have, what can I do now, and who is speaking—without the interface becoming a second simulation. Persistent HUD appears only during supported gameplay states. Modal, presentation, conversation, and projected world information have separate ownership.

**Language.** “Harbor terminal” combines 1990s municipal wayfinding, marine-instrument readouts, faded thermal-paper cream, oxidized copper, sodium amber, and emergency vermilion. Chamfered corners, registration marks, ruled strips, condensed system lettering, tabular figures, and restrained scan texture create an original Atlantic neon-deco/coastal-industrial identity. No external fonts, icons, imagery, or franchise-derived compositions are used.

**Hierarchy and limits.** Interaction and failure are urgent; conversation is focused; health/loadout/navigation are glanceable; money and coordinates are secondary. A zone contains one primary panel family, notification stacks remain bounded, labels wrap before values, and unavailable lab cards state one dependency in one sentence.

**Authority.** `ScreenSpaceLayoutSystem` alone places `player-status`, `navigation`, `loadout`, `interaction`, `objectives`, `notifications`, `conversation`, `modal`, `presentation`, and `world-indicator`. Existing feature systems continue to observe their public domain snapshots/events. The layout observes only public game-state events and never controls simulation, input, camera, or focus.

**Tokens.** `--ash-*` variables in `src/styles.css` define type families/scales, ink and signal colors, spacing, radii/chamfers, panel surfaces, shadows, layers, safe-area gutters, motion durations, and the responsive content scale. Status meaning always includes text, shape, border style, or iconography; color is supplementary.

**State and restoration.** Exploration uses status/navigation/loadout/interaction. Dialogue suppresses the non-conversation HUD and keeps the existing dialogue controller/camera flow. Paused help remains the existing focus-trapped modal and restores prior focus/state. Death retains its existing player/camera restoration. Loading remains lifecycle-driven. Character selection remains modal. Reduced motion removes decorative movement and transition interpolation.

**Responsive and accessibility.** Zones include safe-area insets. At 390px, navigation compacts, player status becomes a full-width strip, and conversation uses a stacked portrait/content layout. Ultrawide content remains edge-anchored with capped readable measures. `--ui-text-scale` can enlarge the interface to 1.25 without clipping. Controls retain visible focus rings, semantic names, keyboard focus order, and existing live regions. Decorative marks are CSS-only and hidden from accessibility APIs.

**Assets and licensing.** System fonts and CSS geometry only; no new asset or license dependency.

## Composition lab and screenshot acceptance

The deterministic `ui-composition-lab` uses explicit presentation fixtures, not runtime private fields. Supported fixtures cover exploration, combat warning, dialogue, and restoration over bright, dark, and noisy Ashfall-like rendered backgrounds. Mission update, driving, full map, loading lifecycle, and production death are visibly marked unavailable until `MISSION-001`, `VEHICLE-001`, `MAP-001`, bootstrap lifecycle integration, and a public death-presentation fixture exist.

Accept at 1280×720, 390×844, and 1920×800 when: no zone overlaps another; urgent copy reads in a glance; text and controls do not clip at 125%; safe-area simulation clears all edges; focus is unmistakable; warning/depleted/unavailable meanings survive grayscale; reduced motion is static; and the browser console has no errors. Live gameplay must also be reviewed at all three viewports over daytime, nighttime, and a noisy street view.

## Known limits

- The lab represents only presentation composition; it does not manufacture mission, vehicle, map, loading, or death gameplay.
- Existing minimap geometry remains the current north-up district representation; `MAP-001` owns the full-world map.
- The developer debug panel intentionally remains outside this player-facing design system.

## Visual review record

The intentional baseline change establishes the first shared Ashfall HUD composition: the Help trigger occupies the first top-right row, player status stacks beneath it, navigation remains bottom-left, loadout remains bottom-center (bottom-right at narrow width), and interaction clears both lower zones. This placement keeps existing feature ownership intact while removing collisions that were visible in live gameplay.

Reviewed lab baselines in `e2e/ui-composition-lab.spec.ts-snapshots/`: `exploration-bright-desktop-darwin.png`, `combat-noisy-desktop-darwin.png`, `dialogue-dark-desktop-darwin.png`, `restoration-ultrawide-darwin.png`, `exploration-narrow-large-safe-darwin.png`, and `mission-unavailable-darwin.png`.

Reviewed console-clean live-game captures in `docs/screenshots/ui-system-001/`: `gameplay-bright-desktop.png`, `gameplay-dark-narrow.png`, and `gameplay-noisy-ultrawide.png`. The live review caught and removed a hidden-dialogue regression and a Help/player-status collision before baseline acceptance.

The first complete 67-test browser pass ran for 10.8 minutes: 58 passed, one performance benchmark remained intentionally skipped, and eight failed. Four failures exposed UI regressions that were corrected (modal stacking below debug tools, short-landscape dialogue height, removed narrow location, and the superseded expectation that navigation remains visible during dialogue). The other camera, roll/fire, and knife failures were timing-sensitive and passed unchanged on direct rerun. After correction, every affected owner passed in focused runs: combat 1/1, conversation 4/4, location 3/3, camera 2/2, equipment 5/5, minimap 2/2, weapon 2/2, and the final UI/navigation matrix 14/14.
