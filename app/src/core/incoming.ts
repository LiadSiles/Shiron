/**
 * The link the share extension opens the app with when it has no App Group to leave the share
 * in (Sideloadly with a free Apple ID): `shiron://share?text=…`, a link or text inside the URL.
 * With an App Group it uses `shiron://dataUrl=…`, read by expo-share-intent.
 */
export function sharedTextFromUrl(url: string | null | undefined, scheme: string): string | null {
  if (!url) return null;
  const m = new RegExp(`^${scheme}://share\\?(?:.*&)?text=([^&#]*)`).exec(url);
  if (!m) return null;
  return safeDecode(m[1].replace(/\+/g, ' ')).trim() || null;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
