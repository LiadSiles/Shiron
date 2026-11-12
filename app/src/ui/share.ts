import { Directory, File, Paths } from 'expo-file-system';
import { Platform, Share } from 'react-native';
import { createStore } from '../core/store';
import { shareableCopy, shareFiles } from '../../modules/shiron-audio';
import { extensionOf, mimeOf, shareBundle, shareFileName, shareMimeType, youtubeShareText } from '../core/ingestRules';
import type { SongWithCategories } from '../core/types';
import { diag } from '../diag/log';
import { resolveStored } from '../ingest/storage';
import { toast } from './toast';

/**
 * "שיתוף": a song — or a whole list or category — to WhatsApp or any other app, through the
 * phone's own share sheet; the app sends nothing anywhere itself. An audio song goes as a file
 * under her title, so the other side sees a name and can play it (see `copiesForSharing` for
 * the format); a YouTube song as its link. One native sheet on both platforms (modules/
 * shiron-audio): expo-sharing's waited on Android for a result WhatsApp never sends, and took a
 * single file only.
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
    const [copy] = await copiesForSharing([{ source, fileName: shareFileName(song.title, sharedExtension(source)) }]);
    diag('share file', song.title, copy.uri, `${copy.size ?? 0} bytes`, mimeOf(copy.name));
    await shareFiles([copy.uri], mimeOf(copy.name), null, song.title);
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
        return { id: s.id, title: s.title, kind: s.kind, youtubeId: s.youtubeId, fileExt: f ? sharedExtension(f) : null };
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
 * The extension a song's file is shared under. On the iPhone a converted .m4a goes out as .aac:
 * iOS types .m4a as MPEG-4 — a movie type — and WhatsApp showed its video trimmer, then said
 * the file isn't supported (owner, 0.13.0). The same AAC audio in a plain .aac file is audio to
 * every app. Android shares the .m4a, which WhatsApp there takes as audio.
 */
function sharedExtension(source: File): string {
  const ext = extensionOf(source.name) || 'm4a';
  return Platform.OS === 'ios' && ext === 'm4a' ? 'aac' : ext;
}

/**
 * Copies under her titles in the cache (the stored files have machine names), re-wrapped as
 * .aac where `sharedExtension` says so. The previous share's copies are cleared here, not after
 * sharing: the receiving app may still be reading them.
 */
async function copiesForSharing(items: { source: File; fileName: string }[]): Promise<File[]> {
  const dir = new Directory(Paths.cache, 'share');
  if (dir.exists) dir.delete();
  dir.create({ intermediates: true });
  const out: File[] = [];
  const counted = items.length > 1;
  try {
    for (const [i, { source, fileName }] of items.entries()) {
      if (counted) shareOutStore.set({ done: i, total: items.length });
      const copy = new File(dir, fileName);
      if (extensionOf(fileName) === 'aac' && extensionOf(source.name) === 'm4a') await shareableCopy(source.uri, copy.uri);
      else await source.copy(copy);
      out.push(copy);
    }
  } finally {
    if (counted) shareOutStore.set({ done: 0, total: 0 });
  }
  return out;
}

/** Copies being made for a list or category shared out, for ui/ActivityDock (total 0 = none). */
export const shareOutStore = createStore<{ done: number; total: number }>({ done: 0, total: 0 });

/** A few words of the native error, so a screenshot of the toast says what went wrong. */
function shortReason(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e);
  return m.replace(/\s+/g, ' ').slice(0, 80);
}
