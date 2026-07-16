# Developer tooling

Developer tooling is loaded from `main.ts` only when Vite replaces `import.meta.env.DEV` with `true`. A production build does not initialize the registry, visual helpers, panel, sandbox loader, or development commands. Never place a production feature behind the debug API.

## Opening the panel

Run `pnpm dev`, then press backtick. Add `?debug=1` to open the panel on startup. Values refresh while the panel is visible; toggles and commands remain interactive while the game is paused.

The panel consumes only `DebugRegistry` snapshots and callbacks. It does not inspect player, world, interaction, asset, or renderer internals.

## Panel information architecture

The panel uses one ordered taxonomy: **Player / Coordinates**, **Collision / Physics**, **Camera**, **World / Level / Spawns**, **Characters / Assets**, **Interactions**, **Dialogue / Conversation**, **Runtime / State**, and **Commands / Actions**. Use the exported `debugSections` names instead of inventing a parallel synonym such as `Movement`, `Diagnostics`, `Camera settings`, or one section per NPC. This ordering follows a debugging pass from the controlled player and physical world through presentation and interaction systems to global runtime state. Unknown custom group names remain supported and appear after the standard sections for compatibility.

Major diagnostics are placed by ownership:

- Player position, movement, and grounded state are **Player / Coordinates**, where moment-to-moment spatial state can be read together.
- Collider counts are **Collision / Physics**; level identity and spawn counts are **World / Level / Spawns**. This keeps physical constraints distinct from authored level structure.
- Camera mode, owner, target, anchor, obstruction, and preferences are **Camera**. Mode and owner are first because they explain most camera handoff issues.
- Selected/loaded player visuals, picker state, alignment measurements, animations, and NPC identity/model status are **Characters / Assets**. NPC spawn, interaction, and conversation rows follow their owning World, Interactions, and Dialogue sections instead. Every NPC row label includes the NPC name rather than creating a second section taxonomy.
- The selected interaction, candidate count, and NPC interaction states are **Interactions**. Active conversation, per-NPC conversation states, dialogue line/speaker/state, and portrait resolution are **Dialogue / Conversation** because the coordinator and presentation describe one conversation flow.
- Game state, FPS, and captured errors are **Runtime / State**.

Passive values are the read-only rows in those eight subsystem sections. Every mutating toggle or command is isolated in **Commands / Actions**, even when it affects camera or visual-helper state. This makes it possible to scan diagnostics without accidentally treating a control as a value. Control labels retain their subsystem terminology, and stable IDs remain the automation interface.

Each section is a native `details` element with a keyboard-operable `summary` exposed as a level-two heading. Player, Camera, Interactions, and Runtime / State start expanded because they contain the most frequently read state; all section states survive toggle updates. Commands are forms, so their explicitly labelled text inputs submit with Enter. Focused editable controls do not leak bound keys into player, camera, dialogue, or runtime input; backtick remains available to close the panel. Focus outlines are high contrast. On narrow viewports the panel becomes a bottom sheet capped at 52% of viewport height, uses safe-area padding, and increases control heights so it does not unnecessarily cover the canvas or core controls.

Alternatives considered were free-form registration groups, a separate section for every NPC, keeping `Camera settings`/`Visual helpers` beside passive state, and a custom accordion. Free-form and per-entity sections made scanning depend on registration order and produced duplicate terminology. Mixed state and controls obscured which rows mutate the game. A custom accordion would duplicate browser keyboard and expanded-state semantics, so native disclosure controls were preferred.

## Extension API

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
    group: debugSections.actions,
    onChange: (enabled) => movement.setFrozen(enabled),
  }),
  debug.registerCommand({
    id: 'movement.reset',
    label: 'Reset controller',
    group: debugSections.actions,
    run: () => movement.reset(),
  }),
];
```

IDs are global within the registry and duplicates fail immediately. Value readers should be cheap, side-effect-free public queries. Command failures are reported with the command ID in the diagnostics panel and console.

The registration signatures and global IDs are unchanged. `DevelopmentTools.sections` exposes the shared constants; ungrouped values default to `Runtime / State`, while ungrouped toggles and commands default to `Commands / Actions`. Registry subscribers receive a `{ kind, id }` change payload, and existing zero-argument subscribers remain compatible. Existing custom group strings still render, but new built-in registrations should use the shared taxonomy. This is a display-only migration: command IDs, toggle IDs, callbacks, game behavior, and browser-test bridge APIs are unchanged.

Visual output stays owned by the mechanic that understands it. Register only a visibility callback:

```ts
const unregisterCollision = visualHelpers.register('collision', {
  setVisible: (visible) => (collisionDebugGroup.visible = visible),
});
```

Standard helper categories are `collision`, `triggers`, `entityIds`, `spawnPoints`, `interactionRanges`, `navigation`, and `characterAlignment`. Character alignment shows the player simulation origin, collision body, visual root, measured model bounds, lowest point, and ground-contact plane. Providers registered after a toggle is enabled immediately receive the current state.

The default development actions pause/resume, reload the current level, and toggle a helper by name. A mechanic may register `player.reset` or `player.teleport` through the same command API once it has a public reset or named-spawn operation. The foundation sandbox demonstrates both without coupling the panel to a player implementation.

The debug district additionally registers **Activate debug sparring target** and **Reset debug sparring target** under `Commands / Actions`. Passive character, range/facing, response-count, and grounding diagnostics remain in their owning sections. Browser tests can drive the same generic registry toggle through the development-only bridge; the target owns no window listener or separate debug UI.

## Sandbox scenarios

Run `pnpm sandbox`, or open `/?sandbox=foundation&debug=1` during `pnpm dev`. Sandbox selection is development-only and replaces the normal scene system, so a scenario can exercise one mechanic without loading story content.

To add a scenario:

1. Add `src/sandbox/scenarios/<name>Sandbox.ts` and export a `SandboxScenario` with a stable URL-safe `id`, title, and `create(context)` function.
2. Implement the returned `GameSystem`. Add scene objects and debug registrations in `init`, then remove objects, unregister callbacks, and dispose Three.js resources in `dispose`.
3. Add the scenario to the map in `src/sandbox/loadSandboxScenario.ts`.
4. Open `/?sandbox=<id>&debug=1` and verify the scenario starts independently, survives pause/resume, and cleans up during hot reload.
5. Add a focused test for any scenario logic that does not require WebGL.

Do not import sandbox modules from production systems. Do not use the sandbox as a level editor or a production cheat surface.

## Errors and bundle reporting

System initialization failures include the failing system ID and dispose already initialized systems. Asset load failures include the logical asset ID, expected type, and resolved URL. Development builds also report uncaught errors and unhandled promise rejections in the panel and console.

After `pnpm build`, run `pnpm size` to print raw and gzip totals for emitted JavaScript and CSS. It emits a CI warning above the informational `BUNDLE_WARN_KB` threshold (1536 KiB by default) but does not fail the build.
