/** Pure rules for playlists she builds herself. Storage is in db/repo.ts. */

/** Long enough for "שירי בוקר לפני הפעילות", short enough for a tile. */
export const MAX_NAME = 40;

const BASE_NAME = 'רשימה חדשה';

/** Trimmed, single spaces, capped; empty if nothing is left. */
export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME).trim();
}

/** A name for a new list that isn't taken: "רשימה חדשה", then "רשימה חדשה 2", ... */
export function newPlaylistName(taken: string[]): string {
  const names = new Set(taken.map(cleanName));
  if (!names.has(BASE_NAME)) return BASE_NAME;
  for (let n = 2; ; n++) if (!names.has(`${BASE_NAME} ${n}`)) return `${BASE_NAME} ${n}`;
}

/** Adds the song at the end, or takes it out if it is already in the list. */
export function toggleSong(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/**
 * Several songs at once (selected together): all in the list already → take them all out;
 * otherwise add the missing ones at the end. What a tap on a list does in "add to list".
 */
export function toggleSongs(ids: string[], songIds: string[]): string[] {
  return songIds.every((id) => ids.includes(id)) ? ids.filter((x) => !songIds.includes(x)) : addSongs(ids, songIds);
}

/** Adds songs at the end, skipping those already in the list (a song appears once). */
export function addSongs(ids: string[], add: string[]): string[] {
  const out = [...ids];
  for (const id of add) if (!out.includes(id)) out.push(id);
  return out;
}

/** Moves one song to another place; out-of-range moves leave the list as it is. */
export function moveSong(ids: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return ids;
  const out = [...ids];
  const [id] = out.splice(from, 1);
  out.splice(to, 0, id);
  return out;
}

/** The list's songs in her order; songs deleted from the library simply drop out. */
export function playlistSongs<S>(songIds: string[], byId: Map<string, S>): S[] {
  return songIds.map((id) => byId.get(id)).filter((s): s is S => s !== undefined);
}

/** "שיר אחד" / "5 שירים" */
export function songCount(n: number): string {
  return n === 1 ? 'שיר אחד' : `${n} שירים`;
}

/** Each list keeps its own colour (picked from its id), distinct from the categories' palette. */
const COLORS = ['#5B4FC4', '#2E7D8C', '#B5447A', '#3F7D3A', '#A65A2A', '#4A6FB5'];

export function playlistColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}
