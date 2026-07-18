# Firearm locomotion and action layering

## Policy

`CharacterLocomotionPolicy` is the single game-facing decision point for base
locomotion, weapon stance, and action layering. Casual and Punk use the same
reviewed Ultimate Modular Men source clips:

| Situation                                 | Base                              | Overlay                                 | Reason                                                                    |
| ----------------------------------------- | --------------------------------- | --------------------------------------- | ------------------------------------------------------------------------- |
| Handgun idle                              | lower-body `Idle_Gun` (`gunIdle`) | upper-body `Idle_Gun`                   | Reconstructs the authored firearm idle through stable layers              |
| Handgun walk                              | lower-body normal `Walk` (`walk`) | upper-body `Idle_Gun`                   | No reviewed gun-walk clip; retains the natural walk gait and firearm pose |
| Handgun run                               | lower-body `Run_Shoot` (`gunRun`) | upper-body `Idle_Gun`                   | Reviewed firearm run gait plus a stable ready pose                        |
| Fire while idle/walking/running           | current base, never restarted     | upper-body `Idle_Gun_Shoot` (`gunFire`) | Preserves foot phase and turning while recoil plays                       |
| Roll, melee, interaction, reaction, death | none during the action            | full-body one-shot                      | Existing action lock remains authoritative                                |

The upper-body filter includes torso, chest, neck, head, shoulder, arm, wrist,
palm, and finger tracks. It deliberately excludes `Body`, leg, foot, and IK
target tracks. The authored `Idle_Gun_Shoot` contains leg keys; filtering them
is what prevents a moving shot from freezing the gait. `Run_Left` and
`Run_Right` remain raw lab-only clips and are not logical gameplay mappings.

Mixer transitions use `0.2s` locomotion/stance cross-fades, short action
admission fades, and gait-phase transfer when changing locomotion clips. The
movement state uses separate start/stop and run-entry/run-exit thresholds, so
small speed changes around a boundary do not repeatedly restart a clip.
Heading remains the critically damped authoritative simulation heading; clip
selection never depends on left/right turning and therefore does not restart
while the player circles or reverses direction.

## Public contract

`PlayerControllerSystem.getLocomotionSnapshot()` is the integration surface for
weapon presentation. It reports movement and horizontal speed, desired/current
facing and turning state, run mode, equipped item, firearm state
(`holstered | ready | firing`), action lock, and the visual animation projection.
The visual projection reports base clip, stance overlay, active action/layer,
and a locomotion transition sequence. Existing action start/impact/completion
events and `useEquippedItem()` remain the cadence/lock hooks; weapon code does
not need to inspect mixer actions or adapt debug state.

Quickbar changes are rejected while an action or held-fire sequence owns the
lock. Entering pause, dialogue, or another non-playing state cancels transient
presentation actions, held fire, and roll translation together. Death and reset
use the same cleanup boundaries. Equipment presentation remains socket-owned
and never writes the simulation transform.

## Root motion and validation

`CharacterLoader` still strips scene-root position tracks from every logical
and authored clip. `CharacterPlayerVisual` additionally restores the definition
root offset after every mixer update. The controller/collision simulation is
the only source of player translation.

The Character/Animation Lab is used to inspect `Idle_Gun`,
`Idle_Gun_Shoot`, `Run_Shoot`, and normal `Walk` on both playable rigs. The live
debug-world browser coverage walks, runs, turns continuously with camera orbit,
holds fire through multiple cadence admissions, changes direction, starts and
stops, and verifies that the locomotion transition sequence does not change for
a shot. Captures are attached for each rig's walk-fire and circular run-fire
states; runtime errors and grounding remain deterministic assertions.

Known limitation: the source pack has no reviewed strafe/backpedal firearm
clips and no standalone additive recoil clip. Movement therefore uses the
forward Walk/`Run_Shoot` gait while authoritative facing follows travel
direction; the filtered upper-body shooting clip is an absolute overlay rather
than an authored additive animation. A future clip replacement must retain the
logical names and upper-body/root-motion contracts.
