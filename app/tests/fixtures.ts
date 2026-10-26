import type { SongWithCategories } from '../src/core/types';

export const DAY = 86400000;
export const NOW = Date.UTC(2026, 9, 25, 8, 0, 0);

/** A ready, playable song with sensible defaults; override what the test is about. */
export function song(p: Partial<SongWithCategories> & { id: string; title: string }): SongWithCategories {
  return {
    kind: 'audio', titleSource: 'ai', lyrics: null, summary: null, keywords: [], originalUri: null,
    playableUri: 'file:///x.m4a', youtubeId: null, sourceName: null, contextText: null, sha256: null,
    durationSec: 90, audioState: 'done', status: 'ready', error: null, pinnedAt: null, createdAt: NOW - 30 * DAY,
    updatedAt: NOW, categories: [], ...p,
  };
}
