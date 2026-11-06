import {
  AudioLockScreenOptions,
  AudioPlaylist,
  AudioPlaylistStatus,
  createAudioPlaylist,
  requestNotificationPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { router } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { getCategory } from '../core/categories';
import { audioRun, nativeLoop, nextIndex, nextRepeat, previousIndex, RepeatMode } from '../core/queue';
import type { SongWithCategories } from '../core/types';
import { getSong, onLibraryChange, recordPlay } from '../db/repo';
import { diag } from '../diag/log';
import { resolveStored } from '../ingest/storage';

export interface PlayerState {
  song: SongWithCategories | null;
  /** The list the song was picked from: audio and YouTube songs, in order. */
  queue: SongWithCategories[];
  index: number;
  playing: boolean;
  position: number;
  duration: number;
  repeat: RepeatMode;
  /** Why the current song didn't play (from the platform player), or null. */
  error: string | null;
}

let state: PlayerState = {
  song: null, queue: [], index: -1, playing: false, position: 0, duration: 0, repeat: 'off', error: null,
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
 * Audio songs play in one native playlist: it gives the notification and lock screen their
 * next/previous buttons, which work with the app in the background. It holds one run of
 * consecutive audio songs from the queue (`run`); YouTube songs play in YouTube's own visible
 * player on the full player screen (ui/YouTubeView). See docs/wiki/player.md.
 */
let player: AudioPlaylist | null = null;
/** Queue indexes [start, end] loaded in the native playlist; null while a YouTube song plays. */
let run: { start: number; end: number } | null = null;
/** While a fade-out runs, status updates still say "playing": don't let them flip the button back. */
let fading = false;
/** Ignore stale positions for a moment after a seek, so the scrubber doesn't jump back. */
let seekingUntil = 0;
/**
 * After rebuilding the playlist, native events still report the old/intermediate index for a
 * moment. Ignore index changes until the player reports the one we asked for.
 */
let expectIndex: number | null = null;
let notificationsAsked = false;

const LOCK_SCREEN: AudioLockScreenOptions = {
  showNextTrack: true,
  showPreviousTrack: true,
  isLiveStream: false, // keeps the seek bar in the notification
};

/** Listening-time accounting for the ranking (audio and YouTube alike). */
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
  onLibraryChange(() => void refreshCurrent());
  player.addListener('playlistStatusUpdate', onStatus);
  player.addListener('trackChanged', ({ currentIndex }) => onNativeIndex(currentIndex));
  return player;
}

const isYoutube = (s: SongWithCategories | null) => s?.kind === 'youtube';

// ---------------------------------------------------------------- the current song

function startSession(song: SongWithCategories) {
  void finishSession();
  session = { songId: song.id, startedAt: Date.now(), listened: 0, lastTime: 0 };
}

function track(seconds: number) {
  if (!session) return;
  const delta = seconds - session.lastTime;
  if (delta > 0 && delta < 2) session.listened += delta;
  session.lastTime = seconds;
}

async function finishSession() {
  const s = session;
  session = null;
  if (s && s.listened >= 1) {
    await recordPlay({ songId: s.songId, startedAt: s.startedAt, listenedSec: Math.round(s.listened) });
  }
}

/** The native playlist moved (end of a song, or next/previous from the notification). */
function onNativeIndex(nativeIndex: number) {
  if (expectIndex !== null) {
    if (nativeIndex === expectIndex) expectIndex = null;
    return;
  }
  if (run && !isYoutube(state.song)) moveTo(run.start + nativeIndex);
}

/** Show another audio song of the loaded run as current. */
function moveTo(index: number) {
  if (index === state.index || index < 0 || index >= state.queue.length) return;
  const song = state.queue[index];
  startSession(song);
  set({ song, index, position: 0, duration: song.durationSec ?? 0, error: null });
  player?.updateLockScreenMetadata(lockScreenInfo(song));
  void refreshCurrent(); // the queue was captured when playback started; names may have come since
}

/**
 * The player keeps the song as it was when playback started. When the library changes — she
 * edited the lyrics, or the AI just named the song — show the fresh version right away
 * (full player, mini player, lock screen) instead of after switching songs.
 */
let refreshSeq = 0;
async function refreshCurrent() {
  const current = state.song;
  if (!current) return;
  const seq = ++refreshSeq;
  const fresh = await getSong(current.id).catch(() => null);
  if (!fresh || seq !== refreshSeq || state.song?.id !== fresh.id) return;
  if (fresh.updatedAt === state.song.updatedAt && sameCategories(fresh, state.song)) return;
  set({ song: fresh, queue: state.queue.map((s) => (s.id === fresh.id ? fresh : s)) });
  if (!isYoutube(fresh)) player?.updateLockScreenMetadata(lockScreenInfo(fresh));
}

function sameCategories(a: SongWithCategories, b: SongWithCategories): boolean {
  return a.categories.map((c) => c.categoryId).join() === b.categories.map((c) => c.categoryId).join();
}

function onStatus(status: AudioPlaylistStatus) {
  if (isYoutube(state.song)) return; // the native player is idle while YouTube plays
  if (typeof status.currentIndex === 'number') onNativeIndex(status.currentIndex);
  if (typeof status.currentTime === 'number') track(status.currentTime);
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
  // The last song of the run ended (the native loop handles repeat-one and a whole-queue
  // repeat-all): continue past the run — to a YouTube song, or around the list.
  if (status.didJustFinish && run && state.index === run.end && state.repeat !== 'one') {
    const n = nextIndex(state.index, state.queue.length, state.repeat);
    const wrapsNatively = state.repeat === 'all' && run.start === 0 && run.end === state.queue.length - 1;
    if (n === null) {
      set({ playing: false });
      void finishSession();
    } else if (!wrapsNatively) {
      void startAt(n).catch((e) => diag('continue failed', e));
    }
  }
}

// ---------------------------------------------------------------- starting songs

export class NotPlayableError extends Error {}
export class MissingFileError extends Error {}

/** Can go in the queue: a YouTube song, or an audio song whose converted file is on the phone. */
function isQueueable(s: SongWithCategories): boolean {
  if (s.kind === 'youtube') return !!s.youtubeId;
  return !!s.playableUri && resolveStored(s.playableUri).exists;
}

/**
 * Start a song. `queue` is the list it was picked from: "next", the notification and the end of
 * a song continue there, through audio and YouTube songs alike.
 */
export async function playSong(song: SongWithCategories, queue: SongWithCategories[] = [song]) {
  if (song.kind === 'audio') {
    if (!song.playableUri) throw new NotPlayableError('השיר עדיין בעיבוד');
    if (!resolveStored(song.playableUri).exists) {
      diag('play: file missing', song.title, song.playableUri);
      throw new MissingFileError('קובץ השמע של השיר חסר במכשיר');
    }
  }
  // Songs in the list that can't play right now (still processing, file gone) are skipped.
  const list = queue.filter((s) => s.id === song.id || isQueueable(s));
  const queueList = list.some((s) => s.id === song.id) ? list : [song];
  set({ queue: queueList });
  await startAt(queueList.findIndex((s) => s.id === song.id));
}

/** Make queue[index] the current song: native playlist for audio, the YouTube player otherwise. */
async function startAt(index: number) {
  const song = state.queue[index];
  if (!song) return;
  if (skipTimer) clearTimeout(skipTimer);
  startSession(song);
  // YouTube reports "playing" itself once it really plays (it may still be loading, or offline).
  set({ song, index, position: 0, duration: song.durationSec ?? 0, error: null, playing: !isYoutube(song) });

  if (isYoutube(song)) {
    run = null;
    if (player) {
      player.pause();
      player.clearLockScreenControls(); // the notification would show the previous song
    }
    diag('play youtube', song.title, `${index + 1}/${state.queue.length}`);
    openPlayerScreen();
    return;
  }

  const p = await ensurePlayer();
  if (Platform.OS === 'android' && !notificationsAsked) {
    notificationsAsked = true;
    await requestNotificationPermissionsAsync().catch(() => undefined);
  }
  run = audioRun(state.queue.map((s) => s.kind === 'audio'), index)!;
  const songs = state.queue.slice(run.start, run.end + 1);
  diag('play', song.title, `${index + 1}/${state.queue.length}`, `native ${songs.length}`);
  expectIndex = index - run.start;
  p.clear();
  for (const s of songs) p.add({ uri: resolveStored(s.playableUri!).uri });
  p.skipTo(index - run.start);
  p.loop = nativeLoop(state.repeat, run, state.queue.length);
  p.volume = 1;
  p.play();
  p.setActiveForLockScreen(true, lockScreenInfo(song), LOCK_SCREEN);
}

/** YouTube must play visibly: bring up the full player (unless it is showing). */
let playerScreenOpen = false;
export function setPlayerScreenOpen(open: boolean) {
  playerScreenOpen = open;
  if (!open && isYoutube(state.song) && state.playing) {
    // Closing the screen removes YouTube's player, which stops it.
    void finishSession();
    set({ playing: false });
  }
}
function openPlayerScreen() {
  if (!playerScreenOpen) router.push('/player');
}

// ---------------------------------------------------------------- YouTube

/** What the YouTube view (ui/YouTubeView) lets the player do while it is on screen. */
export interface YoutubeController {
  play(): void;
  pause(): void;
  seek(seconds: number): void;
}
let youtube: YoutubeController | null = null;

export function attachYoutube(controller: YoutubeController): () => void {
  youtube = controller;
  return () => {
    if (youtube === controller) youtube = null;
  };
}

/**
 * Which way she was going (next/end of song = forward, previous = back): a video that can never
 * play is skipped in that direction, so "previous" over it isn't bounced forward again.
 */
let direction: 1 | -1 = 1;
let skipTimer: ReturnType<typeof setTimeout> | null = null;

/** Events from YouTube's player (IFrame API, or the view's own load watchdog). */
export function youtubeEvent(e: {
  playing?: boolean;
  position?: number;
  duration?: number;
  ended?: boolean;
  error?: string;
  /** The video can never play here (removed, embedding forbidden) — not just offline. */
  permanent?: boolean;
}) {
  if (!isYoutube(state.song)) return;
  if (typeof e.position === 'number') track(e.position);
  const patch: Partial<PlayerState> = {};
  if (typeof e.playing === 'boolean') patch.playing = e.playing;
  if (typeof e.position === 'number' && Date.now() >= seekingUntil) patch.position = e.position;
  if (e.duration) patch.duration = e.duration;
  if (e.error) {
    diag('youtube failed', state.song?.title ?? '?', e.error);
    patch.error = e.error;
  }
  set(patch);
  if (e.error) {
    // Offline or still loading: stay, so she can retry or go either way herself. A video that
    // can never play here shouldn't stop the list: show why, then move on the way she was going.
    if (!e.permanent) return;
    const stuck = state.song?.id;
    const mode = state.repeat === 'one' ? 'off' : state.repeat;
    const n = direction === 1
      ? nextIndex(state.index, state.queue.length, mode)
      : previousIndex(state.index, state.queue.length, mode);
    if (n !== null && n !== state.index) {
      if (skipTimer) clearTimeout(skipTimer);
      skipTimer = setTimeout(() => {
        if (state.song?.id === stuck) void startAt(n).catch((err) => diag('continue failed', err));
      }, 3000);
    }
    return;
  }
  if (e.ended) {
    direction = 1;
    if (state.repeat === 'one') {
      youtube?.seek(0);
      youtube?.play();
      return;
    }
    const n = nextIndex(state.index, state.queue.length, state.repeat);
    if (n === null) {
      set({ playing: false });
      void finishSession();
    } else {
      void startAt(n).catch((err) => diag('continue failed', err));
    }
  }
}

// ---------------------------------------------------------------- controls

/**
 * The one play/pause action used by every button (mini player, full player, the playing row).
 * Pausing fades out over half a second — never an abrupt cut in front of the children — and the
 * button changes at once instead of waiting for the next status update.
 */
export function togglePlay(): Promise<void> {
  if (!state.song) return Promise.resolve();
  if (isYoutube(state.song)) {
    if (!youtube) {
      openPlayerScreen(); // it starts playing when it appears
      set({ playing: true });
    } else if (state.playing) {
      youtube.pause();
      set({ playing: false });
    } else {
      youtube.play();
      set({ playing: true });
    }
    return Promise.resolve();
  }
  const p = player;
  if (!p) return Promise.resolve();
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

/** Tapping a song: the one already loaded pauses/resumes; any other starts from the beginning. */
export async function playOrToggle(song: SongWithCategories, queue: SongWithCategories[]) {
  if (state.song?.id === song.id) return togglePlay();
  return playSong(song, queue);
}

/** Inside the loaded run the native playlist moves (gapless, notification in sync); else restart. */
async function go(target: number) {
  if (player && run && !isYoutube(state.song) && target >= run.start && target <= run.end) {
    expectIndex = target - run.start;
    player.skipTo(target - run.start);
    if (!state.playing) player.play();
    moveTo(target);
    set({ playing: true });
    return;
  }
  await startAt(target);
}

export async function next() {
  direction = 1;
  const n = nextIndex(state.index, state.queue.length, state.repeat === 'one' ? 'all' : state.repeat);
  if (n !== null && n !== state.index) await go(n);
}

export async function previous() {
  direction = -1;
  if (state.position > 3 && !(isYoutube(state.song) && state.error)) {
    await seek(0);
    return;
  }
  const n = previousIndex(state.index, state.queue.length, state.repeat === 'one' ? 'all' : state.repeat);
  if (n === null || n === state.index) await seek(0);
  else await go(n);
}

/** Repeat button: off → the whole list → this song → off. */
export function cycleRepeat() {
  const repeat = nextRepeat(state.repeat);
  set({ repeat });
  if (player && run) player.loop = nativeLoop(repeat, run, state.queue.length);
}

export async function seek(seconds: number) {
  const to = Math.max(0, Math.min(seconds, state.duration || seconds));
  seekingUntil = Date.now() + 800;
  set({ position: to });
  if (isYoutube(state.song)) youtube?.seek(to);
  else if (player) await player.seekTo(to);
}

/** Is this song loaded in the player's queue (its file may be read at any moment)? */
export function isQueued(songId: string): boolean {
  return state.queue.some((s) => s.id === songId);
}

/** Stop and forget the current song (e.g. it was deleted). */
export async function clearIfCurrent(songId: string) {
  if (state.song?.id !== songId) return;
  youtube?.pause();
  if (player) {
    player.pause();
    player.clearLockScreenControls();
    player.clear();
  }
  run = null;
  session = null;
  set({ song: null, queue: [], index: -1, playing: false, position: 0, duration: 0 });
}
