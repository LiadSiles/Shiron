import { describe, expect, it } from 'vitest';
import { formatTime } from '../src/core/time';

describe('time format', () => {
  it('shows m:ss and h:mm:ss', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65.7)).toBe('1:05');
    expect(formatTime(3725)).toBe('1:02:05');
    expect(formatTime(NaN)).toBe('0:00');
  });
});
