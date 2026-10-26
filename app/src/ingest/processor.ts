import { File } from 'expo-file-system';
import { audioErrorCode, processAudio } from '../../modules/shiron-audio';
import { getGroqKey, transcribe, understand, youtubeMeta } from '../api/groq';
import { describeGroqError, GroqError } from '../core/groqRules';
import { decideStatus, keepCategories, mimeOf } from '../core/ingestRules';
import type { Song } from '../core/types';
import { fallbackUnderstanding, SongInput, Understanding } from '../core/understand';
import { getSong, listSongs, setCategories, updateSong } from '../db/repo';
import { deleteStored, resolveStored, songsDir, toStoredPath } from './storage';

/**
 * Two steps per song, one song at a time, oldest first:
 *  1. audio (on the phone, no network): decode → trim silence → loudness → AAC .m4a
 *  2. AI (Groq, needs the teacher's key): Whisper transcription → title, categories, lyrics
 * Step 1 never waits for step 2: a song is playable as soon as it is converted.
 */

export interface ProcessorState {
  running: boolean;
  /** Songs waiting for the AI step because Groq isn't connected. */
  needsKey: boolean;
  /** Last Groq problem worth showing (quota, invalid key, offline), in Hebrew. */
  notice: string | null;
  /** Don't call Groq again before this time (ms), after a rate limit. */
  pausedUntil: number;
}

type Listener = (state: ProcessorState) => void;
const listeners = new Set<Listener>();
let state: ProcessorState = { running: false, needsKey: false, notice: null, pausedUntil: 0 };

function setState(patch: Partial<ProcessorState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}

export function onProcessorState(l: Listener): () => void {
  listeners.add(l);
  l(state);
  return () => listeners.delete(l);
}

let running: Promise<void> | null = null;
let again = false;

/** Safe to call often: concurrent calls share one run, and a call during a run schedules one more. */
export function processQueue(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await run();
    } while (again);
  })().finally(() => {
    running = null;
  });
  return running;
}

async function run() {
  setState({ running: true });
  try {
    // Step 1 for everything first, so every new song becomes playable quickly.
    const raw = (await listSongs()).filter((s) => s.kind === 'audio' && s.audioState === 'raw').reverse();
    for (const song of raw) await convert(song);

    const pending = (await listSongs(['pending'])).reverse();
    if (!pending.length) {
      setState({ needsKey: false });
      return;
    }
    const key = await getGroqKey();
    if (!key) {
      setState({ needsKey: true });
      return;
    }
    setState({ needsKey: false });
    if (Date.now() < state.pausedUntil) return;

    for (const song of pending) {
      try {
        await understandSong(song, key);
        setState({ notice: null });
      } catch (e) {
        const err = e instanceof GroqError ? e : new GroqError('bad-request', String((e as Error)?.message ?? e));
        if (err.retryable || err.kind === 'invalid-key') {
          // Leave this and the rest pending; resume on next foreground or import.
          setState({
            notice: describeGroqError(err),
            needsKey: err.kind === 'invalid-key',
            pausedUntil: err.kind === 'rate-limited' ? Date.now() + (err.retryAfterSec ?? 600) * 1000 : 0,
          });
          await updateSong(song.id, { error: describeGroqError(err) });
          return;
        }
        // This song won't work with the AI as it is: name it from what we know, send to review.
        await applyUnderstanding(song, fallbackUnderstanding(await inputFor(song, null)), describeGroqError(err));
      }
    }
  } finally {
    setState({ running: false });
  }
}

// ---------------------------------------------------------------- step 1: audio

async function convert(song: Song) {
  if (!song.originalUri) {
    await updateSong(song.id, { audioState: song.playableUri ? 'done' : 'unsupported' });
    return;
  }
  const input = resolveStored(song.originalUri);
  const output = new File(songsDir(), `${song.id}.m4a`);
  try {
    const result = await processAudio(input.uri, output.uri);
    const keepOriginal = song.originalUri;
    await updateSong(song.id, {
      audioState: 'done',
      playableUri: toStoredPath(output),
      originalUri: null,
      durationSec: result.durationSec,
    });
    // The m4a replaces the original (videos can be large); dedupe keeps using the stored hash.
    if (keepOriginal !== toStoredPath(output)) deleteStored(keepOriginal);
  } catch (e) {
    const code = audioErrorCode(e);
    console.warn('audio processing failed', song.sourceName, code, e);
    // The original stays; it is still playable when the platform reads its format.
    await updateSong(song.id, {
      audioState: 'unsupported',
      error: code === 'TOO_LONG' ? 'ההקלטה ארוכה משעה' : code === 'NO_AUDIO' ? 'אין בקובץ שמע' : 'הפורמט לא נתמך במכשיר הזה',
    });
  }
}

// ---------------------------------------------------------------- step 2: AI

async function inputFor(song: Song, transcript: string | null): Promise<SongInput> {
  return {
    fileName: song.kind === 'audio' ? song.sourceName : null,
    context: song.contextText,
    transcript,
    youtube: song.kind === 'youtube' && song.youtubeId ? await youtubeMeta(song.youtubeId) : null,
  };
}

async function understandSong(song: Song, key: string) {
  let transcript: string | null = null;
  if (song.kind === 'audio') {
    // Prefer the converted m4a (small, mono); fall back to the original Groq may still read.
    const stored = song.playableUri ?? song.originalUri;
    if (stored) {
      const file = resolveStored(stored);
      if (file.exists) transcript = await transcribe(key, file, mimeOf(file.name));
    }
  }
  const result = await understand(key, await inputFor(song, transcript));
  await applyUnderstanding(song, result, null);
}

async function applyUnderstanding(song: Song, u: Understanding, error: string | null) {
  // The teacher may have renamed or categorised the song meanwhile: her choice wins.
  const fresh = await getSong(song.id);
  if (!fresh) return;
  const patch: Partial<Song> = {
    lyrics: u.lyrics ?? fresh.lyrics,
    summary: u.summary,
    keywords: u.keywords,
    error,
  };
  if (fresh.titleSource !== 'user' && u.title) {
    patch.title = u.title;
    patch.titleSource = 'ai';
  }
  const userCategorized = fresh.categories.some((c) => c.confirmed);
  const cats = keepCategories(u.categories);
  patch.status = userCategorized ? 'ready' : error ? 'review' : decideStatus(u.titleConfidence, cats);
  if (!userCategorized) {
    await setCategories(song.id, cats.map((c) => ({ id: c.id, confidence: c.confidence, confirmed: false })));
  }
  await updateSong(song.id, patch);
}

/** Put a song back in the queue (both steps if its audio wasn't converted). */
export async function retrySong(id: string) {
  const song = await getSong(id);
  if (!song) return;
  await updateSong(id, {
    status: 'pending',
    error: null,
    audioState: song.audioState === 'unsupported' && song.originalUri ? 'raw' : song.audioState,
  });
  setState({ pausedUntil: 0 });
  await processQueue();
}
