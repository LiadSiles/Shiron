/**
 * The play queue mixes songs the phone plays itself (audio files) and YouTube songs, which can
 * only play in YouTube's visible player. The native playlist (lock screen, notification,
 * background) holds one **run** of consecutive audio songs; at the edge of a run the app moves
 * on itself. Pure logic, unit-tested.
 */

export type RepeatMode = 'off' | 'all' | 'one';

/** Repeat button cycle: off → the whole list → this song → off. */
export function nextRepeat(mode: RepeatMode): RepeatMode {
  return mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off';
}

/** The consecutive audio songs around `index` ([start, end], inclusive); null on a YouTube song. */
export function audioRun(isAudio: boolean[], index: number): { start: number; end: number } | null {
  if (!isAudio[index]) return null;
  let start = index;
  let end = index;
  while (start > 0 && isAudio[start - 1]) start -= 1;
  while (end < isAudio.length - 1 && isAudio[end + 1]) end += 1;
  return { start, end };
}

/** Where "next" (or the end of a song) goes; null = stop. Repeat-one is handled by the player. */
export function nextIndex(index: number, length: number, repeat: RepeatMode): number | null {
  if (index + 1 < length) return index + 1;
  return repeat === 'all' && length > 0 ? 0 : null;
}

/** Where "previous" goes; null = restart this song. */
export function previousIndex(index: number, length: number, repeat: RepeatMode): number | null {
  if (index > 0) return index - 1;
  return repeat === 'all' && length > 1 ? length - 1 : null;
}

/**
 * The native playlist's own loop. `slots`: the queue indexes loaded in it, in order. It may wrap
 * by itself ("all") only when it holds every audio song and nothing it would pass over should
 * play: in the foreground that means a queue of audio only; in the background YouTube songs are
 * passed over anyway (`skipYoutube`). Otherwise the app wraps at the last slot.
 */
export function nativeLoop(repeat: RepeatMode, slots: readonly number[], isAudio: readonly boolean[], skipYoutube: boolean): 'none' | 'single' | 'all' {
  if (repeat === 'one') return 'single';
  if (repeat !== 'all') return 'none';
  const audio = isAudio.filter(Boolean).length;
  if (slots.length !== audio) return 'none';
  return skipYoutube || audio === isAudio.length ? 'all' : 'none';
}

/** The run around `index` as queue indexes for the native playlist (see audioRun). */
export function runSlots(isAudio: readonly boolean[], index: number): number[] {
  const run = audioRun(isAudio as boolean[], index);
  if (!run) return [];
  return Array.from({ length: run.end - run.start + 1 }, (_, i) => run.start + i);
}

/**
 * The audio songs that follow `from`, in play order — around the list when repeating it — up to
 * (not including) `from` itself. YouTube can't play with the app in the background (its terms),
 * so there the music goes on with these.
 */
export function audioAhead(isAudio: readonly boolean[], from: number, repeat: RepeatMode): number[] {
  const n = isAudio.length;
  const out: number[] = [];
  const wrap = repeat === 'all';
  for (let step = 1; step < n; step++) {
    const i = from + step;
    if (i >= n && !wrap) break;
    const k = i % n;
    if (isAudio[k]) out.push(k);
  }
  return out;
}

/**
 * The native playlist for the background: what is loaded now, then every audio song after its
 * last slot (YouTube songs left out), so the lock screen's "next" always has somewhere to go.
 */
export function backgroundSlots(slots: readonly number[], isAudio: readonly boolean[], repeat: RepeatMode): number[] {
  if (!slots.length) return [];
  const have = new Set(slots);
  const more = audioAhead(isAudio, slots[slots.length - 1], repeat).filter((i) => !have.has(i));
  return [...slots, ...more];
}

/** How many songs going forward from `from` to `to` passes over (around the end if needed). */
export function passedOver(from: number, to: number, length: number): number {
  if (length <= 0 || from === to) return 0;
  return (to - from - 1 + length) % length;
}

/**
 * Back in the foreground: the slots to keep — the current song and the songs right after it that
 * are next to each other in the queue too. Past that a YouTube song comes, which should play
 * (in its visible player) instead of being passed over.
 */
export function foregroundSlots(slots: readonly number[], currentSlot: number, length: number): number[] {
  let end = currentSlot;
  while (end + 1 < slots.length && slots[end + 1] === slots[end] + 1 && slots[end + 1] < length) end += 1;
  return slots.slice(0, end + 1);
}

/**
 * A song left the queue (she deleted it) at queue index `at`: the native slots without it, the
 * rest renumbered, and which native slot to remove (-1 = it wasn't loaded).
 */
export function withoutQueueIndex(slots: readonly number[], at: number): { slots: number[]; removeSlot: number } {
  const removeSlot = slots.indexOf(at);
  return { slots: slots.filter((i) => i !== at).map((i) => (i > at ? i - 1 : i)), removeSlot };
}
