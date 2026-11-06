import { describe, expect, it, vi } from 'vitest';
import { createStore } from '../src/core/store';

describe('store', () => {
  it('merges patches and notifies with the new state', () => {
    const s = createStore({ a: 1, b: 'x' });
    const l = vi.fn();
    s.subscribe(l);
    s.set({ a: 2 });
    expect(s.get()).toEqual({ a: 2, b: 'x' });
    expect(l).toHaveBeenCalledWith({ a: 2, b: 'x' });
  });

  it('stays silent and keeps the same object when nothing changed', () => {
    const s = createStore({ a: 1, list: [1] as number[] });
    const before = s.get();
    const l = vi.fn();
    s.subscribe(l);
    s.set({ a: 1, list: before.list });
    s.set({});
    expect(l).not.toHaveBeenCalled();
    expect(s.get()).toBe(before);
    s.set({ list: [1] }); // a new array is a change
    expect(l).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes', () => {
    const s = createStore({ n: 0 });
    const l = vi.fn();
    const off = s.subscribe(l);
    off();
    s.set({ n: 1 });
    expect(l).not.toHaveBeenCalled();
  });
});
