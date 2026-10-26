import { File } from 'expo-file-system';
import { AiError } from '../core/ai';
import { errorFromGemini, GEMINI_API, GEMINI_MAX_AUDIO_BYTES, GEMINI_MODELS, geminiAudioMime, geminiText } from '../core/geminiRules';
import {
  buildUserMessage,
  EXPAND_PROMPT,
  fallbackUnderstanding,
  parseExpansion,
  parseModelJson,
  sanitize,
  SongInput,
  SYSTEM_PROMPT,
  UNDERSTANDING_SCHEMA,
  Understanding,
} from '../core/understand';
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
  try {
    return geminiText(JSON.parse(text));
  } catch {
    return '';
  }
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
export async function understandWithGemini(key: string, input: SongInput, audio: File | null): Promise<Understanding> {
  const sound = await audioPart(audio);
  if (!sound) return understand(key, input, null);
  try {
    return await understand(key, input, sound);
  } catch (e) {
    if (e instanceof AiError && (e.kind === 'bad-request' || e.kind === 'too-large')) return understand(key, input, null);
    throw e;
  }
}

async function understand(key: string, input: SongInput, sound: object | null): Promise<Understanding> {
  const withAudio: SongInput = { ...input, audioAttached: !!sound };
  const ask = (model: string, schema: boolean) =>
    generate(
      key,
      model,
      {
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: buildUserMessage(withAudio) }, ...(sound ? [sound] : [])] }],
        generationConfig: {
          responseMimeType: 'application/json',
          ...(schema ? { responseJsonSchema: UNDERSTANDING_SCHEMA } : {}),
        },
      },
      120_000,
    );
  return eachModel(GEMINI_MODELS, async (model) => {
    let content: string;
    try {
      content = await ask(model, true);
    } catch (e) {
      // The schema rejected (models differ in what they accept): plain JSON mode, sanitize() checks.
      if (!(e instanceof AiError) || e.kind !== 'bad-request') throw e;
      content = await ask(model, false);
    }
    const parsed = parseModelJson(content);
    return parsed ? sanitize(parsed) : fallbackUnderstanding(input);
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
