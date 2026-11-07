import { describe, expect, it } from 'vitest';
import { playerRoute, PUSH_GRACE_MS } from '../src/core/playerNav';

describe('showing the full player', () => {
  it('pushes it when none is open', () => {
    expect(playerRoute(0, 0, 10_000, true)).toBe('push');
  });
  it('goes back to the open one (details on top) instead of stacking another', () => {
    expect(playerRoute(1, 0, 10_000, true)).toBe('back-to-it');
    expect(playerRoute(2, 0, 10_000, true)).toBe('back-to-it');
  });
  it('stays when the player is the only screen left', () => {
    expect(playerRoute(1, 0, 10_000, false)).toBe('stay');
  });
  it('ignores a second push before the first mounted (two taps, a song change)', () => {
    expect(playerRoute(0, 10_000, 10_000 + 200, true)).toBe('stay');
    expect(playerRoute(0, 10_000, 10_000 + PUSH_GRACE_MS, true)).toBe('push');
  });
});
