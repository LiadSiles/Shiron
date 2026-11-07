import { describe, expect, it } from 'vitest';
import { describeSummary } from '../src/core/importSummary';

const sum = (added = 0, duplicates: string[] = [], unsupported = 0) => ({
  added: Array.from({ length: added }, (_, i) => `s${i}`),
  duplicates: duplicates.map((title) => ({ title })),
  unsupported: Array.from({ length: unsupported }, (_, i) => `f${i}.txt`),
});

describe('the line she reads after sharing', () => {
  it('counts what was saved, in good Hebrew for one and for many', () => {
    expect(describeSummary(sum(1))).toBe('שיר אחד נשמר');
    expect(describeSummary(sum(3))).toBe('3 שירים נשמרו');
  });
  it('names the one song she already has, counts several', () => {
    expect(describeSummary(sum(0, ['שיר הגשם']))).toBe('כבר קיים: שיר הגשם');
    expect(describeSummary(sum(0, ['א', 'ב']))).toBe('2 כבר קיימים');
  });
  it('says what was not a song', () => {
    expect(describeSummary(sum(0, [], 1))).toBe('קובץ אחד לא נתמך');
    expect(describeSummary(sum(0, [], 2))).toBe('2 קבצים לא נתמכו');
  });
  it('joins everything, in order', () => {
    expect(describeSummary(sum(2, ['שיר הגשם'], 1))).toBe('2 שירים נשמרו · כבר קיים: שיר הגשם · קובץ אחד לא נתמך');
  });
  it('never shows an empty line', () => {
    expect(describeSummary(sum())).toBe('לא נמצא שיר לשמירה');
  });
});
