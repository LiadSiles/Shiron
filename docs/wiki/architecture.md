# Architecture

_Last verified: 2026-10-26 (0.1.0)_

## Shape

```
WhatsApp ──share──▶ iOS share extension / Android intent
                        │  (expo-share-intent)
                        ▼
               app: ingest.ts ── copy into Documents/songs/<id>-original.<ext>
                        │        SHA-256 → duplicate? → toast "כבר קיים"
                        ▼
               SQLite songs(status = pending)  ◀── UI reads everything via useLibrary()
                        │
               processor.ts (queue, one at a time, oldest first)
                        │  multipart upload
                        ▼
               server /v1/process ── ffmpeg → m4a, transcribe, Claude → JSON
                        │
               app downloads /v1/files/<id>.m4a → Documents/songs/<id>.m4a
                        ▼
               songs(status = ready | review), song_categories
```

The phone owns all state. The server is a pure function with a short-lived file cache.
Without a server configured, songs stay `pending`; files iOS can play natively (mp3, m4a,
wav, aac) are playable immediately anyway.

## Data model (SQLite, `app/src/db/db.ts`)

| Table | Key columns | Notes |
|---|---|---|
| `songs` | `id` (uuid), `kind` (audio/youtube), `title`, `title_source` (file/ai/user), `lyrics`, `summary`, `keywords` (JSON array), `original_uri`, `playable_uri`, `youtube_id`, `source_name`, `context_text`, `sha256`, `duration_sec`, `status`, `error`, `pinned_at`, `created_at`, `updated_at` | unique `sha256`, unique `youtube_id` |
| `song_categories` | `song_id`, `category_id`, `confidence`, `confirmed` | many per song; `confirmed` = set or approved by the teacher |
| `play_events` | `song_id`, `started_at`, `listened_sec` | one row per listening session, for ranking |
| `settings` | `key`, `value` | `serverUrl`, `serverToken` |

Migrations: append a SQL string to `MIGRATIONS`; `PRAGMA user_version` tracks the applied
count. Never edit an existing migration.

**Paths are stored relative** to the document directory (`songs/<file>`), resolved with
`ingest/storage.ts → resolveStored()`. iOS changes the absolute container path on app
updates; absolute paths would break every song after an update.

## Status lifecycle

`pending` → (server ok) → `ready` | `review` → (teacher approves) → `ready`
`pending` → (non-retryable error) → `failed` → (retry) → `pending`
Retryable errors (no network, 5xx, 429) leave the song `pending` and stop the queue; it runs
again on next app foreground (`AppState` listener in `_layout.tsx`) or new import.

## State in the UI

`useLibrary()` loads all songs, categories and plays into memory and re-queries on every
`repo` write (`onLibraryChange`). Fine for hundreds of songs; revisit (paging, SQL ranking)
if a library passes ~2,000 songs. Player state is a module-level store read with
`useSyncExternalStore` (`usePlayer()`).
