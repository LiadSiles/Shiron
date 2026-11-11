import { File } from 'expo-file-system';
import { AiError } from '../core/ai';
import {
  errorFromGemini, GEMINI_API, GEMINI_MAX_AUDIO_BYTES, GEMINI_MODELS, geminiAudioMime, geminiNamingRequest, geminiStopReason, geminiText,
} from '../core/geminiRules';
import { stripPhantomLines } from '../core/transcript';
import { EXPAND_PROMPT, fallbackUnderstanding, parseExpansion, parseModelJson, sanitize, SongInput, Understanding } from '../core/understand';
import { diag } from '../diag/log';
import { eachModel, fetchWithTimeout } from './http';

/**
 * Gemini (Google AI Studio key): one call listens to the recording and names the song.
 * generateContent is "legacy" in the docs since the Interactions API (June 2026) but fully
 * supported; it is the documented way to send inline audio.
 */

const headers = (key: string) => ({ 'Content-Type': 'application/json', 'x-goog-api-key': key });

/** True when the key works (lists models). Network errors are thrown, not reported as invalid. */
export async function checkGeminiKey(key: string): Promise<boolean> {
  const res = await fetchWithTimeout(`${GEMINI_API}/models?pageSize=1`, { headers: headers(key) }, 20_000, 'gemini');
  if (res.ok) return true;
  const err = errorFromGemini(res.status, await res.text());
  if (err.kind === 'invalid-key') return false;
  throw err;
}

async function generate(key: string, model: string, body: object, timeoutMs: number, signal?: AbortSignal): Promise<string> {
  const res = await fetchWithTimeout(
    `${GEMINI_API}/models/${model}:generateContent`,
    { method: 'POST', headers: headers(key), body: JSON.stringify(body) },
    timeoutMs,
    'gemini',
    signal,
  );
  const text = await res.text();
  if (!res.ok) throw errorFromGemini(res.status, text);
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AiError('server', `Gemini answered with no JSON: ${text.slice(0, 120)}`, null, 'gemini');
  }
  const answer = geminiText(json);
  // An empty answer used to pass as "no lyrics, title from the file name" without a trace.
  if (!answer.trim()) throw new AiError('bad-request', `Gemini gave no answer (${geminiStopReason(json) ?? 'empty'})`, null, 'gemini');
  return answer;
}

/** A YouTube video by URL (public videos; free tier: up to 8 hours of video a day). */
function youtubePart(youtubeId: string): object {
  return { file_data: { file_uri: `https://www.youtube.com/watch?v=${youtubeId}` } };
}

/** Inline audio part, or null when the file is too big or a format Gemini doesn't read. */
async function audioPart(audio: File | null): Promise<object | null> {
  if (!audio?.exists || (audio.size ?? 0) > GEMINI_MAX_AUDIO_BYTES) return null;
  const mime = geminiAudioMime(audio.name);
  return mime ? { inline_data: { mime_type: mime, data: await audio.base64() } } : null;
}

/**
 * Title, categories, lyrics and keywords, listening to the recording when it can be sent.
 * If Gemini refuses the audio itself, it tries once more from the text alone.
 */
export async function understandWithGemini(
  key: string,
  input: SongInput,
  audio: File | null,
  youtubeId: string | null = null,
): Promise<Understanding> {
  // A public YouTube video Gemini watches itself (Google's own feature: no download by us).
  const sound = youtubeId ? youtubePart(youtubeId) : await audioPart(audio);
  if (!sound) return understand(key, input, null);
  try {
    return await understand(key, input, sound);
  } catch (e) {
    if (e instanceof AiError && (e.kind === 'bad-request' || e.kind === 'too-large')) {
      diag('gemini refused the audio, naming from the text', e.message);
      return understand(key, input, null);
    }
    throw e;
  }
}

async function understand(key: string, input: SongInput, sound: object | null, noLyrics = false): Promise<Understanding> {
  const ask = (model: string, schema: boolean) =>
    generate(
      key,
      model,
      geminiNamingRequest(input, sound, { schema, noLyrics }),
      sound && 'file_data' in sound ? 180_000 : 120_000,
    );
  return eachModel(GEMINI_MODELS, async (model) => {
    let content: string;
    try {
      content = await ask(model, true);
    } catch (e) {
      if (!(e instanceof AiError) || e.kind !== 'bad-request') throw e;
      if (/RECITATION/.test(e.message) && !noLyrics) {
        // A well-known song: Gemini won't write its words out (copyright). Name it anyway.
        diag('gemini withheld the lyrics', model, e.message);
        return understand(key, input, sound, true);
      }
      // The schema rejected (models differ in what they accept): plain JSON mode, sanitize() checks.
      content = await ask(model, false);
    }
    const parsed = parseModelJson(content);
    return parsed ? sanitize(parsed) : fallbackUnderstanding(input);
  });
}

/** Asks for the words of one part of a recording, verbatim. */
const TRANSCRIBE_PART = 'תמללי מילה במילה, בעברית, את כל מה שמושר או נאמר בקטע השמע המצורף, מתחילתו ועד סופו, כולל חזרות. ' +
  'כתבי רק את המילים, שורה לכל שורה מושרת, בלי כותרות ובלי הסברים. באותיות עבריות בלבד: בלי תרגום ובלי שורות באנגלית; ' +
  'מילה לועזית שמושרת — באותיות עבריות. אם אין בקטע שירה או דיבור, החזירי שורה ריקה.';

/**
 * The words of one part of a recording (transcription part by part, see api/ai.ts). Null when
 * Gemini won't write them out (a well-known song: RECITATION) or the part has no words.
 */
export async function transcribeWithGemini(key: string, part: File): Promise<string | null> {
  const sound = await audioPart(part);
  if (!sound) return null;
  return eachModel(GEMINI_MODELS, async (model) => {
    try {
      const text = await generate(key, model, { contents: [{ role: 'user', parts: [{ text: TRANSCRIBE_PART }, sound] }] }, 90_000);
      return stripPhantomLines(text.trim()) || null;
    } catch (e) {
      if (e instanceof AiError && e.kind === 'bad-request' && /RECITATION|empty/.test(e.message)) {
        diag('gemini gave no words for a part', model, e.message);
        return null;
      }
      throw e;
    }
  });
}

/** Related words for a search. */
export async function relatedWordsWithGemini(key: string, query: string, signal?: AbortSignal): Promise<string[]> {
  const content = await generate(
    key,
    GEMINI_MODELS[GEMINI_MODELS.length - 1],
    {
      system_instruction: { parts: [{ text: EXPAND_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: query }] }],
      generationConfig: { responseMimeType: 'application/json' },
    },
    15_000,
    signal,
  );
  return parseExpansion(content, query);
}
