# Developer tooling

Developer tooling is loaded from `main.ts` only when Vite replaces `import.meta.env.DEV` with `true`. A production build does not initialize the registry, visual helpers, panel, sandbox loader, or development commands. Never place a production feature behind the debug API.

## Opening the panel

Run `pnpm dev`, then press backtick. Add `?debug=1` to open the panel on startup. Values refresh while the panel is visible; toggles and commands remain interactive while the game is paused.

The panel consumes only `DebugRegistry` snapshots and callbacks. It does not inspect player, world, interaction, asset, or renderer internals.

## Extension API

Development integrations receive the public `DebugRegistry` and `DebugVisualHelpers` instances. Keep every unregister callback and call it when the owning system is disposed.

```ts
const unregister = [
  debug.registerValue({
    id: 'movement.speed',
    label: 'Speed',
    group: 'Movement',
    read: () => movement.getSpeed(),
  }),
  debug.registerToggle({
    id: 'movement.freeze',
    label: 'Freeze movement',
    group: 'Movement',
    onChange: (enabled) => movement.setFrozen(enabled),
  }),
  debug.registerCommand({
    id: 'movement.reset',
    label: 'Reset controller',
    group: 'Movement',
    run: () => movement.reset(),
  }),
];
```

IDs are global within the registry and duplicates fail immediately. Value readers should be cheap, side-effect-free public queries. Command failures are reported with the command ID in the diagnostics panel and console.

Visual output stays owned by the mechanic that understands it. Register only a visibility callback:

```ts
const unregisterCollision = visualHelpers.register('collision', {
  setVisible: (visible) => (collisionDebugGroup.visible = visible),
});
```

Standard helper categories are `collision`, `triggers`, `entityIds`, `spawnPoints`, `interactionRanges`, `navigation`, and `characterAlignment`. Character alignment shows the player simulation origin, collision body, visual root, measured model bounds, lowest point, and ground-contact plane. Providers registered after a toggle is enabled immediately receive the current state.

The default development actions pause/resume, reload the current level, and toggle a helper by name. A mechanic may register `player.reset` or `player.teleport` through the same command API once it has a public reset or named-spawn operation. The foundation sandbox demonstrates both without coupling the panel to a player implementation.

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
