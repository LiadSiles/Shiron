import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { cleanName, newPlaylistName, playlistColor, songCount, toggleSongs } from '../../core/playlists';
import { createPlaylist, setPlaylistSongs } from '../../db/repo';
import { useLibrary } from '../../db/useLibrary';
import { diag } from '../../diag/log';
import { Button, T } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { toast } from '../../ui/toast';
import { font, radius, space, TOUCH, useTheme } from '../../ui/theme';

/**
 * Which of her lists a song is in — or several songs chosen together (`songs`, ids joined by
 * ","). Each tap adds them to the end of a list, or takes them out when they are all in it
 * already, at once — no save button to forget. Or start a new list with them.
 */
export default function AddToPlaylist() {
  const { songs: param } = useLocalSearchParams<{ songs: string }>();
  const c = useTheme();
  const lib = useLibrary();
  const songIds = (param ?? '').split(',').filter((id) => lib.byId.has(id));
  const one = songIds.length === 1 ? lib.byId.get(songIds[0]) : null;
  const [name, setName] = useState('');

  const toggle = (listId: string, ids: string[]) =>
    setPlaylistSongs(listId, toggleSongs(ids, songIds)).catch((e) => {
      diag('playlist toggle failed', e);
      toast('לא הצלחנו לעדכן את הרשימה', 'error');
    });

  const create = async () => {
    const finalName = cleanName(name) || newPlaylistName(lib.playlists.map((p) => p.name));
    try {
      await createPlaylist(finalName, songIds);
      toast(one ? `השיר נוסף לרשימה החדשה "${finalName}"` : `${songIds.length} שירים נוספו לרשימה החדשה "${finalName}"`, 'success');
      router.back();
    } catch (e) {
      diag('playlist create failed', e);
      toast('לא הצלחנו ליצור את הרשימה', 'error');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: space.l, gap: space.s }} keyboardShouldPersistTaps="handled">
        <T soft numberOfLines={1}>{one ? one.title : `${songIds.length} שירים נבחרו`}</T>

        {lib.playlists.map((p) => {
          const on = songIds.length > 0 && songIds.every((x) => p.songIds.includes(x));
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

        <T weight="bold" size={18} style={{ marginTop: lib.playlists.length ? space.xl : 0 }}>{one ? 'רשימה חדשה עם השיר הזה' : 'רשימה חדשה עם השירים האלה'}</T>
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
