import { describe, expect, it } from 'vitest';
import { frecency, orderCategoryTiles, RANKING, rankSongs } from '../src/core/ranking';
import { textOn } from '../src/core/color';
import { CATEGORIES } from '../src/core/categories';
import { DAY, NOW } from './fixtures';

describe('ranking', () => {
  it('a recent play outweighs an old one', () => {
    const recent = frecency([{ songId: 'a', startedAt: NOW - DAY, listenedSec: 60 }], 90, NOW);
    const old = frecency([{ songId: 'b', startedAt: NOW - 180 * DAY, listenedSec: 60 }], 90, NOW);
    expect(recent).toBeGreaterThan(old * 10);
  });
  it('skips do not count', () => {
    expect(frecency([{ songId: 'a', startedAt: NOW, listenedSec: 3 }], 90, NOW)).toBe(0);
    // a 30-second song heard for 25 seconds counts
    expect(frecency([{ songId: 'a', startedAt: NOW, listenedSec: 19 }], 30, NOW)).toBeGreaterThan(0);
  });
  it('pinned first, then most used', () => {
    const ranked = rankSongs([
      { song: { id: 'used', title: 'א', createdAt: NOW - 60 * DAY, pinnedAt: null, durationSec: 60 }, events: Array.from({ length: 5 }, (_, i) => ({ songId: 'used', startedAt: NOW - i * DAY, listenedSec: 60 })), seasonal: false },
      { song: { id: 'pinned', title: 'ב', createdAt: NOW - 60 * DAY, pinnedAt: NOW - DAY, durationSec: 60 }, events: [], seasonal: false },
      { song: { id: 'rare', title: 'ג', createdAt: NOW - 60 * DAY, pinnedAt: null, durationSec: 60 }, events: [{ songId: 'rare', startedAt: NOW - 100 * DAY, listenedSec: 60 }], seasonal: false },
    ], NOW);
    expect(ranked.map((r) => r.id)).toEqual(['pinned', 'used', 'rare']);
  });
  it('a hanukkah song rises during hanukkah', () => {
    const ranked = rankSongs([
      { song: { id: 'everyday', title: 'א', createdAt: NOW - 60 * DAY, pinnedAt: null, durationSec: 60 }, events: [{ songId: 'everyday', startedAt: NOW - DAY, listenedSec: 60 }], seasonal: false },
      { song: { id: 'hanukkah', title: 'ב', createdAt: NOW - 400 * DAY, pinnedAt: null, durationSec: 60 }, events: [], seasonal: true },
    ], NOW);
    expect(ranked[0].id).toBe('hanukkah');
    expect(RANKING.seasonalBoost).toBeGreaterThan(1);
  });
  it('new songs are not buried', () => {
    const ranked = rankSongs([
      { song: { id: 'old', title: 'א', createdAt: NOW - 90 * DAY, pinnedAt: null, durationSec: 60 }, events: [{ songId: 'old', startedAt: NOW - 20 * DAY, listenedSec: 60 }], seasonal: false },
      { song: { id: 'new', title: 'ב', createdAt: NOW - DAY / 2, pinnedAt: null, durationSec: 60 }, events: [], seasonal: false },
    ], NOW);
    expect(ranked[0].id).toBe('new');
  });
});

describe('library tiles', () => {
  it('puts in-season categories first, then most used, then bigger', () => {
    const tiles = [
      { id: 'morning', count: 9, usage: 1 },
      { id: 'rest', count: 2, usage: 4 },
      { id: 'hanukkah', count: 1, usage: 0 },
      { id: 'rain', count: 3, usage: 1 },
    ];
    expect(orderCategoryTiles(tiles, ['hanukkah']).map((t) => t.id)).toEqual(['hanukkah', 'rest', 'morning', 'rain']);
  });
  it('picks readable text on every category colour', () => {
    expect(textOn('#1F3A8A')).toBe('#FFFFFF');
    expect(textOn('#F2C94C')).toBe('#1B1B22');
    // The brand coral: white, like the buttons (large text needs 3:1).
    expect(textOn('#D9573B')).toBe('#FFFFFF');
    for (const c of CATEGORIES) expect(['#FFFFFF', '#1B1B22']).toContain(textOn(c.color));
  });
});
