/**
 * Turning a transcript into a song: the prompt, the JSON schema and the clean-up of the model's
 * answer. Pure TypeScript; the network calls live in src/api/ (Groq, Gemini).
 */
import { allCategories, UNSORTED_ID } from './categories';
import { stripPhantomLines } from './transcript';

export interface SongInput {
  fileName: string | null;
  /** The WhatsApp message sent with the file, or with the link. */
  context: string | null;
  transcript: string | null;
  /** The recording itself is attached (Gemini listens to it; no separate transcript). */
  audioAttached?: boolean;
  youtube?: { title: string; author: string | null } | null;
}

export interface Understanding {
  title: string;
  titleConfidence: number;
  categories: { id: string; confidence: number }[];
  lyrics: string | null;
  summary: string | null;
  keywords: string[];
}

/** What the model returns (snake_case, as in the schema). */
export interface RawUnderstanding {
  title: string;
  title_confidence: number;
  categories: { id: string; confidence: number }[];
  lyrics: string | null;
  summary: string | null;
  keywords: string[];
}

/** JSON schema for strict structured output: every property required, no extras. */
/** The answer's JSON schema; category ids are the ones in use now (hers included). */
export function understandingSchema() {
  return {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'title_confidence', 'categories', 'lyrics', 'summary', 'keywords'],
  properties: {
    title: { type: 'string', description: 'שם קצר לשיר, עד 5 מילים' },
    title_confidence: { type: 'number', description: '0 עד 1: עד כמה השם בטוח' },
    categories: {
      type: 'array',
      description: 'עד 3 קטגוריות מהרשימה, מהמתאימה ביותר',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'confidence'],
        properties: {
          id: { type: 'string', enum: allCategories().map((c) => c.id) },
          confidence: { type: 'number' },
        },
      },
    },
    lyrics: { type: ['string', 'null'], description: 'מילות השיר מסודרות בשורות, או null אם אין תמלול' },
    summary: { type: ['string', 'null'], description: 'משפט אחד: על מה השיר ומתי משתמשים בו' },
    keywords: { type: 'array', items: { type: 'string' }, description: '5–10 מילות חיפוש בעברית' },
  },
} as const;
}

export const SYSTEM_PROMPT = `את עוזרת לגננת בישראל לסדר ספריית שירים לגן ילדים.
מקבלים פרטים על הקלטה אחת: שם הקובץ, ההודעה שנשלחה איתה בוואטסאפ, תמלול אוטומטי (או ההקלטה עצמה), ולפעמים כותרת מיוטיוב.
התמלול נעשה על שירה של ילדים או מבוגרים ועלול להכיל שגיאות.
אם ההקלטה מצורפת, הקשיבי לה ותמללי את המילים בעברית בעצמך.

המשימות:
1. title — שם קצר וברור לשיר.
   - אם זה שיר ילדים מוכר, השתמשי בשם המקובל שלו.
   - אחרת: השורה הראשונה או הפזמון החוזר. עד 5 מילים, בלי "שיר על", בלי מספרים ובלי אמוג'י.
   - אם ההודעה שנשלחה עם הקובץ מציינת את שם השיר, היא הרמז החזק ביותר.
2. categories — עד 3 מזהים (id) מתוך הרשימה בלבד, עם ביטחון 0–1.
   ביטחון 0.85 ומעלה רק כשהנושא ברור מתוך המילים או ההודעה.
3. lyrics — כל מילות השיר, מההתחלה ועד הסוף, מסודרות בשורות לפי מבנה השיר:
   - חובה לכתוב את כל מה שמושר או נאמר, כולל כל הבתים וכל החזרות של הפזמון. אסור לקצר, לסכם, לדלג או לכתוב "וכו'".
   - אל תוסיפי מילים שלא נשמעו.
   - תקני רק שגיאות תמלול ברורות (מילה שנשמעה לא נכון כשההקשר ברור).
   - מוזיקה ברקע גורמת לתמלול אוטומטי "לשמוע" משפטים שלא נאמרו, כמו "תודה רבה", "תודה שצפיתם", "כתוביות" או קרדיטים. השמיטי רק אותם.
   - מילה שלא ברורה — כתבי את מה שהכי קרוב למה שנשמע.
   אם אין תמלול ואין הקלטה, החזירי null.
4. summary — משפט אחד.
5. keywords — מילים שגננת עשויה להקליד כדי למצוא את השיר: נושאים, חפצים, חגים, מילים נרדפות.

אם ההקלטה היא דיבור ולא שיר (למשל הסבר או סיפור), ציני זאת בסיכום ובחרי בקטגוריה המתאימה.
אם אין מספיק מידע — title_confidence נמוך, וקטגוריה "${UNSORTED_ID}" עם ביטחון נמוך.
עני ב-JSON בלבד.`;

