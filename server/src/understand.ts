import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as z from 'zod/v4';
import { CATEGORIES, UNSORTED_ID } from '../../app/src/core/categories.js';
import type { Config } from './config.js';

export interface SongInput {
  fileName: string | null;
  /** The WhatsApp message sent with the file, or with the link. */
  context: string | null;
  transcript: string | null;
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

export interface Understander {
  understand(input: SongInput): Promise<Understanding>;
}

const Schema = z.object({
  title: z.string().describe('שם קצר לשיר, עד 5 מילים'),
  title_confidence: z.number().describe('0 עד 1: עד כמה השם בטוח'),
  categories: z
    .array(z.object({ id: z.string(), confidence: z.number() }))
    .describe('עד 3 קטגוריות מהרשימה, מהמתאימה ביותר'),
  lyrics: z.string().nullable().describe('מילות השיר מסודרות בשורות, או null אם אין תמלול'),
  summary: z.string().nullable().describe('משפט אחד: על מה השיר ומתי משתמשים בו'),
  keywords: z.array(z.string()).describe('5–10 מילות חיפוש בעברית: נושאים, מילים נרדפות, הקשרים'),
});

const SYSTEM = `את עוזרת לגננת בישראל לסדר ספריית שירים לגן ילדים.
מקבלים פרטים על הקלטה אחת: שם הקובץ, ההודעה שנשלחה איתה בוואטסאפ, תמלול אוטומטי, ולפעמים כותרת מיוטיוב.
התמלול נעשה על שירה של ילדים או מבוגרים ועלול להכיל שגיאות.

המשימות:
1. title — שם קצר וברור לשיר.
   - אם זה שיר ילדים מוכר, השתמשי בשם המקובל שלו.
   - אחרת: השורה הראשונה או הפזמון החוזר. עד 5 מילים, בלי "שיר על", בלי מספרים ובלי אמוג'י.
   - אם ההודעה שנשלחה עם הקובץ מציינת את שם השיר, היא הרמז החזק ביותר.
2. categories — עד 3 מזהים (id) מתוך הרשימה בלבד, עם ביטחון 0–1. אל תמציאי מזהים.
   ביטחון 0.85 ומעלה רק כשהנושא ברור מתוך המילים או ההודעה.
3. lyrics — סדרי את התמלול לשורות לפי מבנה השיר. תקני רק שגיאות תמלול ברורות. אל תוסיפי מילים שלא נשמעו.
   אם אין תמלול, החזירי null.
4. summary — משפט אחד.
5. keywords — מילים שגננת עשויה להקליד כדי למצוא את השיר: נושאים, חפצים, חגים, מילים נרדפות.

אם ההקלטה היא דיבור ולא שיר (למשל הסבר או סיפור), ציני זאת בסיכום ובחרי בקטגוריה המתאימה.
אם אין מספיק מידע — title_confidence נמוך, וקטגוריה "${UNSORTED_ID}" עם ביטחון נמוך.`;

function categoryList(): string {
  return CATEGORIES.map((c) => `- ${c.id}: ${c.name} — ${c.hint}`).join('\n');
}

export function buildUserMessage(input: SongInput): string {
  const parts = [`קטגוריות אפשריות:\n${categoryList()}`, '', 'פרטי ההקלטה:'];
  parts.push(`שם הקובץ: ${input.fileName ?? '(אין)'}`);
  parts.push(`ההודעה שנשלחה איתו: ${input.context?.trim() || '(אין)'}`);
  if (input.youtube) {
    parts.push(`כותרת ביוטיוב: ${input.youtube.title}`);
    if (input.youtube.author) parts.push(`ערוץ: ${input.youtube.author}`);
  }
  parts.push(`תמלול:\n${input.transcript?.trim() || '(אין תמלול)'}`);
  return parts.join('\n');
}

const VALID_IDS = new Set(CATEGORIES.map((c) => c.id));
const clamp = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** Keep only real category ids, de-duplicate, clamp confidences. */
export function sanitize(raw: z.infer<typeof Schema>): Understanding {
  const seen = new Set<string>();
  const categories = raw.categories
    .filter((c) => VALID_IDS.has(c.id) && !seen.has(c.id) && seen.add(c.id))
    .map((c) => ({ id: c.id, confidence: clamp(c.confidence) }))
    .slice(0, 3);
  return {
    title: raw.title.trim().replace(/^["'״]+|["'״]+$/g, '').slice(0, 60) || 'שיר ללא שם',
    titleConfidence: clamp(raw.title_confidence),
    categories: categories.length ? categories : [{ id: UNSORTED_ID, confidence: 0.2 }],
    lyrics: raw.lyrics?.trim() || null,
    summary: raw.summary?.trim() || null,
    keywords: [...new Set(raw.keywords.map((k) => k.trim()).filter(Boolean))].slice(0, 12),
  };
}

/** Without an API key the server still converts audio; songs land in the review inbox. */
export function fallbackUnderstanding(input: SongInput): Understanding {
  const fromContext = input.context?.split('\n')[0]?.trim();
  const title = input.youtube?.title || (fromContext && fromContext.length <= 40 ? fromContext : null)
    || input.fileName?.replace(/\.[a-z0-9]+$/i, '') || 'שיר חדש';
  return {
    title,
    titleConfidence: 0.3,
    categories: [{ id: UNSORTED_ID, confidence: 0.2 }],
    lyrics: input.transcript,
    summary: null,
    keywords: [],
  };
}

export function createUnderstander(cfg: Config, client?: Pick<Anthropic, 'messages'>): Understander {
  if (!cfg.anthropicApiKey && !client) return { understand: async (i) => fallbackUnderstanding(i) };
  const anthropic = client ?? new Anthropic({ apiKey: cfg.anthropicApiKey });
  return {
    async understand(input) {
      const msg = await anthropic.messages.parse({
        model: cfg.claudeModel,
        max_tokens: 2000,
        system: SYSTEM,
        messages: [{ role: 'user', content: buildUserMessage(input) }],
        output_config: { format: zodOutputFormat(Schema) },
      });
      if (!msg.parsed_output) return fallbackUnderstanding(input);
      return sanitize(msg.parsed_output);
    },
  };
}
