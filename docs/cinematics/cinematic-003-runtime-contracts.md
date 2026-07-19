# CINEMATIC-003 — generic runtime contracts

Status: implementation brief for the reusable runtime seam. This slice does not
author the Northbar level, production performances, destination integration, or
location-dependent shot data.

## Purpose and authority

The cinematic coordinator must be able to express the approved Northbar arrival
without taking ownership away from the systems that animate participants, load
levels, place actors, commit mission state, render dialogue, or write camera
transforms. A definition remains serializable data. Runtime work crosses system
boundaries only through injected public adapters and opaque handles.

`CinematicCoordinator` owns deterministic shot/cue progression and the landing
orchestration. `ThirdPersonCameraSystem` remains the only camera-transform owner.
The participant adapter remains the sole mixer/facing owner. The destination
adapter remains the travel/readiness owner. The landing adapter remains the
story-fact and mission-objective authority. `CinematicPresentationSystem` remains
the one cinematic subtitle and skip-confirmation presenter in the shared
`presentation` and `modal` zones.

## Definition and public snapshot

- A shot exposes ordered `subtitleCues`; the legacy singular `subtitle` remains
  accepted and is normalized to one cue. At most one cue may be active at a time,
  avoiding a second dialogue/subtitle authority.
- Shot-specific performance cues use stable IDs, logical intent, phase, targets,
  and an explicit missing-performance policy. The only fallback expressible by
  data is a verified neutral fallback; applause, combat, random, or nearest-clip
  fallback is not part of the contract.
- Destination cinematics declare a destination request and a landing transaction
  containing stable story-effect and mission-handoff IDs. Definitions contain no
  loaded levels, actors, mixers, DOM nodes, or mission internals.
- The public snapshot adds phase, active subtitle cue ID, active performance cue
  IDs, landing result, destination readiness, and committed transaction ID. It
  exposes no private owner state.

## Lifecycle and transaction decisions

Preflight runs before control, pointer, game state, camera, performance, travel,
or mission state changes. It resolves every camera anchor, participant, required
performance cue, destination request, and landing transaction. A blocker returns
a stable failed snapshot and makes no camera or performance request.

On shot entry the coordinator requests the camera once and starts all due
zero-time performance cues in authored order. Timed cues fire exactly once when
their timestamp is crossed. Pause and skip confirmation freeze shot, subtitle,
performance, and destination clocks. Participant handles receive pause/resume;
skip cancel resumes the same handles and cue generations without replay.

Normal completion, confirmed skip, and a definition-authorized recoverable
participant failure all call the same `beginLanding(result)` boundary. That
boundary releases shot camera/performance ownership, requests real destination
travel/readiness once, waits on its public snapshot, then commits one landing
transaction once. Only a ready destination can commit facts/objectives.
Skip-request cancellation never enters landing and therefore never commits.
Travel failure exits as failed without committing. After commit, cleanup restores
global ownership for the destination state and emits the definition completion
event.

Legacy `exact-prior-gameplay` scenes keep their existing immediate completion and
restoration behavior. Destination scenes use `authoritative-destination`; once
landing begins, ordinary cancellation is rejected so an irreversible boundary
cannot leave a mixed source/destination state.

## Player-facing presentation

- **Purpose and hierarchy:** subtitles answer who is speaking and what was said;
  the quiet skip hint remains tertiary. Skip confirmation is the only modal.
- **Zones and tokens:** reuse the existing `presentation` and `modal` mounts,
  typography, copper/amber rules, focus rings, safe-area spacing, and layers. No
  shared HUD styles or new visual tokens are introduced.
- **States:** playing, game-paused, confirming skip, destination-loading,
  completed, skipped, cancelled, recoverable failure, and unrecoverable failure.
  This slice adds runtime loading state to the snapshot but intentionally adds no
  location-specific loading artwork or copy.
- **Responsive behavior:** the existing capped subtitle measure and narrow safe
  width continue to host one cue at a time. Cue changes do not move the region.
- **Accessibility:** each cue updates the existing polite live region once. The
  skip dialog retains named controls, initial focus on “Keep watching,” visible
  focus, keyboard ownership, non-color wording, safe wrapping, and exact focus
  restoration. Reduced motion changes camera/scene implementation through owners;
  cue timing remains deterministic.
- **Content limits:** one speaker label, one subtitle cue, and two subtitle lines
  at a time. No voice-over, portrait, title card, mission recap, or branching UI.

Because the DOM, CSS, copy, and layout do not change in this generic slice, no
new visual baseline is expected. Existing desktop 1280×720, narrow 390×844 with
enlarged text, and reduced-motion cinematic browser coverage remains the visual
acceptance surface. A future location integration must add real-background
screenshots for destination loading/failure and every Northbar composition family.

## Acceptance and integration boundaries

- Deterministic multiple-cue scheduling, pause/resume, skip cancel, and confirmed
  skip are unit-tested through public snapshots.
- Performance preflight blocks before camera entry; shot requests are ordered,
  pausable, idempotently released, and never infer clapping.
- Landing facts/objectives commit once only after destination readiness, for
  normal, skipped, and recoverable-failure routes; canceled skip and readiness
  failure commit nothing.
- Camera, performance, input, pointer, focus, controls, and game state restore on
  every reversible exit. Repeated runs and disposal leave no active handles or
  listener growth.
- The existing opening definition and browser flow remain source-compatible.
- Northbar geometry, LevelSystem/registry changes, NPC mixer/controller work,
  mission definitions, world/map/streaming, assets/audio, final coordinates, and
  shared HUD styling remain explicitly out of scope.
