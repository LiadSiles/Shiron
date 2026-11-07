import { describe, expect, it } from 'vitest';
import { normalize, skeleton, stems, tokenize, tokenMatch } from '../src/core/hebrew';

describe('hebrew normalization', () => {
  it('strips niqqud, unifies final letters and punctuation', () => {
    expect(normalize('שָׁלוֹם, חֲבֵרִים!')).toBe('שלומ חברימ');
    expect(normalize('ט״ו בשבט')).toBe('טו בשבט');
  });
  it('removes attached prefixes', () => {
    expect(stems('והפרפר')).toContain('פרפר');
    expect(stems(normalize('בגן'))).toContain(normalize('גן'));
  });
  it('matches full and defective spelling', () => {
    expect(skeleton('שולחנ')).toBe(skeleton('שלחנ'));
    expect(tokenMatch('תינוק', 'תנוק')).toBeGreaterThan(0);
  });
  it('matches while typing (prefix)', () => {
    expect(tokenMatch('פרפ', 'פרפרימ')).toBe(2);
    expect(tokenMatch('פ', 'פרפר')).toBe(0);
  });
});

describe('tokenize', () => {
  it('splits normalized words and drops nothing else', () => {
    expect(tokenize('  בוקר   טוב, ילדים!  ')).toEqual(tokenize('בוקר טוב ילדים'));
    expect(tokenize('בוקר טוב ילדים')).toHaveLength(3);
  });
  it('gives no tokens for empty or punctuation-only text', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize(' ... ')).toEqual([]);
  });
});
