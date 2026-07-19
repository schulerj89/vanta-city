# UI-002A — Objective navigation, persistence, and loadout UX

## Decision status

This is the implementation authority for `NAV-001`, `UI-SAVE-001`, and
`LOADOUT-001`. It specifies presentation and public consumer contracts only.
It does not implement runtime UI, save data, respawn selection, world entries,
mission content, equipment ownership, input listeners, or game-state changes.

The approved visual idea is an **Ashfall harbor survey kit**: a restrained
objective sounding sight, a folded-survey map tab, and etched issue-card
loadout icons. Its registration ticks, sounding terminology, clipped brass
rules, open line art, and coastal-instrument behavior extend the existing
Atlantic neon-deco / weathered municipal language. It does not use another
game's marker geometry, radar composition, color formula, weapon-wheel art,
terminology, typography, or animation.

## Art-direction method and governing rules

The `vanta-ui-art-director` skill and its UI contract determine this brief as
follows:

- **Hierarchy:** start with the player's question, urgency, frequency, and
  available attention. The persistent objective sentence remains the mission
  answer; spatial guidance is a terse secondary instrument; destructive and
  recovery decisions become focused modals.
- **Zones:** `ScreenSpaceLayoutSystem` remains the only screen-space owner.
  Objective guidance mounts only in `world-indicator`, map access only in
  `navigation`, quick slots only in `loadout`, title content in `presentation`,
  and reset/death decisions in their existing presentation/modal surfaces.
- **Interaction:** controls call existing named actions or injected public
  ports. No component adds a window listener, owns a second map state, derives
  equipment or save state from DOM, or restores camera/input/game state by
  guesswork.
- **Responsive:** every decision covers 1280×720, 390×844, 1920×800, safe-area
  insets, 125% supported enlarged text, true 200% browser-text stress, and short
  landscape behavior. Ultrawide content remains edge anchored and capped.
- **Accessibility:** controls have semantic names, deterministic focus, large
  pointer targets, visible focus, non-color state cues, and bounded live-region
  announcements. Decorative sights and icon strokes are hidden from assistive
  technology.
- **Motion:** motion explains appearance, acquisition, or restoration once. It
  never pulses continuously. `prefers-reduced-motion` removes interpolation,
  path drawing, sweep, scale, and decorative drift without hiding state.
- **Screenshots:** acceptance requires deterministic public fixtures plus live
  game frames over bright, dark, and noisy conditions. Viewport overflow,
  collisions, focus, console/page errors, failed/external requests, disposal,
  and modal restoration are inspected rather than inferred from snapshots.

## Authority boundary

| Truth                                          | Sole authority                                                                         | UI consumption rule                                                                                                     |
| ---------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Active mission/objective/highlights            | `MissionSystem` / `MissionHighlightSource`                                             | Read immutable snapshots and `changed`/`subscribe`; never reconstruct objective progress.                               |
| Static target transforms                       | active immutable `LevelDefinition` through a public resolver                           | Resolve stable IDs; never search scene nodes or private registries.                                                     |
| Player pose                                    | `WorldPoseSource`                                                                      | Read position/forward; never store a competing player transform.                                                        |
| Camera projection/mode                         | renderer camera / camera public projection snapshot                                    | Project a resolved point; never write camera transforms or claim camera ownership.                                      |
| Occlusion                                      | public collision visibility query                                                      | Presentation-only line-of-sight result; never alter collision or streaming.                                             |
| HUD zones/safe areas                           | `ScreenSpaceLayoutSystem`                                                              | Mount in one assigned zone and use its safe-area tokens; never reposition another zone.                                 |
| Map state, return state, focus, pointer intent | `FullWorldMapSystem` + `GameRuntime` + `InputSystem`                                   | All entry paths funnel through the same map request; no duplicate state or global listener.                             |
| Equipment definitions/ownership/equipped/ammo  | `EquipmentDefinition` + player `CharacterEquipment` / controller availability snapshot | Render immutable definitions plus public owner state; never grant, equip, reload, or infer vehicle availability in DOM. |
| Campaign/reset/respawn                         | forthcoming SAVE-001 campaign authority                                                | Call public async commands and display returned typed outcomes; never read keys or call `Storage.clear`.                |
| Respawn locations                              | WORLD-004 stable spawn IDs resolved by SAVE-001                                        | Display the selected outcome; UI never chooses home, clinic, or fallback.                                               |
| Preferences                                    | existing accessibility, audio, and camera stores plus browser reduced-motion media     | Reset never enumerates or clears preference keys; presentation never creates parallel preference storage.               |
| Death camera/control freeze                    | `PlayerDeathSystem` using public handles                                               | Hold and release the existing reversible presentation; UI does not create a second death simulation.                    |

No component may read private fields, loaded scene objects, raw storage keys, or
DOM attributes as simulation truth. BrowserTestBridge remains development-only
and snapshot/command oriented; production code never depends on it.

## Shared information hierarchy and zones

1. Interaction, destructive confirmation, recovery failure, and mission failure
   are urgent.
2. Current objective instruction is persistent and primary in `objectives`.
3. Objective bearing/distance is glanceable and secondary in
   `world-indicator`.
4. Condition and equipment remain glanceable in their existing zones.
5. Map access is a visible, low-urgency control attached to navigation.
6. Reset is discoverable only on a returning title, visually subordinate to
   Continue and Music until invoked.

The new pieces do not move the existing objective annotation, notification
band, minimap, location readout, condition rail, funds ledger, Help trigger, or
quickbar anchor.

---

## 1. Objective awareness — `ashfall-objective-sounding-v1`

### Purpose, name, and visual form

The component answers “which way is the active objective and how far is it?”
without becoming a route solver or a second mission tracker. Player-facing
terms are `FIX`, `BEARING`, `SCREENED`, `BEHIND`, `NO FIX`, and `ON SITE`—never
“waypoint,” “blip,” or franchise-specific language.

