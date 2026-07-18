# Ashfall Night Service audio

This directory contains the first local, offline radio program for Vanta City.
`AudioCatalog` is the authoritative program order: one Ashfall Night Service
station break followed by four music tracks. Every entry is non-looping, so the
playback coordinator advances through the program and wraps deterministically.

The four music files are 128 kbps AAC-in-M4A runtime derivatives of untouched
48 kHz stereo WAV masters supplied by the project owner. The owner represented
that they personally created the tracks with Suno. A read-only review of their
signed-in Suno account on 2026-07-18 found the matching tracks were created on
2026-07-17, an active Pro plan with a 2026-07-20 next billing date, and the plan
description “Commercial use rights for new songs made.” The current Suno Terms
(revision 2026-03-26) assign Suno's interest in outputs generated during a Pro
or Premier subscription, while disclaiming that copyright necessarily vests.
This supports the project-use decision but is not a general copyright warranty.

The station break is a single accepted ElevenLabs synthesis made with the
configured project voice. No credential or provider voice identifier is stored
in this directory. See `provenance.json` and
`docs/audio/audio-001-downloaded-candidate-audit.json` for exact hashes and
technical findings.

Runtime playback requires no network-loaded assets.
