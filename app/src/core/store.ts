/**
 * A tiny observable state container — the app's shared state (player, processing, saving,
 * library) is one of these, so every screen reads the same value and none keeps its own copy.
 * `set` notifies only when a field really changed (Object.is), so frequent updates that change
 * nothing (a status tick with the same position) cost nothing. React reads it through
 * `useStore` (ui/useStore.ts), optionally narrowed by a selector.
 */
export interface Store<T extends object> {
  get(): T;
  set(patch: Partial<T>): void;
  subscribe(listener: (state: T) => void): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<(state: T) => void>();
  return {
    get: () => state,
    set(patch) {
      const keys = Object.keys(patch) as (keyof T)[];
      if (keys.every((k) => Object.is(state[k], patch[k]))) return;
      state = { ...state, ...patch };
      listeners.forEach((l) => l(state));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
