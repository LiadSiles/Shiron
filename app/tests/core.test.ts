import { describe, expect, it } from 'vitest';
import { editDistance, MATCH, normalize, phonetic, skeleton, stems, tokenMatch } from '../src/core/hebrew';
import { highlight, matchCategories, pushRecent, searchSongs } from '../src/core/search';
import { formatTime } from '../src/core/time';
import { frecency, orderCategoryTiles, rankSongs, RANKING } from '../src/core/ranking';
import { textOn } from '../src/core/color';
import { CATEGORIES, activeCategoryIds, inSeason, normalizeHebrewMonth, toHebrewDate, CATEGORY_BY_ID } from '../src/core/categories';
import { decideStatus, fallbackTitle, isNativelyPlayable, keepCategories, youtubeIdFrom } from '../src/core/ingestRules';
import type { SongWithCategories } from '../src/core/types';

const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 25, 8, 0, 0);

function song(p: Partial<SongWithCategories> & { id: string; title: string }): SongWithCategories {
  return {
    kind: 'audio', titleSource: 'ai', lyrics: null, summary: null, keywords: [], originalUri: null,
    playableUri: 'file:///x.m4a', youtubeId: null, sourceName: null, contextText: null, sha256: null,
    durationSec: 90, audioState: 'done', status: 'ready', error: null, pinnedAt: null, createdAt: NOW - 30 * DAY,
    updatedAt: NOW, categories: [], ...p,
  };
}

describe('hebrew normalization', () => {
  it('strips niqqud, unifies final letters and punctuation', () => {
    expect(normalize('שָׁלוֹם, חֲבֵרִים!')).toBe('שלומ חברימ');
    expect(normalize('ט״ו בשבט')).toBe('טו בשבט');
  });
  it('removes attached prefixes', () => {
    expect(stems('והפרפר')).toContain('פרפר');
    expect(stems(normalize('בגן'))).toContain(normalize('גן'));
  });
  it('matches full and defective spelling', () => {
    expect(skeleton('שולחנ')).toBe(skeleton('שלחנ'));
    expect(tokenMatch('תינוק', 'תנוק')).toBeGreaterThan(0);
  });
  it('matches while typing (prefix)', () => {
    expect(tokenMatch('פרפ', 'פרפרימ')).toBe(2);
    expect(tokenMatch('פ', 'פרפר')).toBe(0);
  });
});

describe('search', () => {
  const songs = [
    song({ id: 'a', title: 'הפרפר הצבעוני', lyrics: 'פרפר נחמד\nעף בגינה' }),
    song({ id: 'b', title: 'יום הולדת שמח', lyrics: 'היום יום הולדת', categories: [{ songId: 'b', categoryId: 'birthday', confidence: 0.95, confirmed: true }] }),
    song({ id: 'c', title: 'טיפות של גשם', lyrics: 'טיף טף טיפות', keywords: ['גשם', 'חורף', 'עננים'] }),
    song({ id: 'd', title: 'שיר בוקר', lyrics: 'בוקר טוב לכל הילדים\nגם לפרפרים' }),
  ];

  it('finds by a word in the title before a word in the lyrics', () => {
    const hits = searchSongs(songs, 'פרפר');
    expect(hits.map((h) => h.song.id)).toEqual(['a', 'd']);
    expect(hits[1].snippet).toBe('גם לפרפרים');
  });
  it('finds by category context', () => {
    expect(searchSongs(songs, 'עוגה')[0]?.song.id).toBe('b');
  });
  it('finds by AI keywords', () => {
    expect(searchSongs(songs, 'חורף')[0]?.song.id).toBe('c');
  });
  it('requires every word to match', () => {
    expect(searchSongs(songs, 'פרפר גשם')).toEqual([]);
  });
  it('usage breaks ties', () => {
    const tied = [song({ id: 'x', title: 'שיר לחנוכה' }), song({ id: 'y', title: 'שיר לחנוכה' })];
    expect(searchSongs(tied, 'חנוכה', { y: 5 })[0].song.id).toBe('y');
  });
  it('maps a typed category name to the category', () => {
    expect(matchCategories('חנוכ')).toEqual(['hanukkah']);
    expect(matchCategories('יום הולדת')).toContain('birthday');
  });
});

