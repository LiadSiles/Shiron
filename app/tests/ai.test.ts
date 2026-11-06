import { describe, expect, it } from 'vitest';
import { AiError, describeAiError, findKey, pastedKey, parseRetryAfter, providerOrder } from '../src/core/ai';
import { errorFromGemini, geminiAudioMime, geminiStopReason, geminiText } from '../src/core/geminiRules';
import { errorFromGroq } from '../src/core/groqRules';
import { buildUserMessage } from '../src/core/understand';

describe('providers', () => {
  it('finds each service\'s key in copied text', () => {
    expect(findKey('groq', 'gsk_abcdefghijklmnopqrstuvwxyz0123456789')).toBe('gsk_abcdefghijklmnopqrstuvwxyz0123456789');
    expect(findKey('groq', ' המפתח: gsk_ABCDEFGHIJKLMNOPQRSTUVWX12 \n')).toBe('gsk_ABCDEFGHIJKLMNOPQRSTUVWX12');
    expect(findKey('groq', 'gsk_short')).toBeNull();
    expect(findKey('groq', null)).toBeNull();
    const google = 'AIzaSyA1b2C3d4E5f6G7h8I9j0K_lMnOpQrStUv';
    expect(google).toHaveLength(39);
    expect(findKey('gemini', `key: ${google}\n`)).toBe(google);
    expect(findKey('gemini', 'AIzaSyShort')).toBeNull();
    expect(findKey('gemini', 'gsk_abcdefghijklmnopqrstuvwxyz0123456789')).toBeNull();
    expect(findKey('groq', google)).toBeNull();
    // AI Studio's 2026 format.
    const aq = 'AQ.Ab8RN6Kx_q2-mZ0vLwYt3pHcD9sEfGjU7iOkB1nA4rTe';
    expect(findKey('gemini', `המפתח שלך: ${aq} `)).toBe(aq);
    expect(findKey('gemini', 'AQ.short')).toBeNull();
    expect(findKey('groq', aq)).toBeNull();
  });

  it('accepts a hand-pasted key of an unknown format, but not prose', () => {
    expect(pastedKey('gemini', '  XYZ.NewFormat-0123456789abcdef  ')).toBe('XYZ.NewFormat-0123456789abcdef');
    expect(pastedKey('gemini', 'זה לא מפתח בכלל')).toBeNull();
    expect(pastedKey('gemini', 'too short')).toBeNull();
    expect(pastedKey('groq', 'gsk_abcdefghijklmnopqrstuvwxyz0123456789')).toBe('gsk_abcdefghijklmnopqrstuvwxyz0123456789');
  });

  it('tries the chosen service first, then any other connected one', () => {
    expect(providerOrder('gemini', ['groq', 'gemini'])).toEqual(['gemini', 'groq']);
    expect(providerOrder('groq', ['groq', 'gemini'])).toEqual(['groq', 'gemini']);
    expect(providerOrder('groq', ['gemini'])).toEqual(['gemini']);
    expect(providerOrder('groq', [])).toEqual([]);
  });

  it('parses retry hints from both services', () => {
    expect(parseRetryAfter('12')).toBe(12);
    expect(parseRetryAfter('7m12.5s')).toBe(432.5);
    expect(parseRetryAfter('1h2m3s')).toBe(3723);
    expect(parseRetryAfter('41s')).toBe(41);
    expect(parseRetryAfter('250ms')).toBeNull();
    expect(parseRetryAfter(null)).toBeNull();
  });

  it('names the service in error messages', () => {
    expect(describeAiError(new AiError('invalid-key', 'x', null, 'gemini'))).toContain('Gemini');
    expect(describeAiError(new AiError('rate-limited', 'x', null, 'groq'))).toContain('Groq');
    expect(new AiError('invalid-key', 'x').transient).toBe(true);
    expect(new AiError('bad-request', 'x').transient).toBe(false);
  });
});

describe('groq rules', () => {
  it('maps HTTP status to what the app should do', () => {
    const h = (map: Record<string, string>) => (k: string) => map[k] ?? null;
    expect(errorFromGroq(401, '{"error":{"message":"Invalid API Key"}}', h({})).kind).toBe('invalid-key');
    const rl = errorFromGroq(429, '{}', h({ 'retry-after': '30' }));
    expect(rl.kind).toBe('rate-limited');
    expect(rl.retryAfterSec).toBe(30);
    expect(rl.provider).toBe('groq');
    expect(errorFromGroq(429, '{}', h({ 'x-ratelimit-reset-requests': '2m0s' })).retryAfterSec).toBe(120);
    expect(errorFromGroq(404, '', h({})).kind).toBe('unavailable');
    expect(errorFromGroq(413, '', h({})).kind).toBe('too-large');
    expect(errorFromGroq(400, '', h({})).retryable).toBe(false);
    expect(errorFromGroq(503, '', h({})).retryable).toBe(true);
  });
});

describe('gemini rules', () => {
  it('reads Google error bodies', () => {
    const badKey = JSON.stringify({ error: { code: 400, message: 'API key not valid.', status: 'INVALID_ARGUMENT',
      details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID' }] } });
    expect(errorFromGemini(400, badKey).kind).toBe('invalid-key');
    const quota = JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED',
      details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '41s' }] } });
    const q = errorFromGemini(429, quota);
    expect([q.kind, q.retryAfterSec, q.provider]).toEqual(['rate-limited', 41, 'gemini']);
    expect(errorFromGemini(400, '{"error":{"status":"INVALID_ARGUMENT","message":"schema"}}').kind).toBe('bad-request');
    expect(errorFromGemini(404, 'not json').kind).toBe('unavailable');
    expect(errorFromGemini(503, '').kind).toBe('server');
  });

  it('says why an answer is empty', () => {
    expect(geminiStopReason({ candidates: [{ finishReason: 'RECITATION' }] })).toBe('RECITATION');
    expect(geminiStopReason({ promptFeedback: { blockReason: 'SAFETY' } })).toBe('blocked: SAFETY');
    expect(geminiStopReason({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{}' }] } }] })).toBeNull();
    expect(geminiStopReason({})).toBe('no candidates');
  });

  it('takes the answer text, skipping thoughts', () => {
    const json = { candidates: [{ content: { parts: [{ text: 'thinking…', thought: true }, { text: '{"a":' }, { text: '1}' }] } }] };
    expect(geminiText(json)).toBe('{"a":1}');
    expect(geminiText({})).toBe('');
  });

  it('sends only audio formats Gemini reads', () => {
    expect(geminiAudioMime('song.m4a')).toBe('audio/m4a');
    expect(geminiAudioMime('PTT-1.opus')).toBe('audio/ogg');
    expect(geminiAudioMime('clip.mov')).toBeNull();
  });

  it('tells the model when the recording is attached', () => {
    const base = { fileName: 'a.m4a', context: null, transcript: null };
    expect(buildUserMessage({ ...base, audioAttached: true })).toContain('ההקלטה מצורפת');
    expect(buildUserMessage(base)).toContain('(אין תמלול)');
  });
});
