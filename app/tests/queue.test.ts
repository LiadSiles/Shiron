import { describe, expect, it } from 'vitest';
import { audioRun, nativeLoop, nextIndex, nextRepeat, previousIndex } from '../src/core/queue';

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

  it('lets the native playlist loop by itself only over the whole queue', () => {
    expect(nativeLoop('one', { start: 1, end: 2 }, 5)).toBe('single');
    expect(nativeLoop('all', { start: 0, end: 4 }, 5)).toBe('all');
    expect(nativeLoop('all', { start: 0, end: 2 }, 5)).toBe('none');
    expect(nativeLoop('off', { start: 0, end: 4 }, 5)).toBe('none');
  });
});