describe('forgiving search', () => {
  const songs = [
    song({ id: 'a', title: 'הפרפר הצבעוני', lyrics: 'פרפר נחמד\nעף בגינה' }),
    song({ id: 't', title: 'שיר לטו בשבט', lyrics: 'השקדיה פורחת\nושמש פז זורחת' }),
    song({ id: 'w', title: 'שיר 3', contextText: 'השיר של הגשם שביקשת לבוקר', sourceName: 'PTT-20260101-WA0007.opus' }),
    song({ id: 'f', title: 'שיר 4', sourceName: 'hanukkah_candles.mp3' }),
  ];

  it('tolerates sound-alike letters', () => {
    expect(phonetic('תיפות')).toBe(phonetic('טיפות'));
    expect(tokenMatch('שקדיע', 'שקדיה')).toBeGreaterThan(0);
    expect(searchSongs(songs, 'שקדיא')[0]?.song.id).toBe('t'); // א for ה at the end
    expect(searchSongs(songs, 'זורכת')[0]?.song.id).toBe('t'); // כ for ח
  });
  it('tolerates one typo in a word of 4+ letters, none in short words', () => {
    expect(editDistance('פרפר', 'פרפד', 2)).toBe(1);
    expect(editDistance('פרפר', 'רפפר', 2)).toBe(1); // swapped letters
    expect(searchSongs(songs, 'פרפד')[0]?.song.id).toBe('a');
    expect(tokenMatch('גנ', 'גמ')).toBe(0);
  });
  it('ranks an exact word above a fuzzy one', () => {
    expect(tokenMatch('פרפר', 'פרפר')).toBe(MATCH.exact);
    expect(tokenMatch('פרפר', 'פרפד')).toBeLessThan(MATCH.prefix);
  });
  it('a prefixed query word does not match unrelated words', () => {
    expect(searchSongs(songs, 'שמש').map((h) => h.song.id)).toEqual(['t']);
    expect(tokenMatch('בגינה', 'גינה')).toBeGreaterThan(0);
  });
  it('searches the WhatsApp message and the file name', () => {
    const hit = searchSongs(songs, 'גשם')[0];
    expect(hit.song.id).toBe('w');
    expect(hit.matchedIn).toBe('context');
    expect(hit.snippet).toBe('השיר של הגשם שביקשת לבוקר');
    expect(searchSongs(songs, 'candles')[0]?.song.id).toBe('f');
  });
  it('adds related words from the AI after the direct hits, marked', () => {
    const hits = searchSongs(songs, 'אביב', {}, ['פורחת', 'פרחים']);
    expect(hits.map((h) => [h.song.id, h.related])).toEqual([['t', true]]);
    const mixed = searchSongs(songs, 'פרפר', {}, ['שקדיה']);
    expect(mixed.map((h) => h.song.id)).toEqual(['a', 't']);
    expect(mixed[1].related).toBe(true);
  });
  it('highlights the matched words only', () => {
    const segs = highlight('פרפר נחמד עף בגינה', 'פרפר גינה');
    expect(segs.filter((s) => s.hit).map((s) => s.text)).toEqual(['פרפר', 'בגינה']);
    expect(segs.map((s) => s.text).join('')).toBe('פרפר נחמד עף בגינה');
  });
  it('keeps recent searches newest first without repeats', () => {
    expect(pushRecent(['גשם', 'בוקר'], 'בוקר')).toEqual(['בוקר', 'גשם']);
    expect(pushRecent([], 'א')).toEqual([]);
    expect(pushRecent(['1', '2', '3'], 'חדש', 3)).toEqual(['חדש', '1', '2']);
  });
});

