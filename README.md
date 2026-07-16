# Vanta City

Browser-based low-poly open-world game foundation using TypeScript, Three.js, and Vite.

## Requirements

- Node.js 22.12 or newer
- pnpm 11

## Commands

```sh
pnpm install
pnpm dev
```

Open the URL printed by Vite. The foundation test scene uses only generated primitives, so no external assets are required. Press `Escape` or `P` to pause/resume and the backtick key to toggle the debug overlay.

Use the character panel to select a session-persistent character, inspect it with the rotation control, or disable automatic rotation. External character files are optional; see [Character assets and registration](docs/characters.md).

Quality and production commands:

```sh
pnpm test
pnpm lint
pnpm typecheck
pnpm format:check
pnpm build
pnpm preview
```

See [Architecture](docs/architecture.md) for integration contracts and design decisions.
