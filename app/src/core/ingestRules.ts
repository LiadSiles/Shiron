/** Pure helpers for turning shared content into songs. */

export const AUTO_ACCEPT_CONFIDENCE = 0.85;
export const SUGGEST_CONFIDENCE = 0.5;

const AUDIO_EXT = ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'opus', 'oga', 'flac', 'amr', '3gp', 'caf', 'mp4', 'mpga'];

export function extensionOf(name: string): string {
  const m = /\.([a-z0-9]+)(?:\?.*)?$/i.exec(name);
  return m ? m[1].toLowerCase() : '';
}

export function isAudioFile(fileName: string, mimeType?: string | null): boolean {
  if (mimeType?.startsWith('audio/')) return true;
  return AUDIO_EXT.includes(extensionOf(fileName));
}

/**
 * Can the phone play the original file before the server converts it?
 * iOS (AVPlayer) cannot play Ogg/Opus voice notes; Android can.
 */
export function isNativelyPlayable(fileName: string, platform: 'ios' | 'android' | string): boolean {
  const ext = extensionOf(fileName);
  if (['mp3', 'm4a', 'aac', 'wav', 'mp4', 'caf'].includes(ext)) return true;
  if (['ogg', 'opus', 'oga'].includes(ext)) return platform === 'android';
  return false;
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
