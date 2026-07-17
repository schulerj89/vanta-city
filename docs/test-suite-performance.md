# Unit-test performance

## Scope and commands

`pnpm test` is the isolated Vitest unit suite. It does not include TypeScript checking, character-asset validation, the production build, bundle reporting, or the Playwright browser suite. Measure those commands separately: combining their runtimes obscures whether a change improves unit-test feedback.

Use `pnpm test:profile` for an advisory local profile. It runs the same Vitest projects with the JSON reporter and prints wall time plus the ten slowest files and tests. File durations cover test execution only; they exclude transform, import, and environment setup. Vitest's phase totals are accumulated across parallel workers and must not be reported as wall time.

There is intentionally no timing gate in CI. Record several matched samples, report the median and range, keep the worker count fixed, and note competing machine load. A first run after dependency linking or cache eviction is a cold-ish observation, not a directly comparable warm sample.

## Environment ownership

Vitest uses its default isolated fork pool and worker count (10 workers on the benchmark machine). Most tests run in the `node` project. Only files listed in `domTestFiles` in `vite.config.ts` receive jsdom. Add a test to that list when its subject genuinely requires browser globals or DOM behavior; importing Three.js alone does not require jsdom. Keep DOM cleanup explicit and do not make tests depend on project or file ordering.

Promise-only workflows should settle their known microtask chain directly. `tests/helpers/flushPromises.ts` is the small shared helper for those cases. Use `vi.waitFor` only when the subject actually polls or completes on an indeterminate schedule; its real polling interval otherwise dominates short unit tests.

## July 2026 benchmark

Measured on an Apple M5 Mac with 10 logical CPUs and 16 GiB RAM, macOS 26.5.2, Node 26.5.0, pnpm 11.9.0, and Vitest 4.1.10. Dependencies were linked from the existing pnpm v11 store before samples were collected. Both sets used `pnpm test`, Vitest's default 10 workers, fork pool, and isolation. Each row summarizes five useful warm samples.

| Metric                          |             Before |              After |            Change |
| ------------------------------- | -----------------: | -----------------: | ----------------: |
| Wall time, median (range)       | 4.74 s (4.60-4.87) | 4.33 s (4.21-4.51) |   -0.41 s (-8.6%) |
| Vitest duration, median (range) | 4.29 s (3.88-4.44) | 3.49 s (3.41-3.70) |  -0.80 s (-18.6%) |
| Test phase, median              |             1.43 s |             1.44 s |   within variance |
| Environment phase, median       |            24.63 s |            11.04 s | -13.59 s (-55.2%) |
| Peak RSS, median                |             200 MB |             208 MB |     +8 MB (+3.6%) |
| Files / tests                   |           52 / 257 |           52 / 257 |         unchanged |

Phase values are parallel-worker sums, not elapsed time. Import and transform sums increased because Vitest constructs two explicit project graphs; lower jsdom setup and removal of unnecessary polling still reduced the measured wall time. The largest execution-only file, `characterPicker.test.ts`, fell from about 481 ms to about 100 ms in the profiling runs after promise-only waits became deterministic. No assertions or coverage categories were removed.

The initial benchmark was collected at moderate system load. A later unrelated Playwright/Chromium process briefly consumed several CPU cores; samples taken during that interference were discarded, and the matched after samples were collected after it exited. Remaining variance is why this benchmark is an advisory reference rather than a budget.

## Remaining costs

Three.js and game-system imports remain real costs even in the Node project. Splitting every subsystem into another Vitest project or adding a custom runner would add configuration and startup overhead for marginal benefit at this suite size. The browser-bound tests remain in jsdom because they own UI, input, accessibility, or browser-global behavior; their coverage must not be moved to Playwright solely to improve unit timing.
