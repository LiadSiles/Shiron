/** Pure rules for talking to Groq: keys, models, errors. The network calls are in src/api/groq.ts. */

export const GROQ_API = 'https://api.groq.com/openai/v1';
export const GROQ_KEYS_PAGE = 'https://console.groq.com/keys';

/** Tried in order; each model has its own free-tier quota, so a 429 moves to the next. */
export const TRANSCRIPTION_MODELS = ['whisper-large-v3', 'whisper-large-v3-turbo'] as const;
/** Both support strict JSON-schema structured output on Groq. */
export const CHAT_MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'] as const;

/** Free tier upload limit for transcription. */
export const MAX_TRANSCRIPTION_BYTES = 25 * 1024 * 1024;

const KEY_RE = /\bgsk_[A-Za-z0-9]{20,}\b/;

/** Finds a Groq API key in text (e.g. the clipboard after copying it on the keys page). */
export function findGroqKey(text: string | null | undefined): string | null {
  return text ? KEY_RE.exec(text)?.[0] ?? null : null;
}

export type GroqErrorKind =
  | 'invalid-key'   // 401: the teacher must connect again
  | 'rate-limited'  // 429: try another model, or wait
  | 'too-large'     // 413
  | 'bad-request'   // other 4xx: this song won't work as is
  | 'server'        // 5xx: try again later
  | 'network';      // no connection

export class GroqError extends Error {
  constructor(
    readonly kind: GroqErrorKind,
    message: string,
    /** Seconds to wait before trying again, when Groq says so. */
    readonly retryAfterSec: number | null = null,
  ) {
    super(message);
  }

  get retryable(): boolean {
    return this.kind === 'rate-limited' || this.kind === 'server' || this.kind === 'network';
  }
}

/** `retry-after` is seconds; Groq may also send e.g. "7m12.5s" in x-ratelimit-reset-* headers. */
export function parseRetryAfter(value: string | null | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  if (Number.isFinite(n)) return Math.max(0, n);
  const m = /^(?:(\d+)h)?(?:(\d+)m(?!s))?(?:([\d.]+)s)?$/.exec(value.trim());
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

export function errorFromResponse(status: number, body: string, headers: (name: string) => string | null): GroqError {
  let message = `Groq ${status}`;
  try {
    message = JSON.parse(body)?.error?.message ?? message;
  } catch {
    /* keep default */
  }
  if (status === 401 || status === 403) return new GroqError('invalid-key', message);
  if (status === 429) {
    const wait = parseRetryAfter(headers('retry-after'))
      ?? parseRetryAfter(headers('x-ratelimit-reset-requests'))
      ?? parseRetryAfter(headers('x-ratelimit-reset-tokens'));
    return new GroqError('rate-limited', message, wait);
  }
  if (status === 413) return new GroqError('too-large', message);
  if (status >= 500) return new GroqError('server', message);
  return new GroqError('bad-request', message);
}

/** A friendly Hebrew line for the UI. */
export function describeGroqError(e: GroqError): string {
  switch (e.kind) {
    case 'invalid-key': return 'מפתח ה-Groq לא תקין. צריך לחבר מחדש בהגדרות.';
    case 'rate-limited': return 'הגענו למכסה היומית החינמית של Groq. נמשיך אוטומטית אחר כך.';
    case 'too-large': return 'הקובץ גדול מדי לתמלול.';
    case 'network': return 'אין חיבור לאינטרנט. נמשיך כשיחזור החיבור.';
    case 'server': return 'שירות Groq לא זמין כרגע. ננסה שוב.';
    default: return 'Groq לא הצליח לעבד את השיר.';
  }
}
