# Developer tooling

Developer tooling is loaded from `main.ts` only when Vite replaces `import.meta.env.DEV` with `true`. A production build does not initialize the registry, visual helpers, panel, sandbox loader, or development commands. Never place a production feature behind the debug API.

## Opening the panel

Run `pnpm dev`, then press backtick. Add `?debug=1` to open the panel on startup. Values refresh while the panel is visible; toggles and commands remain interactive while the game is paused.

The panel consumes only `DebugRegistry` snapshots and callbacks. It does not inspect player, world, interaction, asset, or renderer internals.

## Panel information architecture

The panel uses one ordered subsystem taxonomy: **Player**, **Input / Ownership**, **Collision / Physics**, **Camera**, **World**, **Lighting**, **Traffic**, **Combat**, **Interactions**, **Dialogue / Conversation**, **Assets**, and **Runtime / State**. Use the exported `debugSections` names instead of inventing parallel synonyms or one section per entity. Unknown custom group names remain supported and appear after the standard sections for compatibility.

Major diagnostics are placed by ownership:

- Player position, movement, grounded state, economy, equipment, and player mutations are **Player**.
- Active control owner, accepted/rejected actions, devices, pointer lock, focused UI, and accessibility input preferences are **Input / Ownership**, where input-routing decisions can be inspected without mixing them into player transforms.
- Collider counts and collision helpers are **Collision / Physics**; level identity, spawns, minimap layers, and level reload are **World**.
- Camera mode, owner, target, anchor, obstruction, and preferences are **Camera**. Mode and owner are first because they explain most camera handoff issues.
- Lighting state and time-of-day controls are **Lighting**. Traffic lifecycle, counts, and fixture controls are **Traffic**. Health, character actions, sparring state, engagement math, and combat helpers are **Combat**.
- Selected/loaded player visuals, picker state, alignment measurements, animations, and NPC identity/model status are **Assets**. NPC spawn, interaction, and conversation rows follow their owning World, Interactions, and Dialogue sections instead.
- The selected interaction, candidate count, and NPC interaction states are **Interactions**. Active conversation, per-NPC conversation states, dialogue line/speaker/state, and portrait resolution are **Dialogue / Conversation** because the coordinator and presentation describe one conversation flow.
- Game state, FPS, and captured errors are **Runtime / State**.

Each subsystem section contains separate labelled **Diagnostics** and **Controls** blocks. Passive values render only in Diagnostics; toggles, bounded numeric inputs, and command forms render only in Controls. This keeps state and mutations visually distinct without forcing unrelated mechanics into a global action list. Every section remains collapsed by default, control labels retain subsystem terminology, and stable IDs remain the automation interface.

Every dynamic section is a native `details` element with a keyboard-operable `summary` containing a level-two heading and a typed item count such as `14 diagnostics · 6 controls`. All sections, including sections first seen through late registration, start collapsed. A user's expanded state survives live refreshes, overall panel hide/show, and later structural registrations for the panel lifecycle. Structure changes restore focus to the equivalent section or control when it still exists. **Expand all** and **Collapse all** operate only on disclosures; they never invoke a control. Disclosure state is intentionally not written to production storage or telemetry.

The always-visible `Critical runtime summary` reads four existing public registrations without registering or querying gameplay state itself:

- **State** (`runtime.state`) identifies whether the runtime is playing, paused, in dialogue, or in another state.
- **Player** (`player.position`) gives the authoritative coordinates needed to reproduce spatial problems.
- **Camera** (`camera.owner`) makes ownership/handoff mistakes immediately apparent.
- **Errors** (`errors.count`) shows whether the runtime has captured a failure.

Only facts already present in the registry are rendered, in that fixed order. They remain duplicated visually in their full diagnostic sections so the taxonomy stays complete, but there is still one registration and one reader for each fact.

Commands are forms, so their explicitly labelled text inputs submit with Enter. The panel locally contains text-entry keystrokes, native Enter/Space activation, pointer-down, and wheel events so disclosure navigation, command activation, and scrolling cannot become gameplay input or request pointer lock. Other established gameplay keys still work after a debug button retains focus, while keyup and pointer-up reach the existing input system to clear any control held before focus moved into the panel. Backtick passes through to close/reopen the panel. Hiding the panel blurs any focused descendant rather than leaving focus in hidden content. No new window/document listener is installed. Focus outlines are high contrast.

At desktop sizes the panel stays in the upper-left, away from the upper-right Help control, with a capped width and scroll height. At narrow sizes it becomes a floating bottom sheet capped at 42% of dynamic viewport height, uses safe-area-aware offsets, and reserves the bottom HUD/quickbar band. Its content remains scrollable when a large section is expanded.

