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
 * Letters that sound alike and are often swapped when typing (or by Whisper): ט/ת, כ/ח/ק, ס/ש,
 * א/ע. Mapped to one letter each, on top of the skeleton, to compare "how it sounds".
 */
const CONFUSABLE: Record<string, string> = { 'ט': 'ת', 'ח': 'כ', 'ק': 'כ', 'ש': 'ס', 'ע': 'א' };

export function phonetic(token: string): string {
  return skeleton(token).replace(/[טחקשע]/g, (ch) => CONFUSABLE[ch]);
}

/** Damerau–Levenshtein distance, giving up (returning max + 1) as soon as it exceeds `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (a === b) return 0;
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    rows.push([i]);
  }
  for (let j = 1; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, rows[i - 2][j - 2] + 1);
      rows[i][j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
  }
  return rows[a.length][b.length];
}

/** Typos allowed for a word of this length: none under 4 letters, 1 up to 7, then 2. */
function allowedTypos(len: number): number {
  return len < 4 ? 0 : len < 8 ? 1 : 2;
}

export const MATCH = {
  exact: 3,
  prefix: 2,
  spelling: 1.5,  // full/defective spelling (ו/י)
  sound: 1.2,     // sound-alike letters
  typo: 0.8,      // one or two typos
  typoPrefix: 0.6,
} as const;

function matchStem(q: string, s: string): number {
  if (s === q) return MATCH.exact;
  if (q.length >= 2 && s.startsWith(q)) return MATCH.prefix;
  if (q.length < 3) return 0;
  const qs = skeleton(q);
  const ss = skeleton(s);
  if (ss === qs || (ss.startsWith(qs) && qs.length >= 3)) return MATCH.spelling;
  const qp = phonetic(q);
  const sp = phonetic(s);
  if (sp === qp || (sp.startsWith(qp) && qp.length >= 3)) return MATCH.sound;
  const typos = allowedTypos(q.length);
  if (!typos) return 0;
  if (editDistance(qp, sp, typos) <= typos) return MATCH.typo;
  // While typing: the beginning of a longer word, with a typo.
  if (sp.length > qp.length && editDistance(qp, sp.slice(0, qp.length), typos) <= typos) return MATCH.typoPrefix;
  return 0;
}

/**
 * How well a query token matches a document token. 0 = no match; see MATCH for the scale.
 * Both sides may carry Hebrew prefixes ("בגשם" ↔ "והגשם"); a prefix stripped from the query
 * costs a little.
 */
export function tokenMatch(query: string, docToken: string): number {
  let best = 0;
  const docStems = stems(docToken);
  for (const s of docStems) {
    best = Math.max(best, matchStem(query, s));
    if (best === MATCH.exact) return best;
  }
  // The query itself may carry a prefix ("בגשם"). Stripped forms count only as whole words —
  // otherwise "שמש" would match everything starting with "מש".
  for (const q of stems(query)) {
    if (q === query || q.length < 3) continue;
    for (const s of docStems) {
      if (s === q) best = Math.max(best, MATCH.exact * 0.9);
      else if (skeleton(s) === skeleton(q)) best = Math.max(best, MATCH.spelling * 0.9);
    }
  }
  return best;
}