The on-screen form is a **sounding sight**: two open cream bracket jaws, a short
copper plumb stem, and one amber registration notch for a primary fix. It is
not a diamond, ring, pin, chevron stack, beacon column, or floating colored
orb. The target label sits on a narrow ruled ticket beneath the sight; distance
uses tabular data type. Secondary fixes use one jaw and a dashed stem, but only
one fix is ever presented.

The edge form is a **bearing vane**: a slim inward-pointing pennant attached to
a two-tick survey rule. It rotates to the target bearing. A barred jaw means
`SCREENED`; a double transverse tick plus the word `BEHIND` means the target is
behind the camera. Shape, word, line style, and orientation communicate state
without color.

### Required public inputs

NAV-001 may adapt existing public surfaces into the following read-only
consumer boundary. It must not expose private mission or camera objects.

```ts
interface ObjectiveNavigationInputs {
  readonly gameState: GameState;
  readonly levelId: string | undefined;
  readonly highlights: readonly MissionHighlightSnapshot[];
  readonly playerPose: WorldPose | undefined;
  readonly camera: ObjectiveProjectionSnapshot;
  readonly deathVisible: boolean;
}

interface ObjectiveProjectionSnapshot {
  readonly revision: number;
  readonly mode: 'gameplay' | 'conversation' | 'cinematic';
  readonly viewport: {
    readonly width: number;
    readonly height: number;
  };
  project(position: WorldPosition): {
    readonly screenX: number;
    readonly screenY: number;
    readonly cameraX: number;
    readonly cameraY: number;
    readonly forwardDepth: number;
    readonly inFrustum: boolean;
  };
}

interface MissionTargetPresentationResolver {
  resolve(
    levelId: string,
    target: MissionHighlightSnapshot['target'],
  ):
    | {
        readonly status: 'resolved';
        readonly levelId: string;
        readonly position: WorldPosition;
      }
    | { readonly status: 'unknown' | 'off-level' };
}
```

The resolver is a public adapter over the active immutable `LevelDefinition`.
It resolves `spawn`, `location`, `interaction`, `trigger`, and `landmark` by
stable ID. `entity` resolves only through a public entity-pose registry supplied
by the owning world system; if none exists, it returns `unknown`. It never walks
the Three.js scene or reads private level maps. Occlusion uses the existing
public collision segment query from camera position to target sight height.

The implementation snapshot exposed to BrowserTestBridge is:

```ts
interface ObjectiveNavigationSnapshot {
  readonly visible: boolean;
  readonly mode:
    | 'hidden'
    | 'on-screen'
    | 'edge'
    | 'behind'
    | 'screened'
    | 'arriving'
    | 'unknown';
  readonly highlightId: string | undefined;
  readonly missionId: string | undefined;
  readonly objectiveId: string | undefined;
  readonly targetReferenceId: string | undefined;
  readonly rawDistanceMetres: number | undefined;
  readonly displayDistance: string | undefined;
  readonly arrivalLatched: boolean;
  readonly screen: { readonly x: number; readonly y: number } | undefined;
  readonly bearingDegrees: number | undefined;
  readonly occluded: boolean;
  readonly suppressedBy:
    | 'state'
    | 'death'
    | 'missing-highlight'
    | 'missing-pose'
    | 'unresolved-target'
    | undefined;
  readonly revision: number;
}
```

### Highlight selection and target changes

Filter to highlights that include the `world` channel and belong to the public
active mission/current objective. Sort by:

1. `primary` before `secondary`;
2. stable highlight `id` lexical order for an authored deterministic tie.

Present only the first result. Do not cycle, stack, or silently fall through to
a lower-priority target when the selected fix is unknown. An unknown primary is
an authored/data condition and must remain visible as `NO FIX` briefly rather
than redirecting the player elsewhere.

When mission, objective, highlight ID, target reference, or level changes:

- discard the previous target position, occlusion, screen interpolation, and
  arrival latch in the same update;
- resolve the new stable ID once against the current public level;
- reveal the new sight without animating across the screen from the old target;
- announce one polite sentence: `<label>, <distance>` or
  `<label>, survey fix unavailable`;
- never replay acquisition-like motion for ordinary distance updates.

### Distance and arrival rules

World units are metres. Distance is the horizontal centre-to-centre value
`hypot(target.x - player.x, target.z - player.z)`. Vertical separation is not
added to the number; a target on another floor remains the same plan distance
and relies on authored objective text. Player radius and trigger radius do not
change the display because arrival is presentational, not mission completion.

Rounding is deterministic:

- `0–99.49 m`: nearest whole metre, e.g. `37 m`;
- `99.5–999.49 m`: nearest 5 metres, e.g. `145 m`;
- `999.5 m` and above: nearest 0.1 kilometre, e.g. `1.2 km`;
- arrival state displays `ON SITE`, not `0 m`.

The arrival latch enters at raw distance `<= 7.0 m` and exits only at
`>= 10.0 m`. Between those thresholds it keeps its prior state. This
hysteresis is UI-only and never completes an objective. `ON SITE` uses closed
bracket jaws plus a static word cue. There is no pulse.

Sample pose at 10 Hz. A normal frame may ease sight position over the shared
fast duration, but the raw distance and state are current. If the player moves
more than `12 m` between samples, if the camera projection revision resets, or
if the level ID changes, treat it as teleport/transition: clear the latch,
resolve again, and snap the next presentation without interpolation.

### Projection, edge cursor, occlusion, and unknown states

The layout uses an inner **survey window** inside `world-indicator`, leaving all
existing HUD edges free. Its bounds are CSS/layout tokens owned by the shared
layout, not per-frame measurements of feature DOM:

- desktop 1280×720: inline `22–78%`; block from
  `max(safe-top + 8.75rem, 22%)` to
  `min(78%, height - safe-bottom - 7rem)`;
- narrow 390×844: inline from `safe-left + 1rem` to
  `width - safe-right - 1rem`; block from
  `max(safe-top + 15rem, 36%)` to
  `min(68%, height - safe-bottom - 8rem)`;