describe('time format', () => {
  it('shows m:ss and h:mm:ss', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65.7)).toBe('1:05');
    expect(formatTime(3725)).toBe('1:02:05');
    expect(formatTime(NaN)).toBe('0:00');
  });
});

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

describe('hebrew calendar', () => {
  it('normalizes platform month names', () => {
    expect(normalizeHebrewMonth('Adar II')).toBe('adar');
    expect(normalizeHebrewMonth('Adar')).toBe('adar');
    expect(normalizeHebrewMonth('Adar I')).toBe('adar1');
    expect(normalizeHebrewMonth('Tishrei')).toBe('tishri');
    expect(normalizeHebrewMonth('Cheshvan')).toBe('heshvan');
  });
  it('detects hanukkah season (Dec 5 2026 = 25 Kislev)', () => {
    const d = toHebrewDate(new Date('2026-12-05T10:00:00Z'));
    expect(d).toEqual({ month: 'kislev', day: 25 });
    expect(inSeason(CATEGORY_BY_ID['hanukkah'].season!, d!)).toBe(true);
    expect(inSeason(CATEGORY_BY_ID['purim'].season!, d!)).toBe(false);
  });
  it('handles windows that wrap the Hebrew new year', () => {
    expect(inSeason(CATEGORY_BY_ID['rosh-hashana'].season!, { month: 'elul', day: 25 })).toBe(true);
    expect(inSeason(CATEGORY_BY_ID['rosh-hashana'].season!, { month: 'tishri', day: 2 })).toBe(true);
    expect(inSeason(CATEGORY_BY_ID['rosh-hashana'].season!, { month: 'heshvan', day: 2 })).toBe(false);
  });
  it('suggests morning songs in the morning', () => {
    const { timeOfDay } = activeCategoryIds(new Date(2026, 9, 25, 8, 15), null);
    expect(timeOfDay).toContain('morning');
    expect(timeOfDay).not.toContain('rest');
  });
});

describe('ingest rules', () => {
  it('parses youtube links', () => {
    expect(youtubeIdFrom('https://youtu.be/dQw4w9WgXcQ?si=abc')).toBe('dQw4w9WgXcQ');
    expect(youtubeIdFrom('תראי שיר יפה https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3')).toBe('dQw4w9WgXcQ');
    expect(youtubeIdFrom('https://youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeIdFrom('https://example.com')).toBeNull();
  });
  it('turns WhatsApp file names into a readable title', () => {
    expect(fallbackTitle('PTT-20251012-WA0014.opus', NOW)).toBe('הקלטה מ-12.10.2025');
    expect(fallbackTitle('שיר_לחנוכה.mp3', NOW)).toBe('שיר לחנוכה');
  });
  it('iOS cannot play opus before conversion', () => {
    expect(isNativelyPlayable('PTT-1.opus', 'ios')).toBe(false);
    expect(isNativelyPlayable('PTT-1.opus', 'android')).toBe(true);
    expect(isNativelyPlayable('song.mp3', 'ios')).toBe(true);
  });
  it('auto-accepts only confident results', () => {
    expect(decideStatus(0.9, [{ confidence: 0.92 }])).toBe('ready');
    expect(decideStatus(0.9, [{ confidence: 0.6 }])).toBe('review');
    expect(decideStatus(0.5, [{ confidence: 0.99 }])).toBe('review');
  });
  it('keeps at most three suggestions, at least one', () => {
    expect(keepCategories([{ id: 'a', confidence: 0.2 }, { id: 'b', confidence: 0.1 }]).map((c) => c.id)).toEqual(['a']);
    expect(keepCategories([{ id: 'a', confidence: 0.9 }, { id: 'b', confidence: 0.7 }, { id: 'c', confidence: 0.6 }, { id: 'd', confidence: 0.55 }])).toHaveLength(3);
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
    for (const c of CATEGORIES) expect(['#FFFFFF', '#1B1B22']).toContain(textOn(c.color));
  });
});
