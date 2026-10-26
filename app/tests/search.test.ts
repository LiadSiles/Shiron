import { describe, expect, it } from 'vitest';
import { editDistance, MATCH, phonetic, tokenMatch } from '../src/core/hebrew';
import { highlight, matchCategories, pushRecent, searchSongs } from '../src/core/search';
import { song } from './fixtures';

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

describe('search by meaning', () => {
  it('keeps clean single Hebrew words, drops repeats, sentences and the typed word', async () => {
    const { parseExpansion } = await import('../src/core/understand');
    const out = parseExpansion('```json\n{"words": ["פְּרָחִים", "אביב", "פרחים", "ניצנים", "עץ שקדיה פורח", 7, "x"]}\n```', 'אביב');
    expect(out).toEqual(['פרחים', 'ניצנים']);
    expect(parseExpansion('not json', 'אביב')).toEqual([]);
  });
});
