import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import type { ShareIntent } from 'expo-share-intent';
import { extensionOf, fallbackTitle, isMediaFile, isNativelyPlayable, youtubeIdFrom } from '../core/ingestRules';
import { createStore } from '../core/store';
import type { Song } from '../core/types';
import { findBySha, findByYoutube, insertSong } from '../db/repo';
import { processQueue } from './processor';
import { diag } from '../diag/log';
import { songsDir, toStoredPath } from './storage';

export interface ImportSummary {
  added: string[];
  duplicates: { title: string }[];
  unsupported: string[];
}

function toFileUri(path: string): string {
  return path.startsWith('/') ? `file://${path}` : path;
}

function newSong(partial: Partial<Song> & Pick<Song, 'id' | 'kind' | 'title'>): Song {
  const now = Date.now();
  return {
    titleSource: 'file', lyrics: null, summary: null, keywords: [], originalUri: null,
    playableUri: null, youtubeId: null, sourceName: null, contextText: null, sha256: null,
    durationSec: null, audioState: 'raw', status: 'pending', error: null, pinnedAt: null, createdAt: now, updatedAt: now,
    ...partial,
  };
}

/** Copy one audio or video file into the app's own storage and add it to the library. */
async function importMediaFile(
  source: File,
  fileName: string,
  context: string | null,
  summary: ImportSummary,
): Promise<void> {
  const id = Crypto.randomUUID();
  const ext = extensionOf(fileName) || extensionOf(source.uri) || 'audio';
  const dest = new File(songsDir(), `${id}-original.${ext}`);
  try {
    await source.copy(dest);
    diag('import', fileName, `${Math.round((dest.size ?? 0) / 1024)} KB`, `from ${source.uri.slice(0, 60)}`);
    const sha256 = await dest.digest('SHA-256');
    const existing = await findBySha(sha256);
    if (existing) {
      dest.delete();
      summary.duplicates.push({ title: existing.title });
      return;
    }
    await insertSong(newAudioSong(id, dest, fileName, context, sha256));
    summary.added.push(id);
  } catch (e) {
    // Don't leave an orphan copy behind (a failed insert, a full disk…).
    if (dest.exists) dest.delete();
    throw e;
  }
}

function newAudioSong(id: string, dest: File, fileName: string, context: string | null, sha256: string): Song {
  const createdAt = Date.now();
  return newSong({
    id,
    kind: 'audio',
    title: fallbackTitle(fileName, createdAt),
    originalUri: toStoredPath(dest),
    playableUri: isNativelyPlayable(fileName, Platform.OS) ? toStoredPath(dest) : null,
    sourceName: fileName,
    contextText: context,
    sha256,
    createdAt,
  });
}

async function importYoutube(url: string, context: string | null, title: string | null, summary: ImportSummary) {
  const youtubeId = youtubeIdFrom(url);
  if (!youtubeId) return;
  const existing = await findByYoutube(youtubeId);
  if (existing) {
    summary.duplicates.push({ title: existing.title });
    return;
  }
  const id = Crypto.randomUUID();
  await insertSong(
    newSong({
      id,
      kind: 'youtube',
      audioState: 'done', // no audio step: played in YouTube's own player
      title: title?.trim() || 'שיר מיוטיוב',
      youtubeId,
      sourceName: url,
      contextText: context,
    }),
  );
  summary.added.push(id);
}

/** What is being saved right now, for the status banner (src/ui/ActivityBanner). */
export interface ImportState {
  saving: boolean;
  /** Files of the current share or pick: saved so far, and in total. */
  done: number;
  total: number;
  /** Shares waiting behind the current one. */
  queued: number;
}

/** Read with `useStore(importStore)`; only this module writes it. */
export const importStore = createStore<ImportState>({ saving: false, done: 0, total: 0, queued: 0 });
const setImportState = importStore.set;

