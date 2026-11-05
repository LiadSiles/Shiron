import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { cleanName, newPlaylistName, songCount, toggleSong } from '../../core/playlists';
import { createPlaylist, setPlaylistSongs } from '../../db/repo';
import { useLibrary } from '../../db/useLibrary';
import { diag } from '../../diag/log';
import { Button, T } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { playlistColor } from '../../ui/playlists';
import { toast } from '../../ui/toast';
import { font, radius, space, TOUCH, useTheme } from '../../ui/theme';

/**
 * From a song's screen: which of her lists it is in. Each tap adds it to the end of a list or
 * takes it out, at once — no save button to forget. Or start a new list with this song.
 */
export default function AddToPlaylist() {
  const { song: songId } = useLocalSearchParams<{ song: string }>();
  const c = useTheme();
  const lib = useLibrary();
  const song = lib.byId.get(songId);
  const [name, setName] = useState('');

  const toggle = (listId: string, ids: string[]) =>
    setPlaylistSongs(listId, toggleSong(ids, songId)).catch((e) => {
      diag('playlist toggle failed', e);
      toast('לא הצלחנו לעדכן את הרשימה', 'error');
    });

  const create = async () => {
    const finalName = cleanName(name) || newPlaylistName(lib.playlists.map((p) => p.name));
    try {
      await createPlaylist(finalName, [songId]);
      toast(`השיר נוסף לרשימה החדשה "${finalName}"`, 'success');
      router.back();
    } catch (e) {
      diag('playlist create failed', e);
      toast('לא הצלחנו ליצור את הרשימה', 'error');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: space.l, gap: space.s }} keyboardShouldPersistTaps="handled">
        {song ? <T soft numberOfLines={1}>{song.title}</T> : null}

        {lib.playlists.map((p) => {
          const on = p.songIds.includes(songId);
          const color = playlistColor(p.id);
          return (
            <Pressable
              key={p.id}
              onPress={() => toggle(p.id, p.songIds)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={p.name}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: on ? c.primarySoft : pressed ? c.surfaceAlt : c.surface, borderColor: on ? c.primary : c.line },
              ]}
            >
              <View style={[styles.swatch, { backgroundColor: color }]}>
                <Icon name="list" size={20} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <T weight="medium" size={17} numberOfLines={1}>{p.name}</T>
                <T soft size={13}>{songCount(p.songIds.length)}</T>
              </View>
              <Icon name={on ? 'checkmark-circle' : 'ellipse-outline'} size={30} color={on ? c.primary : c.inkSoft} />
            </Pressable>
          );
        })}

        <T weight="bold" size={18} style={{ marginTop: lib.playlists.length ? space.xl : 0 }}>רשימה חדשה עם השיר הזה</T>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="שם לרשימה, למשל: מעגל בוקר"
          placeholderTextColor={c.inkSoft}
          maxLength={40}
          returnKeyType="done"
          onSubmitEditing={create}
          accessibilityLabel="שם לרשימה החדשה"
          style={[styles.input, { color: c.ink, borderColor: c.line, backgroundColor: c.surface, fontFamily: font.medium }]}
        />
        <Button label="יצירת רשימה" icon="add" onPress={create} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    padding: space.m,
    minHeight: 64,
    borderRadius: radius.m,
    borderWidth: 1,
  },
  swatch: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: TOUCH, borderWidth: 1, borderRadius: radius.m, paddingHorizontal: space.m, fontSize: 17 },
});
