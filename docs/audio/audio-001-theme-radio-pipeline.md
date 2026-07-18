# AUDIO-001 — Theme and radio audio pipeline

## Architecture decision

`AudioPlaybackCoordinator` is the single runtime owner of `AudioContext`, decoded `AudioBuffer` retention, source/gain nodes, offsets, interruption, failures, and disposal. `AudioCatalog` is data-only local audio metadata; it does not extend the Three.js model/texture loader because browser audio decoding and node lifetime are a separate ownership contract. The coordinator retains at most two decoded buffers and one live source, closes the context on disposal, and exposes immutable snapshots instead of private fields.

The coordinator is a normal `GameSystem`. It observes `game-state:changed` and the public `VehicleControllerSystem.events` stream. It uses named input edges only to retry browser-required context unlock and adds no DOM/global listener, state machine, vehicle truth, UI layout, or runtime network provider. Production audio requests must resolve below `/assets/audio/`; catalog validation rejects network URLs.

## Public contracts

- `AudioCatalog.get/first/ids` and `validateAudioCatalog` own typed `theme`/`radio` definitions and local-path validation.
- `AudioPreferenceStore.current/update/events` owns versioned persistence under `vanta-city:audio-preferences`. Volumes are finite and clamped to 0–1. Mute, mono output, and pause policy are explicit booleans.
- `AudioPlaybackCoordinator.playTheme/playRadio/pause/resume/stop/unlock/getSnapshot` owns commands and observable state. Failed local requests are retryable and never retain a source node.
- The development-only browser bridge mirrors `snapshot().audio` and exposes the same bounded playback and preference controls. It contains no credentials, URLs outside catalog metadata, private state, or provider code.

No player-facing settings panel or permanent HUD was introduced. This is an intentional UI decision: the current task needs a stable preference/playback contract first, while the shared modal/HUD authorities remain untouched. A future settings surface can bind these public methods using the existing modal zone, semantic controls, keyboard focus, accessible names, 125% text, narrow layout, and reduced-motion rules without changing audio ownership. Visual screenshots and composition-lab changes are therefore not applicable to AUDIO-001.

## Interruption matrix

| Authoritative state            | Vehicle mode | Desired channel | Offset policy                                                                     |
| ------------------------------ | ------------ | --------------- | --------------------------------------------------------------------------------- |
| `playing`                      | on foot      | theme           | Resume prior theme offset                                                         |
| `playing`                      | driving      | radio           | Pause theme; resume prior radio offset                                            |
| `paused`                       | either       | none by default | Preserve active offset                                                            |
| `map`                          | either       | none            | Preserve active offset                                                            |
| `dialogue`                     | either       | none            | Preserve active offset; dialogue remains understandable without audio competition |
| `cinematic`                    | either       | none            | Preserve active offset; cinematic system owns presentation timing                 |
| `character-select` / `booting` | either       | none            | Preserve no active source                                                         |

Repeated vehicle enter/exit and pause/resume events stop the existing source before creating another. Vehicle entry is also a user gesture that can unlock a suspended context through the existing interaction input path. If no radio track is cataloged, driving is intentionally silent rather than falling back to an undisclosed source.

The accepted instrumental currently has two catalog roles backed by one local production file: main theme and the first in-car instrumental rotation. Each role has an independent offset and volume. This exercises radio lifecycle without inventing host material; a later accepted radio catalog can replace the radio entry without changing playback ownership.

## Provider and provenance decision

Development tooling lives only in `scripts/audio/elevenlabs-audio.ts`. It reads approved values from `/Users/jschuler/Projects/vanta-city/.env`, calls only `https://api.elevenlabs.io`, enforces the two-candidate bound, and writes only allow-listed non-secret response metadata. It is never imported by `src/`.

The authenticated radio voice metadata lookup on 2026-07-18 returned HTTP 400 `voice_not_found`. No radio-host TTS request was made, no substitute voice was selected, and no character dialogue voice-over was generated.

One `music_v2` instrumental candidate was requested and accepted; no second request was needed. Full prompt, parameters, provider song ID, date, hash, technical review, decision, and project-owned license are stored beside the local asset in `public/assets/audio/ashfall-theme/`. The request used MP3 48 kHz/192 kbps, forced instrumental, a 60-second duration, no inpainting storage, and requested C2PA signing. Runtime code has no provider dependency or credential path.

## Performance, failure, and disposal

- Maximum decoded cache: two buffers.
- Maximum live source nodes: one.
- Failed loads are not cached; public error state includes local HTTP status but no response body or credential.
- Pause records modulo-duration offsets; stop clears the active offset; switching channels preserves each channel's offset.
- Disposal unsubscribes all state/preference/vehicle observers, stops and disconnects the source, disconnects gains, clears buffers/offsets, and closes the context.
- Synthetic audio is used only in unit failure/lifecycle tests. Browser acceptance decodes and plays the production-intended local MP3.

## Known limitations

- Radio-host audio remains blocked by configured voice access. Required radio information must remain non-audio until that gate succeeds.
- The accepted theme received local format, level, silence, provenance, and pipeline review; a later human listening/mix pass should confirm the final artistic mix, exact loop seam, and loudness in a representative gameplay session.
- The current radio rotation aliases the accepted theme asset. Additional original radio music is future content, not an AUDIO-001 placeholder requirement.
- Browser audio cannot begin audibly until a user gesture unlocks `AudioContext`; the queued desired track and snapshot make that state explicit.
