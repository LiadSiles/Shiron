import { router } from 'expo-router';
import { Alert } from 'react-native';
import { getCategory, primaryCategoryId, UNSORTED_ID } from '../core/categories';
import { canStart } from '../core/ingestRules';
import { playlistColor, songCount } from '../core/playlists';
import type { Playlist, SongWithCategories } from '../core/types';
import { deleteCategory, deletePlaylist, deleteSong, setPlaylistSongs, updateSong } from '../db/repo';
import { diag } from '../diag/log';
import { deleteStored } from '../ingest/storage';
import { currentSongId, forgetSong, playNext } from '../player/player';
import { SheetAction, showActions } from './ActionSheet';
import { playAll, playOrOpen } from './play';
import { shareSong, shareSongs } from './share';
import { toast } from './toast';

/**
 * What a long press (or ⋮) offers on each thing in the app (owner, 0.15.0), and the actions on
 * several songs at once (selection mode). One place, so a song offers the same actions on every
 * screen. Only actions that apply are listed — no greyed-out rows.
 */

export interface SongMenuContext {
  /** The list it is played from (tap = play from here). */
  queue: SongWithCategories[];
  /** In one of her lists: "remove from this list" too. */
  playlist?: Playlist;
  /** On a screen that can select several songs: "בחירה" starts it with this song. */
  onSelect?: () => void;
}

export function showSongMenu(song: SongWithCategories, ctx: SongMenuContext) {
  const cat = getCategory(primaryCategoryId(song));
  const actions: (SheetAction | false)[] = [
    canStart(song) && { icon: 'play', label: 'נגני', onPress: () => playOrOpen(song, ctx.queue) },
    // Something else is playing: this one right after it, once (0.16.0).
    canStart(song) && !!currentSongId() && currentSongId() !== song.id && {
      icon: 'play-forward',
      label: 'נגני הבא',
      onPress: () => void queueNext(song),
    },
    { icon: 'create-outline', label: 'פרטים ועריכה', onPress: () => openSong(song.id) },
    { icon: 'list', label: 'הוספה לרשימה', onPress: () => addToPlaylist([song.id]) },
    { icon: 'share-outline', label: 'שיתוף', onPress: () => void shareSong(song) },
    {
      icon: song.pinnedAt ? 'pin-outline' : 'pin',
      label: song.pinnedAt ? 'ביטול ההצמדה' : 'הצמדה לראש מסך הבית',
      onPress: () => void updateSong(song.id, { pinnedAt: song.pinnedAt ? null : Date.now() }),
    },
    !!ctx.onSelect && { icon: 'checkmark-circle-outline', label: 'בחירת כמה שירים', onPress: ctx.onSelect },
    !!ctx.playlist && {
      icon: 'remove-circle-outline',
      label: 'הוצאה מהרשימה',
      danger: true,
      onPress: () => void removeFromPlaylist(ctx.playlist!, [song.id]),
    },
    { icon: 'trash-outline', label: 'מחיקת השיר', danger: true, onPress: () => confirmDeleteSongs([song]) },
  ];
  showActions({
    title: song.title,
    subtitle: song.kind === 'youtube' ? 'יוטיוב' : cat.id === UNSORTED_ID ? undefined : cat.name,
    art: { emoji: cat.icon, color: cat.color },
    actions: actions.filter((a): a is SheetAction => !!a),
  });
}

/** A category tile — or "כל השירים" / "נוספו לאחרונה", which can't be edited. */
export function showCategoryMenu(
  cat: { id: string; name: string; icon?: string; color: string; editable: boolean },
  songs: SongWithCategories[],
) {
  const playable = songs.filter(canStart);
  const actions: (SheetAction | false)[] = [
    { icon: 'open-outline', label: 'פתיחה', onPress: () => router.push({ pathname: '/category/[id]', params: { id: cat.id } }) },
    playable.length > 0 && { icon: 'play', label: 'נגני הכול', onPress: () => void playAll(playable) },
    songs.length > 0 && { icon: 'share-outline', label: 'שיתוף כל השירים', onPress: () => void shareSongs(cat.name, songs) },
    cat.editable && { icon: 'create-outline', label: 'עריכה: שם, סמל וצבע', onPress: () => router.push({ pathname: '/category/edit', params: { id: cat.id } }) },
    cat.editable && { icon: 'trash-outline', label: 'הסרת הקטגוריה', danger: true, onPress: () => confirmDeleteCategory(cat) },
  ];
  showActions({
    title: cat.name,
    subtitle: songCount(songs.length),
    art: { emoji: cat.icon, icon: cat.icon ? undefined : 'musical-notes', color: cat.color },
    actions: actions.filter((a): a is SheetAction => !!a),
  });
}

