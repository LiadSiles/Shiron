import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Share } from 'react-native';
import { extensionOf, mimeOf, shareFileName, youtubeShareText } from '../core/ingestRules';
import type { SongWithCategories } from '../core/types';
import { diag } from '../diag/log';
import { resolveStored } from '../ingest/storage';
import { toast } from './toast';

/**
 * "שיתוף": the song to WhatsApp or any other app, through the phone's own share sheet — the
 * app sends nothing anywhere itself. An audio song goes as its file (the converted .m4a, under
 * her title, so the other side sees a name and can play it); a YouTube song as its link.
 */
export async function shareSong(song: SongWithCategories) {
  try {
    if (song.kind === 'youtube') {
      if (!song.youtubeId) return;
      const r = await Share.share({ message: youtubeShareText(song.title, song.youtubeId) });
      diag('share link', song.title, r.action, 'activityType' in r ? r.activityType ?? '' : '');
      return;
    }
    const stored = song.playableUri ?? song.originalUri;
    if (!stored) {
      toast('השיר עדיין בהכנה. נסי שוב בעוד רגע.', 'info');
      return;
    }
    const source = resolveStored(stored);
    if (!source.exists) {
      toast('קובץ השמע של השיר חסר במכשיר', 'error');
      return;
    }
    // A copy under her title in the cache (the stored file has a machine name). The previous
    // copy is cleared here, not after sharing: the receiving app may still be reading it.
    const dir = new Directory(Paths.cache, 'share');
    if (dir.exists) dir.delete();
    dir.create({ intermediates: true });
    const ext = extensionOf(source.name) || 'm4a';
    const copy = new File(dir, shareFileName(song.title, ext));
    await source.copy(copy);
    diag('share file', song.title, copy.uri, `${copy.size ?? 0} bytes`, mimeOf(copy.name));
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

/** A few words of the native error, so a screenshot of the toast says what went wrong. */
function shortReason(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e);
  return m.replace(/\s+/g, ' ').slice(0, 80);
}