Desktop and narrow browser coverage owns the compact collapsed layout, per-subsystem expansion, Diagnostics/Controls separation, focus containment, and HUD clearance. Native disclosures remain preferable to a custom accordion because they preserve browser keyboard and expanded-state semantics without another focus implementation.

## Extension API

### Input ownership inspector

Development startup dynamically loads one `InputOwnershipInspector` into the existing debug registry. It does not add browser listeners or a second panel. Its public `getDebugSnapshot()` contract contains:

- `owner` and `acceptedActions` / `acceptedActionFamilies` for gameplay, pause, help, picker, dialogue, cinematic, boot, or focused text UI;
- `activeInputFamily`, `activeDevice`, focused-element details, and pointer-lock state;
- keyboard, mouse, and gamepad named actions split into down, pressed, released, accepted, and rejected sets;
- standard-gamepad identity, raw axes, deadzone-adjusted axes, down/pressed/released buttons, the configured `0.20` deadzone, and the `0.50` threshold;
- current reduced-camera-motion and dialogue-typewriter preferences;
- the most recent rejected action with its ownership reason and a 16-entry ownership/device/input timeline.

The **Input / Ownership** Controls block exposes `input.virtual-gamepad-connect`, `input.virtual-gamepad-disconnect`, `input.virtual-gamepad-axes`, and `input.virtual-gamepad-button`. These controls update the centralized polling adapter; they never dispatch duplicate browser events.

The development browser bridge mirrors the snapshot at `snapshot().controls.ownership` and exposes `setVirtualGamepad(fixture)` for deterministic automation. Omitting the fixture restores native standard-gamepad polling.

Development integrations receive the public `DebugRegistry` and `DebugVisualHelpers` instances. Keep every unregister callback and call it when the owning system is disposed.

```ts
const unregister = [
  debug.registerValue({
    id: 'movement.speed',
    label: 'Speed',
    group: debugSections.player,
    read: () => movement.getSpeed(),
  }),
  debug.registerToggle({
    id: 'movement.freeze',
    label: 'Freeze movement',
    group: debugSections.player,
    onChange: (enabled) => movement.setFrozen(enabled),
  }),
  debug.registerCommand({
    id: 'movement.reset',
    label: 'Reset controller',
    group: debugSections.player,
    run: () => movement.reset(),
  }),
];
```

IDs are global within the registry and duplicates fail immediately. Value readers should be cheap, side-effect-free public queries. Command failures are reported with the command ID in the diagnostics panel and console.

`DevelopmentTools.sections` exposes the shared constants. Ungrouped values, toggles, numbers, and commands default to `Runtime / State`; built-in controls should always name their owning subsystem. `registerNumber()` requires finite `min`/`max` bounds, optionally accepts a positive `step`, reads its current value, and validates before calling `onChange`. Registry subscribers receive `{ kind: 'structure' | 'toggle' | 'number', id }`; existing zero-argument subscribers remain compatible. IDs remain global across every registration kind, disposal callbacks remain stable, and custom group strings still render after standard sections.

Integration note: section names are a development UI contract, so automation that selected the retired `Commands / Actions` container must select the owning subsystem or a stable `data-debug-*` ID instead. Existing toggle and command IDs are retained except that `camera.set-follow-distance` is now a numeric registration; browser automation should use `setDebugNumber()` for it and invoke `camera.persist-follow-distance` only when a storage write is intended. The panel intentionally has no select/dropdown registration yet; bounded numbers, booleans, and text commands are the supported control primitives.

Visual output stays owned by the mechanic that understands it. Register only a visibility callback:

```ts
const unregisterCollision = visualHelpers.register('collision', {
  setVisible: (visible) => (collisionDebugGroup.visible = visible),
});
```

Standard helper categories are `collision`, `triggers`, `entityIds`, `spawnPoints`, `interactionRanges`, `navigation`, and `characterAlignment`. Character alignment shows the player simulation origin, collision body, visual root, measured model bounds, lowest point, and ground-contact plane. Providers registered after a toggle is enabled immediately receive the current state.

The default development actions pause/resume, reload the current level, and toggle a helper by name. A mechanic may register `player.reset` or `player.teleport` through the same command API once it has a public reset or named-spawn operation. The foundation sandbox demonstrates both without coupling the panel to a player implementation.

The debug district registers sparring-target activation, reset/teleport, player/target health controls, and related diagnostics under **Combat**. The shared **Combat engagement / hit volumes** helper renders the exact engagement, strike, hurt, facing, and contact-decision math. Browser tests drive the same generic registry through the development-only bridge; the target owns no window listener or separate debug UI.

## Diagnostic recorder