/** Whisper's prompt: primes children's-song vocabulary and Hebrew spelling (≤ 224 tokens). */
export const TRANSCRIPTION_PROMPT = 'שיר ילדים בעברית מגן ילדים. מילים פשוטות, חזרות, פזמון.';

export function buildUserMessage(input: SongInput): string {
  const parts = [
    `קטגוריות אפשריות:\n${allCategories().map((c) => `- ${c.id}: ${c.name} — ${c.hint}`).join('\n')}`,
    '',
    'פרטי ההקלטה:',
    `שם הקובץ: ${input.fileName ?? '(אין)'}`,
    `ההודעה שנשלחה איתו: ${input.context?.trim() || '(אין)'}`,
  ];
  if (input.youtube) {
    parts.push(`כותרת ביוטיוב: ${input.youtube.title}`);
    if (input.youtube.author) parts.push(`ערוץ: ${input.youtube.author}`);
  }
  parts.push(input.audioAttached
    ? 'תמלול: (ההקלטה מצורפת — הקשיבי לה וכתבי את המילים בשדה lyrics)'
    : `תמלול:\n${input.transcript?.trim() || '(אין תמלול)'}`);
  return parts.join('\n');
}

const clamp = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** Parse and clean the model's answer. Unknown ids dropped, confidences clamped, caps applied. */
export function sanitize(raw: Partial<RawUnderstanding> | null | undefined): Understanding {
  const seen = new Set<string>();
  const valid = new Set(allCategories().map((c) => c.id));
  const categories = (Array.isArray(raw?.categories) ? raw.categories : [])
    .filter((c) => c && valid.has(c.id) && !seen.has(c.id) && seen.add(c.id))
    .map((c) => ({ id: c.id, confidence: clamp(c.confidence) }))
    .slice(0, 3);
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return {
    title: (text(raw?.title) ?? '').replace(/^["'״]+|["'״]+$/g, '').slice(0, 60) || 'שיר ללא שם',
    titleConfidence: clamp(raw?.title_confidence),
    categories: categories.length ? categories : [{ id: UNSORTED_ID, confidence: 0.2 }],
    lyrics: stripPhantomLines(text(raw?.lyrics)),
    summary: text(raw?.summary),
    keywords: [...new Set((Array.isArray(raw?.keywords) ? raw.keywords : [])
      .filter((k): k is string => typeof k === 'string')
      .map((k) => k.trim())
      .filter(Boolean))].slice(0, 12),
  };
}

/** Parse a chat completion's content, tolerating code fences around the JSON. */
export function parseModelJson(content: string): Partial<RawUnderstanding> | null {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    const v = JSON.parse(trimmed);
    return v && typeof v === 'object' ? v : null;
  } catch {
    const m = /\{[\s\S]*\}/.exec(trimmed);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

/** When the AI is unavailable or refuses: a usable title from what we have. */
export function fallbackUnderstanding(input: SongInput): Understanding {
  const fromContext = input.context?.split('\n')[0]?.trim();
  const title = input.youtube?.title
    || (fromContext && fromContext.length <= 40 ? fromContext : null)
    || input.fileName?.replace(/\.[a-z0-9]+$/i, '')
    || 'שיר חדש';
  return {
    title,
    titleConfidence: 0.3,
    categories: [{ id: UNSORTED_ID, confidence: 0.2 }],
    lyrics: input.transcript,
    summary: null,
    keywords: [],
  };
}

// ---------------------------------------------------------------- search by meaning

/**
 * When a search finds little, the AI suggests Hebrew words a matching song would contain
 * ("אביב" → פרחים, פורחת, ניצנים…). Only the query is sent — never the library.
 */
export const EXPAND_PROMPT = `את עוזרת חיפוש בספריית השירים של גננת. קיבלת מה שהגננת הקלידה בחיפוש.
החזירי JSON בלבד בצורה {"words": [...]}: עד 12 מילים בעברית, בלי ניקוד, שסביר שיופיעו במילים של שיר ילדים בגן על הנושא הזה או בשם שלו —
מילים נרדפות, צורות אחרות של אותה מילה, דברים שקשורים לנושא, חגים ועונות מתאימים. מילה אחת לכל פריט, בלי משפטים, בלי לחזור על מה שהוקלד.`;

/** Cleans the model's word list: Hebrew/Latin single words, de-duplicated, at most 12. */
export function parseExpansion(content: string, query: string): string[] {
  const v = parseModelJson(content) as { words?: unknown } | null;
  const raw = Array.isArray(v?.words) ? v!.words : [];
  const typed = new Set(query.trim().split(/\s+/));
  const out: string[] = [];
  for (const w of raw) {
    if (typeof w !== 'string') continue;
    const word = w.trim().replace(/[֑-ׇ]/g, '');
    if (!/^[\p{L}'"״׳-]{2,20}$/u.test(word) || typed.has(word) || out.includes(word)) continue;
    out.push(word);
    if (out.length === 12) break;
  }
  return out;
}