- ultrawide 1920×800: inline `18–82%`; block from
  `max(safe-top + 7.5rem, 20%)` to
  `min(78%, height - safe-bottom - 7rem)`.

At supported 125% text the values scale with `rem`. At true 200% browser text,
the ticket drops its visible label first, then distance if necessary, while
the sight/vane remains at least 24 CSS pixels; the persistent objective region
continues to carry the instruction. The new component must not add an overlap
even if unrelated foundation regions already fail the 200% stress.

State resolution is exact:

| Condition                                                                  | Presentation                                                                                                                                                                  |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resolved, in front, in frustum, within survey window, unobstructed         | On-screen sounding sight at projected point; label plus distance ticket.                                                                                                      |
| Resolved, in front, but outside frustum or survey window                   | Bearing vane at the intersection of the centre-to-target ray and survey-window edge; inward tip, label plus distance.                                                         |
| Resolved with `forwardDepth <= 0`                                          | Bearing vane on the opposite ray. If camera-space X/Y magnitude is below `0.001`, use the right edge at vertical centre. Add the double-tick `BEHIND` cue.                    |
| Resolved but collision segment is obstructed before 98% of target distance | Never draw the exact on-screen sight through geometry. Use the edge vane with a barred jaw and `SCREENED`; retain bearing and distance.                                       |
| Target ID unknown or off-level                                             | No bearing and no distance. Show `NO FIX · <label>` at the centre of the survey window for 2.5 seconds on entry, then hide spatial UI while the persistent objective remains. |
| Within arrival latch                                                       | Centre the sight on the target only if visible; otherwise keep the appropriate edge/behind/screened vane. Replace distance with `ON SITE`.                                    |

For an edge ray, calculate the intersection with all four survey-window sides
and choose the smallest positive parameter. Clamp the entire component box,
not just its anchor. If its label would cross the window, flip the ticket to
the inward side. If it would still collide with the window edge at 125% text,
collapse to sight/vane plus distance. There is one item, so there is no stack.

### Visibility and lifecycle

Visible only while all of these are true:

- game state is `playing`;
- no death presentation is active;
- one selected world highlight exists;
- player pose, level, projection, and target resolution are available.

Suppress completely during `booting`, `paused`, `map`, `dialogue`,
`cinematic`, `character-select`, title, loading, reset confirmation, and death.
Map highlights remain solely the full map's responsibility. Pause does not
retain a frozen cursor. A transition to any suppressed state clears DOM
transforms and live-region pending text so stale announcements do not fire on
return.

Dispose by unsubscribing once from the mission source, releasing any public
target resolver subscription, cancelling the sampling/reveal task, removing
the three DOM nodes (visual, status, live text), and clearing all cached IDs and
arrival state. Re-entry creates one component and one subscription; listener
counts must not grow across three cycles.

### DOM, accessibility, motion, and acceptance

- Root: `<div class="objective-sounding" aria-hidden="true">` in
  `world-indicator`; the persistent mission objective already carries the same
  visible instruction for screen readers.
- State changes: one visually hidden `role="status" aria-live="polite"`
  sibling. Announce highlight/arrival/unknown transitions only, never every
  distance bucket.
- Primary/secondary, screened, behind, and arrival states always have a word,
  line pattern, or tick-count cue. Color is supplementary.
- Sight/ticket contrast uses a solid night underlay, cream text, copper rules,
  and a one-pixel dark outline; accept at least 4.5:1 for text and 3:1 for
  essential line art over sampled bright, dark, and noisy frames.
- Normal motion: 140 ms opacity/0.92-to-1 reveal; 140 ms position smoothing;
  one 360 ms jaw-close on first arrival. No bob, spin, bounce, glow pulse, or
  distance counter tween.
- Reduced motion: instant position/state and static arrival sight.
- Screenshot acceptance: on-screen, off-screen, behind, screened, arrival,
  unknown, teleport, mission change, suppression, and restoration at the three
  required viewports; no zone collision, clipping, stale label, wall-revealing
  sight, duplicate subscription, console error, or external request.

---

## 2. Full-map access — `ashfall-map-tab-v1`

### Placement and form

Add a visible folded-survey tab in the `navigation` zone immediately to the
inline end of the minimap's top edge. It uses a 3×3 survey grid, one folded
corner, the word `MAP` where space allows, and the current binding cap `M`.
It is not a second minimap, circular radar button, floating pill, or global
toolbar.

- Desktop/ultrawide target: 3.5rem wide × 3rem high, at least 48×48 CSS px.
- Narrow/touch target: exactly 48×48 CSS px, grid icon plus visually hidden
  label; it may overflow the narrow navigation zone to the inline end but must
  remain at least 0.5rem clear of the quickbar.
- The existing minimap and location geometry do not move. The tab is an
  adjacent navigation child, not drawn into SVG map geometry.

### One action and one map authority

`FullWorldMapSystem` remains the sole map presentation/state owner. Add one
public command funnel on that owner:

```ts
interface FullWorldMapAccessPort {
  requestToggle(source: 'named-action' | 'pointer-control'): boolean;
  getSnapshot(): FullWorldMapSnapshot;
  subscribe(listener: (snapshot: FullWorldMapSnapshot) => void): () => void;
}
```

The existing `toggleMap` action path calls `requestToggle('named-action')`.
The tab's click calls the same method with `pointer-control`. `requestToggle`
delegates to the existing `open()`/`close()` and existing runtime
`enterMap()`/`exitMap()` path. The tab owns no map boolean, game-state
transition, focus stack, pointer-lock state, key handler, or window listener.

Bindings remain authoritative in `defaultBindings`:

- keyboard `M`: open/close through `toggleMap`;
- gamepad `LT`: open/close through the same action;
- map close retains `M`, `Esc`, and gamepad `B`;
- pointer/touch activates the HTML tab.

### Semantics, focus, and exact restoration

Use a real button:

```html
<button
  type="button"
  class="map-access-tab"
  aria-label="Open Ashfall Junction district map"
  aria-keyshortcuts="M"
  aria-haspopup="dialog"
  aria-controls="full-world-map"
  aria-expanded="false"
></button>
```

