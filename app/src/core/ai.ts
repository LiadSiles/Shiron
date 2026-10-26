/**
 * The AI services a teacher can connect (each with her own free key) and the errors they share.
 * Pure TypeScript; the network calls live in src/api/.
 */

export type ProviderId = 'groq' | 'gemini';

export interface Provider {
  id: ProviderId;
  name: string;
  /** Where she creates a key; the connect screen opens it. */
  keysPage: string;
  keyPattern: RegExp;
  /** The service may use what it receives to train its models (free tier). */
  trainsOnData: boolean;
}

export const PROVIDERS: Record<ProviderId, Provider> = {
  groq: {
    id: 'groq',
    name: 'Groq',
    keysPage: 'https://console.groq.com/keys',
    keyPattern: /\bgsk_[A-Za-z0-9]{20,}\b/,
    trainsOnData: false,
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    keysPage: 'https://aistudio.google.com/apikey',
    // Google API keys: "AIza" + 35 characters.
    keyPattern: /\bAIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/,
    // Gemini API terms (unpaid services): content may be used to improve Google's models and
    // read by human reviewers. Shown on the connect screen; the owner chose to offer it anyway.
    trainsOnData: true,
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

/** Finds a key for this service in text (e.g. the clipboard after copying it). */
export function findKey(provider: ProviderId, text: string | null | undefined): string | null {
  return text ? PROVIDERS[provider].keyPattern.exec(text)?.[0] ?? null : null;
}

/**
 * The order to try services in: the one she chose first, then any other connected one, so a
 * used-up daily quota on one doesn't hold the songs back.
 */
export function providerOrder(preferred: ProviderId, connected: ProviderId[]): ProviderId[] {
  return [preferred, ...PROVIDER_IDS.filter((p) => p !== preferred)].filter((p) => connected.includes(p));
}

export type AiErrorKind =
  | 'invalid-key'   // the teacher must connect again
  | 'rate-limited'  // quota: try another model or service, or wait
  | 'unavailable'   // this model doesn't exist (any more): try the next model
  | 'too-large'     // the recording is too big for the service
  | 'bad-request'   // this song won't work as is
  | 'server'        // try again later
  | 'network';      // no connection, or a timeout

export class AiError extends Error {
  constructor(
    readonly kind: AiErrorKind,
    message: string,
    /** Seconds to wait before trying again, when the service says so. */
    readonly retryAfterSec: number | null = null,
    readonly provider: ProviderId | null = null,
  ) {
    super(message);
  }

  /** Worth trying again later (or with another service) rather than giving up on the song. */
  get retryable(): boolean {
    return this.kind === 'rate-limited' || this.kind === 'server' || this.kind === 'network';
  }

  /** Stops this service for now; another connected service may still work. */
  get transient(): boolean {
    return this.retryable || this.kind === 'invalid-key';
  }
}

/** "12" (seconds), Groq's "7m12.5s", Google's "41s" / "0.5s". */
export function parseRetryAfter(value: string | null | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  if (Number.isFinite(n)) return Math.max(0, n);
  const m = /^(?:(\d+)h)?(?:(\d+)m(?!s))?(?:([\d.]+)s)?$/.exec(value.trim());
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** A friendly Hebrew line for the UI. */
export function describeAiError(e: AiError): string {
  const name = e.provider ? PROVIDERS[e.provider].name : 'שירות ה-AI';
  switch (e.kind) {
    case 'invalid-key': return `המפתח של ${name} לא תקין. צריך לחבר מחדש בהגדרות.`;
    case 'rate-limited': return `הגענו למכסה היומית החינמית של ${name}. נמשיך אוטומטית אחר כך.`;
    case 'too-large': return 'הקובץ גדול מדי לתמלול.';
    case 'network': return 'אין חיבור לאינטרנט. נמשיך כשיחזור החיבור.';
    case 'server':
    case 'unavailable': return `${name} לא זמין כרגע. ננסה שוב.`;
    default: return `${name} לא הצליח לעבד את השיר.`;
  }
}
