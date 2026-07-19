# CINEMATIC-004 + PRESENTATION-001 — authored boot-to-game flow

Status: approved implementation brief. This file records the story, shot,
presentation, ownership, accessibility, restoration, and acceptance decisions
that govern the implementation. Canon remains in
`narrative/ashfall-story-bible.json` and
`docs/cinematics/cinematic-002-northbar-arrival.md`.

## Purpose and player flow

The boot flow answers three questions in order: what is this place, has the
player deliberately begun, and why is Rook entering Ashfall Junction? An
accessible original Ashfall title screen yields only after Start/Continue is
activated. A truthful readiness presentation reports local asset, Northbar
level, character, and cinematic preflight status. The stable opening
`cinematic.ash-001.northbar-arrival` then stages the canonical 5:42 a.m.
Northbar Coach Depot arrival. Mack's service wagon supplies a visible spatial
exit and the real `LevelSystem.prepare/commit` boundary. All terminal routes
land once at `test-district` / `spawn.player-default`, facing south toward the
Junction mission handoff.

The previous `cinematic.ash-001.opening` remains a catalog alias only if legacy
mission/tests require it; new mission content requests the Northbar ID. No
runtime network asset, generated text image, voice-over, lip sync, or facial
animation is introduced.

## Authority and public sources

- `TitleScreen` owns only its DOM, Start/Continue focus, and Music control. It
  observes and updates the existing `AudioPreferenceStore`; it owns no second
  audio state and requests no playback node.
- `LoadingScreen` owns only startup/readiness DOM. `ThreeAssetLoader`, ordered
  runtime initialization, `LevelSystem` preparation, and cinematic preflight
  remain the truth. Indeterminate progress is shown when no measurable asset
  progress exists; elapsed status remains visible and fatal errors expose retry.
- `LevelSystem` and `LevelRegistry` own Northbar/Junction roots, initial sector
  readiness, collision commit, spawns, locations, and unload.
- `CinematicCoordinator` owns shot/cue progression and the one landing boundary.
  `ThirdPersonCameraSystem` remains the only camera-transform writer.
- Player/NPC performance owners own locomotion, facing, mixers, and actions.
  Definition data requests logical intents only. Required missing performance
  is a recoverable cinematic failure that still routes through canonical landing
  and is reported; verified neutral holds are used only where explicitly
  authored. Applause is never requested.
- The mission/fact owner commits the landing transaction exactly once. This
  implementation exposes stable effect/handoff IDs and does not duplicate or
  rewrite mission objective text, reward rules, or NPC identity.
- `ScreenSpaceLayoutSystem` owns the `presentation` and `modal` mounts and their
  safe-area/layer behavior.

## Story and spatial state changes

Entry facts match canon: Orin is missing, Rook has not accepted the search,
Marrow does not yet hold Rook's arrival time, and Rook has not arrived in the
playable Junction. The scene visibly changes participant and prop state:

1. Rook steps from the coach with the duffel and scans for the promised contact.
2. Mack turns from the pillar, approaches, and admits Orin missed two nights.
3. Della pauses her pencil, removes the manifest carbon, and records the wagon
   connection while Mack redirects her attention.
4. Rook sees the theft, checks the eastbound board, folds the unused ticket,
   lifts the duffel, and chooses: “Junction, then.”
5. Mack exposes the keys, opens the passenger route, and both move to the wagon.
6. The wagon leaves along the authored exit path and passes behind the concrete
   divider before real destination loading begins.
7. The Junction arrival restores Rook on foot and grounded at the canonical
   spawn while Mack continues toward the garage.

The landing transaction IDs are
`transaction.ash-001.northbar-arrival`, story effects
`story.ash-001.orin-missing-revealed`,
`story.ash-001.rook-chooses-junction`,
`story.ash-001.marrow-copies-arrival`, and
`story.ash-001.rook-arrives-junction`; mission handoffs are
`ash-001-arrival-prelude-complete` and `ash-001-check-signal-corner`.
Normal completion, confirmed skip, and recoverable performance failure use the
same landing path. Skip cancellation resumes the same shot time, subtitle cue,
and fired performance-cue set. Destination failure commits nothing and exposes
an accessible retry/failure state.

## Shot plan

All shots use Northbar's authored anchors, shared collision obstruction, stable
subtitle placement, and participant/prop-relative action requests. Holds exist
to read a decision or reaction, never to tour scenery.

| #   | Stable shot ID                        | Composition and event                                  | Required visible change                                                            |
| --- | ------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| 1   | `shot.ash-001.northbar-establish`     | Wide Bay Two arrival; coach motion settles behind Rook | Rook steps down, secures duffel, scans; Mack watches the clock; Della writes       |
| 2   | `shot.ash-001.failed-pickup-two-shot` | Rook/Mack moving two-shot                              | Mack turns and approaches; Rook fixes the eyeline and asks where Orin is           |
| 3   | `shot.ash-001.mack-missing-close`     | Justified medium close-up on Mack                      | Mack admits “Two nights”; shoulders hold the withheld cost, no celebratory gesture |
| 4   | `shot.ash-001.della-carbon-close`     | Prop-relative close-up at the counter                  | Pencil pauses, carbon separates from manifest, Della looks toward wagon plate      |
| 5   | `shot.ash-001.della-intercepts`       | Three-way cover                                        | Della needles Mack; Mack turns to her then checks Rook's reaction                  |
| 6   | `shot.ash-001.rook-decision-close`    | Justified Rook medium close-up                         | Eyeline moves board → carbon → Mack; reaction hold makes inference legible         |
| 7   | `shot.ash-001.ticket-choice`          | Ticket/keys/duffel insert flowing into two-shot        | Ticket folds, duffel lifts, keys expose; Rook says “Junction, then.”               |
| 8   | `shot.ash-001.wagon-departure`        | Participant/vehicle-relative departure track           | Both move to doors; wagon traverses authored exit lane behind divider              |
| 9   | `shot.ash-001.junction-arrival`       | Destination anchor after committed readiness           | Rook is grounded/on foot; wagon continues toward garage; gameplay route is named   |

