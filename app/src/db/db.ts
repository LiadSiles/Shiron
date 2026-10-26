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
];

async function migrate(db: SQLite.SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[version]);
    });
    version += 1;
    await db.execAsync(`PRAGMA user_version = ${version}`);
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
