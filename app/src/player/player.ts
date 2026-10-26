import {
  AudioPlayer,
  AudioStatus,
  createAudioPlayer,
  requestNotificationPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { getCategory } from '../core/categories';
import type { Song, SongWithCategories } from '../core/types';
import { recordPlay } from '../db/repo';
import { diag } from '../diag/log';
import { resolveStored } from '../ingest/storage';

export interface PlayerState {
  song: SongWithCategories | null;
  queue: SongWithCategories[];
  index: number;
  playing: boolean;
  position: number;
  duration: number;
  repeat: boolean;
  /** Why the current song didn't play (from the platform player), or null. */
  error: string | null;
}

let state: PlayerState = {
  song: null, queue: [], index: -1, playing: false, position: 0, duration: 0, repeat: false, error: null,
};
const subscribers = new Set<() => void>();
function set(patch: Partial<PlayerState>) {
  state = { ...state, ...patch };
  subscribers.forEach((s) => s());
}

export function usePlayer(): PlayerState {
  return useSyncExternalStore(
    (cb) => {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    () => state,
  );
}

let player: AudioPlayer | null = null;
/** While a fade-out runs, status updates still say "playing": don't let them flip the button back. */
let fading = false;
/** Ignore stale positions for a moment after a seek, so the scrubber doesn't jump back. */
let seekingUntil = 0;
let notificationsAsked = false;

/** Listening-time accounting for the ranking. */
let session: { songId: string; startedAt: number; listened: number; lastTime: number } | null = null;

async function ensurePlayer(): Promise<AudioPlayer> {
  if (player) return player;
  await setAudioModeAsync({
    playsInSilentMode: true, // the classroom phone is often on silent
    shouldPlayInBackground: true,
    interruptionMode: 'doNotMix', // required for lock-screen controls
  });
  player = createAudioPlayer(null, { updateInterval: 500 });
  player.addListener('playbackStatusUpdate', onStatus);
  return player;
}

function onStatus(status: AudioStatus) {
  if (session) {
    const delta = status.currentTime - session.lastTime;
    if (delta > 0 && delta < 2) session.listened += delta;
    session.lastTime = status.currentTime;
  }
  if (status.error && status.error !== state.error) {
    diag('play failed', state.song?.title ?? '?', status.error);
    set({ error: status.error });
  }
  set({
    playing: fading ? false : status.playing,
    position: Date.now() < seekingUntil ? state.position : status.currentTime,
    duration: status.duration || state.duration,
  });
  if (status.didJustFinish && !state.repeat) {
    if (state.index < state.queue.length - 1) void next();
    else {
      set({ playing: false });
      void finishSession();
    }
  }
}

async function finishSession() {
  const s = session;
  session = null;
  if (s && s.listened >= 1) {
    await recordPlay({ songId: s.songId, startedAt: s.startedAt, listenedSec: Math.round(s.listened) });
  }
}

export class NotPlayableError extends Error {}
export class MissingFileError extends Error {}

export function isPlayable(song: Song): boolean {
  return song.kind === 'audio' && !!song.playableUri;
}

/**
 * Start a song. `queue` is the list it was picked from, so "next" continues there.
 * YouTube songs are not handled here — the UI opens the YouTube screen instead.
 */
export async function playSong(song: SongWithCategories, queue: SongWithCategories[] = [song]) {
  if (!isPlayable(song)) throw new NotPlayableError('השיר עדיין בעיבוד');
  const file = resolveStored(song.playableUri!);
  if (!file.exists) {
    diag('play: file missing', song.title, song.playableUri);
    throw new MissingFileError('קובץ השמע של השיר חסר במכשיר');
  }
  const p = await ensurePlayer();
  await finishSession();

  if (Platform.OS === 'android' && !notificationsAsked) {
    notificationsAsked = true;
    await requestNotificationPermissionsAsync().catch(() => undefined);
  }

  const playable = queue.filter(isPlayable);
  const index = Math.max(0, playable.findIndex((s) => s.id === song.id));
  set({ song, queue: playable.length ? playable : [song], index, position: 0, duration: song.durationSec ?? 0, error: null });

  diag('play', song.title, `${file.name} ${Math.round((file.size ?? 0) / 1024)} KB`);
  p.replace({ uri: file.uri });
  p.loop = state.repeat;
  p.volume = 1;
  p.play();
  session = { songId: song.id, startedAt: Date.now(), listened: 0, lastTime: 0 };

  const category = song.categories[0] ? getCategory(song.categories[0].categoryId).name : 'שירון';
  p.setActiveForLockScreen(true, { title: song.title, artist: category, albumTitle: 'שירון' });
}

/**
 * The one play/pause action used by every button (mini player, full player, the playing row).
 * Pausing fades out over half a second — never an abrupt cut in front of the children — and the
 * button changes at once instead of waiting for the next status update.
 */
export function togglePlay(): Promise<void> {
  const p = player;
  if (!p || !state.song) return Promise.resolve();
  if (!state.playing) {
    p.volume = 1;
    p.play();
    set({ playing: true });
    return Promise.resolve();
  }
  if (fading) return Promise.resolve();
  fading = true;
  set({ playing: false });
  return new Promise((resolve) => {
    const steps = 10;
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      p.volume = Math.max(0, 1 - i / steps);
      if (i >= steps) {
        clearInterval(timer);
        p.pause();
        p.volume = 1;
        fading = false;
        set({ playing: false });
        resolve();
      }
    }, 50);
  });
}

/** Pause (with the fade) if something is playing. */
export function pause(): Promise<void> {
  return state.playing ? togglePlay() : Promise.resolve();
}

/** Tapping a song: the one already loaded pauses/resumes; any other starts from the beginning. */
export async function playOrToggle(song: SongWithCategories, queue: SongWithCategories[]) {
  if (state.song?.id === song.id && player) return togglePlay();
  return playSong(song, queue);
}

export async function next() {
  const i = state.index + 1;
  if (i < state.queue.length) await playSong(state.queue[i], state.queue);
  else await finishSession();
}

export async function previous() {
  if (state.position > 3 && player) {
    await seek(0);
    return;
  }
  const i = state.index - 1;
  if (i >= 0) await playSong(state.queue[i], state.queue);
}

export function setRepeat(repeat: boolean) {
  set({ repeat });
  if (player) player.loop = repeat;
}

export async function seek(seconds: number) {
  if (!player) return;
  const to = Math.max(0, Math.min(seconds, state.duration || seconds));
  seekingUntil = Date.now() + 800;
  set({ position: to });
  await player.seekTo(to);
}

/** Keep the lock screen in sync after a rename. */
export function refreshCurrent(song: SongWithCategories) {
  if (state.song?.id !== song.id) return;
  set({ song });
  player?.updateLockScreenMetadata({ title: song.title, albumTitle: 'שירון' });
}

/** Stop and forget the current song (e.g. it was deleted). */
export async function clearIfCurrent(songId: string) {
  if (state.song?.id !== songId || !player) return;
  player.pause();
  player.setActiveForLockScreen(false);
  session = null;
  set({ song: null, queue: [], index: -1, playing: false, position: 0, duration: 0 });
}
