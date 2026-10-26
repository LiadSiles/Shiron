import { File } from 'expo-file-system';
import { audioErrorCode, processAudio } from '../../modules/shiron-audio';
import { getGroqKey, transcribe, understand, youtubeMeta } from '../api/groq';
import { describeGroqError, GroqError } from '../core/groqRules';
import { decideStatus, keepCategories, mimeOf } from '../core/ingestRules';
import type { Song } from '../core/types';
import { fallbackUnderstanding, SongInput, Understanding } from '../core/understand';
import { getSong, listSongs, setCategories, updateSong } from '../db/repo';
import { diag } from '../diag/log';
import { isQueued } from '../player/player';
import { deleteStored, resolveStored, songsDir, toStoredPath } from './storage';

/**
 * Two lanes, each one song at a time, oldest first:
 *  1. audio (on the phone, no network): decode → trim silence → loudness → AAC .m4a
 *  2. AI (Groq, needs the teacher's key): Whisper transcription → title, categories, lyrics
 * The lanes run independently: a song shared while Groq works on others is converted (and
 * playable) within seconds, and its name and category arrive later. The UI picks up every
 * change through the repo's library events.
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

/**
 * A serial worker: concurrent triggers share one run, and a trigger during a run schedules one
 * more pass. Never rejects (callers fire and forget); failures go to the technical log.
 */
function lane(name: string, work: () => Promise<void>, onIdle: () => void): () => Promise<void> {
  let running: Promise<void> | null = null;
  let again = false;
  return () => {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        try {
          await work();
        } catch (e) {
          diag(`${name} stopped`, e);
        }
      } while (again);
    })().finally(() => {
      running = null;
      onIdle();
    });
    return running;
  };
}

let busy = 0;
function track<T>(work: () => Promise<T>): () => Promise<T> {
  return async () => {
    busy += 1;
    setState({ running: true });
    try {
      return await work();
    } finally {
      busy -= 1;
      if (!busy) setState({ running: false });
    }
  };
}

const audioLane = lane('conversion', track(convertNew), () => void aiLane());
const aiLane = lane('naming', track(nameSongs), () => undefined);

/** Safe to call often (app start, foreground, import, connect, retry). */
export function processQueue(): Promise<void> {
  // The AI lane also starts after conversions finish (audioLane's onIdle), so a new song is
  // transcribed from its small .m4a rather than the original.
  void aiLane();
  return audioLane();
}

async function nameSongs() {
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

  for (const queued of pending) {
    const song = await getSong(queued.id);
    if (!song || song.status !== 'pending') continue; // deleted or approved meanwhile
    if (song.kind === 'audio' && song.audioState === 'raw') continue; // the audio lane comes back for it
    try {
      await understandSong(song, key);
      setState({ notice: null });
    } catch (e) {
      diag('groq failed', song.title, e instanceof GroqError ? `${e.kind}: ${e.message}` : e);
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
      // Not a Groq answer we can use (understandSong handles Groq's own refusals): name the song
      // from what we know and send it to review, so the queue moves on.
      await applyUnderstanding(song, fallbackUnderstanding(await inputFor(song, null)), describeGroqError(err));
    }
  }
}

// ---------------------------------------------------------------- step 1: audio

/** Converts every song still `raw`, oldest first, and tidies originals no longer playing. */
async function convertNew() {
  const songs = await listSongs();
  for (const song of songs.filter((s) => s.kind === 'audio' && s.audioState === 'raw').reverse()) {
    await convert(song);
  }
  // Originals kept because they were playing when their conversion finished (see convert).
  for (const song of songs) {
    if (song.audioState === 'done' && song.originalUri && song.originalUri !== song.playableUri && !isQueued(song.id)) {
      deleteStored(song.originalUri);
      await updateSong(song.id, { originalUri: null });
    }
  }
}

async function convert(song: Song) {
  if (!song.originalUri) {
    await updateSong(song.id, { audioState: song.playableUri ? 'done' : 'unsupported' });
    return;
  }
  const input = resolveStored(song.originalUri);
  const output = new File(songsDir(), `${song.id}.m4a`);
  const started = Date.now();
  try {
    const result = await processAudio(input.uri, output.uri);
    diag('converted', song.sourceName ?? song.id, `${result.durationSec.toFixed(1)} s of ${result.sourceDurationSec.toFixed(1)} s`,
      `gain ${result.gainDb} dB`, `${Math.round((output.size ?? 0) / 1024)} KB`, `${Date.now() - started} ms`);
    // The m4a replaces the original (videos can be large; dedupe keeps using the stored hash).
    // If she is already listening to the original (Android plays it before conversion), it is
    // still in the player's queue: delete it on a later pass, not under the player.
    const playing = isQueued(song.id);
    await updateSong(song.id, {
      audioState: 'done',
      playableUri: toStoredPath(output),
      originalUri: playing ? song.originalUri : null,
      durationSec: result.durationSec,
    });
    if (!playing) deleteStored(song.originalUri);
  } catch (e) {
    const code = audioErrorCode(e);
    diag('convert failed', song.sourceName ?? song.id, e, `${Date.now() - started} ms`);
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

/** Retryable problems (quota, offline, Groq down, bad key) are thrown: the queue stops and resumes later. */
function isTransient(e: unknown): boolean {
  return e instanceof GroqError && (e.retryable || e.kind === 'invalid-key');
}

async function understandSong(song: Song, key: string) {
  let transcript: string | null = null;
  if (song.kind === 'audio') {
    // Prefer the converted m4a (small, mono); fall back to the original Groq may still read.
    const stored = song.playableUri ?? song.originalUri;
    const file = stored ? resolveStored(stored) : null;
    if (file?.exists) {
      try {
        transcript = await transcribe(key, file, mimeOf(file.name));
      } catch (e) {
        if (isTransient(e)) throw e;
        // e.g. a format Whisper rejects: the name can still come from the file name and message.
        diag('transcription refused', song.sourceName ?? song.title, e);
      }
    }
  }
  diag('transcribed', song.sourceName ?? song.title, transcript ? `${transcript.length} chars` : 'no text');
  const input = await inputFor(song, transcript);
  try {
    const result = await understand(key, input);
    diag('named', result.title, result.categories.map((c) => `${c.id} ${c.confidence}`).join(', '));
    await applyUnderstanding(song, result, null);
  } catch (e) {
    if (isTransient(e)) throw e;
    // The chat model refused this song: keep the transcript as lyrics, name it, send to review.
    diag('naming refused', song.sourceName ?? song.title, e);
    await applyUnderstanding(song, fallbackUnderstanding(input), e instanceof GroqError ? describeGroqError(e) : String(e));
  }
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