The map root receives stable `id="full-world-map"`. When open,
`aria-expanded` is true and the tab is visually suppressed with all non-modal
HUD. Pointer activation makes the tab the prior focus, so closing restores the
tab. Keyboard/gamepad activation from gameplay preserves the existing focused
element when connected; otherwise focus returns to the game mount. The existing
map close button remains first focus, focus stays trapped in the map, the prior
`playing` or `paused` state returns exactly, camera owner/pose remains
unchanged, UI action edges are consumed, and prior pointer-lock intent is
requested only under the existing FullWorldMap policy.

### Visibility states

| Context                                                             | Tab behavior                                                                                                        |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Playing with active level map data                                  | Visible and enabled.                                                                                                |
| Paused with map available and no other modal                        | Visible and enabled; map returns to paused.                                                                         |
| Map open                                                            | Hidden with ordinary HUD; map Close owns exit.                                                                      |
| Dialogue, cinematic, character select, title, loading, reset, death | Hidden and removed from focus order.                                                                                |
| No active level/map presentation                                    | Visible only if a disabled reason can be shown; use `aria-disabled="true"` and `MAP UNAVAILABLE`, never a fake map. |
| Focus/hover                                                         | Cream 3 px focus outline or copper rule lift; shape remains unchanged.                                              |

Motion is a 140 ms border/ink transition only. Reduced motion removes it.
Acceptance requires mouse, touch emulation, `M`, virtual gamepad LT, `Esc/B`,
opening from playing and paused, focus loop, camera/pointer/HUD restoration,
three repeated cycles, and no duplicate global listener.

---

## 3. Locked loadout icons — `ashfall-issue-cards-v1`

### Fixed slots and authority

The quickbar always shows the immutable definitions for Slot 1 Handgun and
Slot 2 Knife. On a fresh campaign, `ownedIds` is empty and both definition cards
are visible but locked. SAVE-001 restores owned/equipped/ammunition before the
quickbar initializes. Store and mission reward APIs remain the only acquisition
paths. UI never grants an item because a definition exists.

The current `EquipmentDefinition.icon` typographic values (`▰`, `╱`) are not
presentation assets. LOADOUT-001 replaces their use with local code-native SVG
selected by stable equipment ID. Definition identity remains authoritative;
the UI does not store SVG markup in save data.

### Original icon geometry

Both icons use `viewBox="0 0 48 32"`, `fill="none"`, `stroke="currentColor"`,
`stroke-width="2.25"`, `stroke-linejoin="bevel"`, and
`vector-effect="non-scaling-stroke"`. Essential contours remain recognizable
at 24 CSS px.

**Handgun / dock-service sidearm.** An open industrial side elevation, not a
filled weapon-wheel silhouette:

- upper receiver `M5 9 H35 L40 12 V16 H20 L18 13 H5 Z`;
- grip `M25 16 L34 16 L31 29 H23 L21 20 Z`;
- open trigger guard `M19 16 C18 22 23 24 27 20`;
- two short registration cuts at X 10 and 14 along the receiver;
- no muzzle flash, ammunition graphic, brand, realism detail, or copied slot
  frame.

**Knife / harbor rigging knife.** A clipped utility blade rather than a combat
dagger:

- blade `M4 19 L27 8 H35 L31 18 L12 23 Z` with a flat clipped nose;
- guard `M30 17 L36 23`;
- wrapped handle `M34 20 L45 25 L41 31 L30 25 Z`;
- three perpendicular wrap marks; no blood, serration, military insignia, or
  franchise icon silhouette.

The docs-only visual sheet is
`docs/screenshots/ui-002a/ui-002a-layout-icons.svg`. Runtime implementation may
express the same coordinates through SVG DOM or a typed icon function; it must
remain repository-native and require no font, download, or license.

### State table

| State                        | Visual/non-color cue                                                                                | Copy and semantics                                                                                                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty definition slot        | Open corner frame, centred em dash, no weapon contour                                               | `Slot <n>, no issue assigned`; only valid for missing definition/failure fixtures.                                                                                        |
| Locked / not owned           | Full recognizable contour at 45% ink, diagonal hatch rail, dashed outer issue card, `LOCKED` footer | Focusable button with `aria-disabled="true"`; label `Slot 1, Handgun, locked` etc. Press/click is a bounded no-op and polite `Handgun is locked` at most once per second. |
| Newly acquired               | Solid contour, small clipped `NEW` flag, one trace from grip to tip                                 | Polite `Handgun acquired`; flag remains 2.4 s in-session and is event-driven, not restored on reload.                                                                     |
| Owned / unequipped           | Solid cream contour, continuous frame, `READY` footer                                               | `Slot 1, Handgun, owned, 8 of 8 rounds`.                                                                                                                                  |
| Equipped                     | Double lower registration rule, amber notch, `EQUIPPED` footer, `aria-current="true"`               | Label adds `equipped`; selecting again uses existing unequip authority.                                                                                                   |
| Handgun ammunition available | Tabular `current / max` in upper inline corner                                                      | Never color-only.                                                                                                                                                         |
| Handgun empty                | `0 / 8`, crossed ammunition rule, `EMPTY · RELOAD`, icon remains recognizable                       | Label `equipped, empty, reload required`; no fake shot state.                                                                                                             |
| Unavailable in vehicle       | Horizontal stow bar across contour, solid-disabled border, `STOWED · IN VEHICLE`                    | Comes only from public controller/vehicle availability reason; `aria-disabled="true"`, no equip/use call.                                                                 |
| Hover                        | Copper outer rule and full item label; no scale jump                                                | Only on pointer-capable media.                                                                                                                                            |
| Keyboard/gamepad focus       | 3 px cream/amber outline with 3 px offset and label retained                                        | Deterministic slot order 1 then 2.                                                                                                                                        |

