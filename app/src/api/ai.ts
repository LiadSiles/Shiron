import { File } from 'expo-file-system';
import { AiError, ProviderId, providerOrder } from '../core/ai';
import { fallbackUnderstanding, SongInput, Understanding } from '../core/understand';
import { diag } from '../diag/log';
import { relatedWordsWithGemini, understandWithGemini } from './gemini';
import { relatedWordsWithGroq, transcribe, understandWithGroq } from './groq';
import { connectedProviders, getKey, getPreferred } from './keys';

/**
 * Which service names a song. The one she chose goes first; when its quota is used up, it is
 * offline or its key stopped working, the next connected service takes over, so songs keep
 * getting names. A service that hit its quota is skipped until its reset time.
 */

const pausedUntil = new Map<ProviderId, number>();

/** After "try again": give every service another chance. */
export function resumeAllProviders() {
  pausedUntil.clear();
}

async function usableProviders(): Promise<ProviderId[]> {
  const order = providerOrder(await getPreferred(), await connectedProviders());
  return order.filter((p) => Date.now() >= (pausedUntil.get(p) ?? 0));
}

/** No service is ready: the soonest one to come back decides how long the queue waits. */
function allPaused(last: AiError | null): AiError {
  const waits = [...pausedUntil.values()].map((t) => Math.max(0, (t - Date.now()) / 1000));
  return last ?? new AiError('rate-limited', 'every service is paused', waits.length ? Math.min(...waits) : null);
}

export interface Naming {
  result: Understanding;
  provider: ProviderId;
  /** The service answered but refused this song (named from what we know instead). */
  refused: AiError | null;
}

/**
 * Throws an AiError only when no service can do it right now (quota, offline, bad key): the
 * queue stops and comes back later. A song a service refuses still gets a fallback name.
 */
export async function nameSong(input: SongInput, audio: File | null, audioMime: string): Promise<Naming> {
  let last: AiError | null = null;
  for (const provider of await usableProviders()) {
    const key = await getKey(provider);
    if (!key) continue;
    try {
      return provider === 'groq'
        ? await nameWithGroq(key, input, audio, audioMime)
        : await nameWithGemini(key, input, audio);
    } catch (e) {
      if (!(e instanceof AiError) || !e.transient) throw e;
      diag(`${provider} unavailable`, `${e.kind}: ${e.message}`);
      if (e.kind === 'rate-limited') pausedUntil.set(provider, Date.now() + (e.retryAfterSec ?? 600) * 1000);
      last = e;
    }
  }
  throw allPaused(last);
}

async function nameWithGroq(key: string, input: SongInput, audio: File | null, mime: string): Promise<Naming> {
  let transcript: string | null = null;
  if (audio?.exists) {
    try {
      transcript = await transcribe(key, audio, mime);
    } catch (e) {
      if (!(e instanceof AiError) || e.transient) throw e;
      // e.g. a format Whisper rejects: the name can still come from the file name and message.
      diag('transcription refused', e.message);
    }
  }
  const withText = { ...input, transcript };
  try {
    return { result: await understandWithGroq(key, withText), provider: 'groq', refused: null };
  } catch (e) {
    if (!(e instanceof AiError) || e.transient) throw e;
    // Refused: keep the transcript as lyrics, name it from what we know.
    return { result: fallbackUnderstanding(withText), provider: 'groq', refused: e };
  }
}

async function nameWithGemini(key: string, input: SongInput, audio: File | null): Promise<Naming> {
  try {
    return { result: await understandWithGemini(key, input, audio), provider: 'gemini', refused: null };
  } catch (e) {
    if (!(e instanceof AiError) || e.transient) throw e;
    return { result: fallbackUnderstanding(input), provider: 'gemini', refused: e };
  }
}

const relatedCache = new Map<string, string[]>();

/** Related words for a search, from the first service that answers; [] when none is connected. */
export async function relatedWords(query: string, signal?: AbortSignal): Promise<string[]> {
  const cached = relatedCache.get(query);
  if (cached) return cached;
  let last: unknown = null;
  for (const provider of await usableProviders()) {
    const key = await getKey(provider);
    if (!key) continue;
    try {
      const words = provider === 'groq'
        ? await relatedWordsWithGroq(key, query, signal)
        : await relatedWordsWithGemini(key, query, signal);
      relatedCache.set(query, words);
      return words;
    } catch (e) {
      if (signal?.aborted) throw e;
      last = e;
    }
  }
  if (last) throw last;
  return [];
}
