# Recorded production playtest bot

`pnpm playtest:bot` builds Vanta City, starts an ephemeral local production preview, and records one deterministic critical path plus two seeded exploration sessions. It uses Playwright keyboard and mouse input against the same accessible controls and canvas a player receives. It never enables `?e2e=1`, imports the development bridge, calls debug commands, writes runtime fields, or treats private snapshots as truth.

## Run and reproduce

```sh
pnpm playtest:bot
pnpm playtest:bot -- --seeds=1337,7331
```

`--seed=<integer>` selects one exploration seed, `--seeds=<a,b>` selects up to two unique seeds, `--headed` shows Chromium, and `--skip-build` is an iteration-only option when the existing `dist/` was just produced from the same unchanged source. Reports always stay beneath ignored `reports/playbot/`; the command accepts no output-path override.

Every run records its exact Git SHA, environment, build/preview/reproduction commands, action timeline, public DOM snapshots, console and page errors, failed requests and HTTP errors, external requests, transition/anomaly screenshots, session videos, resource sizes, sampled FPS/frame intervals, JavaScript heap proxy, DOM count, and WebGL renderer. `reports/playbot/latest.json` and `latest.md` point to the newest result; each timestamped run also contains `report.json` and `summary.md`.

FPS samples are a discovery proxy collected while Chromium records video under ANGLE SwiftShader. A sample below the 50 FPS reference marks the report `issues` and captures an anomaly screenshot, but does not fail the command; the dedicated performance suite remains the release authority.

## Bounded ownership

- One invocation is aborted after five minutes.
- At most two exploration seeds run after the deterministic critical path.
- A run is capped at 500 MB. Oversized videos/screenshots/traces are pruned inside that run before reports; JSON, Markdown, and logs are retained.
- Retention keeps at most five timestamped run directories, removes runs older than seven days, and caps all retained playbot data at 1 GB.
- Cleanup recognizes only playbot run-directory names and refuses paths outside `reports/playbot`. It never deletes other reports.
- Production preview and browser processes receive interrupt/timeout cleanup, use an ephemeral port, and run one browser session at a time under ANGLE SwiftShader.

The critical path covers production boot, accessible Help discovery, picker open/close, on-foot movement, vehicle prompt/entry/driving/pause/recovery/exit, equipment inputs, combat inputs, camera input, and restoration through public surfaces. Seeded sessions use deterministic keyboard/mouse action choices and capture public-surface transitions and anomalies.

## Capability and evidence limits

On the QA-PLAYBOT-001 base, vehicle driving and the minimap are production features. Dialogue NPCs, the cash pickup, hostile combat target, mission system, and full-map modal are not production-registered. Reports therefore mark dialogue, pickup, mission, and full map unavailable, and combat partial, instead of fabricating fixtures or enabling development URL flags. A future feature becomes available to the bot only through a production player-facing input or accessible surface.

Recorded exploration is discovery evidence. It can reveal a reproducible crash, request failure, performance anomaly, blocked critical flow, or visual transition worth review, but it does not replace deterministic unit, changed-feature, smoke, visual, performance, integration, or release tests. Findings are not promoted into the roadmap automatically; any proposal must be deduplicated and reviewed under `continuousDiscovery` policy.
