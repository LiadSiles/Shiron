import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import type { ShareIntent } from 'expo-share-intent';
import { extensionOf, fallbackTitle, isMediaFile, isNativelyPlayable, youtubeIdFrom } from '../core/ingestRules';
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
export async function importMediaFile(
  source: File,
  fileName: string,
  context: string | null,
  summary: ImportSummary,
): Promise<void> {
  const id = Crypto.randomUUID();
  const ext = extensionOf(fileName) || extensionOf(source.uri) || 'audio';
  const dest = new File(songsDir(), `${id}-original.${ext}`);
  await source.copy(dest);

  diag('import', fileName, `${Math.round((dest.size ?? 0) / 1024)} KB`, `from ${source.uri.slice(0, 60)}`);
  const sha256 = await dest.digest('SHA-256');
  const existing = await findBySha(sha256);
  if (existing) {
    dest.delete();
    summary.duplicates.push({ title: existing.title });
    return;
  }

  const createdAt = Date.now();
  await insertSong(
    newSong({
      id,
      kind: 'audio',
      title: fallbackTitle(fileName, createdAt),
      originalUri: toStoredPath(dest),
      playableUri: isNativelyPlayable(fileName, Platform.OS) ? toStoredPath(dest) : null,
      sourceName: fileName,
      contextText: context,
      sha256,
      createdAt,
    }),
  );
  summary.added.push(id);
}

export async function importYoutube(url: string, context: string | null, title: string | null, summary: ImportSummary) {
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
      title: title?.trim() || 'שיר מיוטיוב',
      youtubeId,
      sourceName: url,
      contextText: context,
    }),
  );
  summary.added.push(id);
}

/** Handles everything that arrives through the system share sheet. */
export async function importShareIntent(intent: ShareIntent): Promise<ImportSummary> {
  const summary: ImportSummary = { added: [], duplicates: [], unsupported: [] };
  const text = intent.text?.trim() || null;

  diag('share received', `type ${intent.type}`, `${intent.files?.length ?? 0} files`,
    (intent.files ?? []).map((f) => `${f.fileName} (${f.mimeType}) ${f.path.slice(0, 50)}`).join(', ') || intent.webUrl || '');
  for (const f of intent.files ?? []) {
    if (!isMediaFile(f.fileName, f.mimeType)) {
      summary.unsupported.push(f.fileName);
      continue;
    }
    try {
      await importMediaFile(new File(toFileUri(f.path)), f.fileName, text, summary);
    } catch (e) {
      diag('import failed', f.fileName, e);
      summary.unsupported.push(f.fileName);
    }
  }

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

/** Fallback when sharing isn't possible: pick audio or video files from the Files app. */
export async function importFromPicker(): Promise<ImportSummary | null> {
  const picked = await File.pickFileAsync({ multipleFiles: true, mimeTypes: ['audio/*', 'video/*'] });
  if (picked.canceled) return null;
  const summary: ImportSummary = { added: [], duplicates: [], unsupported: [] };
  for (const f of picked.result) {
    if (!isMediaFile(f.name, f.type)) {
      summary.unsupported.push(f.name);
      continue;
    }
    await importMediaFile(f, f.name, null, summary);
  }
  if (summary.added.length) processQueue();
  return summary;
}

export function describeSummary(s: ImportSummary): string {
  const parts: string[] = [];
  if (s.added.length) parts.push(s.added.length === 1 ? 'שיר אחד נשמר' : `${s.added.length} שירים נשמרו`);
  if (s.duplicates.length)
    parts.push(s.duplicates.length === 1 ? `כבר קיים: ${s.duplicates[0].title}` : `${s.duplicates.length} כבר קיימים`);
  if (s.unsupported.length) parts.push(`${s.unsupported.length} לא נתמכו`);
  return parts.join(' · ') || 'לא נמצא שיר לשמירה';
}
