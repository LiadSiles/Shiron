import type { CategorySort, Layout, SongSort } from '../core/sorting';
import { createStore } from '../core/store';
import { getSetting, setSetting } from '../db/repo';

/** How she likes to see things; remembered across launches (settings table). */
export interface ViewPrefs {
  /** Library: category tiles or rows. */
  libraryLayout: Layout;
  categorySort: CategorySort;
  /** Song lists (a category, all songs, a playlist): rows or tiles. */
  songLayout: Layout;
  songSort: SongSort;
  /** Inside a playlist: her order unless she picks another. */
  playlistSort: SongSort;
}

const KEY = 'viewPrefs';
const DEFAULTS: ViewPrefs = { libraryLayout: 'tiles', categorySort: 'smart', songLayout: 'rows', songSort: 'smart', playlistSort: 'manual' };

/** Read with `useStore(viewPrefs)`. */
export const viewPrefs = createStore<ViewPrefs>(DEFAULTS);

getSetting(KEY)
  .then((raw) => {
    if (raw) viewPrefs.set({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<ViewPrefs>) });
  })
  .catch(() => undefined);

export function setViewPref(patch: Partial<ViewPrefs>) {
  viewPrefs.set(patch);
  setSetting(KEY, JSON.stringify(viewPrefs.get())).catch(() => undefined);
}
