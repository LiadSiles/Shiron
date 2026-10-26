import { Directory, File, Paths } from 'expo-file-system';

const SONGS = 'songs';

/** Songs live in the app's document directory, which the OS never clears. */
export function songsDir(): Directory {
  const dir = new Directory(Paths.document, SONGS);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/**
 * On iOS the absolute path of the app container changes between app updates,
 * so the database stores paths relative to the document directory.
 */
export function toStoredPath(file: File): string {
  return `${SONGS}/${file.name}`;
}

export function resolveStored(stored: string): File {
  return stored.startsWith('file://') ? new File(stored) : new File(Paths.document, stored);
}

/** Remove a song's audio files from the device. */
export function deleteStored(...stored: (string | null)[]) {
  for (const s of stored) {
    if (!s) continue;
    try {
      const f = resolveStored(s);
      if (f.exists) f.delete();
    } catch {
      /* already gone */
    }
  }
}
