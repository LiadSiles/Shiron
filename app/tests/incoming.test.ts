import { describe, expect, it } from 'vitest';
import { sharedTextFromUrl } from '../src/core/incoming';

describe('sharedTextFromUrl', () => {
  it('reads text the share extension put in the link', () => {
    expect(sharedTextFromUrl('shiron://share?text=https%3A%2F%2Fyoutu.be%2Fabc%0A%D7%A9%D7%99%D7%A8', 'shiron'))
      .toBe('https://youtu.be/abc\nשיר');
  });

  it('ignores the extension’s own links, other links and empty text', () => {
    expect(sharedTextFromUrl('shiron://dataUrl=shironShareKey?nonce=1#file', 'shiron')).toBeNull();
    expect(sharedTextFromUrl('shiron://song/1', 'shiron')).toBeNull();
    expect(sharedTextFromUrl('file:///x/Documents/Inbox/a.opus', 'shiron')).toBeNull();
    expect(sharedTextFromUrl('shiron://share?text=', 'shiron')).toBeNull();
    expect(sharedTextFromUrl(null, 'shiron')).toBeNull();
  });

  it('survives broken encoding', () => {
    expect(sharedTextFromUrl('shiron://share?text=%E0%A4', 'shiron')).toBe('%E0%A4');
  });
});
