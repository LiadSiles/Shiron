import { describe, expect, it } from 'vitest';
import { activeCategoryIds, CATEGORY_BY_ID, inSeason, normalizeHebrewMonth, primaryCategoryId, toHebrewDate, UNSORTED_ID } from '../src/core/categories';

describe('hebrew calendar', () => {
  it('normalizes platform month names', () => {
    expect(normalizeHebrewMonth('Adar II')).toBe('adar');
    expect(normalizeHebrewMonth('Adar')).toBe('adar');
    expect(normalizeHebrewMonth('Adar I')).toBe('adar1');
    expect(normalizeHebrewMonth('Tishrei')).toBe('tishri');
    expect(normalizeHebrewMonth('Cheshvan')).toBe('heshvan');
  });
  it('detects hanukkah season (Dec 5 2026 = 25 Kislev)', () => {
    const d = toHebrewDate(new Date('2026-12-05T10:00:00Z'));
    expect(d).toEqual({ month: 'kislev', day: 25 });
    expect(inSeason(CATEGORY_BY_ID['hanukkah'].season!, d!)).toBe(true);
    expect(inSeason(CATEGORY_BY_ID['purim'].season!, d!)).toBe(false);
  });
  it('handles windows that wrap the Hebrew new year', () => {
    expect(inSeason(CATEGORY_BY_ID['rosh-hashana'].season!, { month: 'elul', day: 25 })).toBe(true);
    expect(inSeason(CATEGORY_BY_ID['rosh-hashana'].season!, { month: 'tishri', day: 2 })).toBe(true);
    expect(inSeason(CATEGORY_BY_ID['rosh-hashana'].season!, { month: 'heshvan', day: 2 })).toBe(false);
  });
  it('suggests morning songs in the morning', () => {
    const { timeOfDay } = activeCategoryIds(new Date(2026, 9, 25, 8, 15), null);
    expect(timeOfDay).toContain('morning');
    expect(timeOfDay).not.toContain('rest');
  });
});

describe('primary category', () => {
  it('is the first (most confident) one, or unsorted', () => {
    expect(primaryCategoryId({ categories: [{ categoryId: 'animals' }, { categoryId: 'shabbat' }] })).toBe('animals');
    expect(primaryCategoryId({ categories: [] })).toBe(UNSORTED_ID);
  });
});
