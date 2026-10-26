import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '../src/core/categories';
import { describeGroqError, errorFromResponse, findGroqKey, GroqError, parseRetryAfter } from '../src/core/groqRules';
import { buildUserMessage, fallbackUnderstanding, parseModelJson, sanitize, UNDERSTANDING_SCHEMA } from '../src/core/understand';

describe('understanding', () => {
  it('drops invented categories and clamps confidence', () => {
    const u = sanitize({
      title: '"שיר הבוקר"', title_confidence: 1.4,
      categories: [{ id: 'morning', confidence: 0.9 }, { id: 'made-up', confidence: 0.8 }, { id: 'morning', confidence: 0.5 }],
      lyrics: '  ', summary: null, keywords: ['בוקר', 'בוקר', ' שמש '],
    });
    expect(u.title).toBe('שיר הבוקר');
    expect(u.titleConfidence).toBe(1);
    expect(u.categories).toEqual([{ id: 'morning', confidence: 0.9 }]);
    expect(u.lyrics).toBeNull();
    expect(u.keywords).toEqual(['בוקר', 'שמש']);
  });

  it('survives a malformed answer', () => {
    const u = sanitize({ title: 42 as unknown as string, categories: 'x' as never, keywords: null as never });
    expect(u.title).toBe('שיר ללא שם');
    expect(u.categories[0].id).toBe('unsorted');
    expect(u.keywords).toEqual([]);
  });

  it('parses JSON with or without code fences', () => {
    expect(parseModelJson('{"title":"א"}')?.title).toBe('א');
    expect(parseModelJson('```json\n{"title":"ב"}\n```')?.title).toBe('ב');
    expect(parseModelJson('Here you go: {"title":"ג"} done')?.title).toBe('ג');
    expect(parseModelJson('not json')).toBeNull();
  });

  it('puts the category list, context and transcript in the prompt', () => {
    const msg = buildUserMessage({ fileName: 'a.opus', context: 'לט״ו בשבט', transcript: 'השקדייה פורחת' });
    expect(msg).toContain('tu-bishvat');
    expect(msg).toContain('לט״ו בשבט');
    expect(msg).toContain('השקדייה פורחת');
  });

  it('uses the YouTube title when there is one', () => {
    const msg = buildUserMessage({ fileName: null, context: null, transcript: null, youtube: { title: 'נר לי דקיק', author: 'הופ' } });
    expect(msg).toContain('כותרת ביוטיוב: נר לי דקיק');
    expect(fallbackUnderstanding({ fileName: null, context: null, transcript: null, youtube: { title: 'נר לי', author: null } }).title).toBe('נר לי');
  });

  it('falls back to a short context line, then the file name', () => {
    expect(fallbackUnderstanding({ fileName: 'x.mp3', context: 'שיר לחנוכה\nתהנו', transcript: null }).title).toBe('שיר לחנוכה');
    expect(fallbackUnderstanding({ fileName: 'x.mp3', context: null, transcript: null }).title).toBe('x');
  });

  it('schema is valid for strict mode: every property required, no extras, ids enumerated', () => {
    expect(UNDERSTANDING_SCHEMA.required).toEqual(Object.keys(UNDERSTANDING_SCHEMA.properties));
    expect(UNDERSTANDING_SCHEMA.additionalProperties).toBe(false);
    const item = UNDERSTANDING_SCHEMA.properties.categories.items;
    expect(item.additionalProperties).toBe(false);
    expect(item.properties.id.enum).toHaveLength(CATEGORIES.length);
  });
});

describe('groq rules', () => {
  it('finds a key in copied text', () => {
    expect(findGroqKey('gsk_abcdefghijklmnopqrstuvwxyz0123456789')).toBe('gsk_abcdefghijklmnopqrstuvwxyz0123456789');
    expect(findGroqKey(' המפתח: gsk_ABCDEFGHIJKLMNOPQRSTUVWX12 \n')).toBe('gsk_ABCDEFGHIJKLMNOPQRSTUVWX12');
    expect(findGroqKey('gsk_short')).toBeNull();
    expect(findGroqKey('sk-ant-123')).toBeNull();
    expect(findGroqKey(null)).toBeNull();
  });

  it('parses retry-after in seconds and Groq duration formats', () => {
    expect(parseRetryAfter('12')).toBe(12);
    expect(parseRetryAfter('7m12.5s')).toBe(432.5);
    expect(parseRetryAfter('1h2m3s')).toBe(3723);
    expect(parseRetryAfter('250ms')).toBeNull();
    expect(parseRetryAfter(null)).toBeNull();
  });

  it('maps HTTP status to what the app should do', () => {
    const h = (map: Record<string, string>) => (k: string) => map[k] ?? null;
    expect(errorFromResponse(401, '{"error":{"message":"Invalid API Key"}}', h({})).kind).toBe('invalid-key');
    const rl = errorFromResponse(429, '{}', h({ 'retry-after': '30' }));
    expect(rl.kind).toBe('rate-limited');
    expect(rl.retryAfterSec).toBe(30);
    expect(rl.retryable).toBe(true);
    expect(errorFromResponse(429, '{}', h({ 'x-ratelimit-reset-requests': '2m0s' })).retryAfterSec).toBe(120);
    expect(errorFromResponse(413, '', h({})).kind).toBe('too-large');
    expect(errorFromResponse(400, '', h({})).retryable).toBe(false);
    expect(errorFromResponse(503, '', h({})).retryable).toBe(true);
    expect(describeGroqError(new GroqError('invalid-key', 'x'))).toContain('לחבר מחדש');
  });
});
