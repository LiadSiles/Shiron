import { describe, expect, it } from 'vitest';
import { parseIncomingUrl } from '../src/core/incoming';

describe('parseIncomingUrl', () => {
  it('reads a file opened in the app, with its decoded name', () => {
    expect(parseIncomingUrl('file:///private/var/mobile/Containers/Data/Application/A/Documents/Inbox/%D7%A9%D7%99%D7%A8%201.opus', 'shiron'))
      .toEqual({
        kind: 'file',
        uri: 'file:///private/var/mobile/Containers/Data/Application/A/Documents/Inbox/%D7%A9%D7%99%D7%A8%201.opus',
        name: 'שיר 1.opus',
      });
  });

  it('reads text the share extension put in the link', () => {
    expect(parseIncomingUrl('shiron://share?text=https%3A%2F%2Fyoutu.be%2Fabc%0A%D7%A9%D7%99%D7%A8', 'shiron'))
      .toEqual({ kind: 'text', text: 'https://youtu.be/abc\nשיר' });
  });

  it('ignores the extension’s own links, other links and empty text', () => {
    expect(parseIncomingUrl('shiron://dataUrl=shironShareKey?nonce=1#file', 'shiron')).toBeNull();
    expect(parseIncomingUrl('shiron://song/1', 'shiron')).toBeNull();
    expect(parseIncomingUrl('shiron://share?text=', 'shiron')).toBeNull();
    expect(parseIncomingUrl(null, 'shiron')).toBeNull();
  });

  it('survives broken encoding', () => {
    expect(parseIncomingUrl('shiron://share?text=%E0%A4', 'shiron')).toEqual({ kind: 'text', text: '%E0%A4' });
  });
});