Slots become real buttons only to support requested focus/hover/pointer use. A
click calls an injected `toggleQuickbarSlot(slot)` on the existing player
controller/equipment action surface; numeric actions continue through
InputSystem. There is no per-slot keyboard listener. Locked and vehicle-stowed
cards remain focusable with `aria-disabled` so the reason is perceivable; the
handler does not call equipment.

The required view model is derived each sync from public definitions plus one
public player snapshot:

```ts
interface QuickbarAvailabilitySnapshot {
  readonly ownerId: 'player';
  readonly equippedId: EquipmentId | undefined;
  readonly ownedIds: readonly EquipmentId[];
  readonly ammunition: EquipmentSnapshot['ammunition'];
  readonly availability: Readonly<
    Partial<
      Record<
        EquipmentId,
        'available' | 'unavailable-in-vehicle' | 'action-locked'
      >
    >
  >;
}
```

Do not infer `unavailable-in-vehicle` from a vehicle HUD node, game-state string,
character animation, or private controller property.

### Responsive, motion, and acceptance

- Desktop/ultrawide cards remain 4rem square at bottom centre. Ultrawide does
  not spread them apart.
- Narrow cards remain 3.35rem minimum under ordinary text and never below a
  44×44 focus target; at enlarged text the visual can stay square while the
  focused detail label expands upward within `loadout`, clear of navigation.
- At true 200% browser text, footer copy may become a visually hidden accessible
  name while icon, slot number, lock/stow/empty shape cue, and focus outline
  remain visible without horizontal overflow.
- Acquisition motion: 360 ms path trace plus 140 ms flag reveal once. No glow
  pulse. Reduced motion shows the final `NEW` flag instantly for the same
  2.4-second information lifetime.
- Disposal removes definition buttons and all equipment subscriptions and
  cancels the NEW flag timer. Rebinding player visual never recreates equipment
  state.
- Accept with both locked on fresh game, each independently acquired, owned,
  equipped, handgun partially loaded/empty/reloaded, vehicle unavailable,
  focus/hover, reduced motion, 125% supported text, 200% component stress, all
  viewports, and three disposal/re-entry cycles.

---

## 4. Title reset-game-data — `ashfall-campaign-reset-v1`

### Public save contract and scope

UI-SAVE-001 consumes the forthcoming SAVE-001 boundary. The final names may
follow SAVE-001 conventions, but the semantics are mandatory:

```ts
interface CampaignPresentationSnapshot {
  readonly revision: number;
  readonly hasCampaign: boolean;
  readonly titleStarted: boolean;
  readonly persistence:
    'ready' | 'memory-only' | 'unavailable' | 'corrupt-fallback';
}

interface CampaignPresentationPort {
  getSnapshot(): CampaignPresentationSnapshot;
  subscribe(
    listener: (snapshot: CampaignPresentationSnapshot) => void,
  ): () => void;
  markTitleStarted(): Promise<{ readonly committed: boolean }>;
  resetCampaign(): Promise<
    | { readonly status: 'reset' | 'already-empty' }
    | { readonly status: 'failed'; readonly message: string }
  >;
}
```

`markTitleStarted` replaces presentation knowledge of
`vanta-city:title-started`. `resetCampaign` resets campaign/title-started
progress only: mission persistence/facts, money, equipment ownership/equipped
item/ammunition, current level/safe-spawn metadata, and campaign schema state.
It preserves accessibility, audio/music, camera, graphics/input, and every
other user preference. Presentation never calls `Storage.clear`, enumerates
keys, imports storage constants, or deletes raw data.

### Placement and title states

**First run:** show `Start` and `Music · On/Muted`. Do not show Reset when
`hasCampaign` and `titleStarted` are both false. This avoids presenting a
destructive action with no target.

**Returning:** show `Continue` as primary, Music as secondary, then a separated
tertiary text button `Reset game data` below the main action row, aligned to the
content start. It uses danger ink only on hover/focus; at rest it is muted cream
with a thin rule so it never competes with Continue. On narrow view it becomes
a full-width 48 px row after Music. On ultrawide it stays inside the capped title
content measure.

If `hasCampaign` is true while `titleStarted` is false (a recovered/migrated
save), use the returning layout and `Continue`; the save authority, not a title
storage flag, determines that campaign data exists.

### Confirmation content and state machine

Opening Reset creates a focused dialog within the title presentation:

- eyebrow: `CAMPAIGN RECORD`;
- heading: `Reset campaign progress?`;
- body: `Missions, money, owned equipment, ammunition, and your current
campaign start will be erased. Accessibility, audio, camera, and other
preferences will stay as they are.`;
- safe action: `Cancel`;
- destructive action: `Reset campaign`.

State behavior:

| State         | Behavior                                                                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Closed        | Reset trigger is in normal title focus order after Music.                                                                                                                                               |
| Confirming    | Background title content is inert/aria-hidden. `role="alertdialog"`, `aria-modal="true"`; initial focus is Cancel.                                                                                      |
| Pending       | Both actions disabled, dialog `aria-busy="true"`, destructive label `Resetting…`; call `resetCampaign()` exactly once.                                                                                  |
| Success       | Close dialog, update title to first-run `Start`, hide Reset, focus Start, and announce `Game data reset. Accessibility, audio, and camera preferences were kept.` in one polite status. No page reload. |
| Already empty | Same first-run result and success wording.                                                                                                                                                              |
| Failure       | Keep dialog open, `role="alert"` text `Game data could not be reset. Nothing else was changed.`, change destructive action to `Try reset again`, focus it, keep Cancel available.                       |
| Cancel        | Close, restore focus to `Reset game data`, make title content active again, perform no save call.                                                                                                       |

Clicking Start/Continue first awaits `markTitleStarted()`. If persistence is
memory-only/unavailable, starting remains possible and a nonblocking warning is
announced; the title must never strand the player because storage is full or
private. After a successful reset, runtime systems have not initialized yet;
choosing Start proceeds through normal bootstrap with the authority's fresh
snapshot. No reload or second bootstrap root is created.

### Keyboard, gamepad, pointer, and focus ownership

- Native `Tab`/`Shift+Tab` follow Start/Continue → Music → Reset on returning
  title. Inside confirmation, loop Cancel ↔ Reset.
