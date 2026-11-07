import { afterEach, describe, expect, it } from 'vitest';
import { activeCategoryIds, applyCategoryCustomizations, UNSORTED_ID } from '../src/core/categories';
import {
  ALL_ID, categoryTiles, deriveLibrary, homeSections, LibraryState, RECENT_ID, recentlyAdded, songsFor,
} from '../src/core/library';
import type { PlayEvent, SongWithCategories } from '../src/core/types';
import { DAY, NOW, song } from './fixtures';

const inCat = (id: string, categoryId: string, p: Partial<SongWithCategories> = {}) =>
  song({ id, title: id, categories: [{ songId: id, categoryId, confidence: 0.9, confirmed: false }], ...p });

function plays(id: string, n: number, daysAgo = 1): PlayEvent[] {
  return Array.from({ length: n }, (_, i) => ({ songId: id, startedAt: NOW - daysAgo * DAY - i * 60_000, listenedSec: 80 }));
}

function lib(songs: SongWithCategories[], played: Record<string, number> = {}, recentIds: string[] = []): LibraryState {
  const m = new Map<string, PlayEvent[]>();
  for (const [id, n] of Object.entries(played)) m.set(id, plays(id, n));
  return deriveLibrary({ songs, plays: m, recentIds, playlists: [] }, false);
}

const ids = (list: { id: string }[]) => list.map((s) => s.id);

describe('the library state', () => {
  it('indexes songs and scores use only for songs she played', () => {
    const l = lib([song({ id: 'a', title: 'a' }), song({ id: 'b', title: 'b' })], { a: 3 });
    expect(l.byId.get('b')?.title).toBe('b');
    expect(l.usage.a).toBeGreaterThan(0);
    expect(l.usage.b).toBe(0);
  });
});

describe('נוספו לאחרונה', () => {
  it('holds the last two weeks, newest first', () => {
    const l = lib([
      song({ id: 'old', title: 'old', createdAt: NOW - 14 * DAY }),
      song({ id: 'week', title: 'week', createdAt: NOW - 7 * DAY }),
      song({ id: 'today', title: 'today', createdAt: NOW - 1000 }),
    ]);
    expect(ids(recentlyAdded(l, NOW))).toEqual(['today', 'week']);
    expect(ids(songsFor(l, RECENT_ID, NOW))).toEqual(['today', 'week']);
  });
});

describe("a category's list", () => {
  it('"כל השירים" has every song, the most used first', () => {
    const l = lib([song({ id: 'a', title: 'a' }), song({ id: 'b', title: 'b' }), song({ id: 'c', title: 'c' })], { b: 5, c: 1 });
    const all = ids(songsFor(l, ALL_ID, NOW));
    expect(all).toHaveLength(3);
    expect(all[0]).toBe('b');
  });

  it('a category has only its songs', () => {
    const l = lib([inCat('rain', 'weather'), inCat('cow', 'animals'), inCat('dog', 'animals')]);
    expect(ids(songsFor(l, 'animals', NOW)).sort()).toEqual(['cow', 'dog']);
    expect(songsFor(l, 'weather', NOW)).toHaveLength(1);
  });

  it('"לא מסווג" has songs with no category or only that one', () => {
    const l = lib([song({ id: 'none', title: 'none' }), inCat('un', UNSORTED_ID), inCat('cow', 'animals')]);
    expect(ids(songsFor(l, UNSORTED_ID, NOW)).sort()).toEqual(['none', 'un']);
  });
});

describe('library tiles', () => {
  afterEach(() => applyCategoryCustomizations([]));

  it('show built-in categories only when they have songs, with counts and plays', () => {
    const l = lib([inCat('cow', 'animals'), inCat('dog', 'animals')], { cow: 2 });
    const tiles = categoryTiles(l, NOW);
    const animals = tiles.find((t) => t.id === 'animals');
    expect(animals).toMatchObject({ count: 2, plays: 2 });
    expect(tiles.every((t) => t.count > 0)).toBe(true);
  });

  it('show her own category even while it is empty', () => {
    applyCategoryCustomizations([{ id: 'u-1', name: 'שירי גשם', icon: null, color: null, hidden: false, createdAt: 1 }]);
    const tiles = categoryTiles(lib([]), NOW);
    expect(tiles.find((t) => t.id === 'u-1')).toMatchObject({ name: 'שירי גשם', count: 0 });
  });
});

describe('home sections', () => {
  it('is empty for an empty library', () => {
    expect(homeSections(lib([]), NOW)).toEqual([]);
  });

  it('starts with what was just shared, then the time of day', () => {
    const { timeOfDay } = activeCategoryIds(new Date(NOW));
    expect(timeOfDay.length).toBeGreaterThan(0);
    const l = lib([song({ id: 'new', title: 'new', createdAt: NOW - DAY }), inCat('t', timeOfDay[0])]);
    const keys = homeSections(l, NOW).map((s) => s.key);
    expect(keys[0]).toBe('new');
    expect(keys).toContain(`now-${timeOfDay[0]}`);
  });

  it('shows at most six pinned songs, the latest pinned first', () => {
    const pinned = Array.from({ length: 8 }, (_, i) => song({ id: `p${i}`, title: `p${i}`, pinnedAt: NOW - i * 1000 }));
    const section = homeSections(lib(pinned), NOW).find((s) => s.key === 'pinned');
    expect(ids(section!.songs)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4', 'p5']);
  });

  it('lists what she played lately, skipping songs that were deleted since', () => {
    const l = lib([song({ id: 'a', title: 'a' }), song({ id: 'b', title: 'b' })], {}, ['b', 'gone', 'a']);
    expect(ids(homeSections(l, NOW).find((s) => s.key === 'recent')!.songs)).toEqual(['b', 'a']);
  });

  it('never repeats a category that is both seasonal and time of day', () => {
    const keys = homeSections(lib([inCat('x', 'morning'), inCat('y', 'shabbat')]), Date.UTC(2026, 9, 23, 8)).map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
