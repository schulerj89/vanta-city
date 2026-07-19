# PRESENTATION-002 visual review

These captures come from the live Vite game and real `TitleScreen` /
`LoadingScreen` classes through `e2e/presentation-title-loading.spec.ts`. The
loading state fixtures use the public constructor and public readiness methods
over the real presentation zone; they do not mutate loader, world, actor,
cinematic, or audio authority.

## Accepted findings

- Desktop title establishes **VANTA CITY** as the only game title, leaves the
  depot/traveler readable at center-right, and keeps setting/story/control
  hierarchy on a quiet left field.
- The generic traveler reads as decorative arrival atmosphere, not a
  face-accurate Rook portrait. The accepted art is painterly
  screenprint/rotogravure rather than an exact low-poly identity render.
- Narrow 390×844 at 125% text keeps the art in the upper band and every line,
  focus ring, 44px control, and hint inside the safe-area column. Reduced motion
  is static.
- The 1920×800 title crop stays deliberate and the Music focus ring remains
  visible without stretching the text measure.
- Measurable loading shows only the loader-provided `46%`; its semantic native
  progress control uses the Ashfall copper-to-amber value treatment instead of
  browser-default green.
- Indeterminate character readiness contains no percentage. Slow loading shows
  an elapsed label without altering readiness. Fatal startup preserves the real
  error and focuses Retry.
- The fallback card remains compact and readable over bright, visually noisy
  gameplay without covering the HUD or pretending gameplay is blocked.
- All nine retained captures have zero document overflow. Browser monitoring
  found no console/page errors, failed non-HEAD runtime requests, or external
  requests.

## Evidence matrix

- `title-desktop-default.png`
- `title-desktop-start-focused.png`
- `title-narrow-large-reduced.png`
- `title-ultrawide-music-focused.png`
- `loading-measurable-desktop.png`
- `loading-indeterminate-narrow.png`
- `loading-slow-ultrawide.png`
- `loading-fatal-retry-focused.png`
- `loading-fallback-bright-noisy.png`
