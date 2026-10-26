import { File, UploadType } from 'expo-file-system';
import { AiError } from '../core/ai';
import { CHAT_MODELS, errorFromGroq, GROQ_API, MAX_TRANSCRIPTION_BYTES, TRANSCRIPTION_MODELS } from '../core/groqRules';
import {
  buildUserMessage,
  EXPAND_PROMPT,
  fallbackUnderstanding,
  parseExpansion,
  parseModelJson,
  sanitize,
  SongInput,
  SYSTEM_PROMPT,
  TRANSCRIPTION_PROMPT,
  UNDERSTANDING_SCHEMA,
  Understanding,
} from '../core/understand';
import { eachModel, fetchWithTimeout } from './http';

/** Groq: Whisper transcription, then a chat model names the song from the transcript. */

/** True when the key works (lists models). Network errors are thrown, not reported as invalid. */
export async function checkGroqKey(key: string): Promise<boolean> {
  const res = await fetchWithTimeout(`${GROQ_API}/models`, { headers: { Authorization: `Bearer ${key}` } }, 20_000, 'groq');
  if (res.ok) return true;
  if (res.status === 401 || res.status === 403) return false;
  throw errorFromGroq(res.status, await res.text(), (h) => res.headers.get(h));
}

/** Whisper transcription in Hebrew; null when the file is over the free upload limit. */
export async function transcribe(key: string, audio: File, mimeType: string): Promise<string | null> {
  if ((audio.size ?? 0) > MAX_TRANSCRIPTION_BYTES) return null;
  return eachModel(TRANSCRIPTION_MODELS, async (model) => {
    let res;
    try {
      res = await audio.upload(`${GROQ_API}/audio/transcriptions`, {
        uploadType: UploadType.MULTIPART,
        fieldName: 'file',
        mimeType,
        headers: { Authorization: `Bearer ${key}` },
        parameters: { model, language: 'he', prompt: TRANSCRIPTION_PROMPT, response_format: 'json', temperature: '0' },
        sessionType: 'foreground',
      });
    } catch (e) {
      throw new AiError('network', String(e), null, 'groq');
    }
    if (res.status < 200 || res.status >= 300) {
      const headers = res.headers;
      throw errorFromGroq(res.status, res.body, (h) =>
        Object.entries(headers).find(([k]) => k.toLowerCase() === h)?.[1] ?? null);
    }
    try {
      return (JSON.parse(res.body) as { text?: string }).text?.trim() || null;
    } catch {
      return null;
    }
  });
}

/** One chat completion; returns the message text. */
async function completion(key: string, body: object, timeoutMs: number, signal?: AbortSignal): Promise<string> {
  const res = await fetchWithTimeout(
    `${GROQ_API}/chat/completions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    },
    timeoutMs,
    'groq',
    signal,
  );
  const text = await res.text();
  if (!res.ok) throw errorFromGroq(res.status, text, (h) => res.headers.get(h));
  try {
    return (JSON.parse(text) as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? '';
  } catch {
    return '';
  }
}

async function chat(key: string, model: string, input: SongInput, strict: boolean): Promise<Understanding> {
  const content = await completion(
    key,
    {
      model,
      temperature: 0.2,
      reasoning_effort: 'low',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserMessage(input) },
      ],
      response_format: strict
        ? { type: 'json_schema', json_schema: { name: 'song', strict: true, schema: UNDERSTANDING_SCHEMA } }
        : { type: 'json_object' },
    },
    90_000,
  );
  const parsed = parseModelJson(content);
  return parsed ? sanitize(parsed) : fallbackUnderstanding(input);
}

/** Title, categories, lyrics and keywords from the transcript and context. */
export function understandWithGroq(key: string, input: SongInput): Promise<Understanding> {
  return eachModel(CHAT_MODELS, async (model) => {
    try {
      return await chat(key, model, input, true);
    } catch (e) {
      // A rejected schema or an answer that broke it: ask again in plain JSON mode;
      // sanitize() enforces the shape either way.
      if (e instanceof AiError && e.kind === 'bad-request') return chat(key, model, input, false);
      throw e;
    }
  });
}

/** Related words for a search (small model: fast, its own quota). */
export async function relatedWordsWithGroq(key: string, query: string, signal?: AbortSignal): Promise<string[]> {
  const content = await completion(
    key,
    {
      model: CHAT_MODELS[CHAT_MODELS.length - 1],
      temperature: 0.3,
      reasoning_effort: 'low',
      messages: [
        { role: 'system', content: EXPAND_PROMPT },
        { role: 'user', content: query },
      ],
      response_format: { type: 'json_object' },
    },
    15_000,
    signal,
  );
  return parseExpansion(content, query);
}
