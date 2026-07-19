# Campaign save and respawn

`CampaignSaveSystem` is the single authority for campaign persistence. Runtime
systems continue to own mission state, facts, money, equipment, ammunition,
health, player pose, and level loading; the save system only validates,
coordinates restore order, snapshots their public state, and writes one record.

## Storage and schema

- Campaign key: `vanta-city:campaign-save`
- Title first-run marker reset alongside it: `vanta-city:title-started`
- Current schema version: `1`

Version 1 stores a save timestamp; the complete `MissionPersistenceSnapshot`
(including persistent facts and reward-granted guards); money balance; equipment
owned/equipped IDs and ammunition counts; positive player health, position and
facing; and level ID, last resolved spawn ID, home-unlocked state, and respawn
preference. Values are plain data. Three.js objects, DOM nodes, event buses,
camera/input ownership, dialogue, cinematics, and other transient state are not
serialized.

Parsing validates the entire record against registered missions, objective
counts, equipment definitions and ammunition capacities, registered levels,
money/health limits, finite bounded transforms, and cross-field ownership and
active-mission invariants. Malformed JSON, partial records, unknown levels, and
unsupported versions produce a deterministic fresh-game fallback without
mutating live systems. Version 1 has no predecessor to migrate. Future versions
must add an explicit whole-record migration before increasing the exported
schema version; unknown versions are never partially interpreted.

Mission progress is matched by stable mission ID rather than array position or
definition count. A version 1 save may omit missions appended in a later build;
those missions retain their authored initial state. Duplicate saved IDs,
unknown IDs, changed objective topology, and inconsistent active-mission data
are rejected as tampered or incompatible.

Storage access is defensive. Unavailable/private storage, quota failures, and
remove failures are reported through `getStatus()` and cannot crash boot.
Snapshots returned by the authority are deeply immutable.

## Boot and lifecycle

The save is read before choosing the initial level, player pose, balance, or
loadout. After all owners are constructed, `restoreBeforeInit()` imports mission,
money, equipment, and health state before `GameRuntime.init()`. Mission restore
therefore precedes reward and content listeners. Save listeners attach only
after every runtime system has initialized, preventing restore/init side effects
from producing writes or replaying rewards.

Initial sector selection uses the restored player pose, so its nearby geometry
and colliders are resident before the player controller settles there. Authored
level transitions still stage around their requested/default spawn.

The Northbar opening is gated by the mission-owned
`rook-arrived-in-ashfall` fact committed by the canonical arrival landing
transaction. Merely having a save is not story progress: a save taken during the
opening safely replays it, while a save after the landing checkpoint cannot
replay it.

Meaningful authoritative events request a save: mission revision changes, money
transactions, equipment ownership/equip/ammunition changes, living health
changes, level loads, and resolved respawns. Requests within one task are
coalesced into one zero-delay write. There is no frame polling. Disposal removes
all listeners and cancels the pending timer. Page hide, document visibility
loss, and disposal synchronously flush a final snapshot so the latest pose is
not lost between meaningful events.

Public APIs are `hasSave()`, `getStatus()`, immutable `getSnapshot()`,
`restoreBeforeInit()`, `attach()`, `requestSave()`, `saveNow()`, `reset()`,
`recordRespawn()`, `setHomeUnlocked()`, `setRespawnPreference()`, and
`resolveRespawn()`. Development E2E can inspect the snapshot/status and invoke
`campaignSaveNow()` or `campaignReset()` through `window.__VANTA_TEST__`.

## Reset and new game

`reset()` removes only the two keys listed above and is idempotent. It never calls
`Storage.clear()`, so audio, accessibility, camera, character, and other user
preferences remain intact. UI confirmation and reset presentation belong to
UI-SAVE-001.

The production player is constructed with an empty owned-equipment list. The
handgun and knife definitions remain registered, allowing the quickbar to project
locked slots. `HandgunPurchase` and mission rewards remain the acquisition
authorities. Persistence-only money/equipment import methods validate data and
emit no fake transactions, purchases, grants, or ammunition-use events.

## Respawn

Death keeps campaign owners alive and changes only player health, pose, transient
movement/actions, camera ownership, and the existing encounter fixture. Spawn
resolution asks `LevelSystem.resolveSafePlayerSpawn()` for stable candidates:

1. `spawn.player.home`, only when home is unlocked and the preference is home.
2. `spawn.player.clinic`, when present.
3. The active level's existing default player spawn.

The query skips missing and capsule-obstructed candidates, so SAVE-001 works with
today's definitions. WORLD-004 can add home and clinic IDs without persistence
code changes. An explicit default preference skips home and clinic. Before
teleporting, the save authority awaits sector reconciliation for the resolved
spawn so geometry and collision are resident. If a preferred sector cannot
load, it prepares the safe default as a bounded fallback; if that also fails,
the death overlay retains camera/input ownership, exposes the error in its debug
snapshot, and permits retry. Repeated revive clicks share one in-progress
request. Only a prepared respawn resets health and transient movement/actions;
missions, money, owned equipment, and ammunition remain unchanged.
