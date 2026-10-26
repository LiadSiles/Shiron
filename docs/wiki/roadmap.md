# Roadmap and status

_Last updated: 2026-10-26_

| Version | Scope | Status |
|---|---|---|
| 0.1.0 | Prototype: share-sheet import (voice notes, mp3, YouTube), file picker, SHA-256 dedupe, processing queue; server (ffmpeg trim + loudness → m4a, Hebrew transcription, Claude naming/categories/keywords); 32 categories with Hebrew-calendar seasons; review inbox; home "now" suggestions; frecency ranking + pins; Hebrew search; background player with lock screen, fade stop, repeat; YouTube embedded player; RTL + dark mode | ✅ built (unit tests, prebuild, JS bundles); released as v0.1.0 (APK + IPA); awaiting device test |
| 0.2 | Device feedback fixes; app icon and splash; tune confidence thresholds on ~200 real songs; swipe-to-approve | next |
| 0.3 | Whole-chat import (WhatsApp "export chat with media" ZIP; use neighbouring messages as context) | planned (moved here from v2 if the owner confirms — open question in the planning doc) |
| 0.4 | Acoustic-fingerprint dedupe (Chromaprint on the server, merge into existing song) | planned |
| 0.5 | Playlists ("מעגל בוקר"), sleep timer with fade, big-tile class mode | planned |
| 0.6 | Library shared with the assistant (needs accounts + sync — first stateful server feature, owner decision) | planned |
| beta | Pilot with 10 teachers; TestFlight | — |
| 1.0 | Privacy review (minors' data), App Store | — |

## Open questions (owner)

- Does the teacher use an iPhone, Android, or both? (planning-doc comment)
- How many of her songs are YouTube links? Decides how much to invest in YouTube.
- Move whole-chat ZIP import into the MVP?
- Hosting for the server (Render / Railway / Fly.io) and who holds the API keys.

## Waiting on

- Owner's device test: share from WhatsApp on Android; background playback with screen off.
