/**
 * The library as the screens see it: songs with their use, and what the home screen and the
 * library show (sections, tiles, a category's list). Pure — db/useLibrary loads and keeps it.
 */
import { activeCategoryIds, allCategories, getCategory, UNSORTED_ID } from './categories';
import { CategoryTile, frecency, orderCategoryTiles, rankSongs } from './ranking';
import type { PlayEvent, Playlist, SongWithCategories } from './types';

export interface LibraryState {
  loading: boolean;
  songs: SongWithCategories[];
  byId: Map<string, SongWithCategories>;
  plays: Map<string, PlayEvent[]>;
  recentIds: string[];
  /** Her own lists, most recently changed first. */
  playlists: Playlist[];
  /** usage score per song, used to break ties in search */
  usage: Record<string, number>;
}

type Loaded = Pick<LibraryState, 'songs' | 'plays' | 'recentIds' | 'playlists'>;

export function deriveLibrary(data: Loaded, loading: boolean): LibraryState {
  const byId = new Map(data.songs.map((s) => [s.id, s]));
  const now = Date.now();
  const usage: Record<string, number> = {};
  for (const s of data.songs) usage[s.id] = frecency(data.plays.get(s.id) ?? [], s.durationSec, now);
  return { ...data, loading, byId, usage };
}

/** Songs in a category, ranked by use. */
function rankedCategory(
  lib: LibraryState,
  categoryId: string,
  now = Date.now(),
  seasonal = activeCategoryIds(new Date(now)).seasonal,
): SongWithCategories[] {
  const inCat = lib.songs.filter((s) => {
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

/** The list behind a library tile: a category, every song (most used first), or the newest. */
export function songsFor(lib: LibraryState, id: string, now = Date.now()): SongWithCategories[] {
  if (id === RECENT_ID) return recentlyAdded(lib, now);
  if (id === ALL_ID) {
    return rankSongs(lib.songs.map((s) => ({ song: s, events: lib.plays.get(s.id) ?? [], seasonal: false })), now)
      .map((r) => lib.byId.get(r.id)!)
      .filter(Boolean);
  }
  return rankedCategory(lib, id, now);
}

export type LibraryTile = CategoryTile & { name: string; plays: number };

/**
 * Library tiles: categories that have songs — and her own, even while empty — in season and
 * most used first.
 */
export function categoryTiles(lib: LibraryState, now = Date.now()): LibraryTile[] {
  const { seasonal } = activeCategoryIds(new Date(now));
  const tiles = allCategories().map((c) => {
    const songs = rankedCategory(lib, c.id, now, seasonal);
    return {
      id: c.id,
      name: c.name,
      count: songs.length,
      usage: songs.reduce((sum, s) => sum + (lib.usage[s.id] ?? 0), 0),
      plays: songs.reduce((sum, s) => sum + (lib.plays.get(s.id)?.length ?? 0), 0),
      custom: !!c.custom,
    };
  }).filter((t) => t.count > 0 || t.custom).map(({ custom: _custom, ...t }) => t);
  return orderCategoryTiles(tiles, seasonal);
}

/** Pseudo-categories with their own list screens (app/category/[id]). */
export const ALL_ID = 'all';
export const RECENT_ID = 'recent';

/** How long a song counts as "נוספו לאחרונה" (home section and library tile). */
const RECENT_FOR_MS = 14 * 24 * 60 * 60 * 1000;

/** Songs added in the last two weeks, newest first — playable at once, details filling in. */
export function recentlyAdded(lib: LibraryState, now = Date.now()): SongWithCategories[] {
  return lib.songs.filter((s) => now - s.createdAt < RECENT_FOR_MS).sort((a, b) => b.createdAt - a.createdAt);
}

export interface HomeSection {
  key: string;
  title: string;
  songs: SongWithCategories[];
  /** "הכול ›" opens this category (or 'recent'). */
  categoryId?: string;
}

/** "Now" suggestions: current holiday first, then time of day; plus pinned and recent. */
export function homeSections(lib: LibraryState, now = Date.now()): HomeSection[] {
  const { seasonal, timeOfDay } = activeCategoryIds(new Date(now));
  const sections: HomeSection[] = [];
  const seen = new Set<string>();

  // Just shared: playable at once, while the name and category are still on their way.
  const fresh = recentlyAdded(lib, now);
  if (fresh.length) sections.push({ key: 'new', title: 'נוספו לאחרונה', songs: fresh, categoryId: RECENT_ID });

  for (const id of [...seasonal, ...timeOfDay]) {
    if (seen.has(id)) continue;
    seen.add(id);
    const songs = rankedCategory(lib, id, now, seasonal);
    if (songs.length) sections.push({ key: `now-${id}`, title: `עכשיו: ${getCategory(id).name}`, songs, categoryId: id });
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
