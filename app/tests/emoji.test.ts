import { describe, expect, it } from 'vitest';
import { lastEmoji } from '../src/core/emoji';

describe('an emoji from the keyboard (owner, 0.14.0)', () => {
  it('takes the last emoji she typed, whole', () => {
    expect(lastEmoji('🦄')).toBe('🦄');
    expect(lastEmoji('🎈🦄')).toBe('🦄');
    expect(lastEmoji('👋🏽')).toBe('👋🏽'); // skin tone
    expect(lastEmoji('👨‍👩‍👧')).toBe('👨‍👩‍👧'); // family, joined
    expect(lastEmoji('🇮🇱')).toBe('🇮🇱'); // flag
    expect(lastEmoji('☀️')).toBe('☀️'); // with the presentation selector
    expect(lastEmoji('❤️')).toBe('❤️');
    expect(lastEmoji('3️⃣')).toBe('3️⃣'); // keycap
    expect(lastEmoji('גשם 🌧️')).toBe('🌧️');
  });

  it('ignores letters and digits', () => {
    expect(lastEmoji('שלום')).toBeNull();
    expect(lastEmoji('abc 123')).toBeNull();
    expect(lastEmoji('')).toBeNull();
  });
});
