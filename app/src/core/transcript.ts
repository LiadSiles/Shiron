/**
 * Cleaning Whisper's output. Over music or silence Whisper "hears" stock phrases it learned from
 * subtitled videos — in Hebrew mostly "תודה רבה", "תודה שצפיתם", subtitle credits — and they end
 * up in the lyrics (owner report, 0.5.1). Pure logic, unit-tested.
 */
import { normalize } from './hebrew';

export interface WhisperSegment {
  text: string;
  /** Average log-probability of the tokens: low = Whisper was guessing. */
  avg_logprob?: number;
  /** Whisper's own estimate that there was no speech in this stretch. */
  no_speech_prob?: number;
  /** gzip ratio of the text: above ~2.4 Whisper is stuck repeating itself. */
  compression_ratio?: number;
}

/** Whole segments that are almost always invented (normalized; prefixes match credit lines). */
const PHANTOM_EXACT = new Set(
  ['תודה', 'תודה רבה', 'תודה רבה לכם', 'תודה לכם', 'תודה שצפיתם', 'תודה על הצפייה', 'תודה על ההאזנה',
    'תודה שהאזנתם', 'תודה רבה על הצפייה', 'להתראות בסרטון הבא', 'הירשמו לערוץ', 'עברית'].map(normalize),
);
const PHANTOM_PREFIX = ['כתוביות', 'תורגם', 'תרגום', 'תמלול', 'הופק', 'subtitles', 'transcribed'].map(normalize);

/** Is this segment one of Whisper's stock inventions rather than something sung? */
export function isPhantom(segment: WhisperSegment): boolean {
  const t = normalize(segment.text);
  if (!t) return true;
  if (PHANTOM_EXACT.has(t)) return true;
  if (PHANTOM_PREFIX.some((p) => t.startsWith(p))) return true;
  // Whisper's own rules: "nothing was said here" (high no-speech probability with low
  // confidence), and "stuck in a loop" (highly compressible text with low confidence). Singing
  // over music often looks unsure to Whisper, so only a clear "no speech" drops a line —
  // lyrics must not lose sung parts (owner, 0.10).
  if ((segment.no_speech_prob ?? 0) > 0.8 && (segment.avg_logprob ?? 0) < -1) return true;
  return (segment.compression_ratio ?? 0) > 2.4 && (segment.avg_logprob ?? 0) < -1;
}

/** Hebrew-insensitive word count (for comparing a tidied text with the transcript it came from). */
function words(text: string | null): number {
  return text ? normalize(text).split(/\s+/).filter(Boolean).length : 0;
}

/**
 * The lyrics to keep: the model's tidy version, unless it left out a real part of what was
 * transcribed (it shortened, summarised or stopped early) — then the full transcript, one
 * line per sung line. Completeness wins over neatness (owner, 0.10).
 */
export function completeLyrics(tidy: string | null, transcript: string | null): string | null {
  if (!transcript?.trim()) return tidy;
  if (!tidy?.trim()) return transcript;
  return words(tidy) >= 0.85 * words(transcript) ? tidy : transcript;
}

/** Transcripts of consecutive parts of one recording, as one text (empty parts skipped). */
export function joinParts(parts: (string | null)[]): string | null {
  const text = parts.map((p) => p?.trim()).filter(Boolean).join('\n');
  return text || null;
}

/**
 * The same clean-up for lyrics from a model that returns plain text (Gemini, or the chat model
 * tidying Whisper's text): drop lines that are only a stock phrase.
 */
export function stripPhantomLines(lyrics: string | null): string | null {
  if (!lyrics) return lyrics;
  const lines = lyrics.split('\n').filter((l) => !l.trim() || !isPhantom({ text: l }));
  const text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return text || null;
}

/**
 * The transcript from a verbose_json response, without phantom segments; one line per segment.
 * Falls back to the plain `text` when there are no segments. Null when nothing real is left.
 */
export function cleanTranscript(response: { text?: string; segments?: WhisperSegment[] } | null | undefined): string | null {
  if (!response) return null;
  const segments = Array.isArray(response.segments) ? response.segments : null;
  if (!segments) {
    const text = response.text?.trim() ?? '';
    return text && !isPhantom({ text }) ? text : null;
  }
  const lines = segments.filter((s) => typeof s?.text === 'string' && !isPhantom(s)).map((s) => s.text.trim());
  // A loop over a long instrumental: more than four identical lines in a row is Whisper stuck,
  // not the song (children's songs do repeat a line three or four times — those stay).
  const LOOP = 4;
  const deduped = lines.filter((l, i) => i < LOOP || lines.slice(i - LOOP, i).some((p) => p !== l));
  return deduped.length ? deduped.join('\n') : null;
}
