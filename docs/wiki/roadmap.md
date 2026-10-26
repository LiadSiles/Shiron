# Roadmap and status

_Last updated: 2026-10-26_

| Version | Scope | Status |
|---|---|---|
| 0.1.0 | Prototype: share-sheet import (voice notes, mp3, YouTube), file picker, SHA-256 dedupe, processing queue; server (ffmpeg trim + loudness → m4a, Hebrew transcription, Claude naming/categories/keywords); 32 categories with Hebrew-calendar seasons; review inbox; home "now" suggestions; frecency ranking + pins; Hebrew search; background player with lock screen, fade stop, repeat; YouTube embedded player; RTL + dark mode | ✅ built (unit tests, prebuild, JS bundles); released as v0.1.0 (APK + IPA); awaiting device test |
| 0.2.0 | No server: on-device audio processing (native module: Ogg Opus demux + AVAudioConverter on iOS, MediaCodec on Android; trim, loudness, AAC); more formats incl. video sound tracks; AI via Groq (Whisper + gpt-oss, strict JSON schema) with the teacher's own free key and an in-app connect flow (clipboard detection); DB v2 adds `audio_state` | ✅ released as v0.2.0 (APK 45 MB + IPA 11.7 MB); iOS audio verified on macOS in CI; Android decoding and Groq calls awaiting device test |
| 0.3 | Device feedback fixes; app icon and splash; tune confidence thresholds on ~200 real songs; swipe-to-approve | next |
| 0.4 | Whole-chat import (WhatsApp "export chat with media" ZIP; use neighbouring messages as context) | planned (moved here from v2 if the owner confirms — open question in the planning doc) |
| 0.5 | Acoustic-fingerprint dedupe (computed on the phone during conversion, merge into existing song) | planned |
| 0.6 | Playlists ("מעגל בוקר"), sleep timer with fade, big-tile class mode | planned |
| 0.7 | Library shared with the assistant (needs accounts + sync: a server or a sync service — owner decision, conflicts with "no server") | planned |
| beta | Pilot with 10 teachers; TestFlight | — |
| 1.0 | Privacy review (minors' data), App Store | — |

## Open questions (owner)

- Does the teacher use an iPhone, Android, or both? (planning-doc comment)
- How many of her songs are YouTube links? Decides how much to invest in YouTube.
- Move whole-chat ZIP import into the MVP?

## Waiting on

- Owner's device test of 0.2.0 on Android: share a WhatsApp voice note and a video; it should
  play within seconds offline; connect Groq from the banner; the song gets a title and category.
- First real Groq run: the strict JSON schema (with `enum` and nullable types) is untested
  against the live API; `json_object` mode is the automatic fallback.
- Running the Android instrumented tests locally (no emulator on GitHub runners).
