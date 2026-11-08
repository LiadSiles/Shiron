import { playerRoute } from '../core/playerNav';
import {
  AudioLockScreenOptions,
  AudioPlaylist,
  AudioPlaylistStatus,
  createAudioPlaylist,
  requestNotificationPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { router } from 'expo-router';
import { AppState, Platform } from 'react-native';
import { getCategory, primaryCategoryId } from '../core/categories';
import { createStore } from '../core/store';
import {
  audioAhead, backgroundSlots, withoutQueueIndex, foregroundSlots, nativeLoop, nextIndex, nextRepeat, passedOver, previousIndex, RepeatMode, runSlots,
} from '../core/queue';
import type { SongWithCategories } from '../core/types';
import { getSong, onLibraryChange, recordPlay } from '../db/repo';
import { diag } from '../diag/log';
import { resolveStored } from '../ingest/storage';
import { toast } from '../ui/toast';
import { useStore } from '../ui/useStore';

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

const store = createStore<PlayerState>({
  song: null, queue: [], index: -1, playing: false, position: 0, duration: 0, repeat: 'off', error: null,
});
/** Always read fresh: async code runs across state changes. */
const state = () => store.get();
const set = store.set;

/** The whole player state — for the player screens, which show position and duration. */
export function usePlayer(): PlayerState {
  return useStore(store);
}

/**
 * One value derived from the player. Lists use it so a row re-renders only when it starts or
 * stops being the song playing — not twice a second while a song plays.
 */
export function usePlayerSelect<S>(select: (state: PlayerState) => S): S {
  return useStore(store, select);
}

/**
 * Audio songs play in one native playlist: it gives the notification and lock screen their
 * next/previous buttons, which work with the app in the background. In the foreground it holds
 * the run of consecutive audio songs around the current one; YouTube songs play in YouTube's own
 * visible player (ui/YouTubeView). In the background YouTube can't play (its terms), so the
 * native list grows to every audio song ahead and the music goes on past YouTube songs.
 * See docs/wiki/player.md.
 */
let player: AudioPlaylist | null = null;
/** The queue indexes loaded in the native playlist, in its order; null = nothing loaded for the current song. */
let slots: number[] | null = null;
/**
 * Left the app during a YouTube song: the video is paused and the native playlist holds the
 * audio songs ahead, paused, so the lock screen offers the next song. Play there = adopt it.
 */
let standby = false;
/** The YouTube song was playing when she left: it carries on when she comes back. */
let resumeYoutube = false;
/** The music reached a YouTube song in the background with no audio song left: it starts when she's back. */
let pendingYoutube: number | null = null;
/** YouTube songs passed over in the background, told when she comes back. */
let passedInBackground = 0;
let appActive = AppState.currentState === 'active' || AppState.currentState == null;
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
  const category = song.categories.length ? getCategory(primaryCategoryId(song)).name : 'PlayGan';
  return { title: song.title, artist: category, albumTitle: 'PlayGan' };
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
const audioFlags = () => state().queue.map((s) => s.kind === 'audio');
const loopFor = (repeat: RepeatMode) => nativeLoop(repeat, slots ?? [], audioFlags(), !appActive);

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
  const to = slots?.[nativeIndex];
  if (to === undefined) return;
  if (standby) {
    adoptStandby(nativeIndex);
    return;
  }
  if (isYoutube(state().song)) return;
  if (!appActive) passedInBackground += youtubeBetween(state().index, to);
  moveTo(to);
}

/** YouTube songs strictly between two queue positions, going forward. */
function youtubeBetween(from: number, to: number): number {
  const q = state().queue;
  let n = 0;
  for (let k = 1; k <= passedOver(from, to, q.length); k++) if (isYoutube(q[(from + k) % q.length])) n += 1;
  return n;
}

