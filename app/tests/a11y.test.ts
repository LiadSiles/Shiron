import { describe, expect, it } from 'vitest';
import { rowLabel } from '../src/core/a11y';

describe('what a screen reader says for a row', () => {
  it('reads the title, the value, then the explanation', () => {
    expect(rowLabel('שיתוף מוואטסאפ', 'הקלטות וקישורים')).toBe('שיתוף מוואטסאפ. הקלטות וקישורים');
    expect(rowLabel('Groq', 'מחובר ✓', 'מומלץ')).toBe('Groq. מחובר ✓. מומלץ');
  });
  it('skips what is missing or blank', () => {
    expect(rowLabel('גרסה')).toBe('גרסה');
    expect(rowLabel('גרסה', '', '  ')).toBe('גרסה');
    expect(rowLabel('עזרה', null, 'איך משתפים')).toBe('עזרה. איך משתפים');
  });
});
