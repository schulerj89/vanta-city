# AUDIO-001 — Theme and radio audio pipeline

## Architecture decision

`AudioPlaybackCoordinator` is the single runtime owner of `AudioContext`, decoded `AudioBuffer` retention, source/gain nodes, offsets, interruption, failures, and disposal. `AudioCatalog` is data-only local audio metadata; it does not extend the Three.js model/texture loader because browser audio decoding and node lifetime are a separate ownership contract. The coordinator retains at most two decoded buffers and one live source, closes the context on disposal, and exposes immutable snapshots instead of private fields.

The coordinator is a normal `GameSystem`. It observes `game-state:changed` and the public `VehicleControllerSystem.events` stream. It uses named input edges only to retry browser-required context unlock and adds no DOM/global listener, state machine, vehicle truth, UI layout, or runtime network provider. Production audio requests must resolve below `/assets/audio/`; catalog validation rejects network URLs.

## Public contracts

- `AudioCatalog.get/first/all/ids` and `validateAudioCatalog` own typed `theme`/`radio` definitions, ordered radio-program roles, and local-path validation.
- `AudioPreferenceStore.current/update/events` owns versioned persistence under `vanta-city:audio-preferences`. Volumes are finite and clamped to 0–1. Mute, mono output, and pause policy are explicit booleans.
- `AudioPlaybackCoordinator.playTheme/playRadio/nextRadio/pause/resume/stop/unlock/getSnapshot` owns commands, radio advancement, and observable state. Failed local requests are retryable and never retain a source node.
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

The radio program is catalog order: one station break followed by four non-looping music tracks. Natural source completion advances exactly one entry and wraps after the final song. Leaving the vehicle preserves the current entry's offset; natural completion clears that entry's offset. The theme no longer aliases radio content.

## Provider and provenance decision

Development tooling lives only in `scripts/audio/elevenlabs-audio.ts`. It reads approved values from `/Users/jschuler/Projects/vanta-city/.env`, calls only `https://api.elevenlabs.io`, enforces the two-candidate bound, and writes only allow-listed non-secret response metadata. It is never imported by `src/`.

A first voice lookup on 2026-07-18 returned sanitized HTTP 400 `voice_not_found`. A separate `GET /v1/user` then returned HTTP 200 without its response body being read, proving the configured API key was valid. A later exact voice recheck returned HTTP 200 `available`; no replacement key or substitute voice was used.

Exactly one bounded TTS request was then made: 231 script characters with `eleven_v3` and `mp3_44100_128`. The accepted 13.244-second station break is mono 44.1 kHz/128 kbps, peaks at -0.85 dBFS, measures -18.75 dBFS RMS, contains no clipped samples, and has no 100 ms leading or trailing silence window. Its request metadata, script, output hash, and decision are stored without the configured voice identifier in `public/assets/audio/ashfall-night-service/provenance.json`. No character dialogue was generated.

One `music_v2` instrumental candidate was requested and accepted; no second request was needed. Full prompt, parameters, provider song ID, date, hash, technical review, decision, and project-owned license are stored beside the local asset in `public/assets/audio/ashfall-theme/`. The request used MP3 48 kHz/192 kbps, forced instrumental, a 60-second duration, no inpainting storage, and requested C2PA signing. Runtime code has no provider dependency or credential path.

## Performance, failure, and disposal

- Maximum decoded cache: two buffers.
- Maximum live source nodes: one.
- Failed loads are not cached; public error state includes local HTTP status but no response body or credential.
- Pause records modulo-duration offsets; stop clears the active offset; switching channels preserves each channel's offset.
- Disposal unsubscribes all state/preference/vehicle observers, stops and disconnects the source, disconnects gains, clears buffers/offsets, and closes the context.
- Synthetic audio is used only in unit failure/lifecycle tests. Browser acceptance decodes and plays the production-intended local MP3/M4A assets.

## Known limitations

- The accepted theme received local format, level, silence, provenance, and pipeline review; a later human listening/mix pass should confirm the final artistic mix, exact loop seam, and loudness in a representative gameplay session.
- The four radio masters and station break passed technical analysis, but a later human listening pass should confirm artistic fit, speech intelligibility against vehicle/gameplay sound, and transitions in a representative mix.
- Browser audio cannot begin audibly until a user gesture unlocks `AudioContext`; the queued desired track and snapshot make that state explicit.

## Downloaded source-candidate follow-up

Four user-supplied WAV candidates in Downloads were inspected read-only and left unchanged. The user represents that they personally created all four tracks with Suno; they are not labelled CC0. All are valid, unclipped 48 kHz/16-bit stereo PCM sources, but none exposes embedded author, creator, copyright, title, source, or license metadata.

The canonical per-file hashes, durations, levels, silence/boundary findings, and decisions are recorded in [`audio-001-downloaded-candidate-audit.json`](audio-001-downloaded-candidate-audit.json). A read-only review of the signed-in Suno account on 2026-07-18 found the matching tracks were created on 2026-07-17 between 20:52 and 21:00 America/Chicago. The account showed an active Pro plan with a 2026-07-20 next billing date and current plan copy granting commercial use rights for new songs. [Suno's current terms](https://suno.com/legal/terms), revised 2026-03-26, assign Suno's interest in outputs generated during a Pro or Premier subscription while disclaiming that copyright necessarily vests. The plan and creation timeline therefore support project use; this is an evidence-backed provenance decision, not a blanket legal guarantee.

The Downloads WAV masters remain unchanged. Deterministic compact runtime derivatives were created with macOS `afconvert` as approximately 128 kbps AAC-in-M4A, each has one explicit radio-music role, and the old theme alias was removed. Exact source/runtime hashes and conversion details are stored beside the runtime assets. Full-file hard looping was intentionally avoided because the sources have different tail-silence and boundary characteristics; ordered sequential playback preserves those endings.
