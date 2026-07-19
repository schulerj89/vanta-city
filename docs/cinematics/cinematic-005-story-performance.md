# CINEMATIC-005 — Ashfall opening story performance

Status: implemented and visually verified.

## Outcome

The Northbar opening is now a 46.9-second intentional story scene rather than
a sequence of loosely framed teleports. Rook, Mack, and Della are staged once
before camera ownership, remain grounded at authoritative collision-resolved
poses, face their scene partners through participant-owned performance, and are
required to pass live projection, safe-frame, and static-occlusion checks. A
shot may use one authored alternate camera; otherwise the opening blocks before
changing player state.

The scene preserves the canonical facts: Rook expected Orin and brought his
fee; Mack says Orin missed two nights; Della connects the traveler and service
wagon; Rook rejects the 6:10 and chooses Junction. The ticket-choice shot makes
no unsupported keys, duffel, handoff, or prop-contact claim. Only the landing
transaction publishes Orin/search/Marrow/arrival facts. A participant failure
still reaches the safe destination but publishes no story facts.

## Shot contract

| Shot                   | Duration | Required presentation                                      |
| ---------------------- | -------: | ---------------------------------------------------------- |
| Northbar establish     |     5.0s | Rook, Mack, and Della; no subtitle                         |
| Failed pickup two-shot |     5.3s | Rook and Mack; Orin/fee and two-nights facts               |
| Mack missing close     |     4.0s | Mack's restrained reaction                                 |
| Della close            |     4.6s | Della's readable reaction; no simulated paper action       |
| Della intercepts       |     4.3s | all three in one spatial cover                             |
| Rook decision close    |     4.8s | Rook reads the available choice                            |
| Ticket choice          |     4.5s | Rook indicates and says “Junction, then”; Mack witnesses   |
| Wagon entry exterior   |     4.4s | opaque exterior; no door, seat, or driving claim           |
| Wagon departure        |     5.2s | level-owned wagon path reaches the divider                 |
| Junction arrival       |     4.8s | post-readiness Rook composition; HUD/readiness copy hidden |

The wagon is original code-native level geometry moved only by a level-owned
path handle. Pause and skip confirmation freeze both cue time and path time.
Cancellation restores the active path and participant state. Completed source
shots retain their path endpoint so the second exterior cut continues without
a jump.

## Grounding, composition, and restoration

Northbar's roof and canopy remain visible environment geometry but are no
longer character-ground collision. This removes the prior highest-surface
misclassification that pushed Rook from authored marks to level boundaries.
Preflight resolves the real player capsule downward and blocks if any mark is
ungrounded or displaced more than 0.20m. Browser evidence resolved all three
participants by 0.01m on `c.northbar-platform`.

Required actors must remain outside the lower 34% subtitle reserve. Desktop
uses at least an 8% edge margin, portrait alternates place faces/actions in the
upper 66%, and ultrawide requires the central 70%. Camera collision uses the
same 0.34m padded sweep in composition preflight, preventing a mathematically
visible actor from passing when the runtime camera would be pushed into a
counter.

Normal completion and confirmed skip commit the landing transaction once after
destination readiness. The 4.8-second Junction shot begins only after the real
level/spawn/collision transition is ready. Cancel restores prior camera,
controls, pointer/focus, player pose, participant performance state, and active
level visuals. Repeated cancellation starts from the same grounded pose with no
retained cinematic ownership.

## Evidence

- [Baseline full-motion capture](../screenshots/cinematic-005/baseline-full-motion.webm)
- [Rebuilt full-motion capture](../screenshots/cinematic-005/after-full-motion.webm)
- [Baseline deterministic frames](../screenshots/cinematic-005/baseline/01-northbar-establish.png)
- [Rebuilt deterministic frames](../screenshots/cinematic-005/after/01-northbar-establish.png)
- [Desktop establishment](../screenshots/cinematic-005/shot-01.png)
- [Desktop Della close](../screenshots/cinematic-005/shot-04.png)
- [Desktop Junction arrival](../screenshots/cinematic-005/shot-10-junction-arrival.png)
- [Portrait two-shot](../screenshots/cinematic-005/responsive-narrow.png)
- [Ultrawide two-shot](../screenshots/cinematic-005/responsive-ultrawide.png)

The baseline full-motion run completed without runtime errors but exposed Rook
settling at boundary positions (`x=-24.38`, `z=18.38`, then `z=-18.38`) and
camera shots that omitted or severely cropped required actors. In the final
desktop run every required subject was reported unoccluded, above `screenY=.66`,
and at least 15.06% from an edge; all resolved blocking displacement was 0.01m.
Both full-motion runs made zero external requests and produced zero console,
page, runtime, or non-HEAD request failures. Expected local asset-probe HEAD
misses were excluded from request failure acceptance.

## Automated acceptance

`e2e/cinematic-005-story-performance.spec.ts` owns full shot progression,
grounding/composition diagnostics, once-only landing, participant failure with
no fact commit, cancel/repeat restoration, portrait, and ultrawide framing.
`tests/world/northbarCoachDepot.test.ts` settles the real capsule at every
blocking mark, while runtime-contract tests cover failed landing semantics.
