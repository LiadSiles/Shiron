/** Pure rules for talking to Gemini (Google AI Studio key): models, audio, errors, answers. */
import { AiError, parseRetryAfter } from './ai';
import { extensionOf } from './ingestRules';

export const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Tried in order: each model has its own free-tier quota, and a model Google retires (404)
 * moves on to the next. Stable models as of Oct 2026 — check ai.google.dev/gemini-api/docs/models.
 */
export const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'] as const;

/**
 * Requests are limited to 20 MB including the prompt, and inline audio is base64 (4/3 larger):
 * recordings up to ~14 MB (~20 minutes of our 96 kbps m4a) are sent; longer ones are named
 * from the text alone.
 */
export const GEMINI_MAX_AUDIO_BYTES = 14 * 1024 * 1024;

/** MIME type for inline audio, or null when Gemini doesn't read the format (then: text only). */
export function geminiAudioMime(fileName: string): string | null {
  const map: Record<string, string> = {
    m4a: 'audio/m4a', aac: 'audio/aac', mp3: 'audio/mp3', wav: 'audio/wav', flac: 'audio/flac',
    ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', aif: 'audio/aiff', aiff: 'audio/aiff',
    webm: 'audio/webm',
  };
  return map[extensionOf(fileName)] ?? null;
}

interface GoogleError {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: { '@type'?: string; reason?: string; retryDelay?: string }[];
  };
}

/**
 * Google errors: a bad key is 400 INVALID_ARGUMENT with reason API_KEY_INVALID (not 401);
 * quota is 429 RESOURCE_EXHAUSTED with a RetryInfo retryDelay like "41s".
 */
export function errorFromGemini(status: number, body: string): AiError {
  let parsed: GoogleError = {};
  try {
    parsed = JSON.parse(body) ?? {};
  } catch {
    /* not JSON */
  }
  const e = parsed.error ?? {};
  const message = e.message ?? `Gemini ${status}`;
  const details = Array.isArray(e.details) ? e.details : [];
  const err = (kind: AiError['kind'], wait: number | null = null) => new AiError(kind, message, wait, 'gemini');
  if (status === 401 || status === 403 || details.some((d) => d.reason === 'API_KEY_INVALID')) return err('invalid-key');
  if (status === 429) {
    const delay = details.find((d) => typeof d.retryDelay === 'string')?.retryDelay;
    return err('rate-limited', parseRetryAfter(delay));
  }
  if (status === 404) return err('unavailable');
  if (status === 413) return err('too-large');
  if (status >= 500) return err('server');
  return err('bad-request');
}

interface GenerateResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
}

/** The answer text of a generateContent response (thinking parts, if any, left out). */
export function geminiText(json: unknown): string {
  const parts = (json as GenerateResponse)?.candidates?.[0]?.content?.parts ?? [];
  return parts.filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('');
}
