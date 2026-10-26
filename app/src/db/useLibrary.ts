import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { activeCategoryIds, CATEGORIES, getCategory, UNSORTED_ID } from '../core/categories';
import { CategoryTile, frecency, orderCategoryTiles, rankSongs } from '../core/ranking';
import type { PlayEvent, SongWithCategories } from '../core/types';
import { diag } from '../diag/log';
import { listSongs, onLibraryChange, playsBySong, recentlyPlayedIds } from './repo';

export interface LibraryState {
  loading: boolean;
  songs: SongWithCategories[];
  byId: Map<string, SongWithCategories>;
  plays: Map<string, PlayEvent[]>;
  recentIds: string[];
  /** usage score per song, used to break ties in search */
  usage: Record<string, number>;
  reload: () => void;
}

/** Loads the whole library into memory and refreshes it whenever it changes. */
export function useLibrary(): LibraryState {
  const [state, setState] = useState<Omit<LibraryState, 'reload' | 'byId' | 'usage'>>({
    loading: true, songs: [], plays: new Map(), recentIds: [],
  });

  // Writes come in bursts (processing a song is several updates); each triggers a reload, and
  // an older query must not land after a newer one.
  const latest = useRef(0);
  const load = useCallback(async () => {
    const id = ++latest.current;
    try {
      const [songs, plays, recentIds] = await Promise.all([listSongs(), playsBySong(), recentlyPlayedIds(10)]);
      if (id === latest.current) setState({ loading: false, songs, plays, recentIds });
    } catch (e) {
      diag('library load failed', e);
    }
  }, []);

  useEffect(() => {
    load();
    return onLibraryChange(() => {
      load();
    });
  }, [load]);

  return useMemo(() => {
    const byId = new Map(state.songs.map((s) => [s.id, s]));
    const now = Date.now();
    const usage: Record<string, number> = {};
    for (const s of state.songs) usage[s.id] = frecency(state.plays.get(s.id) ?? [], s.durationSec, now);
    return { ...state, byId, usage, reload: load };
  }, [state, load]);
}

/**
 * Songs in a category, ranked by use. Songs waiting for review are left out here only: their
 * categories are the AI's unconfirmed guess. They play, search and show under "כל השירים" and
 * "חדשים" like any other song.
 */
export function rankedCategory(
  lib: LibraryState,
  categoryId: string,
  now = Date.now(),
  seasonal = activeCategoryIds(new Date(now)).seasonal,
): SongWithCategories[] {
  const inCat = lib.songs.filter((s) => {
    if (s.status === 'review') return false;
    if (categoryId === UNSORTED_ID) return s.categories.length === 0 || s.categories.every((c) => c.categoryId === UNSORTED_ID);
    return s.categories.some((c) => c.categoryId === categoryId);
  });
  const ranked = rankSongs(
    inCat.map((s) => ({
      song: s,
      events: lib.plays.get(s.id) ?? [],
      seasonal: s.categories.some((c) => seasonal.includes(c.categoryId)),
    })),
    now,
  );
  return ranked.map((r) => lib.byId.get(r.id)!).filter(Boolean);
}

/** Library tiles: categories that have songs, in season and most used first. */
export function categoryTiles(lib: LibraryState, now = Date.now()): CategoryTile[] {
  const { seasonal } = activeCategoryIds(new Date(now));
  const tiles = CATEGORIES.map((c) => {
    const songs = rankedCategory(lib, c.id, now, seasonal);
    return { id: c.id, count: songs.length, usage: songs.reduce((sum, s) => sum + (lib.usage[s.id] ?? 0), 0) };
  }).filter((t) => t.count > 0);
  return orderCategoryTiles(tiles, seasonal);
}

/** How long a song stays in the home screen's "נוספו עכשיו". */
const NEW_FOR_MS = 2 * 24 * 60 * 60 * 1000;

export interface HomeSection {
  key: string;
  title: string;
  songs: SongWithCategories[];
}

/** "Now" suggestions: current holiday first, then time of day; plus pinned and recent. */
export function homeSections(lib: LibraryState, now = Date.now()): HomeSection[] {
  const { seasonal, timeOfDay } = activeCategoryIds(new Date(now));
  const sections: HomeSection[] = [];
  const seen = new Set<string>();

  // Just shared: playable at once, while the name and category are still on their way.
  const fresh = lib.songs.filter((s) => now - s.createdAt < NEW_FOR_MS).slice(0, 5);
  if (fresh.length) sections.push({ key: 'new', title: 'נוספו עכשיו', songs: fresh });

  for (const id of [...seasonal, ...timeOfDay]) {
    if (seen.has(id)) continue;
    seen.add(id);
    const songs = rankedCategory(lib, id, now, seasonal).slice(0, 8);
    if (songs.length) sections.push({ key: `now-${id}`, title: `עכשיו: ${getCategory(id).name}`, songs });
  }

  const pinned = lib.songs
    .filter((s) => s.pinnedAt != null)
    .sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0))
    .slice(0, 6);
  if (pinned.length) sections.push({ key: 'pinned', title: 'מוצמדים', songs: pinned });

  const recent = lib.recentIds.map((id) => lib.byId.get(id)).filter((s): s is SongWithCategories => !!s);
  if (recent.length) sections.push({ key: 'recent', title: 'ניגנת לאחרונה', songs: recent });

  return sections;
}
