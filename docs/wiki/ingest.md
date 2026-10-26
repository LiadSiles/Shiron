# Ingest — how songs get in

_Last verified: 2026-10-26 (0.1.0; share flow not yet tested on a device)_

## Share sheet (`expo-share-intent` 9.x)

- Config in `app/app.json` → plugin `expo-share-intent`:
  - iOS activation: files (max 20), web URL, web page, text.
  - Android: `androidIntentFilters` text, audio, `application/ogg`, `application/octet-stream`;
    `androidMultiIntentFilters` audio + ogg (WhatsApp shares several voice notes as `SEND_MULTIPLE`).
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
| WhatsApp voice note | `files[]` with `.opus`/`.ogg`, mime `audio/ogg` | copied, `playableUri` only on Android until converted |
| mp3 / m4a | `files[]` | playable immediately on both platforms |
| YouTube app / link | `webUrl` and/or `text` | `youtubeIdFrom()`; title from `meta.title` if present |
| Text with a link | `text` | the rest of the text is kept as `context_text` |

`context_text` (the message that came with the file) is the strongest naming hint the AI gets.

## Dedupe

- Audio: SHA-256 of the copied file (`File.digest('SHA-256')`), unique index. A duplicate is
  deleted and reported ("כבר קיים: <title>").
- YouTube: unique `youtube_id`.
- Not yet: the same song re-encoded (WhatsApp recompresses forwards). Planned: Chromaprint
  fingerprint on the server, merge into the existing song.

## Processing queue (`ingest/processor.ts`)

- `processQueue()` is idempotent; concurrent calls share one run. Oldest pending first.
- Per song: upload → server result → download m4a (if audio) → re-read the song (teacher may
  have edited meanwhile) → keep `user` titles and confirmed categories → `decideStatus()`.
- `keepCategories()`: ≥ 0.5 confidence, max 3, always at least the top one.
- Auto-accept: top category ≥ 0.85 **and** title ≥ 0.85 (`AUTO_ACCEPT_CONFIDENCE`). Both
  thresholds are guesses to be tuned on ~200 real songs (open roadmap item).

## File picker fallback

Settings and the empty home state offer `File.pickFileAsync({ multipleFiles: true, mimeTypes: ['audio/*'] })`.
