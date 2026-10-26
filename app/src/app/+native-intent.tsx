import { getShareExtensionKey } from 'expo-share-intent';

/**
 * The share extension opens the app with a deep link like `shiron://dataUrl=shironShareKey`.
 * It isn't a screen — send it to the home screen; the ShareHandler in the root layout
 * picks up the shared files.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (path.includes(`dataUrl=${getShareExtensionKey()}`)) return '/';
    return path;
  } catch {
    return '/';
  }
}
