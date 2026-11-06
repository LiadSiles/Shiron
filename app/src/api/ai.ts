import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { splitAudio } from '../../modules/shiron-audio';
import { AiError, ProviderId, providerOrder } from '../core/ai';
import { mimeOf } from '../core/ingestRules';
import { completeLyrics, joinParts } from '../core/transcript';
import { fallbackUnderstanding, SongInput, Understanding } from '../core/understand';
import { diag } from '../diag/log';
import { relatedWordsWithGemini, transcribeWithGemini, understandWithGemini } from './gemini';
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
export async function nameSong(
  input: SongInput,
  audio: File | null,
  audioMime: string,
  youtubeId: string | null = null,
): Promise<Naming> {
  let last: AiError | null = null;
  let order = await usableProviders();
  // Only Gemini can listen to a YouTube song (it opens the video itself): try it first there.
  if (youtubeId && order.includes('gemini')) order = ['gemini', ...order.filter((p) => p !== 'gemini')];
  for (const provider of order) {
    const key = await getKey(provider);
    if (!key) continue;
    try {
      return provider === 'groq'
        ? await nameWithGroq(key, input, audio, audioMime)
        : await nameWithGemini(key, input, audio, youtubeId);
    } catch (e) {
      if (!(e instanceof AiError) || !e.transient) throw e;
      diag(`${provider} unavailable`, `${e.kind}: ${e.message}`);
      if (e.kind === 'rate-limited') pausedUntil.set(provider, Date.now() + (e.retryAfterSec ?? 600) * 1000);
      last = e;
    }
  }
  throw allPaused(last);
}

/** Parts of this length are transcribed one by one (see transcribeInParts). */
const PART_SEC = 40;

/**
 * Transcribes a recording part by part: speech-to-text models drop the rest of a song after a
 * long instrumental stretch, or stop early, and the owner requires lyrics to the very end. Our
 * converted .m4a is cut on the phone (no re-encoding); anything else is sent whole. A part a
 * service can't do right now (quota, network) throws — the song is tried again later; a part
 * it refuses is skipped, with a log line.
 */
async function transcribeInParts(
  audio: File,
  transcribePart: (part: File, previous: string | null) => Promise<string | null>,
): Promise<string | null> {
  if (!audio.name.toLowerCase().endsWith('.m4a')) return transcribePart(audio, null);
  const dir = new Directory(Paths.cache, `parts-${Crypto.randomUUID()}`);
  try {
    let uris: string[];
    try {
      uris = await splitAudio(audio.uri, dir.uri, PART_SEC);
    } catch (e) {
      diag('split failed, transcribing whole', e);
      return await transcribePart(audio, null);
    }
    const texts: (string | null)[] = [];
    for (const [i, uri] of uris.entries()) {
      try {
        texts.push(await transcribePart(new File(uri), joinParts(texts)));
      } catch (e) {
        if (!(e instanceof AiError) || e.transient) throw e;
        diag('part not transcribed', `${i + 1}/${uris.length}`, e.message);
        texts.push(null);
      }
    }
    diag('transcribed in parts', `${uris.length} parts`, texts.map((t) => (t ? t.split(/\s+/).length : 0)).join('+'), 'words');
    return joinParts(texts);
  } finally {
    try {
      if (dir.exists) dir.delete();
    } catch {
      /* the cache is cleared by the system anyway */
    }
  }
}

async function nameWithGroq(key: string, input: SongInput, audio: File | null, mime: string): Promise<Naming> {
  let transcript: string | null = null;
  if (audio?.exists) {
    try {
      transcript = await transcribeInParts(audio, (part, previous) =>
        transcribe(key, part, part === audio ? mime : mimeOf(part.name), previous));
    } catch (e) {
      if (!(e instanceof AiError) || e.transient) throw e;
      // e.g. a format Whisper rejects: the name can still come from the file name and message.
      diag('transcription refused', e.message);
    }
  }
  const withText = { ...input, transcript };
  try {
    const result = await understandWithGroq(key, withText);
    return { result: { ...result, lyrics: completeLyrics(result.lyrics, transcript) }, provider: 'groq', refused: null };
  } catch (e) {
    if (!(e instanceof AiError) || e.transient) throw e;
    // Refused: keep the transcript as lyrics, name it from what we know.
    return { result: fallbackUnderstanding(withText), provider: 'groq', refused: e };
  }
}

async function nameWithGemini(key: string, input: SongInput, audio: File | null, youtubeId: string | null): Promise<Naming> {
  try {
    if (youtubeId || !audio?.exists) {
      return { result: await understandWithGemini(key, input, audio, youtubeId), provider: 'gemini', refused: null };
    }
    // The words first, part by part (complete to the end), then the name from those words.
    const transcript = await transcribeInParts(audio, (part) => transcribeWithGemini(key, part));
    if (!transcript) {
      // No words came back (Gemini withholds a well-known song's words): let it listen whole.
      return { result: await understandWithGemini(key, input, audio, null), provider: 'gemini', refused: null };
    }
    const result = await understandWithGemini(key, { ...input, transcript }, null, null);
    return { result: { ...result, lyrics: completeLyrics(result.lyrics, transcript) }, provider: 'gemini', refused: null };
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
