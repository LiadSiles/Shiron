import type { PlayEvent, Song } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export const RANKING = {
  /** Decay constant τ in days: a play from 30 days ago counts e^-1 ≈ 0.37. */
  tauDays: 30,
  /** Plays shorter than this are skips and don't count. */
  minListenSec: 20,
  /** Short songs still count if they were mostly heard. */
  minListenFraction: 0.6,
  /** New songs get a boost that fades over their first week. */
  newSongDays: 7,
  newSongBoost: 1.5,
  /** Songs from a holiday that is happening now. */
  seasonalBoost: 3,
} as const;

export function countsAsPlay(e: PlayEvent, durationSec: number | null): boolean {
  if (e.listenedSec >= RANKING.minListenSec) return true;
  return !!durationSec && durationSec > 0 && e.listenedSec / durationSec >= RANKING.minListenFraction;
}

/** Σ e^(-Δt/τ) over real plays — "fresh frequency". */
export function frecency(events: PlayEvent[], durationSec: number | null, now: number): number {
  let s = 0;
  for (const e of events) {
    if (!countsAsPlay(e, durationSec)) continue;
    const ageDays = Math.max(0, (now - e.startedAt) / DAY_MS);
    s += Math.exp(-ageDays / RANKING.tauDays);
  }
  return s;
}

export function newSongBoost(createdAt: number, now: number): number {
  const ageDays = (now - createdAt) / DAY_MS;
  if (ageDays < 0 || ageDays >= RANKING.newSongDays) return 0;
  return RANKING.newSongBoost * (1 - ageDays / RANKING.newSongDays);
}

export interface RankInput {
  song: Pick<Song, 'id' | 'title' | 'createdAt' | 'pinnedAt' | 'durationSec'>;
  events: PlayEvent[];
  seasonal: boolean;
}

export interface Ranked {
  id: string;
  score: number;
  pinned: boolean;
}

/**
 * Order songs inside a category: pinned first (most recently pinned on top),
 * then by score = frecency + new-song boost + seasonal boost, then alphabetically.
 */
export function rankSongs(items: RankInput[], now: number): Ranked[] {
  const scored = items.map((it) => ({
    id: it.song.id,
    title: it.song.title,
    pinnedAt: it.song.pinnedAt,
    pinned: it.song.pinnedAt != null,
    score:
      frecency(it.events, it.song.durationSec, now) +
      newSongBoost(it.song.createdAt, now) +
      (it.seasonal ? RANKING.seasonalBoost : 0),
  }));
  scored.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.pinned && b.pinned) return (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0);
    if (b.score !== a.score) return b.score - a.score;
    return a.title.localeCompare(b.title, 'he');
  });
  return scored.map(({ id, score, pinned }) => ({ id, score, pinned }));
}
