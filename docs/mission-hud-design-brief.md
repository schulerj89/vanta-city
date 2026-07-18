# Mission HUD design brief

## `ashfall-mission-hud-v1`

- Player purpose: answer “what am I doing now, where is it, and did it change?” within a glance while moving through Ashfall Junction.
- Frequency and urgency: the current objective is persistent only during an active attempt; updates are short, bounded announcements; one relevant world marker may appear during exploration. Mission presentation never changes game state, input, focus, pointer lock, camera ownership, or map rendering.
- Hierarchy and limits: show mission title as a small kicker, one current objective sentence as the dominant line, and compact progress (`2 / 5`) as metadata. Notifications contain one state label and one sentence. The world marker contains the objective label only. No prose recap, reward ledger, or stacked objective list is persistent.
- Authority: `MissionSystem.getSnapshot()` and mission events are the only mission-state sources. Authored level entries resolve stable highlight references. DOM state is never read back as mission truth.
- Zones: persistent card in `objectives`; transient updates in `notifications`; projected active target in `world-indicator`. MAP-001 alone will render `map` channel highlights.
- Tokens: reuse `--ash-panel`, `--ash-rule`, `--ash-copper`, `--ash-amber`, `--ash-ink`, muted ink, shared display/data fonts, chamfer, safe-area variables, HUD/notification layers, and shared motion durations. Add no font, icon asset, color system, global breakpoint, or independent z-index.
- States: hidden/available, mission started, objective active, objective completed, completion, cancellation, failed, retry-ready, paused, dialogue-suppressed world marker, and disposal/restoration. The objective card remains readable during pause but follows the shared layout's dialogue/cinematic visibility rules.
- Motion: a restrained opacity/vertical reveal for notifications and marker state changes. Under reduced motion, presentation changes instantly; no pulse, counter animation, or camera movement is required.
- Responsive behavior: desktop caps the objective card near 25 rem; narrow uses the safe width and no more than three short text lines; ultrawide remains anchored to the shared top-left objective zone rather than drifting outward. Enlarged text wraps without clipping or horizontal scroll. The center notification cannot collide with player status; the world marker clamps inside safe edges and hides when the target is behind the camera or occluded.
- Accessibility: objective card is a named region; transient changes use a polite live status except failure, which uses an assertive alert; progress and state are textual, not color-only. World-marker text is hidden from assistive technology because the persistent objective states the same instruction. No interactive controls or focus stops are introduced.
- Production dependencies: existing HTML/CSS typography only; no new icons or art. World marker resolution uses authored entries. Full-map display remains explicitly owned by MAP-001.

## Screenshot acceptance

- Live gameplay at 1280×720, 390×844, and 1920×800 with the canonical active mission on real bright/noisy Ashfall backgrounds.
- Composition lab mission-update state at desktop, narrow enlarged-text/reduced-motion/safe-area, and ultrawide.
- No viewport overflow, HUD-region collisions, clipped text, console errors, focus changes, or duplicate presentation after disposal/re-entry.
- Active objective, completed update, failed/retry-ready, and restored/hidden states must be deterministic through public fixtures or debug commands.
