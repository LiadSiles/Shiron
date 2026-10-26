/** Pure helpers for turning shared content into songs. */

export const AUTO_ACCEPT_CONFIDENCE = 0.85;
export const SUGGEST_CONFIDENCE = 0.5;

/** Audio formats a teacher may receive. Decoded on the phone (see docs/wiki/audio-processing.md). */
export const AUDIO_EXT = [
  'mp3', 'mpga', 'm4a', 'aac', 'wav', 'aif', 'aiff', 'caf', 'flac', 'ogg', 'oga', 'opus', 'amr', 'awb', 'wma',
];
/** Videos: the sound track is extracted (a song filmed in another kindergarten, a clip). */
export const VIDEO_EXT = ['mp4', 'm4v', 'mov', '3gp', '3g2', 'mpeg', 'mpg', 'webm', 'mkv', 'avi'];

const MEDIA_MIME = /^(audio|video)\//;
const MEDIA_MIME_EXTRA = new Set(['application/ogg', 'application/x-ogg']);

export function extensionOf(name: string): string {
  const m = /\.([a-z0-9]+)(?:\?.*)?$/i.exec(name);
  return m ? m[1].toLowerCase() : '';
}

/** Anything worth trying to decode. The native decoder has the final word. */
export function isMediaFile(fileName: string, mimeType?: string | null): boolean {
  if (mimeType && (MEDIA_MIME.test(mimeType) || MEDIA_MIME_EXTRA.has(mimeType))) return true;
  const ext = extensionOf(fileName);
  return AUDIO_EXT.includes(ext) || VIDEO_EXT.includes(ext);
}

export function isVideoFile(fileName: string, mimeType?: string | null): boolean {
  return !!mimeType?.startsWith("video/") || VIDEO_EXT.includes(extensionOf(fileName));
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

/** MIME type to send with an upload, from the file name. */
export function mimeOf(fileName: string): string {
  const ext = extensionOf(fileName);
  const map: Record<string, string> = {
    m4a: 'audio/mp4', mp4: 'video/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac',
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
 * A readable fallback title until the AI names the song. WhatsApp names like
 * "PTT-20251012-WA0014.opus" or "AUD-20250101-WA0003.mp3" become "הקלטה מ-12.10.2025".
 */
export function fallbackTitle(fileName: string | null | undefined, createdAt: number): string {
  const base = (fileName ?? '').replace(/\.[a-z0-9]+$/i, '').trim();
  const wa = /^(?:PTT|AUD|VID)-(\d{4})(\d{2})(\d{2})-WA\d+/i.exec(base);
  const looksMachine = !base || wa || /^[\da-f-]{16,}$/i.test(base) || /^(audio|voice|recording|file)[\s_-]*\d*$/i.test(base);
  if (looksMachine) {
    const d = wa ? new Date(Number(wa[1]), Number(wa[2]) - 1, Number(wa[3])) : new Date(createdAt);
    return `הקלטה מ-${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
  }
  return base.replace(/[_]+/g, ' ').replace(/\s+/g, ' ');
}

export type ReviewDecision = 'ready' | 'review';

/** Songs the AI is confident about skip the review inbox. */
export function decideStatus(titleConfidence: number, categories: { confidence: number }[]): ReviewDecision {
  const top = categories.reduce((m, c) => Math.max(m, c.confidence), 0);
  return top >= AUTO_ACCEPT_CONFIDENCE && titleConfidence >= AUTO_ACCEPT_CONFIDENCE ? 'ready' : 'review';
}

/** Keep only suggestions worth showing; always at least the best one. */
export function keepCategories<T extends { id: string; confidence: number }>(cats: T[]): T[] {
  const sorted = [...cats].sort((a, b) => b.confidence - a.confidence);
  const kept = sorted.filter((c) => c.confidence >= SUGGEST_CONFIDENCE).slice(0, 3);
  return kept.length ? kept : sorted.slice(0, 1);
}
