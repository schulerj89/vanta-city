# CINEMATIC-004 visual review

Evidence in this directory is captured from the live browser through
`e2e/title-opening-flow.spec.ts`. Review covers the original Vanta City title,
Northbar event coverage, truthful destination presentation when readiness is
pending, and the Junction handoff. Images are retained only after checking
composition, subtitle reserve, focus, overflow, runtime errors, failed local
requests, and external requests.

The title uses repo-native HTML/CSS and system font stacks; it has no runtime
network dependency or generated bitmap text. Northbar uses the production level,
locally stored licensed character models, and authored camera anchors. The
destination may commit within one browser turn on a warm local cache; in that
case no artificial loading frame is introduced and the departure/Junction
captures truthfully bracket the readiness boundary.

## Manual findings

- Desktop and narrow title hierarchy, focus ring, Start/Music targets, text
  enlargement, and reduced-motion composition remain inside safe bounds.
- Northbar establishment clearly identifies the bounded depot, Mack's wait, and
  subtitle reserve. Participant mark changes make the failed pickup, counter
  observer, decision, and wagon move spatial rather than a Junction montage.
- The source clip inventories provide verified neutral holds but not literal
  paper separation, ticket folding, door opening, seated-with-duffel, or NPC
  driving. The current build stages those beats through authored marks, props,
  camera emphasis, eyelines, and subtitles; it does not claim facial animation,
  lip sync, or an unavailable body clip. Literal hand/vehicle choreography is
  the most important next production pass.
- The pre-authored Northbar anchors are collision-safe but intentionally broad;
  Mack/Della close-ups read better than the moving two-shot, which remains sparse
  against the wide depot. This is retained as a known visual limitation rather
  than hiding it with a tighter unvalidated camera.
- The warm-cache destination was ready inside one browser turn, so the retained
  run has no artificial loading screenshot. The public landing snapshot and
  presentation remain observable under delayed/failing local asset tests.
- Browser monitoring recorded no console errors, page errors, non-HEAD request
  failures, or external runtime requests in the accepted title/opening runs.
