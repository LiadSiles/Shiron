/** Pure helpers for turning shared content into songs. */
import type { Song } from './types';
import { isNoSpace } from './importSummary';

const SUGGEST_CONFIDENCE = 0.5;

/** Audio formats a teacher may receive. Decoded on the phone (see docs/wiki/audio-processing.md). */
const AUDIO_EXT = [
  'mp3', 'mpga', 'm4a', 'aac', 'wav', 'aif', 'aiff', 'caf', 'flac', 'ogg', 'oga', 'opus', 'amr', 'awb',
  'wma', // Windows Media: no phone decodes it; our FFmpeg build does (native/ffmpeg)
];
/** Videos: the sound track is extracted (a song filmed in another kindergarten, a clip). */
const VIDEO_EXT = ['mp4', 'm4v', 'mov', '3gp', '3g2', 'mpeg', 'mpg', 'webm', 'mkv', 'avi', 'wmv', 'asf', 'vob', 'flv'];

const MEDIA_MIME = /^(audio|video)\//;
const MEDIA_MIME_EXTRA = new Set(['application/ogg', 'application/x-ogg']);

export function extensionOf(name: string): string {
  const m = /\.([a-z0-9]+)(?:\?.*)?$/i.exec(name);
  return m ? m[1].toLowerCase() : '';
}

/**
 * A song that didn't make it and can be tried again: a file the phone couldn't convert (its
 * original is kept), or one the AI step failed on (the error shows on its screen).
 */
export function isFailed(song: Pick<Song, 'kind' | 'audioState' | 'originalUri' | 'error'>): boolean {
  return (song.kind === 'audio' && song.audioState === 'unsupported' && !!song.originalUri) || !!song.error;
}

/** Windows Media (WMA/WMV/ASF): converted by our FFmpeg build, not the phone's. Null for anything else. */
export function windowsMediaFormat(fileName: string, mimeType?: string | null): 'WMA' | 'WMV' | null {
  const ext = extensionOf(fileName);
  const mime = (mimeType ?? '').toLowerCase();
  if (ext === 'wma' || mime === 'audio/x-ms-wma') return 'WMA';
  if (ext === 'wmv' || ext === 'asf' || mime === 'video/x-ms-wmv' || mime === 'video/x-ms-asf') return 'WMV';
  return null;
}

/** Anything worth trying to decode. The native decoder has the final word. */
export function isMediaFile(fileName: string, mimeType?: string | null): boolean {
  if (mimeType && (MEDIA_MIME.test(mimeType) || MEDIA_MIME_EXTRA.has(mimeType))) return true;
  const ext = extensionOf(fileName);
  return AUDIO_EXT.includes(ext) || VIDEO_EXT.includes(ext);
}

/**
 * Can the phone play the original before it is converted (conversion takes a few seconds)?
 * iOS (AVPlayer) cannot play Ogg/Opus voice notes; Android can.
 */
export function isNativelyPlayable(fileName: string, platform: 'ios' | 'android' | string): boolean {
  const ext = extensionOf(fileName);
  if (['mp3', 'm4a', 'aac', 'wav', 'caf', 'aif', 'aiff'].includes(ext)) return true;
  if (['ogg', 'oga', 'opus', 'flac', 'amr'].includes(ext)) return platform === 'android';
  return false;
}

/**
 * An audio song that can't play yet because the phone is still converting it (seconds).
 * YouTube songs never are: they have no audio step.
 */
export function isPreparing(song: { kind: string; audioState: string; playableUri: string | null }): boolean {
  return song.kind === 'audio' && song.audioState === 'raw' && !song.playableUri;
}

/** Something an AI service can listen to: the song's audio file, or (Gemini) its YouTube video. */
/** Can start right now: an audio song with a playable file, or a YouTube song (full player). */
export function canStart(song: { kind: string; playableUri: string | null }): boolean {
  return song.kind === 'youtube' || !!song.playableUri;
}

export function canTranscribe(song: { kind: string; playableUri: string | null; originalUri: string | null; youtubeId: string | null }): boolean {
  return song.kind === 'youtube' ? !!song.youtubeId : !!(song.playableUri ?? song.originalUri);
}

/** MIME type to send with an upload, from the file name. */
export function mimeOf(fileName: string): string {
  const ext = extensionOf(fileName);
  const map: Record<string, string> = {
    m4a: 'audio/mp4', aac: 'audio/aac', mp4: 'video/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac',
    ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', webm: 'audio/webm',
  };
  return map[ext] ?? 'application/octet-stream';
}

