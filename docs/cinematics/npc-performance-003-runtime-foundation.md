# NPC-PERFORMANCE-003 — runtime foundation and facing correction

## Outcome

`CinematicPerformanceController` is the one public, clip-agnostic performance
authority composed inside `CharacterPlayerVisual` and `NpcEntity`. Each owner
continues to construct and dispose exactly one `AnimationMixer`; the controller
receives logical callbacks and never owns or exposes a mixer, action, model root,
bone, or camera.

The initial verified profiles intentionally remain small:

| Character family               | Verified exact intents                                          | Explicit fallback           |
| ------------------------------ | --------------------------------------------------------------- | --------------------------- |
| Rook / playable Ultimate Men   | `neutral-hold`, `indicate` (`interact`), `acknowledge` (`wave`) | neutral only when requested |
| Mack, Nox, Raze / Animated Men | `neutral-hold`, `applaud`                                       | neutral only when requested |
| Animated Women pedestrians     | `neutral-hold`, `applaud`                                       | background neutral only     |

Speak, listen, dismiss, reaction, sit/stand, prop, and movement-dependent acting
remain missing unless a future verified profile maps them. A mandatory request
returns `missing-performance`; an authored request with
`allowNeutralFallback: true` may resolve only to `neutral-hold`. No lookup uses
the closest clip, a generic gesture, combat, or applause.

## Ownership and lifecycle

- `preflightPerformance` resolves the exact binding, explicit neutral fallback,
  movement-owner requirement, and active priority before mutation.
- `capturePerformanceState` returns an opaque participant/token ID while the
  owner retains animation phase, action lock, facing, and presentation state.
- `startPerformance`, `holdPerformance`, and `releasePerformance` publish stable
  logical snapshots/events with monotonically increasing generations.
- acting outranks movement and ambient requests; lower-priority work cannot
  interrupt an active acting request.
- `restorePerformance` returns the owner to its captured movement/action phase
  and facing. NPC restoration also restores the exact smoothed body yaw and any
  active-action time. Player restoration rebuilds the existing graph and restores
  locomotion/action times on its existing mixer.
- one-shot completion uses the existing mixer's `finished` event; the bounded
  duration guard remains recovery only. Release, restoration, and disposal are
  idempotent, and stale request IDs cannot release newer work.
- public browser snapshots include logical state, intent, resolution, generation,
  target IDs, release reason, restoration generation, and owner counts. They
  contain no Three.js references.

## Facing decision

The audited Animated Men/Women files already show their face toward local `+Z`
before the old definition correction. Removing the extra π model-root rotation
makes public `NpcEntity.getWorldPose().forward`, rendered body forward, Character
Lab front view, conversation facing, and cinematic facing agree continuously.
`NpcEntity` now smooths one entity-root target selected in priority order:
cinematic facing, active conversation facing, then authored idle/ambient facing.
The visual alignment root never flips at state boundaries.

## Lab design brief and visual acceptance

Purpose: answer “which reviewed cinematic meanings can this loaded character
actually perform?” without competing with animation, grounding, and equipment
controls. The existing diagnostics region gains two steady text rows—profile ID
and verified intents—sourced from the public registry. It adds no input, focus,
motion, breakpoint, color, token, or screen-space ownership. Long intent lists
wrap under the existing diagnostics behavior at desktop and narrow widths.

Visual acceptance uses real production GLBs in full-body front and medium
close-up views. Rook must keep `Interact` and `Wave` readable. Mack, Nox, and Raze
must keep a stable neutral silhouette with no entry flip or animation pop.
Pedestrians remain background performers. Console, page error, failed local asset,
and external request inspection remain required.

The reviewed 1280×720 capture set and hashes are recorded in
`docs/screenshots/npc-performance-003/capture-report.json`. It contains Rook's
full-body Interact and medium close-up Wave plus full-body and medium close-up
neutral poses for Mack, Nox, and Raze. The accepted capture recorded zero console
errors, page errors, runtime request failures, or external requests. The four
failed local HEAD requests are the lab's expected availability probes; all GLB
GET requests completed locally.

## Known limits

- Current assets expose no facial morphs, facial bones, eye aim, or lip sync. The
  controller makes no such claim and offers no procedural head/look port yet.
- Current NPC profiles do not map locomotion because no NPC movement owner exists.
- This foundation does not add Northbar assets, marks, props, shot definitions,
  or cinematic cue data. The cinematic coordinator can consume the public owner
  seam only after those production dependencies are available.
