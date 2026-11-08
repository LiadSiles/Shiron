/**
 * How she orders songs and categories, and how she sees them (rows or tiles). Pure logic,
 * unit-tested; the choice is remembered (ui/viewPrefs).
 */
import type { PlayEvent } from './types';

export type SongSort = 'smart' | 'manual' | 'title' | 'plays' | 'played' | 'added' | 'length';
export type CategorySort = 'smart' | 'title' | 'count' | 'plays';
export type Layout = 'rows' | 'tiles';

/** "smart" = the app's own order (most used lately, in season first); "manual" = her list's order. */
export const SONG_SORTS: { id: SongSort; label: string }[] = [
  { id: 'manual', label: 'הסדר שלי' },
  { id: 'smart', label: 'מומלץ' },
  { id: 'title', label: 'א–ת' },
  { id: 'plays', label: 'הכי מושמעים' },
  { id: 'played', label: 'נוגנו לאחרונה' },
  { id: 'added', label: 'החדשים' },
  { id: 'length', label: 'הקצרים קודם' },
];

export const CATEGORY_SORTS: { id: CategorySort; label: string }[] = [
  { id: 'smart', label: 'מומלץ' },
  { id: 'title', label: 'א–ת' },
  { id: 'count', label: 'הכי הרבה שירים' },
  { id: 'plays', label: 'הכי מושמעים' },
];

const collator = (() => {
  try {
    return new Intl.Collator('he', { numeric: true, sensitivity: 'base' });
  } catch {
    return null;
  }
})();

/** Hebrew alphabetical order (numbers in number order), falling back to plain comparison. */
export function compareTitles(a: string, b: string): number {
  const x = a.trim();
  const y = b.trim();
  return collator ? collator.compare(x, y) : x < y ? -1 : x > y ? 1 : 0;
}

interface SortableSong {
  id: string;
  title: string;
  createdAt: number;
  durationSec: number | null;
}

/** A new array in that order; ties keep the order given (stable). */
export function sortSongs<T extends SortableSong>(songs: T[], sort: SongSort, plays: Map<string, PlayEvent[]>): T[] {
  const count = (s: T) => plays.get(s.id)?.length ?? 0;
  const last = (s: T) => Math.max(0, ...(plays.get(s.id) ?? []).map((p) => p.startedAt));
  const by = (cmp: (a: T, b: T) => number) => [...songs].sort(cmp);
  switch (sort) {
    case 'title':
      return by((a, b) => compareTitles(a.title, b.title));
    case 'plays':
      return by((a, b) => count(b) - count(a));
    case 'played':
      return by((a, b) => last(b) - last(a));
    case 'added':
      return by((a, b) => b.createdAt - a.createdAt);
    case 'length':
      return by((a, b) => (a.durationSec ?? Infinity) - (b.durationSec ?? Infinity));
    default:
      return songs;
  }
}

/**
 * The order a list keeps while it is on screen. Sorting again after every play ("מומלץ",
 * "הכי מושמעים", "נוגנו לאחרונה") moved the row she was about to tap — her next tap landed on
 * another song. Songs already shown keep their places, new ones come first, deleted ones go.
 * `shown`: the ids in the order on screen (null = nothing shown yet: the fresh order).
 */
export function steadyOrder<T extends { id: string }>(fresh: T[], shown: readonly string[] | null): T[] {
  if (!shown) return fresh;
  const at = new Map(shown.map((id, i) => [id, i]));
  const added = fresh.filter((s) => !at.has(s.id));
  const kept = fresh.filter((s) => at.has(s.id)).sort((a, b) => at.get(a.id)! - at.get(b.id)!);
  return [...added, ...kept];
}

interface SortableCategory {
  id: string;
  name: string;
  count: number;
  plays: number;
}

export function sortCategories<T extends SortableCategory>(cats: T[], sort: CategorySort): T[] {
  const by = (cmp: (a: T, b: T) => number) => [...cats].sort(cmp);
  switch (sort) {
    case 'title':
      return by((a, b) => compareTitles(a.name, b.name));
    case 'count':
      return by((a, b) => b.count - a.count);
    case 'plays':
      return by((a, b) => b.plays - a.plays);
    default:
      return cats;
  }
}