/** Extract an 11-character YouTube video id from any common URL form. */
export function youtubeIdFrom(text: string): string | null {
  const patterns = [
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/(?:watch\?(?:[^#\s]*&)?v=|shorts\/|embed\/|live\/|v\/)([A-Za-z0-9_-]{11})/,
    /music\.youtube\.com\/watch\?(?:[^#\s]*&)?v=([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = p.exec(text);
    if (m) return m[1];
  }
  return null;
}

/**
 * Every YouTube video in a share, once each, with the words around it. Several links shared
 * together (messages forwarded from WhatsApp, a list from Notes) arrive as one text, a link per
 * line; only the first one used to be saved (owner, 0.14.1). A link's context is its own line
 * without the link — or, for a single link, the whole text, as before.
 */
export function youtubeLinksIn(text: string | null, webUrl?: string | null): { url: string; context: string | null }[] {
  const lines = [webUrl ?? '', ...(text ?? '').split('\n')];
  const seen = new Set<string>();
  const links: { url: string; line: string }[] = [];
  for (const line of lines) {
    for (const url of line.match(/\S*(?:youtu\.be|youtube\.com)\/\S+/g) ?? []) {
      const id = youtubeIdFrom(url);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      links.push({ url, line });
    }
  }
  const whole = text?.trim() || null;
  if (links.length === 1) return [{ url: links[0].url, context: whole && whole !== links[0].url ? whole : null }];
  return links.map(({ url, line }) => ({ url, context: line.replace(url, '').trim() || null }));
}

/**
 * A readable fallback title until the AI names the song. WhatsApp names like
 * "PTT-20251012-WA0014.opus" or "AUD-20250101-WA0003.mp3" become "הקלטה מ-12.10.2025".
 */
export function fallbackTitle(fileName: string | null | undefined, createdAt: number): string {
  const base = (fileName ?? '').replace(/\.[a-z0-9]+$/i, '').trim();
  const wa = /^(?:PTT|AUD|VID)-(\d{4})(\d{2})(\d{2})-WA\d+/i.exec(base);
  // Android content ids ("msf:1000000019", "audio:42", "primary:Music/…") are not names either.
  const androidId = /^[a-z]+:[\w/.-]*\d[\w/.-]*$/i.test(base) && !/\s/.test(base);
  const looksMachine = !base || wa || androidId || /^[\da-f-]{16,}$/i.test(base) || /^(audio|voice|recording|file)[\s_-]*\d*$/i.test(base);
  if (looksMachine) {
    const d = wa ? new Date(Number(wa[1]), Number(wa[2]) - 1, Number(wa[3])) : new Date(createdAt);
    return `הקלטה מ-${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
  }
  return base.replace(/[_]+/g, ' ').replace(/\s+/g, ' ');
}

/** Keep only suggestions worth showing; always at least the best one. */
export function keepCategories<T extends { id: string; confidence: number }>(cats: T[]): T[] {
  const sorted = [...cats].sort((a, b) => b.confidence - a.confidence);
  const kept = sorted.filter((c) => c.confidence >= SUGGEST_CONFIDENCE).slice(0, 3);
  return kept.length ? kept : sorted.slice(0, 1);
}

/**
 * The file name a shared song travels under (WhatsApp shows it): her title, without characters
 * that file systems refuse, never empty and not absurdly long.
 */
export function shareFileName(title: string, ext: string): string {
  const clean = title
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 80)
    .trim();
  return `${clean || 'שיר'}.${ext.replace(/^\./, '') || 'm4a'}`;
}

/** What she sends for a YouTube song: its title and a short link. */
export function youtubeShareText(title: string, youtubeId: string): string {
  return `${title}\nhttps://youtu.be/${youtubeId}`;
}

/** A song as a whole list or category shares it. */
export interface ShareableSong {
  id: string;
  title: string;
  kind: 'audio' | 'youtube';
  youtubeId: string | null;
  /** The stored file's extension (m4a once converted); null = no file on the phone yet. */
  fileExt: string | null;
}

/**
 * What "שיתוף" of a whole list or category sends: every audio song as a file (names made unique,
 * a file per name — "שיר (2).m4a"), the YouTube songs as one text of titles and links (no files
 * — terms of service), and how many songs had nothing to send yet (still being prepared).
 */
export function shareBundle(songs: readonly ShareableSong[]): {
  files: { songId: string; fileName: string }[];
  text: string | null;
  notReady: number;
} {
  const files: { songId: string; fileName: string }[] = [];
  const links: string[] = [];
  const used = new Set<string>();
  let notReady = 0;
  for (const s of songs) {
    if (s.kind === 'youtube') {
      if (s.youtubeId) links.push(youtubeShareText(s.title, s.youtubeId));
      else notReady += 1;
      continue;
    }
    if (!s.fileExt) {
      notReady += 1;
      continue;
    }
    const first = shareFileName(s.title, s.fileExt);
    const dot = first.lastIndexOf('.');
    let name = first;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${first.slice(0, dot)} (${n})${first.slice(dot)}`;
    used.add(name.toLowerCase());
    files.push({ songId: s.id, fileName: name });
  }
  return { files, text: links.length ? links.join('\n\n') : null, notReady };
}

/** One type for every file in a share (the share sheet filters apps by it). */
export function shareMimeType(fileNames: readonly string[]): string {
  const types = [...new Set(fileNames.map((n) => mimeOf(n)))];
  if (types.length === 1) return types[0];
  return types.every((t) => t.startsWith('audio/')) ? 'audio/*' : '*/*';
}

/**
 * After the phone failed to convert a file (both its own decoder and our FFmpeg): what she
 * reads, and whether the original may still be played. Only a recording that is merely too
 * long is still readable; anything else the phone couldn't read won't play either — keeping it
 * "playable" made a tap on a damaged file silently do nothing.
 */
export function failedConversion(code: string | null, sourceName: string, message = ''): { error: string; keepOriginalPlayable: boolean } {
  // A full phone is not a bad file: say so, and keep what played before.
  if (isNoSpace(message)) return { error: 'אין מספיק מקום בטלפון כדי להכין את השיר. אחרי שתפני מקום, אפשר לנסות שוב מההגדרות.', keepOriginalPlayable: true };
  if (code === 'TOO_LONG') return { error: 'ההקלטה ארוכה משעה', keepOriginalPlayable: true };
  if (code === 'NO_AUDIO') return { error: 'אין בקובץ שמע', keepOriginalPlayable: false };
  const wm = windowsMediaFormat(sourceName);
  if (wm) return { error: `לא הצלחנו לקרוא את קובץ ה־${wm}. אפשר להמיר אותו ל־MP3 במחשב ולשתף שוב.`, keepOriginalPlayable: false };
  return { error: 'הפורמט לא נתמך במכשיר הזה, או שהקובץ פגום', keepOriginalPlayable: false };
}
