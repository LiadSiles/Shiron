import { describe, expect, it } from 'vitest';
import { describeSummary, isNoSpace } from '../src/core/importSummary';

const sum = (added = 0, duplicates: string[] = [], unsupported = 0, failed: boolean[] = []) => ({
  added: Array.from({ length: added }, (_, i) => `s${i}`),
  duplicates: duplicates.map((title) => ({ title })),
  unsupported: Array.from({ length: unsupported }, (_, i) => `f${i}.txt`),
  failed: failed.map((noSpace, i) => ({ name: `g${i}.mp3`, noSpace })),
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
  it('says the phone is full when it is, and otherwise to share again', () => {
    expect(describeSummary(sum(1, [], 0, [true]))).toBe('שיר אחד נשמר · שיר אחד לא נשמר: אין מספיק מקום בטלפון');
    expect(describeSummary(sum(0, [], 0, [true, true]))).toBe('2 שירים לא נשמרו: אין מספיק מקום בטלפון');
    expect(describeSummary(sum(0, [], 0, [false]))).toBe('שיר אחד לא נשמר, נסי לשתף אותו שוב');
    expect(describeSummary(sum(0, [], 0, [false, false, true]))).toBe('שיר אחד לא נשמר: אין מספיק מקום בטלפון · 2 שירים לא נשמרו, נסי לשתף אותם שוב');
  });
  it('recognises a full phone in the platforms\' wordings', () => {
    expect(isNoSpace('ENOSPC: no space left on device')).toBe(true);
    expect(isNoSpace('The file couldn’t be saved because there isn’t enough space.')).toBe(true);
    expect(isNoSpace('Error Domain=NSCocoaErrorDomain Code=640')).toBe(true);
    expect(isNoSpace('Permission denied')).toBe(false);
  });
});
