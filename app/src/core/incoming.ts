/**
 * Links that open the app with something to save, besides the share extension's own
 * (`shiron://dataUrl=…`, read by expo-share-intent):
 *  - `file:///…/Documents/Inbox/x.opus` — iOS "Open in PlayGan" (the app declares audio and
 *    video document types). Works on any install, including Sideloadly without App Groups.
 *  - `shiron://share?text=…` — the share extension, when it has no App Group to leave the
 *    text in, sends a link or text inside the URL.
 */
export type Incoming = { kind: 'file'; uri: string; name: string } | { kind: 'text'; text: string };

export function parseIncomingUrl(url: string | null | undefined, scheme: string): Incoming | null {
  if (!url) return null;
  if (url.startsWith('file://')) {
    const last = url.split(/[?#]/)[0].split('/').pop() ?? '';
    return { kind: 'file', uri: url, name: safeDecode(last) || 'recording' };
  }
  const m = new RegExp(`^${scheme}://share\\?(?:.*&)?text=([^&#]*)`).exec(url);
  if (m) {
    const text = safeDecode(m[1].replace(/\+/g, ' ')).trim();
    return text ? { kind: 'text', text } : null;
  }
  return null;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
