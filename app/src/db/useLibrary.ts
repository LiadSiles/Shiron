import { applyCategoryCustomizations } from '../core/categories';
import { deriveLibrary, LibraryState } from '../core/library';
import { createStore } from '../core/store';
import { diag } from '../diag/log';
import { useStore } from '../ui/useStore';
import { listCategoryCustomizations, listPlaylists, listSongs, onLibraryChange, playsBySong, recentlyPlayedIds } from './repo';

/**
 * The library in memory, shared by every screen: one query per change however many screens are
 * open (each used to load it on its own). Writes come in bursts — processing a song is several
 * updates — so a change during a load just schedules one more load after it.
 */
const libraryStore = createStore<{ lib: LibraryState }>({
  lib: deriveLibrary({ songs: [], plays: new Map(), recentIds: [], playlists: [] }, true),
});
let started = false;
let loadingNow = false;
let again = false;

async function load() {
  if (loadingNow) {
    again = true;
    return;
  }
  loadingNow = true;
  do {
    again = false;
    try {
      const [songs, plays, recentIds, playlists, custom] = await Promise.all([
        listSongs(), playsBySong(), recentlyPlayedIds(10), listPlaylists(), listCategoryCustomizations(),
      ]);
      // Her categories first: everything derived below (tiles, names, the AI's list) reads them.
      applyCategoryCustomizations(custom);
      libraryStore.set({ lib: deriveLibrary({ songs, plays, recentIds, playlists }, false) });
    } catch (e) {
      diag('library load failed', e);
    }
  } while (again);
  loadingNow = false;
}

/** The whole library, kept current: loads on first use and again after every change. */
export function useLibrary(): LibraryState {
  if (!started) {
    started = true;
    onLibraryChange(() => void load());
    void load();
  }
  return useStore(libraryStore, (s) => s.lib);
}

