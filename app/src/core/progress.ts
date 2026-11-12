import { isFailed, isPreparing } from './ingestRules';
import { Song } from './types';

/**
 * How far the songs that came in together have got (owner, 0.14.1: several songs shared at
 * once, and nothing said how many were waiting or done). Pure logic, unit-tested; shown by
 * ui/ActivityDock.
 *
 * A song is ready once it plays and has its name and lyrics. Without an AI service connected
 * no name is coming, so it is ready once it plays.
 */
export type Stage = 'preparing' | 'naming' | 'ready' | 'failed';

type ProgressSong = Pick<Song, 'kind' | 'audioState' | 'playableUri' | 'originalUri' | 'error' | 'status'>;

export function stageOf(song: ProgressSong, ai: boolean | null): Stage {
  if (song.kind === 'audio' && song.audioState === 'unsupported' && !song.playableUri) return 'failed';
  if (isPreparing(song)) return 'preparing';
  // Still pending with an error = the AI services are busy (quota, offline): it will be named
  // when they're back, so it is on its way, not failed.
  if (song.status === 'pending' && ai !== false) return 'naming';
  return isFailed(song) ? 'failed' : 'ready';
}

export interface BatchProgress {
  total: number;
  ready: number;
  preparing: number;
  naming: number;
  failed: number;
  /** Every song is ready or failed. */
  finished: boolean;
}

export function batchProgress(songs: ProgressSong[], ai: boolean | null): BatchProgress {
  const p = { total: songs.length, ready: 0, preparing: 0, naming: 0, failed: 0 };
  for (const s of songs) p[stageOf(s, ai)] += 1;
  return { ...p, finished: p.ready + p.failed === p.total };
}

const songs = (n: number) => (n === 1 ? 'שיר אחד' : `${n} שירים`);

/** The dock's two lines: what is going on, and how far. */
export function describeProgress(p: BatchProgress): { title: string; detail: string } {
  const failed = p.failed ? (p.failed === 1 ? 'שיר אחד לא הצליח' : `${p.failed} לא הצליחו`) : null;
  if (p.finished) {
    return {
      title: p.ready === 1 ? 'השיר מוכן' : p.ready ? `${p.ready} שירים מוכנים` : 'לא הצלחנו להכין את השירים',
      detail: failed ? `${failed} · אפשר לנסות שוב מדף השיר` : p.ready === 1 ? 'אפשר לנגן אותו עכשיו' : 'אפשר לנגן אותם עכשיו',
    };
  }
  const parts = [`${p.ready} מתוך ${p.total} מוכנים`];
  if (p.preparing) parts.push(`${p.preparing} בהכנה לניגון`);
  if (p.naming) parts.push(`${p.naming} מקבלים שם ומילים`);
  if (failed) parts.push(failed);
  return { title: `מכינה ${songs(p.total)}`, detail: parts.join(' · ') };
}