- `Enter`/`Space` activate the focused HTML button.
- `Escape` cancels confirmation; it does not start the game.
- Gamepad D-pad left/right (or up/down in the narrow column) moves focus, A
  activates, and B cancels confirmation. B has no destructive shortcut.
- Pointer/touch uses at least 48 px Reset, Cancel, and Reset campaign targets.

Title occurs before runtime initialization. Bootstrap therefore constructs and
initializes the one `InputSystem(defaultBindings)` before `TitleScreen`, passes
an `InputReader` to a title-scoped requestAnimationFrame focus controller, and
later registers the same idempotent InputSystem with GameRuntime. Add named
title actions for gamepad focus/activate/cancel; do not add a second key/gamepad
window listener. Disposal cancels the title frame loop and consumes title-owned
edges before gameplay initialization.

### Visual, motion, and accessibility acceptance

The dialog is a compact municipal record sleeve over the existing local title
art: night panel, copper file rule, cream body, danger cross-rule on the
destructive action. It introduces no new image or font.

Normal motion is one 140 ms opacity/0.4rem reveal; pending/success never shake,
flash, or count down. Reduced motion is instant. At 200% browser text, the
dialog body scrolls internally if necessary while heading and both 48 px actions
remain reachable. Accept first-run, returning, confirm, cancel, pending,
failure, retry, success, focus loop, gamepad/pointer, preference preservation,
and three reset calls including already-empty/corrupt/unavailable storage at
all required viewports.

---

## 5. Death and respawn — `ashfall-recovery-transfer-v1`

### Authority and public outcome

SAVE-001 selects and commits respawn using WORLD-004 stable IDs. The preference
order—home only when unlocked, otherwise clinic, then current default spawn—is
simulation truth and is never duplicated in UI. PlayerDeathSystem receives a
typed preview and command:

```ts
type RespawnDestinationKind = 'home' | 'clinic' | 'fallback';

interface RespawnPresentationSnapshot {
  readonly requestId: string;
  readonly phase: 'resolving' | 'ready' | 'committing' | 'failed';
  readonly destination:
    | {
        readonly kind: RespawnDestinationKind;
        readonly spawnId: string;
        readonly displayName: string;
      }
    | undefined;
  readonly persistence:
    'ready' | 'memory-only' | 'write-failed' | 'unavailable';
  readonly errorMessage: string | undefined;
}

interface CampaignRespawnPort {
  prepareRespawn(): Promise<RespawnPresentationSnapshot>;
  commitRespawn(requestId: string): Promise<
    | {
        readonly status: 'committed';
        readonly destination: NonNullable<
          RespawnPresentationSnapshot['destination']
        >;
        readonly persistence: RespawnPresentationSnapshot['persistence'];
      }
    | { readonly status: 'failed'; readonly message: string }
  >;
}
```

SAVE-001 owns preserved mission/money/equipment data, safe spawn resolution,
teleport/reset transaction, idempotence, and storage. WORLD-004 owns
`spawn.player.home` and `spawn.player.clinic`; the fallback outcome returns the
actual default spawn ID and authored display name. Presentation uses returned
`kind` for copy and returned `displayName`; it never looks up facts to choose a
branch.

### Outcome copy

All variants use eyebrow `ASHFALL EMERGENCY TRANSFER`, heading `SIGNAL LOST`,
and one action:

| Returned kind | Detail                                                                    | Button                      |
| ------------- | ------------------------------------------------------------------------- | --------------------------- |
| `home`        | `A safe key is on file. Recover at Rook's place.`                         | `Recover at home`           |
| `clinic`      | `District medics have the nearest safe berth. Recover at Ashfall Clinic.` | `Recover at clinic`         |
| `fallback`    | `No registered safe berth is available. Recover at <displayName>.`        | `Recover at district entry` |

While resolving: detail `Locating a safe recovery berth…`, no enabled action,
and a static three-tick progress rule. Do not invent a location.

If preparation or commit fails: heading `RECOVERY DELAYED`, detail
`A safe recovery could not be completed. Your campaign has not been replaced.`,
alert detail from the typed result when safe, and button `Try recovery again`.
The overlay, control suppression, and death camera remain active. Retry creates
one new request only after the prior promise settles.

If world recovery commits but save persistence reports `write-failed`, close
the overlay and announce assertively:
`Recovered at <displayName>, but progress could not be saved. This session can
continue; progress may not survive closing the game.` Do not roll back a safe
world recovery or claim it was saved.

### Timing, controls, restoration, and focus

1. On health depletion, show the wash within one rendered frame, suppress
   player controls, request the existing reversible death camera, and begin
   `prepareRespawn()` once.
2. Normal-motion content resolves over 360 ms. The action may receive focus as
   soon as a ready outcome exists, but not before 350 ms after depletion; this
   prevents the depletion input from immediately confirming recovery.
3. Focus stays in the modal. Enter/Space, gamepad A, pointer, or touch activates
   the one ready/retry button. Gamepad B/Escape do nothing because death is not
   cancelable.
4. On confirm, disable the button, set `aria-busy`, label it `Recovering…`, and
   call `commitRespawn(requestId)` once.
5. Only a committed result permits PlayerDeathSystem to hide the overlay,
   release its camera handle, snap the existing gameplay camera after the
   authoritative teleport, restore the previously permitted control state, and
   return focus to the connected prior gameplay target or `#game`.
6. Existing layout visibility resumes in one frame. A polite notification
   `RECOVERED · <displayName>` lasts 2.5 seconds. Movement, equipment action,
   minimap pose, HUD, camera owner, and input ownership are then verified from
   public snapshots.

If pointer lock was active, request its existing intent through the input
owner; browser refusal remains nonfatal and the next trusted canvas click may
reacquire it. Never synthesize a click.

### Semantics, layout, and motion

- Modal root: `role="dialog" aria-modal="true"`, labelled heading and detail.
- Resolving text: polite status. Failure/storage warning: assertive alert.
- Other HUD zones become inert/aria-hidden through the shared layout's modal
  visibility policy; PlayerDeathSystem does not individually hide each HUD.