Development builds include an opt-in rolling recorder for attaching the few seconds around a bug. It is idle by default and is not imported, initialized, or exposed by production builds. The default window is eight seconds sampled at 30 Hz: a fixed ring of 240 frames plus a fixed ring of 480 transition events. Enter another duration from 1–30 seconds when running **Start diagnostic recording**; capacity is recalculated as `duration × 30` frames. Recording work is limited to public snapshot reads at the sample rate and small event-object copies between samples.

The recorder composes these public facts:

- authoritative player position, velocity, grounding, movement, facing, and the public animation graph;
- camera owner, mode, obstruction, distance, and handoff progress;
- interaction selection/challenger/selection decision and relevant clear/blocked LOS results;
- game, conversation, and dialogue state using IDs and line indexes;
- game-state, interaction, conversation, dialogue, player-action impact/completion, and sanitized runtime-error events correlated to the most recent sample.

It intentionally records no dialogue text, interaction prompt text, raw keyboard events, arbitrary text fields, storage values, URLs, production telemetry, or personal identifiers. Input ownership is omitted because `InputSystem` currently has no public ownership snapshot; do not bypass that boundary by reading its private key sets.

The **Runtime / State** section exposes recorder status, capacity, timeline, and the `diagnostics.start`, `diagnostics.stop`, `diagnostics.freeze`, `diagnostics.clear`, `diagnostics.export`, and `diagnostics.readback` controls in separate blocks. **Freeze** preserves a stable incident window. **Export diagnostic JSON** creates a local `vanta-city-diagnostic-trace.json` download only after the command is invoked, then removes its temporary link and revokes its object URL. The JSON uses schema `vanta-city.diagnostic-trace`, version `1`. **Read back diagnostic JSON** validates the schema/version and shows its compact timeline; `parseDiagnosticTrace` and `summarizeDiagnosticTrace` provide the same utility to development code and tests.

To attach a trace to a bug:

1. Reproduce locally with `pnpm dev`, open the panel with backtick, and run **Start diagnostic recording** shortly before the suspected path. Eight seconds is usually enough; enter `10` for a longer window.
2. Immediately after the bad state appears, run **Freeze diagnostic recording** so later frames cannot roll over the evidence.
3. Run **Export diagnostic JSON**. Optionally paste the JSON into **Read back diagnostic JSON** and verify its frame/event counts and final state.
4. Attach `vanta-city-diagnostic-trace.json` to the issue with the exact build/commit, reproduction steps, expected behavior, and observed behavior. Review the JSON before sharing outside the project even though the schema excludes known personal and free-text fields.

An exported trace is a bounded diagnostic fact record, not deterministic game replay: it does not contain asset payloads, NPC transforms, full collision casts, pointer deltas, raw input, screenshots, or enough state to resume simulation.

## Sandbox scenarios

Run `pnpm sandbox`, or open `/?sandbox=foundation&debug=1` during `pnpm dev`. Sandbox selection is development-only and replaces the normal scene system, so a scenario can exercise one mechanic without loading story content.

Run `pnpm camera-lab`, or open `/?sandbox=camera-composition&debug=1`, for the deterministic [Camera Composition Lab](camera-composition-lab.md). It uses the existing camera owner/profile and collision-cast APIs to tune participant framing, obstructions, viewport composition, and exact gameplay restoration without creating another camera controller.

To add a scenario:

1. Add `src/sandbox/scenarios/<name>Sandbox.ts` and export a `SandboxScenario` with a stable URL-safe `id`, title, and `create(context)` function.
2. Implement the returned `GameSystem`. Add scene objects and debug registrations in `init`, then remove objects, unregister callbacks, and dispose Three.js resources in `dispose`.
3. Add the scenario to the map in `src/sandbox/loadSandboxScenario.ts`.
4. Open `/?sandbox=<id>&debug=1` and verify the scenario starts independently, survives pause/resume, and cleans up during hot reload.
5. Add a focused test for any scenario logic that does not require WebGL.

Do not import sandbox modules from production systems. Do not use the sandbox as a level editor or a production cheat surface.

## Errors and bundle reporting

System initialization failures include the failing system ID and dispose already initialized systems. Asset load failures include the logical asset ID, expected type, and resolved URL. Development builds also report uncaught errors and unhandled promise rejections in the panel and console.

After `pnpm build`, run `pnpm size` to print raw and gzip totals for emitted JavaScript and CSS, label index-referenced files as initial and deferred files as lazy, and show initial and overall totals. It emits a CI warning above the informational `BUNDLE_WARN_KB` threshold (1536 KiB by default) but does not fail the build.

Development-only renderer/runtime/loading metrics use bounded rolling windows so the panel does not present noisy single-frame timings. The public snapshots and controlled logical-asset fault URLs/commands are documented in [Loading and production performance](loading-performance.md). Never enable the timing collectors or loading fault controller in a production build.
