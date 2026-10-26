/** Hebrew-aware text normalization for search. Pure TS. */

const NIQQUD = /[֑-ׇ]/g;
const FINALS: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const FINALS_RE = /[ךםןףץ]/g;

/** Strip niqqud and cantillation, unify final letters, lowercase Latin, drop punctuation. */
export function normalize(text: string): string {
  return text
    .normalize('NFC')
    .replace(NIQQUD, '')
    .replace(FINALS_RE, (ch) => FINALS[ch])
    .replace(/[׳״'"`״׳]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function tokenize(text: string): string[] {
  const n = normalize(text);
  return n ? n.split(' ') : [];
}

/**
 * Single-letter (and common two-letter) prefixes that attach to Hebrew words:
 * ו ה ב ל מ ש כ — e.g. "והפרפר" → "פרפר".
 */
const PREFIXES = ['וכש', 'ושה', 'וה', 'וב', 'ול', 'ומ', 'וש', 'שה', 'שב', 'של', 'כש', 'מה', 'לה', 'בה', 'ו', 'ה', 'ב', 'ל', 'מ', 'ש', 'כ'];

const HEBREW_WORD = /^[א-ת]+$/;

/** All plausible stems of a token: itself, plus the word with a prefix removed. */
export function stems(token: string): string[] {
  const out = new Set([token]);
  if (HEBREW_WORD.test(token)) {
    for (const p of PREFIXES) {
      if (token.length - p.length >= 2 && token.startsWith(p)) out.add(token.slice(p.length));
    }
  }
  return [...out];
}

/**
 * "Skeleton" without the vowel letters ו and י in the middle of a word, so that
 * full and defective spellings match: "שולחן" ≈ "שלחן", "תינוק" ≈ "תנוק".
 */
export function skeleton(token: string): string {
  if (!HEBREW_WORD.test(token) || token.length < 3) return token;
  return token[0] + token.slice(1, -1).replace(/[וי]/g, '') + token[token.length - 1];
}

/**
 * How well a query token matches a document token. 0 = no match.
 * 3 exact, 2 prefix (while typing), 1 spelling-variant match.
 */
export function tokenMatch(query: string, docToken: string): number {
  let best = 0;
  for (const s of stems(docToken)) {
    if (s === query) return 3;
    if (query.length >= 2 && s.startsWith(query)) best = Math.max(best, 2);
    else if (query.length >= 3 && skeleton(s) === skeleton(query)) best = Math.max(best, 1);
    else if (query.length >= 3 && skeleton(s).startsWith(skeleton(query))) best = Math.max(best, 1);
  }
  return best;
}
