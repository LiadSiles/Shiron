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
  processor.ts — two independent lanes, each one song at a time, oldest first
    step 1, on the phone ── shiron-audio native module ── decode → trim → loudness → AAC .m4a
                        │     songs(audio_state = done, playable_uri = songs/<id>.m4a)
    step 2, Groq (needs key) ── Whisper transcription → gpt-oss title / categories / lyrics
                        ▼
  songs(status = ready), song_categories
```

Step 1 never waits for step 2: a song is playable seconds after it is shared, even offline or
without a key. Details: [audio-processing.md](audio-processing.md), [ai-pipeline.md](ai-pipeline.md).

## Data model (SQLite, `app/src/db/db.ts`)

| Table | Key columns | Notes |
|---|---|---|
| `songs` | `id` (uuid), `kind` (audio/youtube), `title`, `title_source` (file/ai/user), `lyrics`, `summary`, `keywords` (JSON array), `original_uri`, `playable_uri`, `youtube_id`, `source_name`, `context_text`, `sha256`, `duration_sec`, `audio_state` (raw/done/unsupported), `status`, `error`, `pinned_at`, `created_at`, `updated_at` | unique `sha256`, unique `youtube_id` |
| `song_categories` | `song_id`, `category_id`, `confidence`, `confirmed` | many per song; `confirmed` = set or approved by the teacher |
| `play_events` | `song_id`, `started_at`, `listened_sec` | one row per listening session, for ranking |
| `playlists` | `id` (uuid), `name`, `created_at`, `updated_at` | her own lists (0.7.0, DB v6) |
| `playlist_songs` | `playlist_id`, `song_id`, `position` | PK (playlist, song): a song is in a list once; both FKs cascade, so deleting a song or a list cleans up |
| `settings` | `key`, `value` | `connectOffered`, `recentSearches` (JSON), `diagLog` (JSON, last 150 lines) |

The Groq key is **not** in SQLite: `expo-secure-store`.

Migrations: append a SQL string to `MIGRATIONS`; `PRAGMA user_version` tracks the applied
count. Never edit an existing migration. v2 (0.2.0) added `audio_state`; v3 (0.3.3) moved the
old server's `failed` status back to `pending` (the status no longer exists). v4 (0.3.4) set
`audio_state = 'done'` on YouTube songs (they were saved as `raw`, and a raw song without a
playable file shows a spinner — `isPreparing()` now also checks `kind`). v5 (0.5.0) moved `review` → `ready`; v6 (0.7.0) added
`playlists` and `playlist_songs`.

**Paths are stored relative** to the document directory (`songs/<file>`), resolved with
`ingest/storage.ts → resolveStored()`. iOS changes the absolute container path on app
updates; absolute paths would break every song after an update.

## Status lifecycle

- Audio: `raw` → `done` (converted; original deleted) | `unsupported` (kept; played if the
  platform reads it).
- AI: `pending` → `ready` (no approval step since 0.5.0; DB v5 moved `review` → `ready`). Retryable AI problems
  (quota, offline, 5xx, bad key) leave songs `pending` and stop the queue until the next
  foreground / import / connect. A song the AI can't handle gets a fallback title → `ready` with
  `error` set; the song screen shows the error and "לעבד שוב" (`retrySong`).

## State in the UI

Shared state lives in **stores** (`core/store.ts`: `get`/`set(patch)`/`subscribe`; `set` is a
no-op when nothing changed) and components read them with `useStore(store, selector?)`
(`ui/useStore.ts`, `useSyncExternalStore`). One writer each:

| Store | Module | Read by |
|---|---|---|
| library (`{ lib }`) | `db/useLibrary.ts` → `useLibrary()` | every screen with songs |
| player | `player/player.ts` → `usePlayer()`, `usePlayerSelect(sel)` | player screens; rows select only "am I playing" |
| `processorStore` | `ingest/processor.ts` | status banner, home banner, settings, background work |
| `importStore` | `ingest/ingest.ts` | status banner, background work |

`useLibrary()` keeps **one** in-memory copy of all songs, categories, plays and playlists for
the whole app (since 0.8.1; before, each screen loaded its own). It loads on first use and again
on every `repo` write (`onLibraryChange`); a write during a load schedules one follow-up load,
never overlapping queries. Fine for hundreds of songs; revisit (paging, SQL ranking) past ~2,000.
Song rows use `usePlayerSelect`, so a playing song's position ticks (2/s) re-render only the
player views. Event streams that are not state (toasts, the technical log, key changes, repo
writes) keep their small listener sets.