/** She played the lock screen's song while a YouTube song was paused in standby: it becomes current. */
function adoptStandby(nativeIndex: number) {
  const to = slots?.[nativeIndex];
  if (!standby || to === undefined) return;
  standby = false;
  resumeYoutube = false;
  passedInBackground += youtubeBetween(state().index, to);
  const song = state().queue[to];
  startSession(song);
  diag('play from lock screen', song.title, `${to + 1}/${state().queue.length}`);
  set({ song, index: to, position: 0, duration: song.durationSec ?? 0, error: null, playing: player?.playing ?? true });
  if (player) player.loop = loopFor(state().repeat);
}

/** Show another audio song of the loaded run as current. */
function moveTo(index: number) {
  if (index === state().index || index < 0 || index >= state().queue.length) return;
  const song = state().queue[index];
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
  const current = state().song;
  if (!current) return;
  const seq = ++refreshSeq;
  const fresh = await getSong(current.id).catch(() => null);
  const shown = state().song;
  if (!fresh || seq !== refreshSeq || !shown || shown.id !== fresh.id) return;
  if (fresh.updatedAt === shown.updatedAt && sameCategories(fresh, shown)) return;
  set({ song: fresh, queue: state().queue.map((s) => (s.id === fresh.id ? fresh : s)) });
  if (!isYoutube(fresh)) player?.updateLockScreenMetadata(lockScreenInfo(fresh));
}

function sameCategories(a: SongWithCategories, b: SongWithCategories): boolean {
  return a.categories.map((c) => c.categoryId).join() === b.categories.map((c) => c.categoryId).join();
}

