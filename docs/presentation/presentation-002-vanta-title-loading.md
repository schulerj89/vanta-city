# PRESENTATION-002 — Vanta City title and loading presentation

## Outcome

The boot presentation now names the game correctly as **VANTA CITY** while
keeping **Ashfall City · September 1997** as setting and **The Cinder Ledger**
as the story label. The title and loading surfaces share an original Atlantic
neon-deco / coastal-industrial visual language: deep harbor ink, oxidized teal,
sodium amber, cream type, wet concrete, narrow system typography, restrained
rain, and painterly screenprint/rotogravure art.

All essential title, control, progress, readiness, failure, and fallback
information remains semantic HTML. Generated art is decorative and
`aria-hidden`; runtime loads only checked-in local JPEGs. Prompts, request
settings, source/runtime hashes, transformations, and originality review live
in
[`public/assets/presentation/vanta-title-loading/provenance.json`](../../public/assets/presentation/vanta-title-loading/provenance.json).

## Ownership and truth

- `TitleScreen` owns its DOM, native Start/Continue focus, persisted prior-start
  fact, Music toggle, store subscription, and disposal. It reads and writes only
  `AudioPreferenceStore.current.muted`; it creates no audio context or parallel
  preference.
- `LoadingScreen` owns startup/readiness DOM and its display-only slow elapsed
  clock. Asset progress still comes only from `GameAssetLoader`; world and
  character readiness still comes only from ordered lifecycle callbacks.
- A percentage appears only while an authoritative local asset status supplies
  measurable progress. World/character/finalizing phases remain explicitly
  indeterminate.
- The elapsed label appears after three seconds and reads elapsed time only. It
  cannot advance readiness, complete loading, or create a minimum display time.
  It is visual-only (`aria-hidden`) so its once-per-second clock never floods the
  polite live region. Only the deduplicated phase label is live; detail copy and
  semantic progress remain accessible without turning every percentage into a
  live-region announcement.
- Playable fallback stays bounded and dismissible over gameplay. Fatal startup
  retains the real error, becomes an alert, and focuses a native Retry action.
- Bootstrap presentation-zone wiring remains integrator-owned. This slice does
  not edit `main.ts` or take cinematic, camera, world, mission, input, or audio
  playback ownership.

## Root integrator call contract

`TitleScreen.waitForStart()` resolves only after the native Start/Continue
action. If the root disposes the title while that promise is pending, the promise
rejects exactly once with `TitleScreenDisposedError` and code
`title-screen-disposed`; it never remains pending. Disposal after a successful
Start is harmless because the resolve path clears its rejection handle first.
The root must catch the typed cancellation and either ignore it for intentional
page teardown or present the underlying bootstrap cancellation through its
existing failure policy:

```ts
try {
  await title.waitForStart();
} catch (error) {
  if (!(error instanceof TitleScreenDisposedError)) throw error;
  // Intentional teardown may return. Unexpected cancellation may be presented.
}
```

When startup fails before a real `GameAssetLoader` exists, the root installs the
same loading failure component through the public factory—never a second fatal
overlay or a fake loader/progress event:

```ts
const fatal = LoadingScreen.createFatal(presentationMount, error);
```

The factory synchronously creates the canonical alert, removes progress, keeps
the real error copy, focuses Retry, starts no retained elapsed clock, and owns
normal `dispose()` cleanup. Once a real loader exists, root continues using
`new LoadingScreen(presentationMount, assets)` and `fail(error)` on that same
instance.

## Presentation states

| Surface | State                          | Non-color truth and focus                                                           |
| ------- | ------------------------------ | ----------------------------------------------------------------------------------- |
| Title   | first run / returning          | Start or Continue text; Start receives initial focus                                |
| Title   | Music on / muted               | visible text, `aria-pressed`, and Mute/Unmute accessible name from the shared store |
| Title   | departing / disposed           | explicit dataset/snapshot state; listener and store subscription released once      |
| Loading | measurable local asset         | logical asset ID, authoritative percentage, semantic progress value                 |
| Loading | world / character / finalizing | named phase plus “Indeterminate”; no invented percent                               |
| Loading | slow                           | visual-only elapsed seconds; bounded polite phase truth; readiness unchanged        |
| Loading | playable fallback              | bounded status, fallback count, native Dismiss; gameplay remains available          |
| Loading | fatal                          | alert with original error and initially focused native Retry                        |
| Loading | ready / disposed / reentry     | no fake hold; timer, listener, buttons, active statuses, and root released          |

## Responsive and motion rules

Desktop caps content in the left 43% while the focal art occupies center-right.
At 390×844 the art becomes an upper 45% band and content becomes a lower
safe-area column with full-width controls of at least 44px. Ultrawide content
and art positioning are capped rather than stretching. The 125% text fixture
uses the shared `--ui-text-scale` and has no fixed-height content container.

Essential text never sits inside the generated image. Motion is limited to an
18–20 second image scale from 1.005 to 1.015, rain/drift movement of 12px total,
and a short title opacity transition. `prefers-reduced-motion: reduce` removes
these animations and transitions and restores exact static transforms.

## Acceptance evidence

The dedicated browser suite is
[`e2e/presentation-title-loading.spec.ts`](../../e2e/presentation-title-loading.spec.ts).
It covers title default/focus, narrow 125% text/reduced motion, ultrawide Music
focus, measurable progress, narrow indeterminate readiness, ultrawide slow
elapsed, fatal Retry focus, and fallback over bright/noisy gameplay. It asserts
viewport overflow and monitors console errors, page errors, failed runtime
requests, and external requests.

Unit coverage additionally verifies the exact H1, first/returning/departing/
disposed title states, single wait promise, focus restoration seam, persistent
mute authority, truthful progress and phase durations, fallback/fatal behavior,
elapsed timer disposal, and clean loading reentry.
