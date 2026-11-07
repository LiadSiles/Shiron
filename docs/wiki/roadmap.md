# Roadmap and status

_Last updated: 2026-11-06_

| Version | Scope | Status |
|---|---|---|
| 0.1.0 | Prototype: share-sheet import (voice notes, mp3, YouTube), file picker, SHA-256 dedupe, processing queue; server (ffmpeg trim + loudness → m4a, Hebrew transcription, Claude naming/categories/keywords); 32 categories with Hebrew-calendar seasons; review inbox; home "now" suggestions; frecency ranking + pins; Hebrew search; background player with lock screen, fade stop, repeat; YouTube embedded player; RTL + dark mode | ✅ built (unit tests, prebuild, JS bundles); released as v0.1.0 (APK + IPA); awaiting device test |
| 0.2.0 | No server: on-device audio processing (native module: Ogg Opus demux + AVAudioConverter on iOS, MediaCodec on Android; trim, loudness, AAC); more formats incl. video sound tracks; AI via Groq (Whisper + gpt-oss, strict JSON schema) with the teacher's own free key and an in-app connect flow (clipboard detection); DB v2 adds `audio_state` | ✅ released as v0.2.0 (APK 45 MB + IPA 11.7 MB); iOS audio verified on macOS in CI; Android decoding and Groq calls awaiting device test |
| 0.3.0 | Owner's Android feedback on 0.2.0: Groq button (Custom Tabs fallback to the browser), diagnostics (technical log, per-song details, player errors); player: one synced play/pause, LTR media controls, drag-to-seek; search: typo and sound-alike tolerance, WhatsApp message + file name, highlighting, recent searches, related songs by meaning via Groq | ✅ released as v0.3.0 (APK 43 MB + IPA 11 MB); installed by the owner |
| 0.3.1 | Owner feedback on 0.3.0: flat categories in a 2-column square grid; native playlist (next/previous in the notification and lock screen); dismissible notification (patched expo-audio) | released, but the notification patch was not in the APK (prebuilt AAR) |
| 0.3.2 | 0.3.1 with the expo-audio patch actually built in (`buildFromSource`), APK check in CI | ✅ released as v0.3.2 (APK + IPA; patch verified in the dex); awaiting device test |
| 0.3.3 | Senior code review: dead code removed (`failed` status → DB v3, unused exports, noUnusedLocals in CI), atomic migrations, race-free library reloads, Groq timeouts, transcript kept on naming refusal, failure-safe imports, native codec cleanup; tests split per module | ✅ released as v0.3.3 (APK + IPA) |
| 0.3.4 | Owner feedback: YouTube spinner (DB v4), live player refresh, two processing lanes (play at once, names later), review songs visible, "נוספו עכשיו" | ✅ released as v0.3.4 (APK + IPA) |
| 0.4.0 | Gemini as a second AI service (owner's choice: with the recording, behind a training/human-review warning); preferred service + automatic fallback on quota; provider-neutral AI layer | ✅ released as v0.4.0 (APK + IPA); Gemini untested against the live API |
| 0.4.1 | Gemini `AQ.` keys recognised; hand-pasted keys checked by the service, not by pattern | ✅ released as v0.4.1 (APK + IPA) |
| 0.5.0 | Owner feedback: YouTube songs in the queue / full player (IFrame API), repeat off/all/one, YouTube lyrics via Gemini, no review step (DB v5), "נוספו לאחרונה" (home + tile), search bar instead of a search tab | built, but its release was blocked by Actions billing — shipped in v0.5.2 |
| 0.5.1 | "תמלול מחדש" on every song screen | not published separately — shipped in v0.5.2 |
| 0.5.2 | Transcription accuracy (phantom phrases, loops), share queue + 100 files per iOS share, notification returns after being swiped away | ✅ released as v0.5.2 (APK + IPA; includes 0.5.0 and 0.5.1, which were never published) |
| 0.5.x | Why a shared song didn't play on the owner's Xiaomi (read his technical log); app icon and splash; tune confidence thresholds on ~200 real songs; swipe-to-approve | next |
| 0.6.0 | Owner feedback: YouTube offline (loading/offline overlay, retry, previous works, only permanent errors skip, in the direction travelled), big status banner on every screen + larger toasts, work continues in the background (Android dataSync foreground service, iOS background time + expo-background-task), vector icons | not published separately (GitHub had no macOS runners for the IPA) — shipped in v0.7.0 |
| 0.7.0 | Playlists she builds herself: create, name, pick songs (with search), reorder, remove, delete; on home (one-tap play), in the library and from a song screen (DB v6) | released as v0.7.0 (includes 0.6.0) — untested on a device |
| 0.7.1 | Fix: Android release closed at launch (R8 stripped WorkManager's `WorkDatabase_Impl` constructor; keep rules via `plugins/withKeepRules.js`); safe stop for WorkService; emulator launch check on every dev push | released as v0.7.1 — passed the emulator launch check (API 34) |
| 0.8.0 | Polish: no white flash at launch (splash in app colours until home is ready), real app icon, grouped settings lists, song-screen and player action bars, ⋮ on every song row, settings beside search, white tile text; emulator screen walk with screenshots | released as v0.8.0 — checked on the emulator (API 34, light and dark), not on a phone |
| 0.8.1 | Code review: one store implementation (`core/store.ts`), one shared library load for all screens, song rows no longer re-render on player ticks, named song rules (`primaryCategoryId`, `canStart`), `SearchField`, dead code removed, wiki conventions | released as v0.8.1 — emulator walk (light/dark) identical to 0.8.0 |
| 0.9.0 | Renamed PlayGan (visible names only; ids unchanged), xylophone play-arrow logo, previous button in the mini player | released as v0.9.0 — emulator walk passed (light/dark) |
| 0.9.1 | Logo: arrow smaller and optically centred, notes a little bigger | released as v0.9.1 |
| 0.9.2 | iPhone sharing on a Sideloadly install: own share extension controller (App Group lookup, no hangs), "Open in PlayGan" document types | released as v0.9.2 — checked on the simulator |
| 0.9.3 | iPhone: no-App-Group message points to Files; "Open in PlayGan" removed (never shown); iPhone share check on the simulator | not published (GitHub billing blocked the jobs) — shipped in v0.10.0 |
| 0.10.0 | Her categories (rename, emoji/colour, remove, add — also from a song), sorting and rows/tiles for songs, categories and playlists, WMA/WMV played (own FFmpeg build), lyrics transcribed to the end (40 s parts on the phone, every word required, transcript kept if the tidy version shortens it); also 0.9.3's fixes ("+" on home, WMA explained, Gemini empty answers, share capability in Settings) | released as v0.10.0 — simulator check; untested on a device |
| 0.11.0 | MPG (and VOB/AVI/MKV/FLV) on iPhone: FFmpeg is now the fallback decoder for anything the platform can't read; YouTube keeps playing in a small window (224 × 200) while she browses; retry every failed song from Settings, and unconverted files again after each update | released as v0.11.0 — simulator: YouTube slot, small window, details over the player; MPG/WMA on iOS only built and linked (the Files share flow didn't reach the app on the simulator), decoded on Android and Linux; untested on a device |
| 0.11.1 | Back from the player works every time (one player screen at most, `showPlayer`); the small YouTube window is dragged to any corner; the YouTube player doesn't scroll | released as v0.11.1 at the owner's request before the simulator check finished; untested on a device |
| 0.12.0 | Share a song out of the app (song screen → "שיתוף": the file under her title, a YouTube song as a link); "חזרה" no longer blocked by the status banner (it covered the header while songs were named or converted); the iPhone check asserts and fails | released as v0.12.0 at the owner's request with the simulator check still running; untested on a device |
| 0.12.1 | Background work (naming, transcribing, preparing) shows on the home screen, not floating over every screen | released as v0.12.1 at the owner's request; untested on a device |
| 0.13 | Whole-chat import (WhatsApp "export chat with media" ZIP; use neighbouring messages as context) | planned (moved here from v2 if the owner confirms — open question in the planning doc) |
| 0.12 | Acoustic-fingerprint dedupe (computed on the phone during conversion, merge into existing song) | planned |
| 0.13 | Sleep timer with fade, big-tile class mode | planned |
| 0.14 | Library shared with the assistant (needs accounts + sync: a server or a sync service — owner decision, conflicts with "no server") | planned |
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
