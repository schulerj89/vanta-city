# Vanta City

Browser-based low-poly open-world game foundation using TypeScript, Three.js, and Vite.

## Requirements

- Node.js 22.13 or newer
- pnpm 11.7

## Commands

```sh
pnpm install
pnpm dev
```

Open the URL printed by Vite. The Foundry test district uses only generated primitives, so no external assets are required. Press `Escape` or `P` to pause/resume and the backtick key to open the developer panel. Its toggles expose collision, spawn, trigger, and interaction helpers.

The selected session-persistent character is used by the playable player. In development, use the `Select character` command to change it; missing external files automatically fall back to the primitive character. See [Character assets and registration](docs/characters.md).

The character picker opens before entering the district and can be reopened with `K`. It supports keyboard and mouse navigation, local portrait assets, generated portrait fallbacks, and unavailable-model states. See [Character picker](docs/character-picker.md).

## On-foot controls

- `WASD` or arrow keys: camera-relative movement
- `Shift`: sprint
- `Space`: jump
- Mouse: orbit while pointer-locked (click the game) or while holding the left button
- Mouse wheel: adjust follow distance
- `C`: re-center the camera behind a moving player
- `Q`: switch camera shoulder
- `Escape` or `P`: pause/resume
- Backtick: toggle movement and camera diagnostics

The scene guarantees a generated placeholder and requires no character asset. See
[Player controller](docs/player-controller.md) for tuning and integration APIs.

Development builds can open the developer panel with the backtick key or `?debug=1`; production builds do not initialize the panel or its commands.

Run the isolated foundation sandbox without a story scene:

```sh
pnpm sandbox
```

See [Developer tooling](docs/developer-tooling.md) for the debug extension API, visual-helper providers, commands, and adding sandbox scenarios.

See [Camera system](docs/camera-system.md) for camera controls, persistent settings, conversation framing, and ownership priorities.

See [Dialogue system](docs/dialogue.md) for conversation data, session APIs, portraits, input, and browser-test hooks.

See [Conversation-slice integration decisions](docs/conversation-slice-integration.md) for the authoritative identity, dialogue, interaction, and camera contracts selected while combining the worker branches.

## Validation

GitHub Actions is intentionally a small main-branch gate. It installs pnpm 11.7.0
with Node.js 24.4.1, installs the frozen lockfile, runs the unit tests, and creates
a production build. The build includes the TypeScript project check.

Before opening a pull request, run the fuller local validation suite:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm validate:characters
pnpm build
pnpm size
pnpm test:e2e:install # first time only
pnpm test:e2e
```

Use `pnpm preview` for a final manual check of the production build when relevant.

See [Architecture](docs/architecture.md) and [First-wave integration decisions](docs/first-wave-integration.md) for design decisions, [World levels](docs/world-levels.md) for level APIs and environment GLB registration, and [Browser smoke tests](docs/browser-smoke-tests.md) for deterministic playable-slice validation.
