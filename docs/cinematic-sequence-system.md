# CINEMATIC-001 — cinematic sequence system

## Design brief: `cinematic.ash-001.opening`

- **Purpose and question.** Briefly establish that Rook is late, the Junction is watched, and Mack waits west at the garage. The scene answers “where am I going and why should I move carefully?” without advancing any mission objective.
- **Ownership and frequency.** `CinematicCoordinator` is the single sequence/progression owner. `GameStateMachine` remains global-state authority, `ThirdPersonCameraSystem` remains renderer-camera authority, `InputSystem` remains named-input authority, `MissionSystem` remains objective/event authority, and `ScreenSpaceLayoutSystem` remains screen-space placement authority. The opening runs once per mission content request; debug playback is development-only.
- **Hierarchy and limits.** One stable speaker label, one subtitle of at most two narrow lines, and a quiet skip hint occupy the shared `presentation` zone. Skip confirmation is the only interactive cinematic surface and occupies `modal`. No portrait, title card, voice-over, mission recap, branching choice, or persistent cinematic HUD is introduced.
- **Visual rationale.** The first three-quarter arrival frame isolates Rook against the north approach. The second frame looks into the exposed crossing. The third points west to Mack. Restrained dark edge masks improve bright/noisy readability without hiding the playable world; typography, copper/amber rules, focus rings, spacing, layers, and chamfers reuse Ashfall UI tokens.
- **States.** Idle, playing, game-paused, confirming skip, completed, skipped, cancelled, and failed. The first skip request freezes the exact shot clock and subtitle. Confirm uses normal cleanup with result `skipped`; cancel resumes the same clock without replaying entry events.
- **Input, focus, pointer, camera, restoration.** Escape requests skip; Enter confirms and Escape cancels only while the modal owns input. P pauses/resumes progression. Start captures player-control enablement, game state, focused element, pointer-lock relationship, and the camera system’s gameplay view. Every terminal path releases the active camera handle and restores those captured values. Camera anchors are immutable IDs/data; sequence and UI never write camera transforms.
- **Motion and reduced motion.** Camera interpolation remains the existing directed-camera policy and obeys the stored reduced-camera-motion preference. UI has no required animation; reduced motion removes transitions. Shot durations and subtitle windows remain deterministic.
- **Responsive and accessibility.** Desktop subtitles use a capped 42rem measure. Narrow view uses safe-area width and reserves two lines plus the speaker label. The modal has `role=dialog`, `aria-modal`, an accessible title, initial focus on “Keep watching,” visible focus, keyboard buttons, and non-color wording. Subtitle text is a polite live region.
- **Dependencies and assets.** Local production Ashfall Junction, authoritative Casual/Rook and Mack identities, and three authored `ash-001` camera anchors. There are no new runtime assets, URLs, animations, audio, fonts, icons, or licensing claims.

## Public contracts and tuning

`CinematicDefinition` contains serializable stable IDs, story/mission references, participant/speaker IDs, entry/completion event IDs, dependency declarations, restoration policy, ordered shot data, subtitle timing, safe-frame guidance, and transition intent. `CinematicCoordinator.getSnapshot()` and its typed events are the public observer surface. The development browser bridge exposes start/skip/cancel controls and the same snapshot; it does not expose private fields.

Configurable framing stays in authored level anchors. Shot duration, subtitle windows, transition intent/duration, minimum subject margin, and optional narrow FOV guidance stay in cinematic data. The first implementation records the latter two as review/debug intent; the camera anchor FOV remains authoritative at runtime.

## Screenshot matrix and acceptance

- 1280×720: arrival subtitle, watched-Junction subtitle, Mack-position subtitle, and keyboard-focused skip confirmation on the real daytime/noisy Junction.
- 390×844: representative subtitle and skip confirmation, including 125% interface text.
- Reduced motion: representative shot and confirmation with no required UI animation.
- Inspect console errors, page errors, failed requests, runtime error reporter, horizontal/vertical overflow, subtitle occlusion, safe-area collision, focus order, pointer ownership, and repeated playback.

Known limitation: the initial system uses authored static anchors rather than moving participant-relative rails. Participant availability is validated continuously, but participant animation blocking remains data intent because no cinematic animation owner is approved in this slice.

## Visual review record

Reviewed real-game captures:

- `docs/screenshots/cinematic-001/opening-arrival-1280x720.png`
- `docs/screenshots/cinematic-001/opening-junction-1280x720.png`
- `docs/screenshots/cinematic-001/opening-mack-1280x720.png`
- `docs/screenshots/cinematic-001/skip-confirmation-1280x720.png`
- `docs/screenshots/cinematic-001/opening-arrival-390x844-large-reduced.png`
- `docs/screenshots/cinematic-001/skip-confirmation-390x844-large-reduced.png`

The arrival keeps Rook full-body and visually separates the foreground player from Mack's west-side position. The exposed-crossing frame reads clearly over the bright, low-detail roadway, and the Mack frame retains the participant, garage edge, subtitle, and skip hint without obstruction. Desktop and narrow subtitles remain within the safe width with strong dark-edge contrast; 125% text wraps without clipping. The narrow confirmation retains both full button labels and a visible default focus ring. An initial review caught touching modal actions; the accepted captures include the corrected wrapped action row.

Manual browser inspection found zero console errors, page errors, non-probe failed requests, runtime error reports, or viewport overflow at either required viewport. Existing development-time optional-asset availability `HEAD` probes appear in Playwright request-failure events and were reviewed separately from runtime asset loads. Narrow overflow measured `0×0`; confirmation focus was `cinematic-skip-cancel`. No UI composition baseline changed.
