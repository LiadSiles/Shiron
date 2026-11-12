import { createStore } from '../core/store';

/**
 * The songs that came in recently and are being followed to ready — every song of every share
 * or pick since the dock was last cleared (ui/ActivityDock clears it a moment after all are
 * ready). Read with `useStore(batchStore)`.
 */
export const batchStore = createStore<{ ids: string[] }>({ ids: [] });

export function addToBatch(ids: string[]) {
  batchStore.set({ ids: [...new Set([...batchStore.get().ids, ...ids])] });
}

export function clearBatch() {
  batchStore.set({ ids: [] });
}
