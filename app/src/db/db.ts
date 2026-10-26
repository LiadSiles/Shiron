import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const MIGRATIONS: string[] = [
  // v1
  `
  CREATE TABLE IF NOT EXISTS songs (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    title_source TEXT NOT NULL,
    lyrics TEXT,
    summary TEXT,
    keywords TEXT NOT NULL DEFAULT '[]',
    original_uri TEXT,
    playable_uri TEXT,
    youtube_id TEXT,
    source_name TEXT,
    context_text TEXT,
    sha256 TEXT,
    duration_sec REAL,
    status TEXT NOT NULL,
    error TEXT,
    pinned_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS songs_sha256 ON songs(sha256) WHERE sha256 IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS songs_youtube ON songs(youtube_id) WHERE youtube_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS songs_status ON songs(status);

  CREATE TABLE IF NOT EXISTS song_categories (
    song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    category_id TEXT NOT NULL,
    confidence REAL NOT NULL,
    confirmed INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (song_id, category_id)
  );
  CREATE INDEX IF NOT EXISTS song_categories_cat ON song_categories(category_id);

  CREATE TABLE IF NOT EXISTS play_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    started_at INTEGER NOT NULL,
    listened_sec REAL NOT NULL
  );
  CREATE INDEX IF NOT EXISTS play_events_song ON play_events(song_id, started_at);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
  // v2 — audio is processed on the phone (0.2.0). Songs from 0.1 are converted again.
  `
  ALTER TABLE songs ADD COLUMN audio_state TEXT NOT NULL DEFAULT 'raw';
  `,
  // v3 — no 'failed' status any more: songs the 0.1 server failed on get another try.
  `
  UPDATE songs SET status = 'pending', error = NULL WHERE status = 'failed';
  `,
  // v4 — YouTube songs were saved with audio_state 'raw' and showed a spinner forever.
  `
  UPDATE songs SET audio_state = 'done' WHERE kind = 'youtube';
  `,
  // v5 — no review inbox any more (0.5.0): what waited for approval is simply in the library.
  `
  UPDATE songs SET status = 'ready' WHERE status = 'review';
  `,
];

async function migrate(db: SQLite.SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const next = version + 1;
    // The version bump is in the same transaction: a crash can't leave a migration applied but
    // unrecorded (re-running v2's ALTER TABLE would then fail on every launch).
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[version]);
      await db.execAsync(`PRAGMA user_version = ${next}`);
    });
    version = next;
  }
}

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('shiron.db');
      await migrate(db);
      return db;
    })();
  }
  return dbPromise;
}
