import { afterEach, describe, expect, it } from 'vitest';
import { allCategories, applyCategoryCustomizations, getCategory, isBuiltinCategory, mergeCategories, UNSORTED_ID } from '../src/core/categories';
import { sanitize, understandingSchema } from '../src/core/understand';

const row = (id: string, patch: Partial<{ name: string; icon: string; color: string; hidden: boolean; createdAt: number }> = {}) => ({
  id, name: patch.name ?? null, icon: patch.icon ?? null, color: patch.color ?? null, hidden: patch.hidden ?? false, createdAt: patch.createdAt ?? 0,
});

describe('her categories', () => {
  afterEach(() => applyCategoryCustomizations([]));

  it('renames, re-emojis and removes built-ins; adds hers before "לא מסווג"', () => {
    const cats = mergeCategories([
      row('morning', { name: 'מעגל בוקר', icon: '🌅' }),
      row('purim', { hidden: true }),
      row('u-2', { name: 'שירי גשם', createdAt: 2 }),
      row('u-1', { name: 'שירי חנוכה של רותי', icon: '🕎', createdAt: 1 }),
      row('u-gone', { name: 'ישן', hidden: true }),
    ]);
    const ids = cats.map((c) => c.id);
    expect(cats.find((c) => c.id === 'morning')).toMatchObject({ name: 'מעגל בוקר', icon: '🌅', hours: [7, 10] });
    expect(ids).not.toContain('purim');
    expect(ids).not.toContain('u-gone');
    expect(ids.slice(-3)).toEqual(['u-1', 'u-2', UNSORTED_ID]);
    expect(cats.find((c) => c.id === 'u-2')).toMatchObject({ custom: true, hint: 'שירי גשם', icon: '🎵' });
  });

  it('keeps "לא מסווג" even when asked to hide it', () => {
    expect(mergeCategories([row(UNSORTED_ID, { hidden: true })]).at(-1)?.id).toBe(UNSORTED_ID);
  });

  it('applies everywhere: lookups, the AI schema, and what the AI may answer', () => {
    applyCategoryCustomizations([row('animals', { hidden: true }), row('u-1', { name: 'שירי גשם', createdAt: 1 })]);
    expect(getCategory('animals').id).toBe(UNSORTED_ID);
    expect(getCategory('u-1').name).toBe('שירי גשם');
    expect(understandingSchema().properties.categories.items.properties.id.enum).toContain('u-1');
    expect(allCategories().some((c) => c.id === 'animals')).toBe(false);
    const u = sanitize({ title: 'x', categories: [{ id: 'animals', confidence: 0.9 }, { id: 'u-1', confidence: 0.8 }] });
    expect(u.categories.map((c) => c.id)).toEqual(['u-1']);
  });
});

describe('built-in or hers', () => {
  it('knows the built-in ids and nothing else', () => {
    expect(isBuiltinCategory(allCategories()[0].id)).toBe(true);
    expect(isBuiltinCategory('custom-123')).toBe(false);
    expect(isBuiltinCategory('')).toBe(false);
  });
});
