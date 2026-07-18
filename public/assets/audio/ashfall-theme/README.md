# The Cinder Ledger theme

Production-intended instrumental theme generated for Vanta City through the official ElevenLabs Music API. It is original project-owned work and is stored locally for runtime playback; the browser never calls ElevenLabs.

- Provider: ElevenLabs Music API `POST /v1/music`
- Model: `music_v2`
- Output: MP3, 48 kHz, 192 kbps, stereo
- Generated: 2026-07-18
- Duration: 60.024 seconds
- SHA-256: `7d9f6fd6fdc95b93975b7718f92bcb7c05f13ed9272cf6abf5fb1cef60ef9e77`
- Provider song ID: `EWLBpdUA4qlBh4HzxvhG`
- Provider request ID / character-cost header: not returned by this endpoint
- Purpose: AUDIO-001 Ashfall instrumental main theme
- Request settings: 60,000 ms, forced instrumental, `store_for_inpainting=false`, C2PA requested
- Prompt: “Instrumental main theme for Ashfall City, an original fictional Atlantic port crime drama set in autumn 1997. Low-key analog drum machine, worn electric piano, restrained bass guitar, muted brass swells, distant industrial percussion, and a salt-air nocturnal mood. Tense but humane, deliberate courier momentum, municipal neon and wet concrete, no vocals, no spoken word, no recognizable melody, no brand references. Clear loop-friendly opening and ending, modest dynamic range for browser gameplay, 60 seconds.”

## Review decision

Candidate 1 was accepted; no second candidate was requested. The provider's instrumental enforcement and prompt establish the content boundary. Local technical inspection confirmed a valid 60.024-second stereo 48 kHz MP3 at 192 kbps, approximately -15.31 dBFS RMS and -1.03 dBFS peak, with only the intended opening/ending silence. The piece is accepted as production-intended for the current original Ashfall direction. A later human listening/mix pass may refine loop points and loudness without changing catalog or playback ownership.

Radio-host TTS was not generated. The authenticated configured-voice lookup returned HTTP 400 `voice_not_found` on 2026-07-18, so the required metadata gate remained closed and no substitute voice was used.
