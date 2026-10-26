import { File, UploadType } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import {
  CHAT_MODELS,
  errorFromResponse,
  GROQ_API,
  GroqError,
  MAX_TRANSCRIPTION_BYTES,
  TRANSCRIPTION_MODELS,
} from '../core/groqRules';
import {
  buildUserMessage,
  EXPAND_PROMPT,
  parseExpansion,
  fallbackUnderstanding,
  parseModelJson,
  sanitize,
  SongInput,
  SYSTEM_PROMPT,
  TRANSCRIPTION_PROMPT,
  UNDERSTANDING_SCHEMA,
  Understanding,
} from '../core/understand';

const KEY_NAME = 'groqApiKey';

// ---------------------------------------------------------------- key

type KeyListener = (connected: boolean) => void;
const keyListeners = new Set<KeyListener>();
let cachedKey: string | null | undefined;

/** The teacher's own key, kept in the iOS Keychain / Android Keystore. */
export async function getGroqKey(): Promise<string | null> {
  if (cachedKey === undefined) cachedKey = await SecureStore.getItemAsync(KEY_NAME);
  return cachedKey;
}

export async function saveGroqKey(key: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_NAME, key);
  cachedKey = key;
  keyListeners.forEach((l) => l(true));
}

export async function removeGroqKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_NAME);
  cachedKey = null;
  keyListeners.forEach((l) => l(false));
}

export function onGroqKeyChange(l: KeyListener): () => void {
  keyListeners.add(l);
  return () => keyListeners.delete(l);
}

/** True when the key works (lists models). Network errors are thrown, not reported as invalid. */
export async function checkGroqKey(key: string): Promise<boolean> {
  let res: Response;
  try {
    res = await fetch(`${GROQ_API}/models`, { headers: { Authorization: `Bearer ${key}` } });
  } catch (e) {
    throw new GroqError('network', String(e));
  }
  if (res.ok) return true;
  if (res.status === 401 || res.status === 403) return false;
  throw errorFromResponse(res.status, await res.text(), (h) => res.headers.get(h));
}

// ---------------------------------------------------------------- calls

/** Whisper transcription in Hebrew. Falls back to the next model when one is rate-limited. */
export async function transcribe(key: string, audio: File, mimeType = 'audio/mp4'): Promise<string | null> {
  if ((audio.size ?? 0) > MAX_TRANSCRIPTION_BYTES) return null;
  let last: GroqError | null = null;
  for (const model of TRANSCRIPTION_MODELS) {
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
      throw new GroqError('network', String(e));
    }
    if (res.status >= 200 && res.status < 300) {
      try {
        const text = (JSON.parse(res.body) as { text?: string }).text?.trim();
        return text || null;
      } catch {
        return null;
      }
    }
    const headers = res.headers;
    last = errorFromResponse(res.status, res.body, (h) =>
      Object.entries(headers).find(([k]) => k.toLowerCase() === h)?.[1] ?? null);
    if (last.kind !== 'rate-limited') throw last;
  }
  throw last!;
}

async function chat(key: string, model: string, input: SongInput, strict = true): Promise<Understanding> {
  let res: Response;
  try {
    res = await fetch(`${GROQ_API}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
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
      }),
    });
  } catch (e) {
    throw new GroqError('network', String(e));
  }
  const body = await res.text();
  if (!res.ok) throw errorFromResponse(res.status, body, (h) => res.headers.get(h));
  const content = (JSON.parse(body) as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? '';
  const parsed = parseModelJson(content);
  return parsed ? sanitize(parsed) : fallbackUnderstanding(input);
}

/** Title, categories, lyrics and keywords. Falls back to the next model when one is rate-limited. */
export async function understand(key: string, input: SongInput): Promise<Understanding> {
  let last: GroqError | null = null;
  for (const model of CHAT_MODELS) {
    try {
      try {
        return await chat(key, model, input);
      } catch (e) {
        // A rejected schema or an answer that broke it: ask again in plain JSON mode;
        // sanitize() enforces the shape either way.
        if (e instanceof GroqError && e.kind === 'bad-request') return await chat(key, model, input, false);
        throw e;
      }
    } catch (e) {
      if (!(e instanceof GroqError) || e.kind !== 'rate-limited') throw e;
      last = e;
    }
  }
  throw last!;
}

// ---------------------------------------------------------------- search by meaning

const expansionCache = new Map<string, string[]>();

/**
 * Words related in meaning to a search, for songs that never use the typed word. Sends only the
 * query. Uses the small model (fast, separate rate limit); failures just mean no extra results.
 */
export async function expandQuery(key: string, query: string, signal?: AbortSignal): Promise<string[]> {
  const q = query.trim();
  const cached = expansionCache.get(q);
  if (cached) return cached;
  const res = await fetch(`${GROQ_API}/chat/completions`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: CHAT_MODELS[CHAT_MODELS.length - 1],
      temperature: 0.3,
      reasoning_effort: 'low',
      messages: [
        { role: 'system', content: EXPAND_PROMPT },
        { role: 'user', content: q },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  const body = await res.text();
  if (!res.ok) throw errorFromResponse(res.status, body, (h) => res.headers.get(h));
  const content = (JSON.parse(body) as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? '';
  const words = parseExpansion(content, q);
  expansionCache.set(q, words);
  return words;
}

// ---------------------------------------------------------------- YouTube

/** Title and channel through YouTube's public oEmbed endpoint: no key, no download. */
export async function youtubeMeta(youtubeId: string): Promise<{ title: string; author: string | null } | null> {
  try {
    const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${youtubeId}`)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const j = (await res.json()) as { title?: string; author_name?: string };
    return j.title ? { title: j.title, author: j.author_name ?? null } : null;
  } catch {
    return null;
  }
}
