# NPC-PERFORMANCE-002 — cinematic participant performance contract

## Purpose

The next story cinematic needs deliberate performances without giving the
cinematic system ownership of character mixers, simulation transforms, or private
animation actions. This document defines the public seam to implement after the
asset and story beats are approved. It is a preproduction contract, not a runtime
implementation.

The contract addresses four verified gaps:

- the current logical `gesture` can resolve to applause;
- cinematic data has no participant-performance dependencies or cues;
- participant owners cannot capture and restore animation/facing state; and
- browser acceptance cannot observe performance state through a stable public
  snapshot.

The asset findings and exact evidence are in
`docs/animation/npc-performance-002-readiness-audit.md`.

## Boundaries and owners

| Concern                                     | Authoritative owner                             | Cinematic access                                            |
| ------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| Loaded model, mixer, actions, action graph  | Existing `CharacterPlayerVisual` or `NpcEntity` | Public performance-owner requests only                      |
| NPC world position, collision, mark arrival | Existing/future movement and blocking owner     | Public mark/movement request; never an animation-root write |
| Player movement                             | Existing player movement/controller systems     | Existing cinematic coordination seam                        |
| Body facing and optional look target        | Participant owner                               | Logical target request and opaque restore token             |
| Camera anchors and camera motion            | Cinematic camera coordinator                    | Existing stable participant/anchor IDs                      |
| Cue order, required participants, timing    | Cinematic definition/coordinator                | Stable IDs and logical intents only                         |
| Model root, mixer, `AnimationAction`, bones | Participant owner internals                     | Never exposed in cinematic definitions or tests             |

One participant has one mixer owner. Implementing this contract must not create a
second mixer, clone an action graph, translate a model root, or reach through an
owner to mutate private Three.js state.

## Stable performance vocabulary

Definitions request logical intent rather than source clip names. The initial
vocabulary should be deliberately small:

```ts
type CinematicPerformanceIntent =
  | 'neutral-hold'
  | 'approach'
  | 'turn-to'
  | 'listen'
  | 'speak-restrained'
  | 'speak-emphatic'
  | 'indicate'
  | 'dismiss'
  | 'react-alert'
  | 'sit'
  | 'seated-hold'
  | 'stand'
  | 'prop-use';
```

These are meanings, not aliases for animation packs. For example, applause may be
mapped only by an explicit future `applaud` intent; it may never satisfy `listen`,
`speak-*`, `neutral-hold`, or a missing intent.

Each participant type supplies a validated profile owned beside its character/NPC
definition:

```ts
interface CharacterPerformanceProfile {
  readonly profileId: string;
  readonly characterId: string;
  readonly intents: Partial<
    Record<CinematicPerformanceIntent, CharacterPerformanceBinding>
  >;
}

interface CharacterPerformanceBinding {
  readonly animationId: string;
  readonly playback: 'loop' | 'one-shot' | 'transition-with-hold';
  readonly startAtNormalizedTime?: number;
  readonly holdAtNormalizedTime?: number;
  readonly releaseAnimationId?: string;
  readonly requiresMovementOwner?: boolean;
  readonly requiresPropMarkId?: string;
}
```

`animationId` is a validated logical animation name from the character definition,
not a raw GLB clip string. A profile validator resolves the logical name, checks
the source clip, validates the declared playback shape, and rejects incompatible
movement or prop requirements before the profile enters production data.

## Definition-level cue model

A cinematic sequence declares performance requirements alongside participant and
camera dependencies:

```ts
interface CinematicPerformanceDependency {
  readonly participantId: string;
  readonly profileId: string;
  readonly requiredIntents: readonly CinematicPerformanceIntent[];
}

interface CinematicPerformanceCue {
  readonly cueId: string;
  readonly shotId: string;
  readonly atSeconds: number;
  readonly participantId: string;
  readonly intent: CinematicPerformanceIntent;
  readonly phase: 'start' | 'hold' | 'release';
  readonly targetParticipantId?: string;
  readonly targetMarkId?: string;
  readonly propMarkId?: string;
  readonly allowNeutralFallback?: boolean;
  readonly required?: boolean;
}
```

Rules:

1. `cueId`, participant, target, mark, profile, animation, and shot references are
   stable IDs and validate before playback.
2. `required` defaults to true for story action. A required cue with no exact
   binding blocks cinematic entry before camera motion.
3. `allowNeutralFallback` defaults to false. When true, it permits only the
   participant profile's verified `neutral-hold`, never an arbitrary action.
4. `approach` requires a movement owner and target mark. The performance owner may
   mirror locomotion after movement begins, but world translation and arrival are
   reported by the movement owner.