/** One file failing (unreadable, full disk) never stops the others. */
async function importFiles(
  files: { file: File; name: string; mime: string | null | undefined }[],
  context: string | null,
  summary: ImportSummary,
) {
  setImportState({ saving: true, done: 0, total: files.length });
  for (const [i, f] of files.entries()) {
    setImportState({ done: i });
    if (!isMediaFile(f.name, f.mime)) {
      summary.unsupported.push(f.name);
      continue;
    }
    try {
      await importMediaFile(f.file, f.name, context, summary);
    } catch (e) {
      diag('import failed', f.name, e);
      summary.unsupported.push(f.name);
    }
  }
  setImportState({ done: files.length });
}

/**
 * Shares are queued: she can share again (and again) while earlier ones are still being saved;
 * each waits its turn, none is lost. Saving is quick (copy + hash); conversion and naming run
 * afterwards in the processor's lanes.
 */
let shareQueue: Promise<unknown> = Promise.resolve();
let waiting = 0;

export function enqueueShare(intent: ShareIntent): Promise<ImportSummary> {
  return enqueue(() => importShareIntent(intent));
}

function enqueue(job: () => Promise<ImportSummary>): Promise<ImportSummary> {
  waiting += 1;
  setImportState({ saving: true, queued: waiting - 1 });
  const done = shareQueue.then(job).finally(() => {
    waiting -= 1;
    setImportState(waiting ? { queued: waiting - 1 } : { saving: false, queued: 0, done: 0, total: 0 });
  });
  shareQueue = done.catch(() => undefined);
  return done;
}

/** Handles everything that arrives through the system share sheet. */
async function importShareIntent(intent: ShareIntent): Promise<ImportSummary> {
  const summary: ImportSummary = { added: [], duplicates: [], unsupported: [] };
  const text = intent.text?.trim() || null;

  diag('share received', `type ${intent.type}`, `${intent.files?.length ?? 0} files`,
    (intent.files ?? []).map((f) => `${f.fileName} (${f.mimeType}) ${f.path.slice(0, 50)}`).join(', ') || intent.webUrl || '');
  await importFiles(
    (intent.files ?? []).map((f) => ({ file: new File(toFileUri(f.path)), name: f.fileName, mime: f.mimeType })),
    text,
    summary,
  );

  const url = intent.webUrl ?? (text && youtubeIdFrom(text) ? text : null);
  if (url && youtubeIdFrom(url)) {
    const context = text && text !== url ? text : null;
    await importYoutube(url, context, intent.meta?.title ?? null, summary);
  } else if (!intent.files?.length && text) {
    summary.unsupported.push(text.slice(0, 40));
  }

  if (summary.added.length) processQueue();
  return summary;
}

/**
 * Pick audio or video files from the Files app (for files already on the phone, and the way in
 * for recordings when sharing can't pass files). Null when she cancelled; throws when the
 * picker fails. Shown with ui/importResult.
 */
export async function importFromPicker(): Promise<ImportSummary | null> {
  try {
    const picked = await File.pickFileAsync({ multipleFiles: true, mimeTypes: ['audio/*', 'video/*'] });
    if (picked.canceled) return null;
    const summary: ImportSummary = { added: [], duplicates: [], unsupported: [] };
    await importFiles(picked.result.map((f) => ({ file: f, name: f.name, mime: f.type })), null, summary);
    if (summary.added.length) processQueue();
    return summary;
  } catch (e) {
    diag('file picker failed', e);
    throw e;
  } finally {
    if (!waiting) setImportState({ saving: false, done: 0, total: 0 });
  }
}

export function describeSummary(s: ImportSummary): string {
  const parts: string[] = [];
  if (s.added.length) parts.push(s.added.length === 1 ? 'שיר אחד נשמר' : `${s.added.length} שירים נשמרו`);
  if (s.duplicates.length)
    parts.push(s.duplicates.length === 1 ? `כבר קיים: ${s.duplicates[0].title}` : `${s.duplicates.length} כבר קיימים`);
  if (s.unsupported.length) parts.push(`${s.unsupported.length} לא נתמכו`);
  return parts.join(' · ') || 'לא נמצא שיר לשמירה';
}