- Keep the current centred, wide ruled composition but replace generic debug
  wording and raw `z-index: 100` styling with Ashfall semantic modal tokens.
- Normal motion: 360 ms wash/content arrival and 180 ms successful release.
  Reduced motion: immediate opaque overlay and immediate release. No zoom,
  heartbeat, red flash, camera shake, or countdown.
- At 200% browser text, content scrolls inside safe bounds and the action stays
  at least 48 px and reachable. Narrow uses a single centred column; ultrawide
  caps the ruled sleeve at 42rem.

Accept home, clinic, fallback, resolving, commit, storage-warning, hard
failure, retry, reduced motion, focus, gamepad, pointer/touch, safe area, 200%
component text, and three death/recovery cycles. Confirm no duplicate reward,
mission reset, equipment loss, input edge, camera handle, listener, or DOM root.

---

## 6. Architecture and independent implementation handoff

### Component boundaries

| Component                                            | Mount/owner                     | Inputs                                                                                                      | Outputs / forbidden ownership                                                                                                                         |
| ---------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ObjectiveSoundingSystem` (NAV-001)                  | existing `world-indicator` zone | mission highlights, active level resolver, player pose, camera projection, occlusion, game/death visibility | Snapshot only; no mission progress, camera, collision, map, or game-state writes. Replaces only MissionHud's current exact world-marker presentation. |
| `MapAccessControl` (NAV-001)                         | `navigation` zone               | `FullWorldMapAccessPort`, level/map availability, binding metadata                                          | Pointer request only; no map state/listener.                                                                                                          |
| `FullWorldMapSystem` access funnel (NAV-001)         | existing `modal` owner          | existing action + pointer sources                                                                           | One request/open/close/restore path.                                                                                                                  |
| `QuickbarSystem` (LOADOUT-001)                       | existing `loadout` zone         | definitions, CharacterEquipment snapshot/events, controller availability, existing toggle port              | Presentation buttons/snapshot only; no acquisition/equip/ammo/vehicle truth.                                                                          |
| `TitleScreen` reset extension (UI-SAVE-001)          | existing `presentation` zone    | audio store, campaign port, single InputReader                                                              | Calls mark/reset; no raw storage or duplicate input listeners.                                                                                        |
| `PlayerDeathSystem` recovery extension (UI-SAVE-001) | existing `modal` zone           | health event, respawn port, camera/control handles, reduced-motion source                                   | Displays returned outcome and calls commit; no destination selection/save/world truth.                                                                |

MissionHud keeps persistent objective and transient notification ownership.
NAV-001 extracts/replaces only its current `mission-world-indicator` portion so
two world indicators can never coexist. FullWorldMap continues to consume map
channel highlights independently.

### File ownership and non-overlap

To allow three medium workers to proceed independently:

**NAV-001 owns**

- `src/ui/MissionHudSystem.ts` only for removal/delegation of the existing world
  marker;
- new `src/ui/ObjectiveSoundingSystem.ts` and
  `src/ui/MapAccessControl.ts`;
- `src/ui/FullWorldMapSystem.ts` only for the public request funnel/root ID and
  snapshot subscription;
- new `src/ui/objective-navigation.css`, imported by the new component;
- the mission/full-map constructor hunk in `src/main.ts` around current map and
  mission UI wiring;
- NAV-owned unit/browser/lab fixtures and `docs/screenshots/nav-001`.

NAV-001 must not edit TitleScreen, PlayerDeathSystem, QuickbarSystem,
CharacterEquipment, save/respawn implementation, world definitions, or their
tests.

**UI-SAVE-001 owns**

- `src/ui/TitleScreen.ts` and `src/ui/PlayerDeathSystem.ts`;
- new `src/ui/persistence-recovery.css`, imported by those components;
- named title actions and the pre-title InputSystem construction hunk in
  `src/input/defaultBindings.ts` / the title bootstrap section of `src/main.ts`;
- only the death/title save ports provided by SAVE-001;
- UI-SAVE unit/browser/lab fixtures and `docs/screenshots/ui-save-001`.

UI-SAVE-001 must not edit MissionHudSystem, FullWorldMapSystem,
ObjectiveSoundingSystem, QuickbarSystem, equipment definitions/icons, or their
tests. SAVE-001 owns all storage/schema/reset/respawn branch logic; UI-SAVE
imports its public types and calls it.

**LOADOUT-001 owns**

- `src/ui/QuickbarSystem.ts`;
- new `src/ui/EquipmentIcon.ts` and `src/ui/quickbar-issue-cards.css`, imported
  by QuickbarSystem;
- icon presentation removal from `EquipmentDefinition.icon` only if the public
  definition contract is deliberately changed; stable equipment IDs/slots and
  gameplay definitions remain untouched;
- LOADOUT unit/browser/lab fixtures and `docs/screenshots/loadout-001`.

LOADOUT-001 must not edit TitleScreen, PlayerDeathSystem, MissionHudSystem,
FullWorldMapSystem, save data, acquisition paths, vehicle simulation, or main
bootstrap.

No worker appends feature rules to the shared `src/styles.css`; each imports one
owned feature stylesheet and reuses existing semantic variables. This prevents
three-way CSS conflicts and another global breakpoint/layer system. Shared
ScreenSpaceLayout zone names and global tokens remain unchanged. If modal inert
handling needs a shared layout API, UI-SAVE proposes it as a small separate
commit for integration review; NAV/LOADOUT do not touch that file.

### Tokens, layers, and assets

Reuse all `--ash-font-*`, ink, night, panel/underlay, copper, amber, danger,
disabled, rule, gap, safe-area, motion, and layer tokens. Feature CSS may define
only derived local custom properties:

- objective: `--objective-fix-ink`, `--objective-screened-rule`, and
  survey-window clearances;
- loadout: `--issue-card-hatch` and `--issue-card-stow-rule`;
- persistence/recovery: `--record-danger-rule`.

No new global z-index is allowed. Persistent HUD/world sight uses
`--ash-layer-hud`; transient announcement uses
`--ash-layer-notification`; map/reset/death uses `--ash-layer-modal`; title
remains presentation/modal. No external font, icon, bitmap, runtime request, or
license is added. The icon and survey geometry are project-authored code-native
SVG/CSS.

### Deterministic lab fixtures and test IDs

Extend the public composition lab with explicit presentation fixtures, not
private mutation:

- `objective-on-screen`, `objective-edge`, `objective-behind`,
  `objective-screened`, `objective-arrival`, `objective-unknown`;
- `map-tab-closed`, existing `pause-map`, and `map-restored`;
- `loadout-both-locked`, `loadout-new-handgun`, `loadout-equipped`,
  `loadout-empty-ammo`, `loadout-vehicle-stowed`;
- `title-returning`, `reset-confirmation`, `reset-error`, `reset-complete`;
- `death-home`, `death-clinic`, `death-fallback`, `death-storage-warning`,
  `death-retry`.

Use accessible role/name queries by default. Stable test IDs are permitted only
where no semantic query is reliable:

- `objective-sounding` root for geometry/snapshot association;
- `map-access` for closed-map focus restoration;
- existing `full-world-map`, `map-close`, and map control IDs;
- `reset-game-data` and `reset-confirm` to distinguish two intentionally
  similar destructive labels;
- existing title/start/music IDs;
- `quickbar-slot-1` / `quickbar-slot-2` for deterministic fixed-slot geometry;
- existing death root may add `death-recover` for pending/retry sequence.

Do not add IDs to every decorative SVG path.

### Required screenshot and behavioral matrix

| Feature/state                                              | 1280×720     | 390×844                      | 1920×800   | Stress                                                 |
| ---------------------------------------------------------- | ------------ | ---------------------------- | ---------- | ------------------------------------------------------ |
| Objective on-screen/edge/behind/screened/arrival           | bright live  | dark + safe + 125% + reduced | noisy live | teleport, mission change, 200% component text          |
| Map tab closed / map open / restored                       | live         | safe + 125% + reduced        | live       | keyboard, gamepad, pointer/touch, focus, paused return |
| Loadout both locked / acquired / equipped / empty / stowed | bright/noisy | safe + enlarged              | noisy      | focus/hover, reduced motion, event/disposal            |
| First-run / returning / reset confirm/error/success        | title art    | safe + 125%/200% + reduced   | title art  | focus trap, gamepad, corrupt/unavailable storage       |
| Death home / clinic / fallback / retry                     | live modal   | safe + 200% + reduced        | live modal | storage warning, exact camera/HUD/input restoration    |

All accepted captures require no owned-zone overlap, viewport overflow,
unreadable contrast, stale state, focus escape, page/console error, unexpected
GET failure, or external request. Baseline updates must cite this brief and name
the intentional state/layout change.

### Dependency handoffs

- **SAVE-001:** deliver the versioned public campaign snapshot, mark-title,
  reset, respawn prepare/commit outcomes, empty fresh ownership, idempotence,
  corrupt/unavailable fallback, and preference-preservation guarantee. Do not
  return storage keys to UI.
- **WORLD-004:** deliver stable `spawn.player.home` and
  `spawn.player.clinic` with authored display names plus the existing default
  fallback. UI consumes only the outcome chosen by SAVE-001.
- **MISSION-003B:** author stable highlight IDs/labels/channels/priorities and
  resolvable stable targets. Avoid simultaneous same-priority primary fixes;
  the deterministic tie still exists for safety.
- **NAV-001:** implement the sounding sight, distance/hysteresis/projection,
  suppression/disposal, map tab, one map request funnel, and NAV evidence.
- **UI-SAVE-001:** implement title reset and returned respawn presentation only
  after SAVE-001 contracts exist; preserve the title art/audio/camera sources.
- **LOADOUT-001:** implement local SVG issue cards from empty fresh save state
  and equipment/controller snapshots; do not change acquisition gameplay.

## Current-base visual findings informing the design

The bounded review is recorded in
`docs/screenshots/ui-002a/README.md`. Important current facts are:

- On-screen mission sight works from public mission/level/camera/collision
  inputs, but a target directly behind the camera makes the indicator disappear
  with no direction or distance.
- No pointer-visible map control exists while the full map is closed. The
  existing map itself correctly focuses Close and restores playing/camera/HUD.
- The fresh live fixture has Handgun locked but Knife owned; SAVE-001 changes
  the fresh campaign to neither owned.
- Returning title changes Start to Continue but exposes no reset control.
- Death presentation is responsive and focusable but says `debug encounter`,
  offers only generic `Revive & restart`, and has no returned destination or
  storage outcome.
- The documented 125% safe-area/reduced-motion narrow lab is collision-free.
  A true 200% root-font stress produces ten current-region collisions and
  truncated objective copy. New UI must reflow safely and not hide this broader
  foundation limitation.

## Known limitations and integration risks

- WORLD-004 and SAVE-001 do not yet provide the home/clinic outcomes, so this
  consultation cannot capture real destination variants.
- Current first mission uses a world-only highlight until its later objective;
  the reviewed open map therefore legitimately reports zero active map
  highlights in the captured state.
- Current accessibility storage has reduced camera motion and dialogue
  typewriter preferences; interface reduced motion is browser-media driven.
  Do not invent a stored duplicate setting in these workers.
- Title currently precedes InputSystem construction. The specified single-input
  bootstrap move is a focused UI-SAVE integration risk and must be reviewed
  against title/loading failure paths.
- True 200% whole-HUD collision repair exceeds the three feature components and
  may need a separate foundation pass. UI-002A implementations must still pass
  isolated component/modal 200% checks and the supported integrated 125% path.
- NAV and UI-SAVE touch different semantic hunks of `src/main.ts`; integrate
  SAVE-001 first, then reapply the small constructor/wiring changes with one
  authoritative InputSystem and one campaign authority.