Subtitle copy is the canonical nine-shot copy from CINEMATIC-002, kept concise,
speaker-labelled through existing metadata, and limited to two lines. No line
claims an action that is not visible.

## Title, music, and loading presentation

Feature IDs: `presentation.ashfall-title`, `control.music-muted`, and
`presentation.ashfall-loading`.

- Visual language: Atlantic neon-deco meets a weathered 1997 coach ticket and
  municipal departure board. Deep harbor ink, oxidized teal, sodium amber,
  cream paper, a narrow local/system display stack, offset rules, and subtle
  rain/scan texture are composed in CSS. There is no copied logo silhouette,
  postcard montage, pink/palm palette, franchise font, or external artwork.
- Hierarchy: ASHFALL wordmark and “The Cinder Ledger”; concise date/location
  line; primary Start/Continue; secondary Music mute; small keyboard hint.
- Start state: “Start” on first run and “Continue” when a local prior-start fact
  exists. The button is native, initially focused, activates by mouse, Enter,
  or Space, and focus returns to it if startup fails. Start is the deliberate
  user gesture that unlocks theme playback without blocking progression.
- Music state: one native toggle reads `AudioPreferenceStore.current.muted`,
  writes only `{ muted }`, subscribes to `changed`, updates pressed state and
  “Mute music” / “Unmute music” accessible label immediately, and disposes the
  subscription/listener. Existing master mute affects theme/radio by design; the
  label says Music because this boot surface is controlling the current theme,
  not because another channel truth exists.
- Loading state: title yields to the same presentation surface. Copy names the
  real phase and current logical local asset. Measured asset requests drive the
  progress value; level/collision/participant readiness is textual and
  indeterminate unless an authoritative count is available. The screen shows
  elapsed seconds after a bounded threshold so a hang is never hidden. Fatal
  state retains the underlying error and retry action.
- Motion: restrained rule sweep, rain drift, and button reveal only. Under
  reduced motion all nonessential animation is removed and transitions become
  immediate. No flicker or autoplay visual noise.

## Responsive and accessibility behavior

At 1280×720, title hierarchy occupies the left/lower-safe third while a CSS
depot-light composition breathes on the right. At 390×844, content becomes a
single safe-area column; controls remain at least 44px high and no essential
text overlays the subtitle reserve. Ultrawide uses capped measures. Enlarged
text wraps without clipping or fixed-height containers. Safe-area insets apply
on every edge.

The title is a labelled region with a real heading. Buttons use visible
`:focus-visible`, non-color text/state, native keyboard semantics, and no
positive tabindex. Loading uses polite status updates; fatal failure uses alert.
Skip confirmation retains initial focus on Keep watching and restores the exact
prior focus after cancel/terminal cleanup. All story information is available
as subtitles and visible actions; audio is optional.

## Failure, restoration, and disposal

- Preflight must resolve the source level, nine anchors, three participants,
  required performance intents, destination, and landing IDs before taking
  cinematic ownership. Missing required performance becomes a reported
  recoverable route only where the definition declares `land-at-destination`.
- No source fact/event is applied before the landing transaction. The transaction
  is idempotent across normal, skip, repeated callbacks, and retries.
- Every terminal path releases camera handles, performance handles/tokens,
  Northbar roots/props/vehicle presentation, title/loading roots, store/event
  subscriptions, DOM listeners, and audio nodes. Three title/start/travel/replay
  cycles must show stable root/listener/action/node counts.
- Destination restoration resets movement, places/grounds Rook at the canonical
  spawn and rotation, restores player control, camera relationship, pointer,
  focus, gameplay HUD, mission state, location, and minimap. It never restores a
  stale Northbar transform after the irreversible commit.

## Visual and behavioral acceptance

Capture and manually inspect title, Northbar establishment, moving two-shot,
Mack close-up, Della prop theft, Rook decision, ticket/keys action, wagon
departure/loading, and Junction arrival at 1280×720 and 390×844. Also capture
enlarged text and reduced motion. Inspect focus order, overflow, subtitle-safe
framing, bright/dark/noisy contrast, console/page errors, failed requests, and
all external requests (expected: zero).

Automated coverage owns mouse/keyboard Start, persisted immediate music mute,
truthful loading/failure, nine purposeful shots, exact skip-cancel cue resume,
once-only landing effects, destination failure, recoverable participant failure,
three replay/travel cycles, and legacy opening compatibility. Run narrative and
character validation, focused unit tests, format, lint, typecheck, production
bundle/size, cinematic/title/loading/audio browser specs, smoke, and the bounded
integration lane because the change crosses shared boot, level, cinematic,
audio, and presentation contracts.

## Known production limits

Northbar currently supplies production geometry, camera anchors, blocking marks,
paper/coach/wagon presentation, and licensed building textures. Character clip
inventories do not yet provide every literal door, ticket-fold, paper-separation,
or seated-with-duffel body action. Those beats may use owner-controlled prop/root
motion plus verified locomotion/facing/neutral holds; they must be labelled in
runtime snapshots and documentation as procedural staging, never as facial
animation, lip sync, or an unavailable clip. A missing body performance may not
fall back to applause, combat, random clips, or an unverified placeholder.
