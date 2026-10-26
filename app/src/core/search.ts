import { CATEGORIES, getCategory } from './categories';
import { normalize, tokenize, tokenMatch } from './hebrew';
import type { SongWithCategories } from './types';

export interface SearchHit {
  song: SongWithCategories;
  score: number;
  /** A lyrics line containing the match, to help recognize the song. */
  snippet: string | null;
  matchedIn: 'title' | 'lyrics' | 'keywords' | 'category' | 'summary';
}

const FIELD_WEIGHT = { title: 5, keywords: 3, category: 3, lyrics: 2, summary: 1 } as const;

interface Indexed {
  song: SongWithCategories;
  fields: Record<keyof typeof FIELD_WEIGHT, string[]>;
  lyricLines: string[];
}

function indexSong(song: SongWithCategories): Indexed {
  const cats = song.categories.map((c) => getCategory(c.categoryId));
  return {
    song,
    fields: {
      title: tokenize(song.title),
      keywords: tokenize(song.keywords.join(' ')),
      category: tokenize(cats.map((c) => `${c.name} ${c.hint}`).join(' ')),
      lyrics: tokenize(song.lyrics ?? ''),
      summary: tokenize(song.summary ?? ''),
    },
    lyricLines: (song.lyrics ?? '').split(/\n+/).map((l) => l.trim()).filter(Boolean),
  };
}

/**
 * Category names typed as a query ("מנוחה", "חנוכה") should surface the whole category.
 * Returns category ids whose name matches every query token.
 */
export function matchCategories(query: string): string[] {
  const q = tokenize(query);
  if (!q.length) return [];
  return CATEGORIES.filter((c) => {
    const name = tokenize(c.name);
    return q.every((t) => name.some((n) => tokenMatch(t, n) >= 2));
  }).map((c) => c.id);
}

/**
 * Full-text search over title, AI keywords, category, lyrics and summary.
 * Every query token must match somewhere (AND); fields are weighted; a usage score
 * breaks ties so familiar songs come first.
 */
export function searchSongs(
  songs: SongWithCategories[],
  query: string,
  usage: Record<string, number> = {},
): SearchHit[] {
  const qTokens = tokenize(query);
  if (!qTokens.length) return [];
  const hits: SearchHit[] = [];

  for (const idx of songs.map(indexSong)) {
    let total = 0;
    let bestField: SearchHit['matchedIn'] = 'title';
    let bestFieldScore = 0;
    let allMatched = true;

    for (const q of qTokens) {
      let tokenBest = 0;
      for (const field of Object.keys(FIELD_WEIGHT) as (keyof typeof FIELD_WEIGHT)[]) {
        let m = 0;
        for (const d of idx.fields[field]) {
          m = Math.max(m, tokenMatch(q, d));
          if (m === 3) break;
        }
        const s = m * FIELD_WEIGHT[field];
        if (s > tokenBest) tokenBest = s;
        if (s > bestFieldScore) {
          bestFieldScore = s;
          bestField = field;
        }
      }
      if (tokenBest === 0) {
        allMatched = false;
        break;
      }
      total += tokenBest;
    }
    if (!allMatched) continue;

    // Whole phrase in the title or lyrics is a strong signal.
    const phrase = normalize(query);
    if (qTokens.length > 1) {
      if (normalize(idx.song.title).includes(phrase)) total += 10;
      else if (normalize(idx.song.lyrics ?? '').includes(phrase)) total += 6;
    }

    const snippet = idx.lyricLines.find((line) => {
      const lt = tokenize(line);
      return qTokens.some((q) => lt.some((d) => tokenMatch(q, d) >= 2));
    }) ?? null;

    total += Math.min(usage[idx.song.id] ?? 0, 5) * 0.2;
    hits.push({ song: idx.song, score: total, snippet, matchedIn: bestField });
  }

  return hits.sort((a, b) => b.score - a.score);
}
