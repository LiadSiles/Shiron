import * as Crypto from 'expo-crypto';
import { getDb } from './db';
import { CategoryCustomization, isBuiltinCategory, UNSORTED_ID } from '../core/categories';
import type { PlayEvent, Playlist, Song, SongCategory, SongStatus, SongWithCategories } from '../core/types';

interface SongRow {
  id: string;
  kind: string;
  title: string;
  title_source: string;
  lyrics: string | null;
  summary: string | null;
  keywords: string;
  original_uri: string | null;
  playable_uri: string | null;
  youtube_id: string | null;
  source_name: string | null;
  context_text: string | null;
  sha256: string | null;
  duration_sec: number | null;
  audio_state: string;
  status: string;
  error: string | null;
  pinned_at: number | null;
  created_at: number;
  updated_at: number;
}

function fromRow(r: SongRow): Song {
  let keywords: string[] = [];
  try {
    const parsed: unknown = JSON.parse(r.keywords);
    if (Array.isArray(parsed)) keywords = parsed.filter((k): k is string => typeof k === 'string');
  } catch {
    /* keep [] */
  }
  return {
    id: r.id,
    kind: r.kind as Song['kind'],
    title: r.title,
    titleSource: r.title_source as Song['titleSource'],
    lyrics: r.lyrics,
    summary: r.summary,
    keywords,
    originalUri: r.original_uri,
    playableUri: r.playable_uri,
    youtubeId: r.youtube_id,
    sourceName: r.source_name,
    contextText: r.context_text,
    sha256: r.sha256,
    durationSec: r.duration_sec,
    audioState: r.audio_state as Song['audioState'],
    status: r.status as SongStatus,
    error: r.error,
    pinnedAt: r.pinned_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const COLUMN: Record<keyof Song, string> = {
  id: 'id', kind: 'kind', title: 'title', titleSource: 'title_source', lyrics: 'lyrics',
  summary: 'summary', keywords: 'keywords', originalUri: 'original_uri', playableUri: 'playable_uri',
  youtubeId: 'youtube_id', sourceName: 'source_name', contextText: 'context_text', sha256: 'sha256',
  durationSec: 'duration_sec', audioState: 'audio_state', status: 'status', error: 'error', pinnedAt: 'pinned_at',
  createdAt: 'created_at', updatedAt: 'updated_at',
};

function toDbValue(key: keyof Song, value: unknown): string | number | null {
  if (key === 'keywords') return JSON.stringify(value ?? []);
  if (value === undefined) return null;
  return value as string | number | null;
}

// ---------- listeners: screens re-query when the library changes ----------

type Listener = () => void;
const listeners = new Set<Listener>();
export function onLibraryChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() {
  listeners.forEach((fn) => fn());
}

// ---------- songs ----------

export async function insertSong(song: Song): Promise<void> {
  const db = await getDb();
  const keys = Object.keys(COLUMN) as (keyof Song)[];
  await db.runAsync(
    `INSERT INTO songs (${keys.map((k) => COLUMN[k]).join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
    keys.map((k) => toDbValue(k, song[k])),
  );
  emit();
}

export async function updateSong(id: string, patch: Partial<Song>): Promise<void> {
  const db = await getDb();
  const keys = (Object.keys(patch) as (keyof Song)[]).filter((k) => k !== 'id');
  if (!keys.length) return;
  const sets = [...keys.map((k) => `${COLUMN[k]} = ?`), 'updated_at = ?'];
  await db.runAsync(
    `UPDATE songs SET ${sets.join(', ')} WHERE id = ?`,
    [...keys.map((k) => toDbValue(k, patch[k])), Date.now(), id],
  );
  emit();
}

export async function deleteSong(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM songs WHERE id = ?', [id]);
  emit();
}

export async function findBySha(sha256: string): Promise<Song | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<SongRow>('SELECT * FROM songs WHERE sha256 = ?', [sha256]);
  return r ? fromRow(r) : null;
}

export async function findByYoutube(youtubeId: string): Promise<Song | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<SongRow>('SELECT * FROM songs WHERE youtube_id = ?', [youtubeId]);
  return r ? fromRow(r) : null;
}

export async function getSong(id: string): Promise<SongWithCategories | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<SongRow>('SELECT * FROM songs WHERE id = ?', [id]);
  if (!r) return null;
  const cats = await db.getAllAsync<{ song_id: string; category_id: string; confidence: number; confirmed: number }>(
    'SELECT * FROM song_categories WHERE song_id = ? ORDER BY confidence DESC',
    [id],
  );
  return { ...fromRow(r), categories: cats.map(catFromRow) };
}

function catFromRow(c: { song_id: string; category_id: string; confidence: number; confirmed: number }): SongCategory {
  return { songId: c.song_id, categoryId: c.category_id, confidence: c.confidence, confirmed: !!c.confirmed };
}

/** All songs with their categories, in one round trip each. */
export async function listSongs(statuses?: SongStatus[]): Promise<SongWithCategories[]> {
  const db = await getDb();
  const where = statuses?.length ? `WHERE status IN (${statuses.map(() => '?').join(',')})` : '';
  const rows = await db.getAllAsync<SongRow>(`SELECT * FROM songs ${where} ORDER BY created_at DESC`, statuses ?? []);
  const cats = await db.getAllAsync<{ song_id: string; category_id: string; confidence: number; confirmed: number }>(
    'SELECT * FROM song_categories ORDER BY confidence DESC',
  );
  const bySong = new Map<string, SongCategory[]>();
  for (const c of cats) {
    const list = bySong.get(c.song_id) ?? [];
    list.push(catFromRow(c));
    bySong.set(c.song_id, list);
  }
  return rows.map((r) => ({ ...fromRow(r), categories: bySong.get(r.id) ?? [] }));
}

export async function setCategories(songId: string, cats: { id: string; confidence: number; confirmed: boolean }[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM song_categories WHERE song_id = ?', [songId]);
    for (const c of cats) {
      await db.runAsync(
        'INSERT OR REPLACE INTO song_categories (song_id, category_id, confidence, confirmed) VALUES (?, ?, ?, ?)',
        [songId, c.id, c.confidence, c.confirmed ? 1 : 0],
      );
    }
  });
  emit();
}

// ---------- plays ----------

export async function recordPlay(e: PlayEvent): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT INTO play_events (song_id, started_at, listened_sec) VALUES (?, ?, ?)', [
    e.songId, e.startedAt, e.listenedSec,
  ]);
  emit();
}

/** Plays from the last 365 days, grouped by song. */
export async function playsBySong(): Promise<Map<string, PlayEvent[]>> {
  const db = await getDb();
  const since = Date.now() - 365 * 86400000;
  const rows = await db.getAllAsync<{ song_id: string; started_at: number; listened_sec: number }>(
    'SELECT song_id, started_at, listened_sec FROM play_events WHERE started_at >= ?',
    [since],
  );
  const map = new Map<string, PlayEvent[]>();
  for (const r of rows) {
    const list = map.get(r.song_id) ?? [];
    list.push({ songId: r.song_id, startedAt: r.started_at, listenedSec: r.listened_sec });
    map.set(r.song_id, list);
  }
  return map;
}

export async function recentlyPlayedIds(limit = 10): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ song_id: string }>(
    'SELECT song_id, MAX(started_at) AS last FROM play_events GROUP BY song_id ORDER BY last DESC LIMIT ?',
    [limit],
  );
  return rows.map((r) => r.song_id);
}

// ---------- playlists ----------

/** Every playlist with its songs in order, most recently changed first. */
export async function listPlaylists(): Promise<Playlist[]> {
  const db = await getDb();
  const lists = await db.getAllAsync<{ id: string; name: string; created_at: number; updated_at: number }>(
    'SELECT * FROM playlists ORDER BY updated_at DESC',
  );
  const items = await db.getAllAsync<{ playlist_id: string; song_id: string }>(
    'SELECT playlist_id, song_id FROM playlist_songs ORDER BY position',
  );
  const byList = new Map<string, string[]>();
  for (const i of items) {
    const ids = byList.get(i.playlist_id) ?? [];
    ids.push(i.song_id);
    byList.set(i.playlist_id, ids);
  }
  return lists.map((l) => ({
    id: l.id, name: l.name, songIds: byList.get(l.id) ?? [], createdAt: l.created_at, updatedAt: l.updated_at,
  }));
}

export async function createPlaylist(name: string, songIds: string[] = []): Promise<string> {
  const db = await getDb();
  const id = Crypto.randomUUID();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    await db.runAsync('INSERT INTO playlists (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)', [id, name, now, now]);
    await writeItems(db, id, songIds);
  });
  emit();
  return id;
}

export async function renamePlaylist(id: string, name: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE playlists SET name = ?, updated_at = ? WHERE id = ?', [name, Date.now(), id]);
  emit();
}

/** Replaces the list's songs with these, in this order. */
export async function setPlaylistSongs(id: string, songIds: string[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM playlist_songs WHERE playlist_id = ?', [id]);
    await writeItems(db, id, songIds);
    await db.runAsync('UPDATE playlists SET updated_at = ? WHERE id = ?', [Date.now(), id]);
  });
  emit();
}

export async function deletePlaylist(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM playlists WHERE id = ?', [id]);
  emit();
}

async function writeItems(db: Awaited<ReturnType<typeof getDb>>, playlistId: string, songIds: string[]) {
  const unique = [...new Set(songIds)];
  for (let i = 0; i < unique.length; i++) {
    await db.runAsync('INSERT INTO playlist_songs (playlist_id, song_id, position) VALUES (?, ?, ?)', [playlistId, unique[i], i]);
  }
}

// ---------- her categories ----------

export async function listCategoryCustomizations(): Promise<CategoryCustomization[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string; name: string | null; icon: string | null; color: string | null; hidden: number; created_at: number }>(
    'SELECT * FROM category_custom',
  );
  return rows.map((r) => ({ id: r.id, name: r.name, icon: r.icon, color: r.color, hidden: !!r.hidden, createdAt: r.created_at }));
}

/** A new category of hers; returns its id. */
export async function createCategory(name: string, icon: string, color: string): Promise<string> {
  const db = await getDb();
  const id = `u-${Crypto.randomUUID()}`;
  await db.runAsync('INSERT INTO category_custom (id, name, icon, color, hidden, created_at) VALUES (?, ?, ?, ?, 0, ?)', [
    id, name.trim(), icon, color, Date.now(),
  ]);
  emit();
  return id;
}

/** Rename / new emoji or colour, for hers and for built-in ones alike. */
export async function updateCategory(id: string, name: string, icon: string, color: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO category_custom (id, name, icon, color, hidden, created_at) VALUES (?, ?, ?, ?, 0, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, icon = excluded.icon, color = excluded.color`,
    [id, name.trim(), icon, color, Date.now()],
  );
  emit();
}

/**
 * Removes a category: hers are deleted, built-in ones hidden. Its songs stay in the library
 * (under their other categories, or "לא מסווג"); the AI stops suggesting it.
 */
export async function deleteCategory(id: string): Promise<void> {
  if (id === UNSORTED_ID) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM song_categories WHERE category_id = ?', [id]);
    if (isBuiltinCategory(id)) {
      await db.runAsync(
        `INSERT INTO category_custom (id, hidden, created_at) VALUES (?, 1, ?)
         ON CONFLICT(id) DO UPDATE SET hidden = 1`,
        [id, Date.now()],
      );
    } else {
      await db.runAsync('DELETE FROM category_custom WHERE id = ?', [id]);
    }
  });
  emit();
}

/** Brings back the built-in categories she removed (their songs are not re-sorted). */
export async function restoreBuiltinCategories(): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE category_custom SET hidden = 0 WHERE hidden = 1');
  emit();
}

// ---------- settings ----------

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return r?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
}
