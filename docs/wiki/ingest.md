# Ingest — how songs get in

_Last verified: 2026-10-26 (0.2.0; share flow not yet tested on a device)_

## Share sheet (`expo-share-intent` 9.x)

- Config in `app/app.json` → plugin `expo-share-intent`:
  - iOS activation: files (max 20), movies (max 20), web URL, web page, text.
  - Android: `androidIntentFilters` text, audio, video, `application/ogg`,
    `application/octet-stream`; `androidMultiIntentFilters` audio + video + ogg (WhatsApp shares
    several items as `SEND_MULTIPLE`).
- `iosShareExtensionName` **must be ASCII** ("Shiron"). The plugin strips non-ASCII to build
  the Xcode target name; a Hebrew name became "" and prebuild failed with
  `withIosXcodeprojBaseMod: Target name missing`. The display name in the share sheet is
  therefore "Shiron".
- iOS: the extension's controller is ours (patch-package replaces the plugin's template; see
  [decisions.md](decisions.md) 2026-11-06): it finds the App Group the signature really grants,
  reads audio/video from any provider, and never leaves the share sheet hanging.
- The extension opens the app with `shiron://dataUrl=<key>`, or, without an App Group,
  `shiron://share?text=…` (read by `core/incoming.ts`); `src/app/+native-intent.tsx` redirects
  both to `/` so expo-router doesn't show "unmatched route".
- `ShareHandler` in `_layout.tsx` imports, toasts a summary, then `resetShareIntent()`; it also
  watches the app's incoming link (`useLinkingURL`) for `shiron://share?text=…`.
- Checked on the iPhone simulator by `.github/workflows/ios-sim.yml` (see build-and-release.md).
- Expo Go cannot test this (native code). Needs a dev or release build.

## What a share contains

| Source | `shareIntent` | Handling |
|---|---|---|
| WhatsApp voice note | `files[]` with `.opus`/`.ogg`, mime `audio/ogg` | copied; playable on iOS after conversion (seconds) |
| mp3 (`audio/mpeg`) / m4a / wav | `files[]` | playable immediately, then converted |
| flac, amr, aiff, caf | `files[]` | converted on the phone |
| wma, wmv, asf | `files[]` | **refused at import** (`unsupportedFormat`): no decoder on iOS or Android, and neither Groq nor Gemini reads it; she gets an explanation and how to convert to MP3. Making them work would mean shipping our own decoder (an FFmpeg build with the WMA decoder for both platforms) — not done, owner's call |
| Video (mp4, mov, m4v, 3gp, mpeg, webm, mkv, avi) | `files[]`, `video/*` | the sound track is extracted; webm/mkv only on Android |
| YouTube app / link | `webUrl` and/or `text` | `youtubeIdFrom()`; title from `meta.title` if present |
| Text with a link | `text` | the rest of the text is kept as `context_text` |

`context_text` (the message that came with the file) is the strongest naming hint the AI gets.

Accepted by `isMediaFile()` (`core/ingestRules.ts`): any `audio/*`, `video/*`, `application/ogg`,
or a known extension (`AUDIO_EXT`, `VIDEO_EXT`). The native decoder has the final word; what it
can't read becomes `audioState = 'unsupported'`.

## Dedupe

- Audio: SHA-256 of the copied file (`File.digest('SHA-256')`), unique index. A duplicate is
  deleted and reported ("כבר קיים: <title>").
- YouTube: unique `youtube_id`.
- Not yet: the same song re-encoded (WhatsApp recompresses forwards). Planned: an acoustic
  fingerprint computed on the phone during conversion, merge into the existing song.

## Processing queue (`ingest/processor.ts`)

- Two independent serial lanes (since 0.3.4): **audio** (`convertNew`, on the phone) and
  **naming** (`nameSongs`, Groq). `processQueue()` triggers both; each lane is idempotent (a
  trigger during a run schedules one more pass) and never rejects. The audio lane triggers
  the naming lane when it finishes. See [audio-processing.md](audio-processing.md) and
  [ai-pipeline.md](ai-pipeline.md).