5. `sit`, `seated-hold`, `stand`, and `prop-use` require authored marks and any
   required prop. A source clip alone is not sufficient.
6. `hold` is an explicit authored phase, not an instruction to freeze whatever
   frame happens to be playing.

## Public participant owner seam

`CharacterPlayerVisual` and `NpcEntity` should implement a common public adapter.
The exact class organization may differ, but behavior and observable state must
match this surface:

```ts
interface CinematicPerformanceOwner {
  readonly participantId: string;

  preflightPerformance(
    request: CinematicPerformanceRequest,
  ): CinematicPerformancePreflight;

  capturePerformanceState(): CinematicPerformanceRestoreToken;
  startPerformance(request: CinematicPerformanceRequest): void;
  holdPerformance(requestId: string): void;
  releasePerformance(requestId: string, reason: PerformanceReleaseReason): void;
  restorePerformance(token: CinematicPerformanceRestoreToken): void;

  getPerformanceSnapshot(): CinematicPerformanceSnapshot;
}
```

The restore token is opaque outside the owner. Internally, it must preserve enough
state to restore the exact pre-cinematic behavior, including:

- logical animation and action-graph state;
- clip/action phase or normalized time where continuity matters;
- loop mode, time scale, paused state, and one-shot/action lock;
- body-facing target, current yaw, and visual-root correction;
- look target if that owner supports one; and
- any request/listener generation used to ignore stale callbacks.

Restoration must not expose raw `AnimationAction`, mixer, model, bone, or scene
references in a token, snapshot, event, or cinematic definition.

## Lifecycle

### Entry transaction

Before the first camera request:

1. Resolve all performance dependencies and participant owners.
2. Preflight every required cue and movement/prop dependency.
3. Fail with a stable reason when a mandatory intent, mark, prop, or owner is
   missing. No participant or camera state changes in this case.
4. Capture one opaque restore token per participant.
5. Start entry cues in deterministic participant/cue order.
6. If any start fails, release started requests, restore every captured token in
   reverse order, and report the original failure plus rollback result.

This transaction joins the existing camera/input/gameplay entry transaction; it
does not replace it.

### Start, hold, and release

- `start` resolves one reviewed binding and assigns a monotonically increasing
  request generation.
- A looping performance continues until an explicit hold/release or sequence exit.
- A one-shot releases from the mixer's public completion signal. A duration guard
  may recover from a missing completion event, but is not the primary authority.
- A transition-with-hold reaches its reviewed hold window, stays there without
  accumulating mixer time, and leaves through its explicit release binding.
- Stale completion callbacks from an earlier request generation are ignored.
- Release is idempotent. Releasing an already released or superseded request does
  not restart idle, emit duplicate events, or alter a newer request.

### Skip, cancellation, normal completion, and failure

Skip-pending may pause sequence time and performance progression, but it must not
replay a cue or overwrite the captured pre-cinematic phase. Canceling skip resumes
the same cue/request generation at the same phase. Confirming skip, normal
completion, runtime failure, participant removal, and disposal all take the same
release-and-restore path.

Restore every participant before returning gameplay/input ownership. If a
participant no longer exists, restoration records a stable `participant-missing`
result while all remaining participants and global owners still restore. Cleanup
is idempotent so an error followed by disposal cannot double-release listeners or
actions.

## Deterministic missing-performance policy

Resolution has exactly four outcomes, in this order:

1. Exact verified binding for the requested intent.
2. Verified `neutral-hold` only when the cue explicitly allows it.
3. Public facing/look behavior without a gesture, only when neutral fallback was
   accepted and the owner supports those capabilities.
4. `missing-performance` preflight failure.

There is no implicit gesture, random variation, nearest clip, first available
one-shot, pack-wide lookup, combat fallback, or applause fallback. Mandatory story
action blocks rather than silently becoming semantically false.

## Observable snapshot and events

The public snapshot exposes logic, not Three.js objects:

```ts
interface CinematicPerformanceSnapshot {
  readonly participantId: string;
  readonly state:
    'gameplay' | 'starting' | 'performing' | 'holding' | 'restoring';
  readonly requestId: string | null;
  readonly cueId: string | null;
  readonly shotId: string | null;
  readonly requestedIntent: CinematicPerformanceIntent | null;
  readonly resolvedAnimationId: string | null;
  readonly resolution: 'exact' | 'neutral-fallback' | null;
  readonly phase: 'start' | 'hold' | 'release' | null;
  readonly generation: number;
  readonly targetParticipantId: string | null;
  readonly targetMarkId: string | null;
  readonly releaseReason: PerformanceReleaseReason | null;
  readonly restoreGeneration: number;
}
```

