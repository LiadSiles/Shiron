import { describe, expect, it } from 'vitest';
import { compareTitles, sortCategories, sortSongs } from '../src/core/sorting';

const song = (id: string, title: string, createdAt: number, durationSec: number | null) => ({ id, title, createdAt, durationSec });
const songs = [song('a', 'שלום', 3, 90), song('b', 'אבא', 1, null), song('c', 'בוקר טוב', 2, 30), song('d', '10 אצבעות', 4, 60)];
const plays = new Map([
  ['c', [{ songId: 'c', startedAt: 100, listenedSec: 30 }, { songId: 'c', startedAt: 50, listenedSec: 30 }]],
  ['a', [{ songId: 'a', startedAt: 200, listenedSec: 30 }]],
]);
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe('sorting songs', () => {
  it('orders alphabetically in Hebrew, numbers first', () => {
    expect(ids(sortSongs(songs, 'title', plays))).toEqual(['d', 'b', 'c', 'a']);
    expect(compareTitles('2 ידיים', '10 אצבעות')).toBeLessThan(0);
  });

  it('by plays, last played, newest and length; smart/manual keep the order given', () => {
    expect(ids(sortSongs(songs, 'plays', plays))).toEqual(['c', 'a', 'b', 'd']);
    expect(ids(sortSongs(songs, 'played', plays))).toEqual(['a', 'c', 'b', 'd']);
    expect(ids(sortSongs(songs, 'added', plays))).toEqual(['d', 'a', 'c', 'b']);
    expect(ids(sortSongs(songs, 'length', plays))).toEqual(['c', 'd', 'a', 'b']);
    expect(sortSongs(songs, 'manual', plays)).toBe(songs);
    expect(sortSongs(songs, 'smart', plays)).toBe(songs);
  });
});

describe('sorting categories', () => {
  const cats = [
    { id: 'x', name: 'פורים', count: 2, plays: 9 },
    { id: 'y', name: 'בוקר טוב', count: 7, plays: 1 },
    { id: 'z', name: 'אוכל', count: 4, plays: 3 },
  ];
  it('by name, size and plays', () => {
    expect(ids(sortCategories(cats, 'title'))).toEqual(['z', 'y', 'x']);
    expect(ids(sortCategories(cats, 'count'))).toEqual(['y', 'z', 'x']);
    expect(ids(sortCategories(cats, 'plays'))).toEqual(['x', 'z', 'y']);
    expect(sortCategories(cats, 'smart')).toBe(cats);
  });
});
