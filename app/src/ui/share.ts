import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';
import { shareFiles } from '../../modules/shiron-audio';
import { extensionOf, mimeOf, shareBundle, shareFileName, shareMimeType, youtubeShareText } from '../core/ingestRules';
import type { SongWithCategories } from '../core/types';
import { diag } from '../diag/log';
import { resolveStored } from '../ingest/storage';
import { toast } from './toast';

/**
 * "שיתוף": a song — or a whole list or category — to WhatsApp or any other app, through the
 * phone's own share sheet; the app sends nothing anywhere itself. An audio song goes as its file
 * (the converted .m4a, under her title, so the other side sees a name and can play it); a
 * YouTube song as its link.
 */
export async function shareSong(song: SongWithCategories) {
  try {
    if (song.kind === 'youtube') {
      if (!song.youtubeId) return;
      const r = await Share.share({ message: youtubeShareText(song.title, song.youtubeId) });
      diag('share link', song.title, r.action, 'activityType' in r ? r.activityType ?? '' : '');
      return;
    }
    const source = storedFile(song);
    if (!source) {
      toast(song.playableUri ?? song.originalUri ? 'קובץ השמע של השיר חסר במכשיר' : 'השיר עדיין בהכנה. נסי שוב בעוד רגע.', 'error');
      return;
    }
    const ext = extensionOf(source.name) || 'm4a';
    const [copy] = await copiesForSharing([{ source, fileName: shareFileName(song.title, ext) }]);
    diag('share file', song.title, copy.uri, `${copy.size ?? 0} bytes`, mimeOf(copy.name));
    // Android: our own sheet (modules/shiron-audio SongSharer) — expo-sharing's waited for a
    // result that WhatsApp never sends, and then refused every later share.
    if (Platform.OS === 'android') {
      await shareFiles([copy.uri], mimeOf(copy.name), null, song.title);
      return;
    }
    await Sharing.shareAsync(copy.uri, {
      mimeType: mimeOf(copy.name),
      UTI: ext === 'm4a' ? 'public.mpeg-4-audio' : undefined,
      dialogTitle: song.title,
    });
  } catch (e) {
    diag('share failed', song.title, e);
    toast(`לא הצלחנו לשתף את השיר (${shortReason(e)})`, 'error');
  }
}

/**
 * A whole list or category: every audio song as a file and the YouTube songs as one message of
 * links, in one share sheet. `name` is the list's name (the sheet's title).
 */
export async function shareSongs(name: string, songs: SongWithCategories[]) {
  try {
    const files = new Map(songs.map((s) => [s.id, storedFile(s)]));
    const bundle = shareBundle(
      songs.map((s) => {
        const f = files.get(s.id);
        return { id: s.id, title: s.title, kind: s.kind, youtubeId: s.youtubeId, fileExt: f ? extensionOf(f.name) || 'm4a' : null };
      }),
    );
    if (!bundle.files.length && !bundle.text) {
      toast(songs.length ? 'השירים עדיין בהכנה. נסי שוב בעוד רגע.' : 'אין עדיין שירים לשתף', 'info');
      return;
    }
    if (bundle.files.length > 3) toast(`מכינה ${bundle.files.length} שירים לשיתוף…`, 'info');
    const copies = await copiesForSharing(bundle.files.map((f) => ({ source: files.get(f.songId)!, fileName: f.fileName })));
    const bytes = copies.reduce((sum, c) => sum + (c.size ?? 0), 0);
    diag('share list', name, `${copies.length} files`, `${Math.round(bytes / 1024)} KB`, bundle.text ? 'with links' : '', `${bundle.notReady} not ready`);
    if (bundle.notReady) {
      toast(bundle.notReady === 1 ? 'שיר אחד עוד בהכנה ולא נשלח' : `${bundle.notReady} שירים עוד בהכנה ולא נשלחו`, 'info');
    }
    await shareFiles(copies.map((c) => c.uri), shareMimeType(copies.map((c) => c.name)), bundle.text, name);
  } catch (e) {
    diag('share list failed', name, e);
    toast(`לא הצלחנו לשתף (${shortReason(e)})`, 'error');
  }
}

/** The song's file on the phone (converted, else the original), or null if there is none. */
function storedFile(song: SongWithCategories): File | null {
  if (song.kind !== 'audio') return null;
  const stored = song.playableUri ?? song.originalUri;
  if (!stored) return null;
  const file = resolveStored(stored);
  return file.exists ? file : null;
}

/**
 * Copies under her titles in the cache (the stored files have machine names). The previous
 * share's copies are cleared here, not after sharing: the receiving app may still be reading them.
 */
async function copiesForSharing(items: { source: File; fileName: string }[]): Promise<File[]> {
  const dir = new Directory(Paths.cache, 'share');
  if (dir.exists) dir.delete();
  dir.create({ intermediates: true });
  const out: File[] = [];
  for (const { source, fileName } of items) {
    const copy = new File(dir, fileName);
    await source.copy(copy);
    out.push(copy);
  }
  return out;
}

/** A few words of the native error, so a screenshot of the toast says what went wrong. */
function shortReason(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e);
  return m.replace(/\s+/g, ' ').slice(0, 80);
}
