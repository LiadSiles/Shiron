import { useSyncExternalStore } from 'react';
import type { Store } from '../core/store';

/**
 * Read a store in a component. With a selector the component re-renders only when the selected
 * value changes — e.g. a song row asks "am I the song playing, and is it playing?" instead of
 * re-rendering on every position tick. The selector must return a primitive or a value already
 * held in the state (a new object each call would never compare equal).
 */
export function useStore<T extends object>(store: Store<T>): T;
export function useStore<T extends object, S>(store: Store<T>, select: (state: T) => S): S;
export function useStore<T extends object, S>(store: Store<T>, select?: (state: T) => S): T | S {
  return useSyncExternalStore(store.subscribe, () => (select ? select(store.get()) : store.get()));
}
