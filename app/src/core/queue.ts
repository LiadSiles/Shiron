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
 * The native playlist's own loop: only when the run is the whole queue can it wrap by itself
 * ("all"); otherwise the app wraps at the run's edge.
 */
export function nativeLoop(repeat: RepeatMode, run: { start: number; end: number }, length: number): 'none' | 'single' | 'all' {
  if (repeat === 'one') return 'single';
  if (repeat === 'all' && run.start === 0 && run.end === length - 1) return 'all';
  return 'none';
}
