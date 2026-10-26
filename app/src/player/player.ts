import {
  AudioLockScreenOptions,
  AudioPlaylist,
  AudioPlaylistStatus,
  createAudioPlaylist,
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

/**
 * One native playlist holds the queue the song was picked from. A playlist (not a single player)
 * is what gives the notification and lock screen their next/previous buttons: those call the
 * native queue directly, even when the app is in the background. See docs/wiki/player.md.
 */
let player: AudioPlaylist | null = null;
/** While a fade-out runs, status updates still say "playing": don't let them flip the button back. */
let fading = false;
/** Ignore stale positions for a moment after a seek, so the scrubber doesn't jump back. */
let seekingUntil = 0;
/**
 * After rebuilding the queue, native events still report the old/intermediate index for a moment.
 * Ignore index changes until the player reports the one we asked for.
 */
let expectIndex: number | null = null;
let notificationsAsked = false;

const LOCK_SCREEN: AudioLockScreenOptions = {
  showNextTrack: true,
  showPreviousTrack: true,
  isLiveStream: false, // keeps the seek bar in the notification
};

/** Listening-time accounting for the ranking. */
let session: { songId: string; startedAt: number; listened: number; lastTime: number } | null = null;

function lockScreenInfo(song: SongWithCategories) {
  const category = song.categories[0] ? getCategory(song.categories[0].categoryId).name : 'שירון';
  return { title: song.title, artist: category, albumTitle: 'שירון' };
}

async function ensurePlayer(): Promise<AudioPlaylist> {
  if (player) return player;
  await setAudioModeAsync({
    playsInSilentMode: true, // the classroom phone is often on silent
    shouldPlayInBackground: true,
    interruptionMode: 'doNotMix', // required for lock-screen controls
  });
  player = createAudioPlaylist({ updateInterval: 500, loop: 'none' });
  player.addListener('playlistStatusUpdate', onStatus);
  player.addListener('trackChanged', ({ currentIndex }) => onIndex(currentIndex));
  return player;
}

/** The native queue moved (end of a song, or next/previous from the notification). */
function onIndex(index: number) {
  if (expectIndex !== null) {
    if (index === expectIndex) expectIndex = null;
    return;
  }
  moveTo(index);
}

function moveTo(index: number) {
  if (index === state.index || index < 0 || index >= state.queue.length) return;
  const song = state.queue[index];
  void finishSession();
  session = { songId: song.id, startedAt: Date.now(), listened: 0, lastTime: 0 };
  set({ song, index, position: 0, duration: song.durationSec ?? 0, error: null });
  player?.updateLockScreenMetadata(lockScreenInfo(song));
}

function onStatus(status: AudioPlaylistStatus) {
  if (typeof status.currentIndex === 'number') onIndex(status.currentIndex);
  if (session && typeof status.currentTime === 'number') {
    const delta = status.currentTime - session.lastTime;
    if (delta > 0 && delta < 2) session.listened += delta;
    session.lastTime = status.currentTime;
  }
  // Not in the typed status, but both platforms report playback errors here.
  const raw = (status as { error?: unknown }).error;
  const error = raw == null ? null : typeof raw === 'string' ? raw : String((raw as { message?: unknown }).message ?? 'שגיאה');
  if (error && error !== state.error) {
    diag('play failed', state.song?.title ?? '?', error);
    set({ error });
  }
  const patch: Partial<PlayerState> = {};
  if (typeof status.playing === 'boolean') patch.playing = fading ? false : status.playing;
  if (typeof status.currentTime === 'number' && Date.now() >= seekingUntil) patch.position = status.currentTime;
  if (status.duration) patch.duration = status.duration;
  set(patch);
  if (status.didJustFinish && !state.repeat && state.index >= state.queue.length - 1) {
    set({ playing: false });
    void finishSession();
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
 * Start a song. `queue` is the list it was picked from, so "next" continues there — in the app,
 * on the lock screen and in the notification. YouTube songs are not handled here — the UI opens
 * the YouTube screen instead.
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

  // Songs in the list that can't play right now (still processing, file gone) are skipped.
  const playable = queue.filter((s) => s.id === song.id || (isPlayable(s) && resolveStored(s.playableUri!).exists));
  const list = playable.some((s) => s.id === song.id) ? playable : [song];
  const index = list.findIndex((s) => s.id === song.id);
  set({ song, queue: list, index, position: 0, duration: song.durationSec ?? 0, error: null, playing: true });

  diag('play', song.title, `${file.name} ${Math.round((file.size ?? 0) / 1024)} KB`, `${index + 1}/${list.length}`);
  expectIndex = index;
  p.clear();
  for (const s of list) p.add({ uri: resolveStored(s.playableUri!).uri });
  p.skipTo(index);
  p.loop = state.repeat ? 'single' : 'none';
  p.volume = 1;
  p.play();
  session = { songId: song.id, startedAt: Date.now(), listened: 0, lastTime: 0 };
  p.setActiveForLockScreen(true, lockScreenInfo(song), LOCK_SCREEN);
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
  if (!player || state.index >= state.queue.length - 1) return;
  const i = state.index + 1;
  expectIndex = i;
  player.next();
  if (!state.playing) player.play();
  moveTo(i);
}

export async function previous() {
  if (!player) return;
  if (state.position > 3 || state.index === 0) {
    await seek(0);
    return;
  }
  const i = state.index - 1;
  expectIndex = i;
  player.previous();
  if (!state.playing) player.play();
  moveTo(i);
}

export function setRepeat(repeat: boolean) {
  set({ repeat });
  if (player) player.loop = repeat ? 'single' : 'none';
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
  const queue = state.queue.map((s) => (s.id === song.id ? song : s));
  if (state.song?.id !== song.id) {
    set({ queue });
    return;
  }
  set({ song, queue });
  player?.updateLockScreenMetadata(lockScreenInfo(song));
}

/** Stop and forget the current song (e.g. it was deleted). */
export async function clearIfCurrent(songId: string) {
  if (state.song?.id !== songId || !player) return;
  player.pause();
  player.clearLockScreenControls();
  player.clear();
  session = null;
  set({ song: null, queue: [], index: -1, playing: false, position: 0, duration: 0 });
}
