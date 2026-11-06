import { getShareExtensionKey } from 'expo-share-intent';
import { parseIncomingUrl } from '../core/incoming';

/**
 * The share extension opens the app with a deep link like `shiron://dataUrl=shironShareKey`
 * (or `shiron://share?text=…`), and iOS opens files with a `file://` link. None is a screen —
 * send them to the home screen; the ShareHandler in the root layout saves what they carry.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (path.includes(`dataUrl=${getShareExtensionKey()}`)) return '/';
    if (parseIncomingUrl(path, 'shiron')) return '/';
    return path;
  } catch {
    return '/';
  }
}
