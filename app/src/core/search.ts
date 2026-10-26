import { CATEGORIES, getCategory } from './categories';
import { MATCH, normalize, tokenize, tokenMatch } from './hebrew';
import type { SongWithCategories } from './types';

export type SearchField = 'title' | 'keywords' | 'category' | 'lyrics' | 'context' | 'summary' | 'file';

export interface SearchHit {
  song: SongWithCategories;
  score: number;
  /** A lyrics line (or the WhatsApp message) containing the match, to recognise the song. */
  snippet: string | null;
  matchedIn: SearchField;
  /** Found only through the AI's related words, not the words she typed. */
  related: boolean;
}

/**
 * Field weights. Title first; the AI's keywords and the category describe what the song is about;
 * lyrics; then the WhatsApp message it came with and the file name, which often say what it is.
 */
const FIELD_WEIGHT: Record<SearchField, number> = {
  title: 5, keywords: 3, category: 3, lyrics: 2, context: 1.5, summary: 1, file: 1,
};
const FIELDS = Object.keys(FIELD_WEIGHT) as SearchField[];

interface Indexed {
  song: SongWithCategories;
  fields: Record<SearchField, string[]>;
  lyricLines: string[];
}

const indexCache = new WeakMap<SongWithCategories, Indexed>();

function indexSong(song: SongWithCategories): Indexed {
  const cached = indexCache.get(song);
  if (cached) return cached;
  const cats = song.categories.map((c) => getCategory(c.categoryId));
  const idx: Indexed = {
    song,
    fields: {
      title: tokenize(song.title),
      keywords: tokenize(song.keywords.join(' ')),
      category: tokenize(cats.map((c) => `${c.name} ${c.hint}`).join(' ')),
      lyrics: tokenize(song.lyrics ?? ''),
      context: tokenize(song.contextText ?? ''),
      summary: tokenize(song.summary ?? ''),
      file: tokenize((song.sourceName ?? '').replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ')),
    },
    lyricLines: (song.lyrics ?? '').split(/\n+/).map((l) => l.trim()).filter(Boolean),
  };
  indexCache.set(song, idx);
  return idx;
}

/**
 * Category names typed as a query ("מנוחה", "חנוכה") surface the whole category as a chip.
 * Returns ids whose name matches every query token.
 */
export function matchCategories(query: string): string[] {
  const q = tokenize(query);
  if (!q.length) return [];
  return CATEGORIES.filter((c) => {
    const name = tokenize(c.name);
    return q.every((t) => name.some((n) => tokenMatch(t, n) >= MATCH.spelling));
  }).map((c) => c.id);
}

function bestFieldMatch(idx: Indexed, q: string): { score: number; field: SearchField } {
  let best = 0;
  let field: SearchField = 'title';
  for (const f of FIELDS) {
    let m = 0;
    for (const d of idx.fields[f]) {
      const t = tokenMatch(q, d);
      if (t > m) m = t;
      if (m === MATCH.exact) break;
    }
    const s = m * FIELD_WEIGHT[f];
    if (s > best) {
      best = s;
      field = f;
    }
  }
  return { score: best, field };
}

function snippetFor(idx: Indexed, qTokens: string[], field: SearchField): string | null {
  const lineScore = (line: string) => {
    const lt = tokenize(line);
    return qTokens.reduce((sum, q) => sum + Math.max(0, ...lt.map((d) => tokenMatch(q, d))), 0);
  };
  let best: string | null = null;
  let bestScore = 0;
  for (const line of idx.lyricLines) {
    const s = lineScore(line);
    if (s > bestScore) {
      best = line;
      bestScore = s;
    }
  }
  if (best) return best;
  if (field === 'context' && idx.song.contextText) return idx.song.contextText.split('\n')[0].slice(0, 80);
  return null;
}

/**
 * Full-text search: every typed word must match some field (AND), tolerating Hebrew prefixes,
 * full/defective spelling, sound-alike letters and typos. `related` words (from the AI, see
 * src/api/groq.ts → expandQuery) add songs where ANY of them matches, scored lower and marked.
 * Usage breaks ties, so familiar songs come first.
 */
export function searchSongs(
  songs: SongWithCategories[],
  query: string,
  usage: Record<string, number> = {},
  related: string[] = [],
): SearchHit[] {
  const qTokens = tokenize(query);
  if (!qTokens.length) return [];
  const relTokens = [...new Set(related.flatMap(tokenize))].filter((t) => t.length >= 2 && !qTokens.includes(t));
  const phrase = normalize(query);
  const hits: SearchHit[] = [];

  for (const song of songs) {
    const idx = indexSong(song);
    let total = 0;
    let field: SearchField = 'title';
    let fieldScore = 0;
    let all = true;
    for (const q of qTokens) {
      const m = bestFieldMatch(idx, q);
      if (m.score === 0) {
        all = false;
        break;
      }
      total += m.score;
      if (m.score > fieldScore) {
        fieldScore = m.score;
        field = m.field;
      }
    }

    let isRelated = false;
    if (!all) {
      // Not a direct hit: does any related word fit strongly enough?
      total = 0;
      for (const r of relTokens) {
        const m = bestFieldMatch(idx, r);
        if (m.score >= MATCH.spelling * 1.5 && m.score > total) {
          total = m.score;
          field = m.field;
        }
      }
      if (total === 0) continue;
      total *= 0.4;
      isRelated = true;
    } else if (qTokens.length > 1) {
      if (normalize(song.title).includes(phrase)) total += 10;
      else if (normalize(song.lyrics ?? '').includes(phrase)) total += 6;
    }

    total += Math.min(usage[song.id] ?? 0, 5) * 0.2;
    hits.push({
      song,
      score: total,
      snippet: snippetFor(idx, isRelated ? relTokens : qTokens, field),
      matchedIn: field,
      related: isRelated,
    });
  }

  return hits.sort((a, b) => Number(a.related) - Number(b.related) || b.score - a.score);
}

export interface Segment {
  text: string;
  hit: boolean;
}

/** Splits text into words and the rest, marking words that match a query token — for bold. */
export function highlight(text: string, query: string): Segment[] {
  const q = tokenize(query);
  if (!q.length || !text) return [{ text, hit: false }];
  const parts = text.split(/([\p{L}\p{N}\p{M}'"״׳]+)/u).filter((p) => p.length);
  const out: Segment[] = [];
  for (const part of parts) {
    const t = tokenize(part);
    const hit = t.length > 0 && t.some((d) => q.some((qq) => tokenMatch(qq, d) >= MATCH.typo));
    const last = out[out.length - 1];
    if (last && last.hit === hit) last.text += part;
    else out.push({ text: part, hit });
  }
  return out;
}

/** Keeps the last searches she ran, newest first, without repeats. */
export function pushRecent(recent: string[], query: string, max = 8): string[] {
  const q = query.trim();
  if (q.length < 2) return recent;
  const key = normalize(q);
  return [q, ...recent.filter((r) => normalize(r) !== key)].slice(0, max);
}
