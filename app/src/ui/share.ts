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
      if (song.youtubeId) await Share.share({ message: youtubeShareText(song.title, song.youtubeId) });
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
    await Sharing.shareAsync(copy.uri, {
      mimeType: mimeOf(copy.name),
      UTI: ext === 'm4a' ? 'public.mpeg-4-audio' : undefined,
      dialogTitle: song.title,
    });
  } catch (e) {
    diag('share failed', song.title, e);
    toast('לא הצלחנו לשתף את השיר', 'error');
  }
}
