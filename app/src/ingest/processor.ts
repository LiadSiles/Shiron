import { File } from 'expo-file-system';
import { downloadProcessedAudio, getServerConfig, processAudio, processYoutube, ServerError } from '../api/client';
import { decideStatus, keepCategories } from '../core/ingestRules';
import type { ProcessResult, Song } from '../core/types';
import { getSong, listSongs, setCategories, updateSong } from '../db/repo';
import { resolveStored, songsDir, toStoredPath } from './storage';

let running: Promise<void> | null = null;

type Listener = (state: { running: boolean; serverMissing: boolean }) => void;
const listeners = new Set<Listener>();
let lastState = { running: false, serverMissing: false };
function setState(s: typeof lastState) {
  lastState = s;
  listeners.forEach((l) => l(s));
}
export function onProcessorState(l: Listener): () => void {
  listeners.add(l);
  l(lastState);
  return () => listeners.delete(l);
}

/**
 * Sends every pending song to the server, one at a time. Safe to call often:
 * concurrent calls share one run.
 */
export function processQueue(): Promise<void> {
  if (!running) {
    running = run().finally(() => {
      running = null;
    });
  }
  return running;
}

async function run() {
  const cfg = await getServerConfig();
  if (!cfg) {
    setState({ running: false, serverMissing: true });
    return;
  }
  setState({ running: true, serverMissing: false });
  try {
    // Oldest first, so a batch of shared songs is processed in the order it arrived.
    const pending = (await listSongs(['pending'])).reverse();
    for (const song of pending) {
      try {
        await processOne(song, cfg);
      } catch (e) {
        const retryable = e instanceof ServerError ? e.retryable : true;
        await updateSong(song.id, { status: retryable ? 'pending' : 'failed', error: String((e as Error).message ?? e) });
        if (retryable) break; // server unreachable: stop and try again later
      }
    }
  } finally {
    setState({ running: false, serverMissing: false });
  }
}

async function processOne(song: Song, cfg: NonNullable<Awaited<ReturnType<typeof getServerConfig>>>) {
  let result: ProcessResult;
  const patch: Partial<Song> = {};

  if (song.kind === 'youtube') {
    const url = song.sourceName ?? `https://youtu.be/${song.youtubeId}`;
    result = await processYoutube(cfg, { url, context: song.contextText });
  } else {
    if (!song.originalUri) throw new ServerError('הקובץ המקורי חסר', false);
    result = await processAudio(cfg, resolveStored(song.originalUri), {
      fileName: song.sourceName ?? 'audio',
      context: song.contextText,
    });
    if (result.audioPath) {
      const dest = new File(songsDir(), `${song.id}.m4a`);
      const file = await downloadProcessedAudio(cfg, result.audioPath, dest);
      patch.playableUri = toStoredPath(file);
    }
  }

  // The teacher may have renamed or categorized the song while it was processing.
  const fresh = await getSong(song.id);
  if (!fresh) return;
  if (fresh.titleSource !== 'user' && result.title) {
    patch.title = result.title;
    patch.titleSource = 'ai';
  }
  patch.lyrics = result.lyrics;
  patch.summary = result.summary;
  patch.keywords = result.keywords ?? [];
  patch.durationSec = result.durationSec ?? fresh.durationSec;
  patch.error = null;

  const userCategorized = fresh.categories.some((c) => c.confirmed);
  const cats = keepCategories(result.categories ?? []);
  patch.status = userCategorized ? 'ready' : decideStatus(result.titleConfidence ?? 0, cats);
  if (!userCategorized) {
    await setCategories(song.id, cats.map((c) => ({ id: c.id, confidence: c.confidence, confirmed: false })));
  }
  await updateSong(song.id, patch);
}

/** Put a failed song back in the queue. */
export async function retrySong(id: string) {
  await updateSong(id, { status: 'pending', error: null });
  await processQueue();
}
