import * as Haptics from 'expo-haptics';
import { Alert } from 'react-native';
import type { SongWithCategories } from '../core/types';
import { MissingFileError, NotPlayableError, playOrToggle, playSong } from '../player/player';

/** Tap = play now (or pause, if it is the song playing). A YouTube song opens the full player. */
export function playOrOpen(song: SongWithCategories, queue: SongWithCategories[]) {
  Haptics.selectionAsync().catch(() => undefined);
  return explainPlayErrors(song, () => playOrToggle(song, queue));
}

/** "נגני הכול": always starts the first song, even if it is the one playing. */
export function playAll(queue: SongWithCategories[]) {
  const first = queue[0];
  return first ? explainPlayErrors(first, () => playSong(first, queue)) : Promise.resolve();
}

async function explainPlayErrors(song: SongWithCategories, play: () => Promise<void>) {
  try {
    await play();
  } catch (e) {
    if (e instanceof NotPlayableError) {
      const unsupported = song.audioState === 'unsupported';
      Alert.alert(
        unsupported ? 'לא ניתן לנגן' : 'עוד רגע',
        unsupported ? song.error ?? 'הפורמט של הקובץ הזה לא נתמך במכשיר.' : 'השיר עדיין בהכנה. הוא יהיה מוכן לניגון בעוד כמה שניות.',
      );
    } else if (e instanceof MissingFileError) {
      Alert.alert('לא ניתן לנגן', 'קובץ השמע של השיר חסר. אפשר למחוק את השיר ולשתף אותו שוב.');
    } else {
      Alert.alert('לא הצלחנו לנגן', String((e as Error)?.message ?? e));
    }
  }
}
