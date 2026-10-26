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
- The extension opens the app with `shiron://dataUrl=<key>`; `src/app/+native-intent.tsx`
  redirects that to `/` so expo-router doesn't show "unmatched route".
- `ShareHandler` in `_layout.tsx` imports, toasts a summary, then `resetShareIntent()`.
- Expo Go cannot test this (native code). Needs a dev or release build.

## What a share contains

| Source | `shareIntent` | Handling |
|---|---|---|
| WhatsApp voice note | `files[]` with `.opus`/`.ogg`, mime `audio/ogg` | copied; playable on iOS after conversion (seconds) |
| mp3 (`audio/mpeg`) / m4a / wav | `files[]` | playable immediately, then converted |
| flac, amr, aiff, caf, wma | `files[]` | converted on the phone (wma: no decoder on either platform → unsupported) |
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

- `processQueue()` is idempotent; a call during a run schedules one more pass.
- Step 1 (audio, on the phone) for every `raw` song first, then step 2 (Groq) for `pending`
  songs. See [audio-processing.md](audio-processing.md) and [ai-pipeline.md](ai-pipeline.md).
- Step 2 re-reads the song before writing (the teacher may have edited it): `user` titles and
  confirmed categories are kept.
- `keepCategories()`: ≥ 0.5 confidence, max 3, always at least the top one.
- Auto-accept: top category ≥ 0.85 **and** title ≥ 0.85 (`AUTO_ACCEPT_CONFIDENCE`). Both
  thresholds are guesses to be tuned on ~200 real songs (open roadmap item).
- Runs on app start, on every return to the foreground, after an import and after connecting Groq.

## File picker fallback

Settings and the empty home state offer `File.pickFileAsync({ multipleFiles: true, mimeTypes: ['audio/*', 'video/*'] })`.