export function showPlaylistMenu(list: Playlist, songs: SongWithCategories[]) {
  const playable = songs.filter(canStart);
  const actions: (SheetAction | false)[] = [
    { icon: 'open-outline', label: 'פתיחה', onPress: () => openPlaylistScreen(list.id) },
    playable.length > 0 && { icon: 'play', label: 'נגני את הרשימה', onPress: () => void playAll(playable) },
    songs.length > 0 && { icon: 'share-outline', label: 'שיתוף הרשימה', onPress: () => void shareSongs(list.name, songs) },
    { icon: 'add', label: 'הוספת שירים', onPress: () => router.push({ pathname: '/playlist/pick', params: { id: list.id } }) },
    { icon: 'pencil', label: 'שינוי שם', onPress: () => openPlaylistScreen(list.id, true) },
    { icon: 'trash-outline', label: 'מחיקת הרשימה', danger: true, onPress: () => confirmDeletePlaylist(list) },
  ];
  showActions({
    title: list.name,
    subtitle: songCount(songs.length),
    art: { icon: 'list', color: playlistColor(list.id) },
    actions: actions.filter((a): a is SheetAction => !!a),
  });
}

// ---------------------------------------------------------------- the actions themselves

/** "נגני הבא": after the song playing (and the ones she asked for before), once. */
async function queueNext(song: SongWithCategories) {
  try {
    const before = await playNext(song);
    toast(before === 0 ? 'יתנגן אחרי השיר הזה' : `יתנגן אחרי ${before + 1} שירים`, 'success');
  } catch (e) {
    diag('play next failed', song.title, e);
    toast('לא הצלחנו להוסיף את השיר לתור', 'error');
  }
}

export function openSong(id: string) {
  router.push({ pathname: '/song/[id]', params: { id } });
}

function openPlaylistScreen(id: string, rename = false) {
  router.push({ pathname: '/playlist/[id]', params: rename ? { id, rename: '1' } : { id } });
}

/** "Add to list" for one song or several (playlist/add takes them all). */
export function addToPlaylist(songIds: string[]) {
  router.push({ pathname: '/playlist/add', params: { songs: songIds.join(',') } });
}

export async function removeFromPlaylist(list: Playlist, songIds: string[]) {
  try {
    await setPlaylistSongs(list.id, list.songIds.filter((x) => !songIds.includes(x)));
    toast(songIds.length === 1 ? 'השיר הוצא מהרשימה' : `${songIds.length} שירים הוצאו מהרשימה`, 'success');
  } catch (e) {
    diag('playlist remove failed', e);
    toast('לא הצלחנו לעדכן את הרשימה', 'error');
  }
}

/**
 * Deleting songs, after asking once for all of them. Each leaves the player's queue, its files
 * and every list; `onDone` runs after (a screen may go back, selection mode end).
 */
export function confirmDeleteSongs(songs: SongWithCategories[], onDone?: () => void) {
  if (!songs.length) return;
  const one = songs.length === 1;
  Alert.alert(
    one ? 'למחוק את השיר?' : `למחוק ${songs.length} שירים?`,
    one ? `"${songs[0].title}" יימחק מהטלפון ומכל הרשימות.` : 'הם יימחקו מהטלפון ומכל הרשימות.',
    [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחיקה',
        style: 'destructive',
        onPress: async () => {
          let failed = 0;
          for (const s of songs) {
            try {
              await forgetSong(s.id);
              deleteStored(s.originalUri, s.playableUri);
              await deleteSong(s.id);
            } catch (e) {
              failed += 1;
              diag('delete failed', s.title, e);
            }
          }
          if (failed) toast(`${failed} שירים לא נמחקו. נסי שוב.`, 'error');
          else if (!one) toast(`${songs.length} שירים נמחקו`, 'success');
          onDone?.();
        },
      },
    ],
  );
}

function confirmDeleteCategory(cat: { id: string; name: string }) {
  Alert.alert(`להסיר את "${cat.name}"?`, 'השירים יישארו בספרייה, ושירים בלי קטגוריה אחרת יעברו ל"לא מסווג".', [
    { text: 'ביטול', style: 'cancel' },
    {
      text: 'הסרה',
      style: 'destructive',
      onPress: async () => {
        await deleteCategory(cat.id);
        toast('הקטגוריה הוסרה', 'success');
      },
    },
  ]);
}

export function confirmDeletePlaylist(list: Playlist, onDone?: () => void) {
  Alert.alert('למחוק את הרשימה?', `"${list.name}" תימחק. השירים עצמם נשארים בספרייה.`, [
    { text: 'ביטול', style: 'cancel' },
    {
      text: 'מחיקה',
      style: 'destructive',
      onPress: async () => {
        await deletePlaylist(list.id);
        toast('הרשימה נמחקה', 'success');
        onDone?.();
      },
    },
  ]);
}