- Why two lanes: in 0.3.3 one loop converted everything, then named everything, so a song
  shared while Groq worked through a backlog waited minutes before it could play on iPhone
  (owner report: "don't make me wait for the whole process"). Now it converts in seconds,
  plays, and its name/category/lyrics appear when they arrive (UI and player update live).
- The naming lane re-reads each song before working on it (skips deleted, approved, and
  still-raw ones) and again before writing: `user` titles and confirmed categories are kept.
- `processor.running` is true while either lane works.
- `keepCategories()`: ≥ 0.5 confidence, max 3, always at least the top one.
- No approval step since 0.5.0: every processed song is `ready`; confidences are kept on
  `song_categories` (for ordering suggestions), not used to hold songs back.
- Runs on app start, on every return to the foreground, after an import and after connecting Groq.

## File picker fallback

Settings and the empty home state offer `File.pickFileAsync({ multipleFiles: true, mimeTypes: ['audio/*', 'video/*'] })`.
Share sheet and picker go through the same `importFiles()`: one unreadable file is logged and
counted as unsupported, the rest still import, and a copy whose insert failed is deleted (no
orphan files in `songs/`). `importFromPicker()` returns the toast text itself.

## Many files, many shares (0.5.2)

- iOS share extension accepts up to 100 files or videos per share
  (`iosActivationRules` in app.json; was 20). Android has no limit.
- Each share is taken at once and queued (`enqueueShare`): the handler resets the share
  intent immediately (`resetShareIntent` only clears the pointer; the files stay) so the next
  share is received even while a big batch is still saving. Before 0.5.2 a share arriving
  during an import was dropped. Batches of more than three files show "שומרת n מתוך m…".
- Saving is serial (copy + SHA-256, quick); conversion and naming then run in their own lanes,
  one song at a time each — conversion is seconds per song, and the AI services' per-minute
  quotas make parallel naming pointless.

## Working in the background (0.6.0, `src/ingest/background.ts`)

Owner: saving and processing a new song should go on after he leaves the app. Mobile systems
stop a backgrounded app within seconds, so:

- `keepWorkingInBackground()` watches `onImportState` and `onProcessorState`; while either is
  busy it calls the native `startBackgroundWork` (shiron-audio module), and `stop…` when idle.
  - **Android**: `WorkService`, a `dataSync` foreground service with a quiet notification
    ("שירון מכינה שירים חדשים…", channel "הכנת שירים", low importance). It must be started while
    the app is in the foreground (Android 12+ forbids starting it from the background — the
    call is caught and the work then only runs while the app is open). Android 15 caps
    dataSync at ~6 h/day (`onTimeout` stops it).
  - **Gotcha:** a service started with `startForegroundService()` must reach
    `startForeground()` even if the work is already over; `stopService()` before that kills the
    whole app. Every launch risked exactly that (the queue starts and finds nothing within
    milliseconds). Since 0.7.1 JS waits 2 s of steady state before starting or stopping, and
    `WorkService.stop()` only flags the request; the service goes foreground first, then stops.
- expo-background-task brings in **WorkManager**; with R8 on (the SDK 58 default) a release
  build crashed at launch until `plugins/withKeepRules.js` (see build-and-release.md).
  - **iPhone**: `UIApplication.beginBackgroundTask` — about 30 s after leaving the app, enough
    to finish the song in hand. iOS gives no more to a non-audio app.
- **expo-background-task** (`shiron-process-songs`, minimumInterval 15 min) runs
  `processQueue()` when the system decides (Android WorkManager; iOS BGTaskScheduler, often
  hours later or overnight, needs network and battery). It does nothing when all songs are
  processed. Not testable in release builds; `triggerTaskWorkerForTestingAsync` works only in
  debug builds and needs a device on iOS.
- And always: everything resumes when she opens the app.

Untested on devices so far.