function onStatus(status: AudioPlaylistStatus) {
  if (standby) {
    if (status.playing) adoptStandby(player?.currentIndex ?? 0);
    return;
  }
  if (isYoutube(state().song)) return; // the native player is idle while YouTube plays
  if (typeof status.currentIndex === 'number') onNativeIndex(status.currentIndex);
  if (typeof status.currentTime === 'number') track(status.currentTime);
  // Not in the typed status, but both platforms report playback errors here.
  const raw = (status as { error?: unknown }).error;
  const error = raw == null ? null : typeof raw === 'string' ? raw : String((raw as { message?: unknown }).message ?? 'שגיאה');
  if (error && error !== state().error) {
    diag('play failed', state().song?.title ?? '?', error);
    set({ error });
  }
  const patch: Partial<PlayerState> = {};
  if (typeof status.playing === 'boolean') patch.playing = fading ? false : status.playing;
  if (typeof status.currentTime === 'number' && Date.now() >= seekingUntil) patch.position = status.currentTime;
  if (status.duration) patch.duration = status.duration;
  set(patch);
  // The last loaded song ended (the native loop handles repeat-one and a whole-list
  // repeat-all): continue past it — to a YouTube song, or around the list.
  if (status.didJustFinish && slots?.length && state().index === slots[slots.length - 1] && state().repeat !== 'one') {
    const n = nextIndex(state().index, state().queue.length, state().repeat);
    const wrapsNatively = player?.loop === 'all';
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
  const song = state().queue[index];
  if (!song) return;
  if (skipTimer) clearTimeout(skipTimer);
  if (isYoutube(song) && !appActive) {
    // In the background YouTube can't play: the music goes on with the next audio song, or
    // waits for her if there is none.
    const ahead = audioAhead(audioFlags(), index, state().repeat === 'one' ? 'off' : state().repeat);
    const to = ahead[0];
    if (to !== undefined && to !== state().index) {
      passedInBackground += 1 + youtubeBetween(index, to);
      return startAt(to);
    }
    pendingYoutube = index;
    diag('youtube waits for the app', song.title);
    set({ playing: false });
    void finishSession();
    return;
  }
  standby = false;
  pendingYoutube = null;
  startSession(song);
  // YouTube reports "playing" itself once it really plays (it may still be loading, or offline).
  set({ song, index, position: 0, duration: song.durationSec ?? 0, error: null, playing: !isYoutube(song) });

  if (isYoutube(song)) {
    slots = null;
    if (player) {
      player.pause();
      player.clearLockScreenControls(); // the notification would show the previous song
    }
    diag('play youtube', song.title, `${index + 1}/${state().queue.length}`);
    showPlayer();
    return;
  }

  const p = await ensurePlayer();
  if (Platform.OS === 'android' && !notificationsAsked) {
    notificationsAsked = true;
    await requestNotificationPermissionsAsync().catch(() => undefined);
  }
  const run = runSlots(audioFlags(), index);
  slots = appActive ? run : backgroundSlots(run, audioFlags(), state().repeat);
  diag('play', song.title, `${index + 1}/${state().queue.length}`, `native ${slots.length}`);
  expectIndex = slots.indexOf(index);
  p.clear();
  for (const i of slots) p.add({ uri: resolveStored(state().queue[i].playableUri!).uri });
  p.skipTo(slots.indexOf(index));
  p.loop = loopFor(state().repeat);
  p.volume = 1;
  p.play();
  p.setActiveForLockScreen(true, lockScreenInfo(song), LOCK_SCREEN);
}

/**
 * Where YouTube's player shows (ui/YouTubeHost keeps one player for the whole app, so a video
 * keeps playing while she browses): in the full player's slot (`frame`, window coordinates), or
 * as a small picture-in-picture window — always visible, as YouTube's terms require. `closed`:
 * she closed the small window, which stops the video.
 */
export interface YoutubeViewState {
  frame: { x: number; y: number; width: number; height: number } | null;
  closed: boolean;
  /** Where she dragged the small window (it snaps to a corner); kept while the app runs. */
  corner: PipCorner;
}
export type PipCorner = 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end';
export const youtubeView = createStore<YoutubeViewState>({ frame: null, closed: false, corner: 'bottom-end' });

/**
 * How many full-player screens are mounted (normally 0 or 1). A count, not a flag: with two
 * mounted, the first to close used to mark the player as closed while the other was still in
 * the stack, and every later song pushed one more player — back then seemed to do nothing.
 */
let playerScreens = 0;
/** When the last push that hasn't mounted yet happened (two taps or a song change at once). */
let pushedAt = 0;

export function setPlayerScreenOpen(open: boolean) {
  playerScreens = Math.max(0, playerScreens + (open ? 1 : -1));
  if (open) pushedAt = 0;
  // Leaving the full player doesn't stop YouTube: it carries on in the small window.
  if (!open) youtubeView.set({ frame: null });
}

/**
 * Show the full player — the one way every button gets there (mini player, the small window's
 * ⤢, a YouTube song starting). If it is already in the stack (details opened on top of it),
 * go back to it instead of stacking a second one.
 */
export function showPlayer() {
  youtubeView.set({ closed: false });
  const route = playerRoute(playerScreens, pushedAt, Date.now(), router.canDismiss());
  if (route === 'back-to-it') router.dismissTo('/player');
  else if (route === 'push') {
    pushedAt = Date.now();
    router.push('/player');
  }
}

/** The small YouTube window's ✕: stops the video and hides the window. */
export function closeYoutube() {
  if (!isYoutube(state().song)) return;
  youtube?.pause();
  if (state().playing) void finishSession();
  set({ playing: false });
  youtubeView.set({ closed: true });
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
  if (!isYoutube(state().song)) return;
  if (typeof e.position === 'number') track(e.position);
  const patch: Partial<PlayerState> = {};
  if (typeof e.playing === 'boolean') patch.playing = e.playing;
  if (typeof e.position === 'number' && Date.now() >= seekingUntil) patch.position = e.position;
  if (e.duration) patch.duration = e.duration;
  if (e.error) {
    diag('youtube failed', state().song?.title ?? '?', e.error);
    patch.error = e.error;
  }
  set(patch);
  if (e.error) {
    // Offline or still loading: stay, so she can retry or go either way herself. A video that
    // can never play here shouldn't stop the list: show why, then move on the way she was going.
    if (!e.permanent) return;
    const stuck = state().song?.id;
    const mode = state().repeat === 'one' ? 'off' : state().repeat;
    const n = direction === 1
      ? nextIndex(state().index, state().queue.length, mode)
      : previousIndex(state().index, state().queue.length, mode);
    if (n !== null && n !== state().index) {
      if (skipTimer) clearTimeout(skipTimer);
      skipTimer = setTimeout(() => {
        if (state().song?.id === stuck) void startAt(n).catch((err) => diag('continue failed', err));
      }, 3000);
    }
    return;
  }
  if (e.ended) {
    direction = 1;
    if (state().repeat === 'one') {
      youtube?.seek(0);
      youtube?.play();
      return;
    }
    const n = nextIndex(state().index, state().queue.length, state().repeat);
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
  if (!state().song) return Promise.resolve();
  if (isYoutube(state().song)) {
    if (!youtube) {
      showPlayer(); // it starts playing when it appears
      set({ playing: true });
    } else if (state().playing) {
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
  if (!state().playing) {
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
  if (state().song?.id === song.id) return togglePlay();
  return playSong(song, queue);
}

/** Inside the loaded songs the native playlist moves (gapless, notification in sync); else restart. */
async function go(target: number) {
  const slot = slots?.indexOf(target) ?? -1;
  if (player && slot >= 0 && !standby && !isYoutube(state().song)) {
    expectIndex = slot;
    player.skipTo(slot);
    if (!state().playing) player.play();
    moveTo(target);
    set({ playing: true });
    return;
  }
  await startAt(target);
}

export async function next() {
  direction = 1;
  const n = nextIndex(state().index, state().queue.length, state().repeat === 'one' ? 'all' : state().repeat);
  if (n !== null && n !== state().index) await go(n);
}

export async function previous() {
  direction = -1;
  if (state().position > 3 && !(isYoutube(state().song) && state().error)) {
    await seek(0);
    return;
  }
  const n = previousIndex(state().index, state().queue.length, state().repeat === 'one' ? 'all' : state().repeat);
  if (n === null || n === state().index) await seek(0);
  else await go(n);
}

/** Repeat button: off → the whole list → this song → off. */
export function cycleRepeat() {
  const repeat = nextRepeat(state().repeat);
  set({ repeat });
  if (player && slots) player.loop = loopFor(repeat);
}

export async function seek(seconds: number) {
  const to = Math.max(0, Math.min(seconds, state().duration || seconds));
  seekingUntil = Date.now() + 800;
  set({ position: to });
  if (isYoutube(state().song)) youtube?.seek(to);
  else if (player) await player.seekTo(to);
}

/** Is this song loaded in the player's queue (its file may be read at any moment)? */
export function isQueued(songId: string): boolean {
  return state().queue.some((s) => s.id === songId);
}

/**
 * She deleted a song: out of the queue too. The current one stops; any other is taken out of the
 * native list before its file goes, or the list would reach a missing file later and stop there.
 */
export async function forgetSong(songId: string) {
  if (state().song?.id === songId) return clearIfCurrent(songId);
  const at = state().queue.findIndex((s) => s.id === songId);
  if (at < 0) return;
  if (slots) {
    const next = withoutQueueIndex(slots, at);
    if (next.removeSlot >= 0) player?.remove(next.removeSlot);
    slots = next.slots;
  }
  if (pendingYoutube !== null) pendingYoutube = pendingYoutube === at ? null : pendingYoutube > at ? pendingYoutube - 1 : pendingYoutube;
  const index = state().index;
  set({ queue: state().queue.filter((_, i) => i !== at), index: index > at ? index - 1 : index });
}

/** Stop and forget the current song (e.g. it was deleted). */
async function clearIfCurrent(songId: string) {
  if (state().song?.id !== songId) return;
  youtube?.pause();
  if (player) {
    player.pause();
    player.clearLockScreenControls();
    player.clear();
  }
  slots = null;
  standby = false;
  resumeYoutube = false;
  pendingYoutube = null;
  session = null;
  set({ song: null, queue: [], index: -1, playing: false, position: 0, duration: 0 });
}

// ---------------------------------------------------------------- the app in the background

/**
 * YouTube's terms forbid playing with the app's window closed or minimized, and iOS stops a
 * page's video there anyway. So leaving the app pauses YouTube; the music goes on with the
 * audio songs (docs/wiki/player.md → "In the background").
 */
async function onBackground() {
  appActive = false;
  const song = state().song;
  if (!song) return;
  if (isYoutube(song)) {
    // iOS may pause the page's video on the way out, before this runs: what it was doing as she left counts.
    resumeYoutube = state().playing || playingAsSheLeft;
    youtube?.pause();
    set({ playing: false });
    diag('background: youtube paused', song.title, resumeYoutube ? 'resumes on return' : 'was paused');
    // The lock screen offers the next audio song, paused: play there and it continues from it.
    const ahead = audioAhead(audioFlags(), state().index, state().repeat === 'one' ? 'off' : state().repeat);
    if (!ahead.length) return;
    const p = await ensurePlayer();
    if (appActive || !isYoutube(state().song)) return; // she came back meanwhile
    slots = ahead;
    standby = true;
    expectIndex = 0;
    p.clear();
    for (const i of ahead) p.add({ uri: resolveStored(state().queue[i].playableUri!).uri });
    p.skipTo(0);
    p.loop = loopFor(state().repeat);
    p.setActiveForLockScreen(true, lockScreenInfo(state().queue[ahead[0]]), LOCK_SCREEN);
    diag('background: next on the lock screen', state().queue[ahead[0]].title);
    return;
  }
  if (!player || !slots?.length) return;
  // Every audio song ahead goes into the native list, so the end of a song and the lock
  // screen's "next" carry on past YouTube songs.
  const more = backgroundSlots(slots, audioFlags(), state().repeat).slice(slots.length);
  for (const i of more) player.add({ uri: resolveStored(state().queue[i].playableUri!).uri });
  slots = [...slots, ...more];
  player.loop = loopFor(state().repeat);
}

async function onForeground() {
  appActive = true;
  if (standby) {
    // She didn't take the lock screen's song: back to the YouTube song where it stopped.
    standby = false;
    slots = null;
    if (player) {
      player.pause();
      player.clearLockScreenControls();
      player.clear();
    }
    if (resumeYoutube && isYoutube(state().song)) {
      youtubeView.set({ closed: false });
      set({ playing: true });
      youtube?.play();
    }
    resumeYoutube = false;
  } else if (pendingYoutube !== null) {
    const i = pendingYoutube;
    pendingYoutube = null;
    void startAt(i).catch((e) => diag('continue failed', e));
  } else if (player && slots?.length && !isYoutube(state().song)) {
    // Past the songs next to the current one comes a YouTube song: it should play again, not be passed over.
    const keep = foregroundSlots(slots, slots.indexOf(state().index), state().queue.length);
    for (let k = slots.length - 1; k >= keep.length; k--) player.remove(k);
    slots = keep;
    player.loop = loopFor(state().repeat);
  }
  if (passedInBackground > 0) {
    const n = passedInBackground;
    passedInBackground = 0;
    toast(n === 1
      ? 'שיר יוטיוב אחד דולג כי האפליקציה הייתה ברקע — יוטיוב מתנגן רק כשהאפליקציה פתוחה'
      : `${n} שירי יוטיוב דולגו כי האפליקציה הייתה ברקע — יוטיוב מתנגן רק כשהאפליקציה פתוחה`, 'info');
  }
}

/** iOS passes through "inactive" on the way out (and for Control Center, which changes nothing). */
let playingAsSheLeft = false;

AppState.addEventListener('change', (s) => {
  if (s === 'inactive') playingAsSheLeft = isYoutube(state().song) && state().playing;
  else if (s === 'background' && appActive) void onBackground().catch((e) => diag('background failed', e));
  else if (s === 'active' && !appActive) void onForeground().catch((e) => diag('foreground failed', e));
});

/** Where a reloaded YouTube player picks up (the page was dropped by the system meanwhile). */
export function youtubeResumePoint(): { start: number; play: boolean } {
  return { start: Math.floor(state().position), play: state().playing };
}
