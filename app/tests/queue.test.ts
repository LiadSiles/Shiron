import { describe, expect, it } from 'vitest';
import {
  afterEnd, withoutQueueIndex, audioAhead, upNextAt, upNextCount, withQueueInsert, withoutPlayedOnce, audioRun, backgroundSlots, foregroundSlots, nativeLoop, nextIndex, nextRepeat, passedOver, previousIndex, runSlots,
} from '../src/core/queue';

describe('play queue', () => {
  it('cycles the repeat button', () => {
    expect([nextRepeat('off'), nextRepeat('all'), nextRepeat('one')]).toEqual(['all', 'one', 'off']);
  });

  it('finds the run of audio songs around a song', () => {
    const q = [true, true, false, true, true, true, false];
    expect(audioRun(q, 0)).toEqual({ start: 0, end: 1 });
    expect(audioRun(q, 4)).toEqual({ start: 3, end: 5 });
    expect(audioRun(q, 2)).toBeNull();
    expect(audioRun([true], 0)).toEqual({ start: 0, end: 0 });
  });

  it('moves on, wrapping only when repeating the list', () => {
    expect(nextIndex(1, 3, 'off')).toBe(2);
    expect(nextIndex(2, 3, 'off')).toBeNull();
    expect(nextIndex(2, 3, 'all')).toBe(0);
    expect(previousIndex(0, 3, 'off')).toBeNull();
    expect(previousIndex(0, 3, 'all')).toBe(2);
    expect(previousIndex(2, 3, 'one')).toBe(1);
  });

  it('decides what follows the end of a song in each repeat mode', () => {
    // One song (picked from a search): stops, starts again, starts again.
    expect(afterEnd(0, 1, 'off')).toBeNull();
    expect(afterEnd(0, 1, 'all')).toBe(0);
    expect(afterEnd(0, 1, 'one')).toBe(0);
    // The last of three: stops, wraps, itself. The middle one: the next, the next, itself.
    expect(afterEnd(2, 3, 'off')).toBeNull();
    expect(afterEnd(2, 3, 'all')).toBe(0);
    expect(afterEnd(2, 3, 'one')).toBe(2);
    expect(afterEnd(1, 3, 'off')).toBe(2);
    expect(afterEnd(1, 3, 'one')).toBe(1);
  });

  it('lets the native playlist loop by itself only when it holds every song it should play', () => {
    const allAudio = [true, true, true];
    const mixed = [true, false, true];
    expect(nativeLoop('one', [1], mixed, false)).toBe('single');
    expect(nativeLoop('all', [0, 1, 2], allAudio, false)).toBe('all');
    expect(nativeLoop('all', [0, 1], allAudio, false)).toBe('none');
    expect(nativeLoop('off', [0, 1, 2], allAudio, false)).toBe('none');
    // Every audio song loaded, but a YouTube song between: only in the background, where it is passed over.
    expect(nativeLoop('all', [0, 2], mixed, false)).toBe('none');
    expect(nativeLoop('all', [0, 2], mixed, true)).toBe('all');
  });

  // A = audio, Y = YouTube.
  const q = [true, false, true, true, false, false, true]; // A Y A A Y Y A

  it('loads the run around a song', () => {
    expect(runSlots(q, 2)).toEqual([2, 3]);
    expect(runSlots(q, 1)).toEqual([]);
  });

  it('finds the audio songs ahead, around the list only when repeating it', () => {
    expect(audioAhead(q, 3, 'off')).toEqual([6]);
    expect(audioAhead(q, 3, 'all')).toEqual([6, 0, 2]);
    expect(audioAhead(q, 1, 'off')).toEqual([2, 3, 6]);
    expect(audioAhead(q, 6, 'off')).toEqual([]);
    expect(audioAhead(q, 6, 'one')).toEqual([]);
    expect(audioAhead([false, false], 0, 'all')).toEqual([]);
  });

  it('in the background, the native list goes on past YouTube songs', () => {
    expect(backgroundSlots([2, 3], q, 'off')).toEqual([2, 3, 6]);
    expect(backgroundSlots([2, 3], q, 'all')).toEqual([2, 3, 6, 0]);
    expect(backgroundSlots([6], q, 'off')).toEqual([6]);
    expect(backgroundSlots([], q, 'all')).toEqual([]);
  });

  it('counts the songs passed over', () => {
    expect(passedOver(3, 6, 7)).toBe(2);
    expect(passedOver(6, 0, 7)).toBe(0);
    expect(passedOver(6, 2, 7)).toBe(2);
    expect(passedOver(2, 3, 7)).toBe(0);
    expect(passedOver(4, 4, 7)).toBe(0);
  });

  it('back in the foreground, keeps the songs next to the current one and drops what jumps a YouTube song', () => {
    expect(foregroundSlots([2, 3, 6, 0], 0, 7)).toEqual([2, 3]);
    expect(foregroundSlots([2, 3, 6, 0], 2, 7)).toEqual([2, 3, 6]);
    expect(foregroundSlots([2, 3, 6, 0], 3, 7)).toEqual([2, 3, 6, 0]);
    expect(foregroundSlots([0, 1, 2], 1, 3)).toEqual([0, 1, 2]);
  });

  it('takes a deleted song out of the native list and renumbers the rest', () => {
    expect(withoutQueueIndex([2, 3, 6], 3)).toEqual({ slots: [2, 5], removeSlot: 1 });
    expect(withoutQueueIndex([2, 3, 6], 4)).toEqual({ slots: [2, 3, 5], removeSlot: -1 });
    expect(withoutQueueIndex([2, 3], 0)).toEqual({ slots: [1, 2], removeSlot: -1 });
  });
});

describe('"נגני הבא": songs to hear next, once (owner, 0.16.0)', () => {
  const q = (...once: boolean[]) => once.map((o, i) => ({ id: String(i), ...(o ? { once: true as const } : {}) }));

  it('goes after the current song and the up-next ones already waiting, in order', () => {
    expect(upNextAt(q(false, false, false), 0)).toBe(1);
    expect(upNextAt(q(false, true, true, false), 0)).toBe(3);
    expect(upNextCount(q(false, true, true, false), 0)).toBe(2);
    expect(upNextAt(q(false, false), 1)).toBe(2); // the last song: at the end
  });

  it('moves the loaded slots past the inserted song', () => {
    expect(withQueueInsert([2, 3, 4], 3)).toEqual([2, 4, 5]);
  });

  it('drops up-next songs once played, keeping the target', () => {
    // a, x(once, playing), b → on to b: x leaves.
    const r = withoutPlayedOnce(q(false, true, false), 1, 2);
    expect(r.queue.map((s) => s.id)).toEqual(['0', '2']);
    expect(r.target).toBe(1);
    // Back to x itself (previous): it stays.
    expect(withoutPlayedOnce(q(false, true, false), 2, 1).queue.map((s) => s.id)).toEqual(['0', '1', '2']);
    // Not played yet (after the current): stays.
    expect(withoutPlayedOnce(q(false, false, true), 0, 1).queue.map((s) => s.id)).toEqual(['0', '1', '2']);
    // Around the list: all once songs before the end have played.
    const w = withoutPlayedOnce(q(false, true, false, true), 3, 0);
    expect(w.queue.map((s) => s.id)).toEqual(['0', '2']);
    expect(w.target).toBe(0);
  });
});
