# Architecture

_Last verified: 2026-10-26 (0.2.0)_

## Shape

There is no Shiron server (removed in 0.2.0). Everything runs in the app; the only network
calls are to Groq with the teacher's own key, and to YouTube's oEmbed for link titles.

```
WhatsApp ──share──▶ iOS share extension / Android intent      (expo-share-intent)
                        ▼
  ingest.ts ── copy into Documents/songs/<id>-original.<ext>, SHA-256 → duplicate? → toast
                        ▼
  SQLite songs(audio_state = raw, status = pending)  ◀── UI reads everything via useLibrary()
                        │
  processor.ts — one song at a time, oldest first
    step 1, on the phone ── shiron-audio native module ── decode → trim → loudness → AAC .m4a
                        │     songs(audio_state = done, playable_uri = songs/<id>.m4a)
    step 2, Groq (needs key) ── Whisper transcription → gpt-oss title / categories / lyrics
                        ▼
  songs(status = ready | review), song_categories
```

Step 1 never waits for step 2: a song is playable seconds after it is shared, even offline or
without a key. Details: [audio-processing.md](audio-processing.md), [ai-pipeline.md](ai-pipeline.md).

## Data model (SQLite, `app/src/db/db.ts`)

| Table | Key columns | Notes |
|---|---|---|
| `songs` | `id` (uuid), `kind` (audio/youtube), `title`, `title_source` (file/ai/user), `lyrics`, `summary`, `keywords` (JSON array), `original_uri`, `playable_uri`, `youtube_id`, `source_name`, `context_text`, `sha256`, `duration_sec`, `audio_state` (raw/done/unsupported), `status`, `error`, `pinned_at`, `created_at`, `updated_at` | unique `sha256`, unique `youtube_id` |
| `song_categories` | `song_id`, `category_id`, `confidence`, `confirmed` | many per song; `confirmed` = set or approved by the teacher |
| `play_events` | `song_id`, `started_at`, `listened_sec` | one row per listening session, for ranking |
| `settings` | `key`, `value` | `connectOffered` |

The Groq key is **not** in SQLite: `expo-secure-store`.

Migrations: append a SQL string to `MIGRATIONS`; `PRAGMA user_version` tracks the applied
count. Never edit an existing migration. v2 (0.2.0) added `audio_state`.

**Paths are stored relative** to the document directory (`songs/<file>`), resolved with
`ingest/storage.ts → resolveStored()`. iOS changes the absolute container path on app
updates; absolute paths would break every song after an update.

## Status lifecycle

- Audio: `raw` → `done` (converted; original deleted) | `unsupported` (kept; played if the
  platform reads it).
- AI: `pending` → `ready` | `review` → (teacher approves) → `ready`. Retryable Groq problems
  (quota, offline, 5xx, bad key) leave songs `pending` and stop the queue until the next
  foreground / import / connect. A song Groq can't handle gets a fallback title → `review`.

## State in the UI

`useLibrary()` loads all songs, categories and plays into memory and re-queries on every
`repo` write (`onLibraryChange`). Fine for hundreds of songs; revisit (paging, SQL ranking)
past ~2,000. Player state is a module-level store read with `useSyncExternalStore`
(`usePlayer()`); processor state (`needsKey`, `notice`, `running`) via `onProcessorState`.
