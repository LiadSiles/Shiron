/** Pure rules for talking to Groq: models and error mapping. The network calls are in src/api/groq.ts. */
import { AiError, parseRetryAfter } from './ai';

export const GROQ_API = 'https://api.groq.com/openai/v1';

/** Tried in order; each model has its own free-tier quota, so a 429 moves to the next. */
export const TRANSCRIPTION_MODELS = ['whisper-large-v3', 'whisper-large-v3-turbo'] as const;
/** Both support strict JSON-schema structured output on Groq. */
export const CHAT_MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'] as const;

/** Free tier upload limit for transcription. */
export const MAX_TRANSCRIPTION_BYTES = 25 * 1024 * 1024;

export function errorFromGroq(status: number, body: string, headers: (name: string) => string | null): AiError {
  let message = `Groq ${status}`;
  try {
    message = JSON.parse(body)?.error?.message ?? message;
  } catch {
    /* keep default */
  }
  const err = (kind: AiError['kind'], wait: number | null = null) => new AiError(kind, message, wait, 'groq');
  if (status === 401 || status === 403) return err('invalid-key');
  if (status === 429) {
    return err('rate-limited', parseRetryAfter(headers('retry-after'))
      ?? parseRetryAfter(headers('x-ratelimit-reset-requests'))
      ?? parseRetryAfter(headers('x-ratelimit-reset-tokens')));
  }
  if (status === 404) return err('unavailable');
  if (status === 413) return err('too-large');
  if (status >= 500) return err('server');
  return err('bad-request');
}
