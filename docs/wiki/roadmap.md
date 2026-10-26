# Roadmap and status

_Last updated: 2026-10-26_

| Version | Scope | Status |
|---|---|---|
| 0.1.0 | Prototype: share-sheet import (voice notes, mp3, YouTube), file picker, SHA-256 dedupe, processing queue; server (ffmpeg trim + loudness → m4a, Hebrew transcription, Claude naming/categories/keywords); 32 categories with Hebrew-calendar seasons; review inbox; home "now" suggestions; frecency ranking + pins; Hebrew search; background player with lock screen, fade stop, repeat; YouTube embedded player; RTL + dark mode | ✅ built (unit tests, prebuild, JS bundles); released as v0.1.0 (APK + IPA); awaiting device test |
| 0.2.0 | No server: on-device audio processing (native module: Ogg Opus demux + AVAudioConverter on iOS, MediaCodec on Android; trim, loudness, AAC); more formats incl. video sound tracks; AI via Groq (Whisper + gpt-oss, strict JSON schema) with the teacher's own free key and an in-app connect flow (clipboard detection); DB v2 adds `audio_state` | ✅ released as v0.2.0 (APK 45 MB + IPA 11.7 MB); iOS audio verified on macOS in CI; Android decoding and Groq calls awaiting device test |
| 0.3.0 | Owner's Android feedback on 0.2.0: Groq button (Custom Tabs fallback to the browser), diagnostics (technical log, per-song details, player errors); player: one synced play/pause, LTR media controls, drag-to-seek; search: typo and sound-alike tolerance, WhatsApp message + file name, highlighting, recent searches, related songs by meaning via Groq | ✅ released as v0.3.0 (APK 43 MB + IPA 11 MB); installed by the owner |
| 0.3.1 | Owner feedback on 0.3.0: flat categories in a 2-column square grid; native playlist (next/previous in the notification and lock screen); dismissible notification (patched expo-audio) | released, but the notification patch was not in the APK (prebuilt AAR) |
| 0.3.2 | 0.3.1 with the expo-audio patch actually built in (`buildFromSource`), APK check in CI | ✅ released as v0.3.2 (APK + IPA; patch verified in the dex); awaiting device test |
| 0.3.3 | Senior code review: dead code removed (`failed` status → DB v3, unused exports, noUnusedLocals in CI), atomic migrations, race-free library reloads, Groq timeouts, transcript kept on naming refusal, failure-safe imports, native codec cleanup; tests split per module | ✅ released as v0.3.3 (APK + IPA) |
| 0.3.x | Why a shared song didn't play on the owner's Xiaomi (read his technical log); app icon and splash; tune confidence thresholds on ~200 real songs; swipe-to-approve | next |
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

- Owner's 0.2.0 report: a shared WhatsApp song didn't play (cause unknown — 0.3.0's technical
  log and "פרטים טכניים" should show it), Groq button did nothing (fixed in 0.3.0, unconfirmed).
- Owner's device test of 0.3.0: dragging the scrubber, play/pause sync between the mini and
  full player, search by meaning with a real key.
- First real Groq run: the strict JSON schema (with `enum` and nullable types) is untested
  against the live API; `json_object` mode is the automatic fallback.
- Running the Android instrumented tests locally (no emulator on GitHub runners).
