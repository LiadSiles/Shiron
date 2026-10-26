/**
 * Default category taxonomy for an Israeli kindergarten.
 * One flat list: every topic is its own category, with no groups above it (owner's decision).
 * Pure TypeScript (no React Native imports), unit-tested.
 */

/** Hebrew-calendar month keys, normalized. */
export type HebrewMonth =
  | 'tishri' | 'heshvan' | 'kislev' | 'tevet' | 'shevat' | 'adar1' | 'adar'
  | 'nisan' | 'iyar' | 'sivan' | 'tamuz' | 'av' | 'elul';

export interface SeasonWindow {
  /** inclusive start (month, day) and inclusive end (month, day) in the Hebrew calendar */
  from: [HebrewMonth, number];
  to: [HebrewMonth, number];
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  /** Short description the AI uses to decide whether a song belongs here. */
  hint: string;
  /** Local hours [start, end) when this category is suggested on the home screen. */
  hours?: [number, number];
  season?: SeasonWindow;
}

export const CATEGORIES: Category[] = [
  { id: 'morning', name: 'בוקר טוב', icon: '☀️', color: '#F2A93B', hint: 'שירי פתיחת יום, מעגל בוקר, שלום לחברים', hours: [7, 10] },
  { id: 'meal', name: 'ארוחה', icon: '🍎', color: '#E46B5D', hint: 'ברכות לפני אוכל, שירי ארוחת עשר וצהריים', hours: [9, 13] },
  { id: 'cleanup', name: 'סידור', icon: '🧺', color: '#6BAF92', hint: 'שירים לסידור הגן ואיסוף צעצועים' },
  { id: 'transitions', name: 'מעברים', icon: '🔔', color: '#7C8BD9', hint: 'שירים למעבר בין פעילויות, יציאה לחצר, כניסה למעגל' },
  { id: 'rest', name: 'מנוחה', icon: '🌙', color: '#5C6BC0', hint: 'שירים שקטים למנוחת צהריים והרגעה', hours: [12, 15] },
  { id: 'goodbye', name: 'פרידה', icon: '👋', color: '#9C7BB8', hint: 'שירי סוף יום ולהתראות', hours: [15, 17] },

  { id: 'rosh-hashana', name: 'ראש השנה', icon: '🍯', color: '#D9A13B', hint: 'ראש השנה, תפוח בדבש, שנה טובה, שופר', season: { from: ['elul', 10], to: ['tishri', 4] } },
  { id: 'yom-kippur', name: 'יום כיפור', icon: '🕊️', color: '#90A4AE', hint: 'סליחה, יום כיפור', season: { from: ['tishri', 3], to: ['tishri', 10] } },
  { id: 'sukkot', name: 'סוכות', icon: '🌿', color: '#7CB342', hint: 'סוכה, ארבעת המינים, שמחת תורה', season: { from: ['tishri', 8], to: ['tishri', 23] } },
  { id: 'hanukkah', name: 'חנוכה', icon: '🕎', color: '#3F7FBF', hint: 'חנוכייה, סביבון, נרות, מכבים, סופגניות', season: { from: ['kislev', 10], to: ['tevet', 3] } },
  { id: 'tu-bishvat', name: 'ט״ו בשבט', icon: '🌳', color: '#4E9A51', hint: 'עצים, נטיעות, פירות יבשים, השקדייה פורחת', season: { from: ['shevat', 1], to: ['shevat', 16] } },
  { id: 'purim', name: 'פורים', icon: '🎭', color: '#E0567A', hint: 'פורים, תחפושות, רעשן, אסתר, משלוח מנות', season: { from: ['adar', 1], to: ['adar', 15] } },
  { id: 'pesach', name: 'פסח', icon: '🫓', color: '#C58B4E', hint: 'פסח, מצה, יציאת מצרים, ליל הסדר, אביב', season: { from: ['adar', 20], to: ['nisan', 22] } },
  { id: 'memorial', name: 'יום הזיכרון', icon: '🕯️', color: '#78909C', hint: 'יום הזיכרון ויום השואה, שירים שקטים', season: { from: ['nisan', 24], to: ['iyar', 5] } },
  { id: 'independence', name: 'יום העצמאות', icon: '🇮🇱', color: '#2F6FD6', hint: 'יום העצמאות, דגל, ארץ ישראל, יום הולדת למדינה', season: { from: ['nisan', 28], to: ['iyar', 7] } },
  { id: 'lag-baomer', name: 'ל״ג בעומר', icon: '🔥', color: '#E8752B', hint: 'מדורה, חץ וקשת, ל״ג בעומר', season: { from: ['iyar', 12], to: ['iyar', 19] } },
  { id: 'jerusalem', name: 'יום ירושלים', icon: '🏛️', color: '#B8975A', hint: 'ירושלים, הכותל', season: { from: ['iyar', 20], to: ['iyar', 29] } },
  { id: 'shavuot', name: 'שבועות', icon: '🧺', color: '#8BC34A', hint: 'ביכורים, חג הקציר, מוצרי חלב, טנא', season: { from: ['iyar', 22], to: ['sivan', 7] } },
  { id: 'shabbat', name: 'קבלת שבת', icon: '🕯️', color: '#C9A227', hint: 'שבת שלום, נרות שבת, חלה, קידוש' },

  { id: 'birthday', name: 'יום הולדת', icon: '🎂', color: '#EC6FA7', hint: 'יום הולדת, עוגה, נרות, משאלה, הרמת כיסא' },
  { id: 'end-of-year', name: 'מסיבת סיום', icon: '🎓', color: '#AB7AE0', hint: 'פרידה מהגן, מסיבת סיום, עולים לכיתה א' },
  { id: 'family', name: 'משפחה', icon: '👨‍👩‍👧', color: '#E58A5C', hint: 'אמא, אבא, סבא וסבתא, יום המשפחה' },

  { id: 'seasons', name: 'עונות ומזג אוויר', icon: '🌦️', color: '#4FA3C7', hint: 'גשם, חורף, קיץ, סתיו, אביב, שמש, רוח' },
  { id: 'animals', name: 'בעלי חיים', icon: '🐘', color: '#8D6E63', hint: 'בעלי חיים, חיות בית, חרקים, ציפורים, חוות' },
  { id: 'learning', name: 'צבעים, מספרים ואותיות', icon: '🔢', color: '#26A69A', hint: 'ספירה, צבעים, אותיות, צורות' },
  { id: 'body', name: 'הגוף שלי', icon: '🖐️', color: '#F48A65', hint: 'איברי הגוף, היגיינה, רחצת ידיים, שיניים' },
  { id: 'nature', name: 'טבע וגינה', icon: '🌼', color: '#66BB6A', hint: 'פרחים, צמחים, גינה, ים' },

  { id: 'dance', name: 'ריקוד ותנועה', icon: '💃', color: '#EF5350', hint: 'שירי תנועה, ריקודים, הוראות לתנועה' },
  { id: 'finger', name: 'שירי ידיים', icon: '🤲', color: '#FFA726', hint: 'משחקי אצבעות ושירי ידיים' },
  { id: 'calm', name: 'רגיעה ושירי ערש', icon: '🧸', color: '#7E57C2', hint: 'שירי ערש, נשימות, הרפיה', hours: [12, 15] },
  { id: 'stories', name: 'סיפורים מוקלטים', icon: '📖', color: '#8E7CC3', hint: 'סיפור מוקלט או מוקרא, לא שיר' },

  { id: 'unsorted', name: 'לא מסווג', icon: '🎵', color: '#9E9E9E', hint: 'כשאין קטגוריה מתאימה' },
];

