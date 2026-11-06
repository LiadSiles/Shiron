import { describe, expect, it } from 'vitest';
import { allCategories } from '../src/core/categories';
import { buildUserMessage, fallbackUnderstanding, parseModelJson, sanitize, understandingSchema } from '../src/core/understand';

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
    const schema = understandingSchema();
    expect(schema.required).toEqual(Object.keys(schema.properties));
    expect(schema.additionalProperties).toBe(false);
    const item = schema.properties.categories.items;
    expect(item.additionalProperties).toBe(false);
    expect(item.properties.id.enum).toHaveLength(allCategories().length);
  });
});