Events use stable sequence numbers and include `performance:started`,
`performance:held`, `performance:released`, `performance:failed`, and
`performance:restored`. Tests and the browser bridge consume only these events and
the snapshot. They do not inspect clips, roots, mixers, bones, or private actions.

## Required tests before production integration

### Definition and profile tests

- Every profile ID, character ID, logical animation, cue, participant, target,
  mark, and prop reference resolves.
- Required intents fail preflight before camera entry when absent.
- Neutral fallback works only when explicitly enabled.
- `gesture`, applause, combat, jump, death, and sword actions never satisfy an
  unrelated cinematic intent.
- Locomotion and prop-required bindings fail when their external owner/mark is
  absent.
- Source clip duration, loop/one-shot classification, and hold windows agree with
  the deterministic asset inventory.

### Participant-owner unit tests

- Start, hold, release, and restore produce the expected snapshot/event sequence.
- Existing mixer and action-owner counts do not change after adapter creation.
- Exact gameplay idle/locomotion phase, one-shot lock, time scale, and facing are
  restored from an opaque token.
- One-shot completion is driven by the mixer completion signal with a tested
  duration guard.
- Superseded/stale completion callbacks cannot release a newer request.
- Release, restore, participant removal, and disposal are idempotent.
- Three consecutive play/skip/cancel/fail cycles add no actions, mixers,
  completion listeners, event listeners, or loaded roots.
- Movement remains authoritative for world translation while approach animation
  only mirrors movement state.

### Coordinator tests

- All mandatory performance cues preflight before the first camera request.
- A partial start failure rolls back participant state and existing camera/input
  ownership deterministically.
- Skip-pending pauses without replay; cancel resumes the same generation and
  phase; confirmed skip restores exact pre-cinematic state.
- Normal completion, thrown cue callback, participant removal, camera failure,
  and coordinator disposal share the same cleanup path.
- Restoration order and resulting error reasons are deterministic.

### Browser and visual acceptance

- Add public browser commands to start/hold/release a cue and read the public
  performance snapshot. Do not expose Three.js internals.
- Assert participant intent, resolved logical animation, facing target, request
  generation, action-owner count, and restore generation before/during/after the
  cinematic.
- Run normal completion, skip cancel, confirmed skip, forced asset failure, and
  immediate re-entry at least three times without console/page/runtime request
  errors or count growth.
- Capture close-up evidence for every focal start/hold/release phase and a wider
  hand/prop shot. Acceptance fails when a neutral/listen/speak cue resolves to
  applause or when facing changes discontinuously at entry.
- Verify no hand/face, hand/prop, shoulder/torso, body/chair, wardrobe/chair, or
  subtitle-safe-area collision in authored camera views.

## Implementation dependency split

1. **Freeze vocabulary and cue semantics.** Story/cinematic direction names each
   required intent, target, mark, prop, and fallback policy. This document is the
   starting contract.
2. **Acquire and promote assets.** Select only license-compliant local assets,
   record provenance, run the deterministic inventory, validate transforms, and
   approve close-up/prop evidence. This blocks mappings for missing focal acting.
3. **Add profiles and validators.** Map verified logical animation IDs to the
   frozen vocabulary. This can begin for Rook and current neutral/locomotion clips;
   it must not invent mappings for missing speaking/listening performances.
4. **Implement owner adapters and restoration.** Add the common public seam inside
   existing mixer owners, including exact tokens, completion handling, snapshots,
   and leak tests. This can proceed against current assets in parallel with new
   location construction.
5. **Extend the development lab.** Drive public intent requests, show snapshot
   state, test lifecycle/re-entry, and capture focal performance evidence.
6. **Integrate the cinematic only after its location, participants, marks, props,
   camera requests, and story beats are stable.** The coordinator consumes the
   public owner and movement seams; it does not absorb their responsibilities.

The new location/world build and camera plan may proceed independently through
their own contracts. Final cinematic integration depends on those deliverables,
the approved focal asset set, the participant performance owner, and the browser
acceptance seam.

## Decisions carried forward

1. Stable intent IDs are the authoring surface; source clips remain asset data.
2. Existing participant mixers remain authoritative and singular.
3. Movement owns translation; performance owns presentation.
4. Preflight and restoration are transactional and occur outside camera prose.
5. Neutral fallback is explicit; semantically false animation is a hard failure.
6. Current static-face assets use brief medium close-ups. Sustained focal close-up
   requires new reviewed facial/performance support.
7. Facing-axis correction must be resolved before participant-relative camera
   composition is accepted.