export const CATEGORY_BY_ID: Record<string, Category> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
);

export const UNSORTED_ID = 'unsorted';

export function getCategory(id: string): Category {
  return CATEGORY_BY_ID[id] ?? CATEGORY_BY_ID[UNSORTED_ID];
}

// ---------- Hebrew calendar helpers ----------

const MONTH_ORDER: HebrewMonth[] = [
  'tishri', 'heshvan', 'kislev', 'tevet', 'shevat', 'adar1', 'adar',
  'nisan', 'iyar', 'sivan', 'tamuz', 'av', 'elul',
];

/**
 * Normalizes a month name as returned by Intl (`en-u-ca-hebrew`, month: 'long') on
 * Node/ICU, iOS and Android. "Adar II" and plain "Adar" both map to 'adar' (Purim month).
 */
export function normalizeHebrewMonth(raw: string): HebrewMonth | null {
  const s = raw.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  if (/^adar (i|1)$/.test(s)) return 'adar1';
  if (/^adar( (ii|2))?$/.test(s)) return 'adar';
  if (s.startsWith('tish')) return 'tishri';
  if (s.includes('heshvan') || s.includes('cheshvan') || s.startsWith('marhe')) return 'heshvan';
  if (s.startsWith('kislev')) return 'kislev';
  if (s.startsWith('tevet') || s.startsWith('teveth')) return 'tevet';
  if (s.startsWith('shevat') || s.startsWith('shvat') || s.startsWith('sebat')) return 'shevat';
  if (s.startsWith('nisan') || s.startsWith('nissan')) return 'nisan';
  if (s.startsWith('iy')) return 'iyar';
  if (s.startsWith('sivan')) return 'sivan';
  if (s.startsWith('tam')) return 'tamuz';
  if (s === 'av' || s === 'ab') return 'av';
  if (s.startsWith('elul')) return 'elul';
  return null;
}

export interface HebrewDate { month: HebrewMonth; day: number }

/** Returns today's Hebrew date, or null when the platform's Intl lacks the Hebrew calendar. */
export function toHebrewDate(date: Date): HebrewDate | null {
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-hebrew', { month: 'long', day: 'numeric' })
      .formatToParts(date);
    const month = normalizeHebrewMonth(parts.find((p) => p.type === 'month')?.value ?? '');
    const day = Number(parts.find((p) => p.type === 'day')?.value);
    if (!month || !Number.isFinite(day)) return null;
    return { month, day };
  } catch {
    return null;
  }
}

function ordinal(month: HebrewMonth, day: number): number {
  return MONTH_ORDER.indexOf(month) * 31 + day;
}

export function inSeason(window: SeasonWindow, today: HebrewDate): boolean {
  const t = ordinal(today.month, today.day);
  const a = ordinal(window.from[0], window.from[1]);
  const b = ordinal(window.to[0], window.to[1]);
  // Windows that wrap the year boundary (e.g. Elul → Tishri).
  return a <= b ? t >= a && t <= b : t >= a || t <= b;
}

/** Categories that should be boosted right now: active holidays + time-of-day. */
export function activeCategoryIds(now: Date, hebrew: HebrewDate | null = toHebrewDate(now)): {
  seasonal: string[];
  timeOfDay: string[];
} {
  const hour = now.getHours();
  const seasonal = hebrew
    ? CATEGORIES.filter((c) => c.season && inSeason(c.season, hebrew)).map((c) => c.id)
    : [];
  // Shabbat songs on Thursday afternoon and Friday (kindergartens meet on Friday morning).
  const dow = now.getDay();
  if (dow === 5 || (dow === 4 && hour >= 12)) seasonal.push('shabbat');
  const timeOfDay = CATEGORIES.filter((c) => c.hours && hour >= c.hours[0] && hour < c.hours[1])
    .map((c) => c.id);
  return { seasonal, timeOfDay };
}
